# Sistema de Reservas de Bienestar

Aplicación web de producción para gestionar reservas de actividades de bienestar (masajes,
silla de masajes, y cualquier otra actividad que el administrador configure), con una
experiencia inspirada funcionalmente en **Microsoft Bookings**: el portal muestra un catálogo
de "eventos" en tarjetas, el visitante consulta disponibilidad **sin necesidad de cuenta**, y
solo al confirmar una reserva se le pide iniciar sesión o registrarse. Un administrador
configura áreas, eventos y agendas desde el panel — **nada de esto está codificado en el
programa**: crear un área, un evento o una agenda nueva desde la interfaz los hace aparecer de
inmediato en el portal público, con sus horarios generados dinámicamente, sin tocar una sola
línea de código.

Toda la operación usa la zona horaria única **America/Bogota**.

## Índice

- [Arquitectura](#arquitectura)
- [Modelo de datos](#modelo-de-datos)
- [Flujo de reserva](#flujo-de-reserva)
- [Regla de reservas: una por evento y por día](#regla-de-reservas-una-por-evento-y-por-día)
- [Cuentas de usuario](#cuentas-de-usuario)
- [Zona horaria: estrategia](#zona-horaria-estrategia)
- [Concurrencia y control de duplicados](#concurrencia-y-control-de-duplicados)
- [Requisitos](#requisitos)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [Migraciones (Alembic)](#migraciones-alembic)
- [Administrador inicial](#administrador-inicial)
- [Configuración SMTP y notificaciones](#configuración-smtp-y-notificaciones)
- [Backup y restauración de MariaDB](#backup-y-restauración-de-mariadb)
- [Pruebas automatizadas](#pruebas-automatizadas)
- [Modo desarrollo (sin Docker)](#modo-desarrollo-sin-docker)
- [Despliegue con dominio (Nginx Proxy Manager)](#despliegue-con-dominio-nginx-proxy-manager)
- [Protección de datos personales](#protección-de-datos-personales)

## Arquitectura

- **Backend:** FastAPI + SQLAlchemy 2.x + Alembic + Pydantic v2 + JWT (PyJWT) + Passlib/Bcrypt.
  Arquitectura por capas: `api (routers) → services (reglas de negocio) → repositories (acceso
  a datos) → models (SQLAlchemy)`, con `schemas` (Pydantic) como contratos de la API y
  `auth`, `database`, `utils` como soporte transversal. Los routers no contienen lógica de
  negocio: solo validan entrada, delegan al servicio y traducen errores de dominio a HTTP. El
  envío de correo vive en un `EmailService` independiente de la lógica de reservas, invocado
  como `BackgroundTask` después de confirmar la reserva.
- **Frontend:** React 19 + TypeScript + Vite + MUI + React Router + Axios. Portal público
  mobile-first y panel administrativo, ambos consumiendo la misma API REST versionada. El
  portal usa dos JWT independientes en paralelo (colaborador y administrador, ver
  [Cuentas de usuario](#cuentas-de-usuario)).
- **Base de datos:** **MariaDB** (obligatorio; no se usa PostgreSQL en ninguna parte del
  sistema).
- **Infraestructura:** Docker Compose con 3 servicios (`db`, `backend`, `frontend`). Existe un
  archivo alternativo opcional (`docker-compose.client.yml`, sin `db`) para que un equipo se
  conecte a la MariaDB de otro en vez de tener la suya propia — ver
  [Base de datos compartida en la red local](#base-de-datos-compartida-en-la-red-local). El
  frontend se sirve con Nginx, que hace de proxy inverso hacia la API (`/api → backend:8000`).
  MariaDB persiste sus datos en `./data/mariadb` dentro del propio directorio del proyecto
  (bind mount, no volumen nombrado de Docker), para que los datos vivan siempre junto al
  código y no dependan del ciclo de vida de los volúmenes de Docker.

```mermaid
flowchart LR
    subgraph Cliente
        Nav[Navegador\ncolaborador / admin]
    end
    subgraph Docker Compose
        FE[frontend\nNginx + React SPA]
        BE[backend\nFastAPI]
        DB[(db\nMariaDB)]
    end
    Nav -->|HTTP| FE
    FE -->|"/api/* → proxy_pass"| BE
    BE -->|SQLAlchemy| DB
    BE -.->|SMTP, en BackgroundTask| SMTP[(Servidor de correo)]
    NPM[Nginx Proxy Manager\n(despliegue con dominio, opcional)] -.->|HTTPS| FE
```

La API está versionada bajo `/api/v1` y documentada automáticamente por FastAPI en
`/docs` (Swagger) y `/redoc`.

## Modelo de datos

Tablas mínimas: `roles`, `administradores`, `usuarios`, `areas`, `servicios` (presentado al
público como "Evento"), `agendas`, `reservas`, `bloqueos`, `festivos`, `auditoria`,
`configuracion_general`, `notificaciones`, `configuracion_smtp`.

```mermaid
erDiagram
    ROLES ||--o{ ADMINISTRADORES : tiene
    AREAS ||--o{ AGENDAS : contiene
    SERVICIOS ||--o{ AGENDAS : ofrece
    AGENDAS ||--o{ RESERVAS : agenda
    SERVICIOS ||--o{ RESERVAS : "evento (desnormalizado)"
    USUARIOS ||--o{ RESERVAS : reserva
    USUARIOS ||--o{ NOTIFICACIONES : recibe
    RESERVAS ||--o{ NOTIFICACIONES : origina
    AGENDAS ||--o{ BLOQUEOS : bloquea
    ADMINISTRADORES ||--o{ BLOQUEOS : crea
    ADMINISTRADORES ||--o{ AUDITORIA : genera
    ADMINISTRADORES ||--o{ CONFIGURACION_SMTP : edita

    ROLES {
        int id PK
        string nombre
    }
    ADMINISTRADORES {
        int id PK
        string usuario
        string hash_password
        int rol_id FK
        bool activo
    }
    USUARIOS {
        int id PK
        string nombre
        string apellido
        string correo UK "único; registro público abierto"
        string password_hash "NULL = aún no creó cuenta"
        bool activo
        bool permite_reservas_multiples
    }
    AREAS {
        int id PK
        string nombre
        bool activo
    }
    SERVICIOS {
        int id PK
        string nombre "Evento, cara al público"
        string descripcion_corta
        string descripcion_larga
        string imagen_url
        int duracion_minutos "informativo, ver nota"
        bool activo
    }
    AGENDAS {
        int id PK
        string nombre
        int area_id FK
        int servicio_id FK
        time hora_inicio
        time hora_fin
        time almuerzo_inicio
        time almuerzo_fin
        int duracion_minutos
        bool activo
    }
    RESERVAS {
        int id PK
        int agenda_id FK
        int servicio_id FK "desnormalizado desde agenda.servicio_id"
        int usuario_id FK
        date fecha
        time hora_inicio
        time hora_fin
        string estado
        string slot_lock "columna generada, ver abajo"
        datetime cancelled_at
        string cancelled_by
    }
    BLOQUEOS {
        int id PK
        int agenda_id FK "nulo = todas las agendas"
        string tipo "dia | rango"
        date fecha
        int creado_por FK
    }
    FESTIVOS {
        int id PK
        date fecha
        string nombre
        bool estado
    }
    AUDITORIA {
        int id PK
        int admin_id FK
        string accion
        string entidad
        json datos_anteriores
        json datos_nuevos
    }
    CONFIGURACION_GENERAL {
        int id PK
        string clave
        string valor
    }
    NOTIFICACIONES {
        int id PK
        int reserva_id FK
        int usuario_id FK
        string tipo
        string destinatario
        string estado "pendiente | enviado | fallido"
        int intentos
        string error_mensaje
    }
    CONFIGURACION_SMTP {
        int id PK "fila única"
        string host
        int port
        string password_cifrado "Fernet, nunca en texto plano"
        int actualizado_por FK
    }
```

**Los slots no se almacenan.** El backend los calcula dinámicamente (`HorarioService`) a
partir de `hora_inicio`, `hora_fin`, `duracion_minutos` y `almuerzo_*` de la agenda,
descartando la franja final incompleta, el almuerzo (solape total o parcial), los bloqueos,
los festivos, los horarios ya pasados (hora de Bogotá) y la semana activa configurada. Cada
slot que sí se devuelve trae un `estado`: `disponible`, `ocupado`, `bloqueado` o `pasado`, para
que el frontend los distinga visualmente sin depender solo del color.

**Nota sobre `servicios.duracion_minutos`:** es solo informativo, para mostrarlo en la
tarjeta pública del evento. La duración real de cada cita la sigue gobernando
`agendas.duracion_minutos` (un evento puede tener más de una agenda, p. ej. una por área, y
cada una define su propia duración de turno).

## Flujo de reserva

```mermaid
sequenceDiagram
    participant U as Visitante
    participant FE as Frontend
    participant BE as Backend
    participant DB as MariaDB
    participant SMTP as Servidor de correo

    U->>FE: Abre el portal (sin sesión)
    FE->>BE: GET /eventos
    BE-->>FE: catálogo de eventos activos (tarjetas)
    U->>FE: Elige evento → "Ver disponibilidad"
    FE->>BE: GET /agendas/{id}/horarios?fecha=...
    BE-->>FE: slots con estado (disponible/ocupado/bloqueado/pasado)
    U->>FE: Selecciona un horario disponible
    alt sin sesión
        FE-->>U: pide iniciar sesión o registrarse (guarda la selección)
        U->>FE: Inicia sesión / se registra
        FE->>BE: POST /cuenta/login  ó  POST /cuenta/registro
        BE-->>FE: JWT de usuario (scope=usuario)
        FE-->>U: retoma la selección pendiente automáticamente
    end
    U->>FE: Confirma en el diálogo (evento, área, fecha, hora, nombre, correo)
    FE->>BE: POST /reservas (JWT de usuario, botón deshabilitado tras el clic)
    BE->>DB: revalida disponibilidad + INSERT dentro de una transacción
    alt slot todavía libre
        DB-->>BE: OK (constraint única no se viola)
        BE-->>FE: 201 Created (correo_confirmacion: "pendiente")
        BE--)SMTP: BackgroundTask: enviar correo de confirmación (no bloquea la respuesta)
        SMTP-->>BE: éxito o error (se registra en notificaciones, la reserva no se revierte)
        FE-->>U: "¡Reserva confirmada! Te llegará un correo de confirmación."
    else otro usuario lo tomó primero
        DB-->>BE: error de índice único (slot_lock)
        BE-->>FE: 409 Conflict
        FE-->>U: "El horario seleccionado acaba de ser reservado. Seleccione otro horario"
    end
```

## Regla de reservas: una por evento y por día

Cada usuario puede tener **como máximo una reserva activa por evento, por día** — sin importar
la hora. Reemplaza una regla anterior más estricta ("una sola reserva activa en todo el
sistema"): ahora el control es por combinación `usuario + evento + fecha`, no global.

- Un mismo colaborador **sí puede** reservar eventos distintos el mismo día (p. ej. "Masaje de
  relajación" a las 09:00 y "Silla de masajes" a las 15:00, ambos el lunes).
- Un mismo colaborador **no puede** reservar el mismo evento dos veces el mismo día, sin
  importar la hora (si ya tiene "Masaje de relajación" el lunes a las 09:00, un intento de
  reservarlo también a las 15:00 el mismo lunes se rechaza).
- Cancelar una reserva libera esa combinación evento+día de inmediato, permitiendo volver a
  reservar el mismo evento ese mismo día.
- El administrador puede seguir habilitando la excepción por usuario
  (`usuarios.permite_reservas_multiples`, `POST /api/v1/usuarios/{id}/reservas-multiples`) para
  que a alguien en particular no le aplique este límite.

La validación ocurre en tres capas, de la más temprana (mejor UX) a la más autoritativa
(protección real):

1. **Frontend:** antes de confirmar, `ReservationDialog` consulta `GET /reservas/mias` y avisa
   si el usuario ya tiene una reserva activa para ese evento en esa fecha, deshabilitando el
   botón de confirmar.
2. **Backend:** `ReservaService.crear` vuelve a verificar la misma condición dentro de la
   transacción antes de insertar.
3. **Base de datos (barrera definitiva):** ver [Concurrencia](#concurrencia-y-control-de-duplicados).

## Cuentas de usuario

Los colaboradores **no** se autentican con cédula: tienen una cuenta propia (correo +
contraseña con Bcrypt), completamente separada de la autenticación administrativa. Ambos JWT
usan el mismo `JWT_SECRET` pero llevan un claim `scope` (`"usuario"` vs `"admin"`) que cada
dependencia de FastAPI valida — un token de colaborador nunca sirve en un endpoint de admin, y
viceversa, aunque estén firmados con el mismo secreto (`app/api/deps.py`).

**El registro es abierto:** pide únicamente nombre, apellido, correo y contraseña. Cualquier
persona puede crear una cuenta; el único requisito es que el correo no esté ya en uso (`409` si
lo está). El modelo `usuarios` **no tiene cédula, área ni cargo** — solo identidad (nombre,
apellido), correo, estado de la cuenta y los campos técnicos necesarios para autenticación
(`password_hash`) y auditoría (`created_at`/`updated_at`). Una reserva manual creada por el
administrador (`POST /api/v1/reservas/manual`) identifica al colaborador por **correo**, no por
cédula.

El registro deja al usuario autenticado de inmediato (no hace falta un paso de login
separado). Endpoints: `POST /api/v1/cuenta/registro`, `POST /api/v1/cuenta/login`,
`GET /api/v1/cuenta/me`. Reservas propias: `GET /api/v1/reservas/mias` (nunca expone reservas
de otro usuario) y `POST /api/v1/reservas/{id}/cancelar` (sujeta a la política
`cancelacion_horas_minimas` en `configuracion_general`, 0 = sin restricción por defecto).

**Gestión de cuentas desde el panel administrativo** (`/admin/usuarios`): el administrador
puede consultar las cuentas registradas, **bloquear/desbloquear** una cuenta
(`POST /api/v1/usuarios/{id}/desactivar` y `.../activar` — reutilizan el flag `activo`: un
usuario bloqueado no puede iniciar sesión ni crear reservas nuevas, pero su historial de
reservas se conserva íntegro) y **restablecer la contraseña** de un usuario
(`POST /api/v1/usuarios/{id}/resetear-password`). Las tres acciones quedan registradas en la
auditoría (`bloquear_usuario`, `desbloquear_usuario`, `resetear_password_usuario`).

## Zona horaria: estrategia

Todo el sistema usa **America/Bogota** como única fuente de verdad, de forma consistente en
las cuatro capas:

- **Docker / MariaDB / backend:** los tres contenedores fijan `TZ=America/Bogota`.
- **Backend:** `app/utils/time.py` calcula "ahora" exclusivamente con
  `zoneinfo("America/Bogota")`. Ninguna regla de negocio usa la hora del sistema operativo sin
  pasar por ahí.
- **Base de datos:** las columnas de fecha/hora (`DATE`, `TIME`, `DATETIME`) se guardan como
  hora local de Bogotá **naive** (sin offset). Colombia no observa horario de verano, así que
  no hay ambigüedad: no hace falta guardar el offset porque nunca cambia.
- **Frontend:** nunca usa la zona horaria del navegador como fuente de verdad. El backend es
  quien decide qué horarios están "pasados"; el frontend solo formatea las fechas/horas que
  recibe. El único cálculo de fecha que hace el frontend (qué semana mostrar por defecto) usa
  `Intl.DateTimeFormat` fijando explícitamente `timeZone: "America/Bogota"`, nunca la zona
  horaria local del dispositivo.

## Concurrencia y control de duplicados

Es imposible que dos colaboradores ocupen el mismo horario, y también es imposible que el
mismo colaborador termine con dos reservas activas del mismo evento el mismo día — ambas
reglas están protegidas por índices únicos de MariaDB, no solo por la validación en memoria:

1. **Última barrera — base de datos:** la tabla `reservas` tiene una columna generada
   `slot_lock` (`GENERATED ALWAYS AS (IF(estado = 'activa', 'A', NULL)) STORED`) que se
   reutiliza en **dos** índices únicos. PostgreSQL soporta índices únicos parciales de forma
   nativa, pero **MariaDB no**; esta es la forma estándar de reproducirlo, aprovechando que un
   índice único permite múltiples `NULL`: solo las filas con `estado = 'activa'` compiten, y
   las canceladas (`slot_lock = NULL`) nunca chocan entre sí, liberando lo que protegían.
   - `uq_reserva_activa_slot` sobre `(agenda_id, fecha, hora_inicio, slot_lock)`: nunca dos
     reservas activas para el mismo horario exacto.
   - `uq_reserva_activa_evento_dia` sobre `(usuario_id, servicio_id, fecha, slot_lock)`: nunca
     dos reservas activas del mismo usuario para el mismo evento el mismo día. `servicio_id`
     está desnormalizado en `reservas` (copiado de `agenda.servicio_id` al crear la fila)
     porque un índice solo puede referenciar columnas de su propia tabla.
2. **Revalidación en el backend:** `ReservaService.crear` vuelve a calcular la disponibilidad
   del slot (vía `HorarioService`) y a verificar la regla evento+día, ambas inmediatamente
   antes de insertar, dentro de la misma transacción. Si de todas formas dos solicitudes
   llegan a la vez, un `SELECT ... FOR UPDATE` sobre la fila del usuario serializa los intentos
   concurrentes de la misma persona.
3. **Frontend:** el botón de confirmar se deshabilita y muestra un loader tras el primer clic.
   Si de todas formas llegan dos solicitudes (doble clic, red lenta, etc.), el backend sigue
   protegido por el punto 1: la segunda siempre recibe `409 Conflict`, con un mensaje distinto
   según cuál índice se violó ("El horario seleccionado acaba de ser reservado..." o "Ya tienes
   una reserva para este evento en esta fecha") — esa respuesta y la constraint de base de
   datos son el mecanismo equivalente a idempotencia que exige el sistema.

`backend/tests/test_concurrencia.py` valida **ambas** reglas contra una MariaDB real: dos
colaboradores distintos compitiendo por el mismo slot, y el mismo colaborador compitiendo
consigo mismo por dos horarios del mismo evento el mismo día — en los dos casos, exactamente
un intento tiene éxito.

## Requisitos

- Docker y Docker Compose. No se requiere instalar Node.js, Python ni MariaDB en el servidor.

## Puesta en marcha

```bash
# copie .env.example a .env y ajuste credenciales, JWT_SECRET, ADMIN_INITIAL_PASSWORD y SMTP_*
cp .env.example .env
docker compose up -d --build
```

Al iniciar, el backend aplica las migraciones de Alembic y siembra: el rol `administrador`,
el administrador inicial (usuario/clave de `.env`), y datos de ejemplo mínimos (áreas
"Oficinas"/"Planta", eventos "Masaje de relajación"/"Silla de masajes", una agenda "Masajes -
Oficinas" 08:00–17:00 con almuerzo 12:00–13:00 cada 30 min). Ninguno de estos valores está
codificado en la lógica: son solo filas de ejemplo, editables y reemplazables desde el panel
sin tocar el código. Para probar el portal como colaborador, regístrate desde `/registro` con
cualquier nombre/correo/contraseña — el registro es abierto.

| Servicio            | URL                          |
|----------------------|-------------------------------|
| Portal de reservas   | http://localhost:8080         |
| Panel administrativo | http://localhost:8080/admin   |
| API (Swagger)        | http://localhost:8001/docs    |
| Health check         | http://localhost:8001/health  |

El sistema funciona igual detrás de una IP de red local (`http://IP-DEL-SERVIDOR`) sin ningún
cambio de código: no hay IPs ni dominios fijos en el proyecto — todo sale de `CORS_ORIGINS`
y de rutas relativas (`/api/v1`) en el frontend. Los puertos publicados en el host (`8080`
para el frontend, `8001` para la API — ver `BACKEND_PORT` en `.env`) son configurables si ya
están en uso en su servidor; el frontend siempre llega al backend por la red interna de
Docker (`backend:8000`), sin importar qué puerto de host se elija.

## Variables de entorno

Ver `.env.example` en la raíz (backend) y `frontend/.env.example` (build del frontend).

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión SQLAlchemy a MariaDB (`mysql+pymysql://usuario:clave@db:3306/bd`) |
| `MARIADB_ROOT_PASSWORD`, `MARIADB_DATABASE`, `MARIADB_USER`, `MARIADB_PASSWORD` | Credenciales del contenedor de MariaDB |
| `JWT_SECRET` | Secreto para firmar los JWT (administrativos y de usuario). Genere uno largo y aleatorio en producción — también se usa para derivar la clave de cifrado de la contraseña SMTP guardada en BD |
| `APP_ENV` | `development` \| `production` |
| `APP_TIMEZONE` | Zona horaria única del sistema (`America/Bogota`) |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma |
| `BACKEND_PORT` | Puerto del host publicado hacia el backend (por defecto `8001`; cámbielo si ya está en uso) |
| `ADMIN_USER`, `ADMIN_INITIAL_PASSWORD` | Credenciales del administrador inicial (cámbielas tras el primer login) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS`, `SMTP_FROM`, `SMTP_FROM_NAME` | Configuración SMTP por defecto (fallback si no hay una guardada desde el panel — ver [Configuración SMTP](#configuración-smtp-y-notificaciones)) |
| `VITE_API_URL` | Base de la API que usa el frontend (en Docker, ruta relativa `/api/v1`) |

Ninguna credencial ni secreto está escrito en el código fuente; todo se lee de variables de
entorno (`app/config.py`, 12-factor).

## Migraciones (Alembic)

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic revision --autogenerate -m "descripcion_del_cambio"
```

No se debe modificar el esquema de MariaDB manualmente en producción: todo cambio de modelo
pasa por una migración de Alembic versionada en `backend/alembic/versions/`:

- `0001_inicial`: esquema base.
- `0002_cuentas_smtp_eventos`: cuentas de usuario, campos de tarjeta del evento, notificaciones
  y configuración SMTP.
- `0003_registro_sin_cedula`: `usuarios.cedula` pasa a ser opcional (paso intermedio).
- `0004_simplificar_usuarios`: se eliminan por completo `usuarios.cedula`, `.area` y `.cargo` —
  la cuenta queda reducida a nombre, apellido, correo y los campos técnicos de autenticación.
- `0005_regla_evento_dia`: agrega `reservas.servicio_id` (desnormalizado) y el índice único
  `uq_reserva_activa_evento_dia`, reemplazando la regla global de una reserva por usuario por
  la regla de una reserva por usuario+evento+día.

## Administrador inicial

Se crea automáticamente al levantar el backend, a partir de `ADMIN_USER` /
`ADMIN_INITIAL_PASSWORD`. Cambie la contraseña desde el panel (`/admin`, menú de usuario →
Cambiar contraseña) o por API (`POST /api/v1/auth/cambiar-password`) apenas despliegue. El
modelo de datos ya soporta múltiples administradores y roles (tabla `roles`) para cuando se
necesite, aunque hoy solo se usa el rol `administrador`.

## Configuración SMTP y notificaciones

El envío del correo de confirmación está **desacoplado** de la creación de la reserva: se
dispara en una `BackgroundTask` después de que la reserva ya quedó confirmada y guardada. Si
el servidor SMTP falla o no está configurado, la reserva **no se revierte** — queda registrada
en `notificaciones` con `estado = 'fallido'` y el motivo, y la respuesta de la API ya había
informado `correo_confirmacion: "pendiente"` al frontend.

Dos formas de configurar SMTP (la de base de datos tiene prioridad si existe):

1. **Variables de entorno** (`SMTP_*` en `.env`) — valor por defecto, útil para el despliegue
   inicial sin tocar la interfaz.
2. **Panel administrativo** (`/admin/configuracion`, sección SMTP): host, puerto, usuario,
   contraseña, TLS y remitente, editables sin reiniciar contenedores. La contraseña se cifra
   con Fernet antes de guardarse (`app/utils/crypto.py`, clave derivada de `JWT_SECRET`) y
   **nunca se vuelve a mostrar** en la respuesta de la API — solo se indica si hay una
   guardada. Un botón "Enviar correo de prueba" confirma que la configuración funciona.

La tabla `notificaciones` deja preparada la arquitectura para agregar más adelante correos de
cancelación, modificación o recordatorio sin cambiar el esquema (columna `tipo`).

## Backup y restauración de MariaDB

**Backup** (dump lógico completo, incluye estructura y datos — reservas históricas,
notificaciones, configuración general y SMTP incluidas):

```bash
docker compose exec db mariadb-dump -u root -p"$MARIADB_ROOT_PASSWORD" \
  --single-transaction --routines --events "$MARIADB_DATABASE" > backup_$(date +%F).sql
```

Guarde el archivo fuera de la carpeta `data/` (por ejemplo, en un almacenamiento de respaldo
externo). Recomendado: automatizarlo con cron y conservar varias versiones.

**Restauración:**

```bash
cat backup_2026-08-13.sql | docker compose exec -T db mariadb -u root -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"
```

**Backup de los archivos de datos completos** (alternativa a nivel de archivo; como MariaDB
persiste en `./data/mariadb` dentro del propio proyecto, basta con copiar esa carpeta con el
servicio detenido, sin usar `docker volume`):

```bash
docker compose stop db
tar czf backup_data_$(date +%F).tar.gz -C data mariadb
docker compose start db
```

Para restaurar este tipo de backup, detenga el servicio, reemplace el contenido de
`data/mariadb` por el del tar (`rm -rf data/mariadb && tar xzf backup_data_2026-08-13.tar.gz -C data`)
y vuelva a iniciar.

## Base de datos compartida en la red local

Por defecto, `docker compose up -d --build` (el comando estándar, sin cambios) levanta los 3
servicios de siempre — incluida su propia MariaDB — así que cualquier despliegue normal de un
solo equipo sigue funcionando exactamente igual. Si en cambio quiere que un único equipo de la
red (por ejemplo un servidor) aloje la base real y que otro equipo de esa misma LAN (por
ejemplo su PC local) se conecte a esa misma base en vez de tener la suya propia, use
`docker-compose.client.yml`:

- **En el equipo que aloja la base** (el que debe tener los datos reales, con el puerto 3306
  accesible desde la LAN): no cambia nada, sigue con el comando de siempre:

  ```bash
  docker compose up -d --build
  ```

- **En el equipo que quiere usar esa base remota en vez de la suya propia** (por ejemplo su PC
  local): use el archivo alternativo, que no incluye el servicio `db`:

  ```bash
  docker compose -f docker-compose.client.yml up -d --build
  ```

  con estas variables en su `.env`:

  ```bash
  DB_HOST=192.168.2.14        # IP en la LAN del equipo que aloja la base
  DB_PORT=3306
  MARIADB_USER=root           # deben coincidir exactamente con las del equipo que aloja la base
  MARIADB_PASSWORD=...
  MARIADB_DATABASE=reservas
  ```

  Por defecto la app se conecta como `root` de MariaDB (no se crea un usuario de aplicación
  aparte); si prefiere un usuario con privilegios acotados en vez de root, defina
  `MARIADB_USER`/`MARIADB_PASSWORD` con otro nombre en el `.env` del equipo que aloja la base
  **antes** del primer arranque (el contenedor oficial solo crea ese usuario al inicializar
  una base vacía).

**Advertencias importantes:**

- El puerto 3306 queda expuesto a toda la red local, no solo a Docker. Úsese solo dentro de
  una LAN de confianza (oficina/casa); no lo exponga a internet sin una VPN o un firewall que
  restrinja el origen.
- No corra `pytest` desde un equipo que apunta a la base compartida: las pruebas crean y
  destruyen una base `reservas_test` completa, algo que no debe tocar el servidor que aloja
  los datos reales. Las pruebas automatizadas están pensadas para correrse en el equipo que
  también aloja su propia MariaDB (`docker compose up -d --build`, sin `docker-compose.client.yml`)
  o en un entorno aparte.

## Pruebas automatizadas

```bash
docker compose exec backend pytest
```

Las pruebas corren contra una MariaDB real (crean y recrean una base `reservas_test`
dedicada), porque la regla de concurrencia depende de comportamiento específico de MariaDB
(columna generada + índice único) que no tendría sentido validar contra un motor distinto.
Cobertura incluida en `backend/tests/`:

- `test_horario_service.py`: generación de slots — horario completo, franja final incompleta,
  almuerzo total/parcial, bloqueos (rango y día completo), festivos, hora pasada, fecha
  completamente pasada, agenda inactiva.
- `test_reserva_service.py`: usuario inactivo, no puede reservar el mismo evento dos veces el
  mismo día, sí puede reservar otro evento el mismo día, sí puede reservar el mismo evento otro
  día, excepción de reservas múltiples, cancelación y reutilización del slot/evento-día,
  cancelación propia (dueño vs. ajeno, política de horas mínimas), slot ya ocupado por otro
  usuario, horario fuera de la agenda, agenda inactiva.
- `test_cuenta.py`: registro abierto (sin cédula ni ningún otro requisito previo), correo ya en
  uso (409), login válido/inválido, cuenta bloqueada no puede iniciar sesión, `/cuenta/me`, que
  un token de usuario no sirva en endpoints de admin (y viceversa), y la gestión de cuentas
  desde el panel (bloquear/desbloquear una cuenta y verificar que afecta el login, restablecer
  contraseña, y que ambas acciones queden en la auditoría).
- `test_api_flujo.py`: flujo público completo por HTTP (requiere sesión de usuario, incluye
  reservar un segundo evento distinto el mismo día), un usuario nunca puede cancelar la reserva
  de otro, conflicto 409 por slot ocupado, reserva manual por admin identificando por correo
  (incluido correo inexistente → 404), reinicio de semana (verifica que no borra filas),
  auditoría, búsqueda administrativa de reservas por nombre/correo.
- `test_concurrencia.py`: **pruebas obligatorias** — dos colaboradores distintos compitiendo
  por el mismo slot, y el mismo colaborador compitiendo consigo mismo por dos horarios del
  mismo evento el mismo día; en ambos casos, contra MariaDB real, exactamente un intento tiene
  éxito.
- `test_email_service.py`: envío exitoso registra `notificaciones.estado = 'enviado'`; un
  fallo de SMTP (mockeado) **no revierte la reserva** y queda registrado como `'fallido'` con
  el error; sin SMTP configurado no se intenta conectar.

## Modo desarrollo (sin Docker)

Backend:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="mysql+pymysql://reservas:reservas@localhost:3306/reservas"
alembic upgrade head && python -m scripts.create_admin
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Despliegue con dominio (Nginx Proxy Manager)

El sistema no tiene ninguna IP ni dominio codificado. Para publicarlo con
`https://agenda.empresa.com` detrás de Nginx Proxy Manager:

1. Levante la pila con `docker compose up -d` en la red interna del servidor (sin exponer
   `8080`/`BACKEND_PORT` públicamente si NPM y esta pila comparten una red Docker; si no,
   exponga solo el puerto que NPM necesite alcanzar).
2. En NPM, cree un *Proxy Host* apuntando al contenedor/puerto del servicio `frontend`
   (que ya sirve el frontend y reenvía `/api` al backend), con el dominio deseado.
3. Solicite el certificado (Let's Encrypt) desde NPM y fuerce HTTPS.
4. Actualice `CORS_ORIGINS` en `.env` para incluir `https://agenda.empresa.com` y reinicie el
   backend (`docker compose up -d backend`).
5. Con HTTPS activo, la aplicación queda lista para instalarse como PWA (el `manifest.json` ya
   está preparado en `frontend/public/`); antes de habilitar la instalación agregue íconos
   reales y, si se desea soporte offline, un service worker — ninguno de los dos es necesario
   para el funcionamiento normal en red local por HTTP.

## Protección de datos personales

El sistema trata datos personales de colaboradores colombianos y se diseñó considerando la
Ley 1581 de 2012 (principio de minimización de datos):

- El catálogo público de eventos (`GET /eventos`) y la disponibilidad no exponen ningún dato
  personal: son iguales para cualquier visitante, con o sin sesión.
- Un colaborador solo puede ver y gestionar su propia información: `GET /cuenta/me` y
  `GET /reservas/mias` devuelven exclusivamente lo del usuario autenticado (por `usuario_id`
  del JWT, nunca por un parámetro que el cliente pueda manipular); no existe ningún endpoint
  público de búsqueda o listado de otros colaboradores.
- El historial completo de reservas de cualquier colaborador solo es visible autenticado como
  administrador; el propio modelo de usuario ya es mínimo (nombre, apellido, correo y campos
  técnicos), sin datos adicionales que minimizar.
- La bitácora de auditoría registra quién hizo qué y cuándo sobre información administrativa,
  sin capturar datos personales adicionales a los estrictamente necesarios para la
  trazabilidad.
- Quedan pendientes de definición por la empresa: la política de tratamiento de datos
  personales formal y sus textos de aviso de privacidad, que este sistema está preparado para
  incorporar (por ejemplo, como texto configurable en `configuracion_general` o en el propio
  frontend) sin requerir cambios estructurales.
- Protección básica contra abuso: *rate limiting* en `POST /cuenta/registro` y
  `POST /cuenta/login` (`RATE_LIMIT_AUTH`, por defecto 10 solicitudes/minuto por IP).
