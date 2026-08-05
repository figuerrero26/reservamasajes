# Sistema Web de Reservas de Bienestar

Aplicación para gestionar reservas de actividades de bienestar (masajes, silla de masajes, etc.). Los colaboradores reservan usando únicamente su cédula, y un administrador configura áreas, servicios, agendas y horarios desde la base de datos. Toda la operación usa la zona horaria única **America/Bogota**.

Este repositorio es un **scaffold ejecutable**: la arquitectura por capas está montada de punta a punta y las piezas centrales del dominio ya funcionan (generación dinámica de horarios, control de concurrencia y regla global de reserva única).

## Arquitectura

- **Backend:** FastAPI + SQLAlchemy 2.x + Alembic + Pydantic v2 + JWT (PyJWT) + Passlib/Bcrypt. Organizado en capas: `api → services → repositories → models`, con `schemas` (Pydantic) para los contratos y `auth`, `database`, `utils` como soporte.
- **Frontend:** React 19 + TypeScript + Vite + MUI + React Router + Axios.
- **Base de datos:** PostgreSQL 16.
- **Infraestructura:** Docker + Docker Compose. El frontend se sirve con Nginx, que además hace de proxy inverso hacia la API (`/api → backend:8000`).

## Requisitos

- Docker y Docker Compose.

## Puesta en marcha (Docker)

```bash
cp .env.example .env      # ajuste credenciales y JWT_SECRET
docker compose up -d --build
```

Al levantar, el backend aplica las migraciones de Alembic, crea el administrador inicial y siembra datos de ejemplo mínimos (un área, un servicio, una agenda "Masajes - Oficinas" 08:00–17:00 con almuerzo 12:00–13:00 y un colaborador de prueba con cédula `123456789`).

| Servicio           | URL                              |
|--------------------|----------------------------------|
| Aplicación (web)   | http://localhost:8080            |
| Panel admin        | http://localhost:8080/admin      |
| API (docs Swagger) | http://localhost:8000/docs       |
| Health check       | http://localhost:8000/health     |

**Credenciales del administrador inicial** (configurables en `.env`): usuario `admin`, contraseña `Admin123*`. Cámbielas antes de exponer el sistema.

## Estructura del proyecto

```
reservamasajes/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── app/
│   │   ├── api/v1/        # routers (auth, areas, servicios, agendas, reservas)
│   │   ├── services/      # lógica de negocio (horarios, reservas, ...)
│   │   ├── repositories/  # acceso a datos
│   │   ├── models/        # entidades SQLAlchemy
│   │   ├── schemas/       # contratos Pydantic
│   │   ├── auth/          # hashing y JWT
│   │   ├── database/      # motor y sesión
│   │   └── utils/         # utilidades de tiempo (TZ Bogotá)
│   ├── alembic/           # migraciones
│   └── scripts/           # create_admin, import_empleados
└── frontend/
    └── src/
        ├── pages/         # ReservaPage (público), LoginPage, admin/DashboardPage
        ├── services/      # cliente axios y llamadas a la API
        ├── contexts/      # AuthContext (JWT)
        ├── layouts/ routes/ hooks/ components/ types/
```

## Reglas de negocio ya implementadas

- **Generación dinámica de horarios:** los turnos se calculan desde la configuración de la agenda; se excluyen los que solapan el almuerzo (total o parcial), la franja final incompleta, los horarios pasados (en hora de Bogotá), los días no habilitados, los festivos y los bloqueos.
- **Regla global de reserva única:** un colaborador solo puede tener una reserva activa en todo el sistema. El administrador puede habilitar una reserva adicional puntual por colaborador.
- **Control de concurrencia:** un índice único parcial de PostgreSQL (`WHERE estado = 'activa'`) impide que dos confirmaciones simultáneas tomen el mismo turno.
- **Ciclo de vida de la reserva:** estados activa / cancelada / completada / no_asistió; cancelar libera el horario.
- **Auditoría:** las acciones administrativas quedan registradas en la bitácora.

## Importación de empleados

Con los contenedores arriba:

```bash
docker compose exec backend python -m scripts.import_empleados /ruta/al/archivo.xlsx
```

El archivo requiere las columnas `cedula` y `nombre_completo` (opcionales: `area`, `cargo`, `correo`). El script valida el formato, reporta filas rechazadas y cédulas duplicadas, y actualiza los empleados existentes sin afectar sus reservas.

## Migraciones (Alembic)

```bash
docker compose exec backend alembic upgrade head           # aplicar
docker compose exec backend alembic revision --autogenerate -m "cambio"  # nueva
```

## Modo desarrollo (sin Docker)

Backend:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg://reservas:reservas@localhost:5432/reservas"
alembic upgrade head && python -m scripts.create_admin
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxy /api → localhost:8000)
```

## Pendiente por desarrollar

Este scaffold prioriza la columna vertebral del sistema. Quedan como siguientes fases: gestión completa de agendas desde la UI (creación con selección de área/servicio y horarios), administración de bloqueos y festivos desde el panel, reportes y exportaciones, listado y cancelación de reservas desde la UI, reinicio semanal desde el panel, recuperación de contraseña, gestión de múltiples administradores/roles, PWA instalable y la suite de pruebas automatizadas.

## Notas técnicas

- `bcrypt` está fijado a `4.0.1` por compatibilidad con Passlib 1.7.x.
- Defina un `JWT_SECRET` largo y aleatorio en producción.
