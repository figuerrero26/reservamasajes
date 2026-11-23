# Correcciones y mejoras — noviembre 2026

Registro de cada problema encontrado en el diagnóstico técnico, su causa raíz, la solución
implementada y cómo se verificó. Rama: `mejora-integral`.

Cómo correr las pruebas:

```bash
# Unitarias (sin base de datos, cualquier equipo):
cd backend && pytest tests/test_unitarias_logica.py
# Suite completa contra MariaDB (dentro del contenedor):
docker compose exec backend pytest
```

---

## 1. Bucle infinito al generar turnos cerca de la medianoche

- **Síntoma:** una agenda 20:00–23:45 con turnos de 30 min (o cualquier `hora_fin` a menos de
  una duración de las 24:00), o una agenda editada con duración 0, dejaba colgado el worker
  del backend y consumía memoria sin límite. El endpoint afectado es público
  (`GET /agendas/{id}/horarios`).
- **Causa raíz:** el generador sumaba minutos a objetos `time`; al pasar de las 23:59 el valor
  "daba la vuelta" a 00:00, que se comparaba como anterior a `hora_fin` y el ciclo nunca
  terminaba. Además `AgendaUpdate` no validaba `duracion_minutos` (con 0 el cursor nunca
  avanzaba).
- **Solución:** `horario_service.grilla_agenda` calcula la grilla en minutos enteros
  (`cursor + duración <= fin`), con un tope duro de 288 turnos por día. `add_minutes` ahora
  lanza error en vez de dar la vuelta. Duración validada entre 5 y 480 en creación **y**
  edición; el horario debe alcanzar al menos para un turno; el almuerzo debe quedar dentro
  del horario; `dias_habilitados` se valida (antes un valor como `"a"` rompía cada consulta).
- **Pruebas:** `test_unitarias_logica.py` (casos 20:00–23:45, 08:00–23:59, duración 0 y
  negativa, tope de seguridad; cada caso con tiempo límite para detectar bucles) y
  `test_correcciones_reservas.py::test_agenda_nocturna_genera_turnos_sin_colgarse`,
  `test_no_se_puede_guardar_duracion_cero`, `test_dias_habilitados_invalidos_se_rechazan`.

## 2. Modificar una agenda con reservas existentes

- **Síntoma:** cambiar la duración o la hora de inicio dejaba reservas futuras fuera de la
  nueva grilla: el turno que se cruzaba con ellas aparecía libre (doble reserva física) y la
  vista "por día" dejaba de mostrarlas.
- **Causa raíz:** la ocupación se calculaba por coincidencia exacta de `hora_inicio`, y la
  edición de agendas no consideraba las reservas.
- **Solución:** (a) `AgendaService.actualizar` comprueba, para cualquier cambio estructural
  (horario, duración, almuerzo, días, evento o área), que cada reserva activa futura siga
  siendo un turno exacto de la nueva configuración; si no, responde `409` con
  `reservas_afectadas` y **no modifica nada** (las reservas nunca se tocan automáticamente).
  El panel muestra la lista y permite cancelarlas con aviso antes de volver a guardar. (b) La
  ocupación se calcula por **solapamiento**, así ni datos históricos permiten turnos
  solapados. (c) La vista por día agrega las reservas que no coinciden con la grilla actual,
  marcadas como "fuera del horario actual".
- **Pruebas:** `test_cambio_de_duracion_incompatible_con_reservas_futuras_se_rechaza`,
  `test_deshabilitar_dia_con_reserva_se_rechaza`, `test_cambio_compatible_con_reservas_se_aplica`,
  `test_cambiar_evento_de_agenda_con_reservas_se_rechaza`,
  `test_reserva_fuera_de_grilla_bloquea_turnos_solapados`.

## 3. Bloqueos y festivos sobre reservas existentes

- **Síntoma:** crear un bloqueo o festivo no informaba qué reservas había en el periodo, no
  avisaba al colaborador y la vista por día devolvía una lista vacía para ese día, ocultando
  las reservas.
- **Causa raíz:** el bloqueo solo afectaba la generación de turnos; no existía ningún proceso
  para las reservas ya creadas.
- **Solución:** crear un bloqueo/festivo devuelve `reservas_afectadas` (por agenda, fecha y
  solapamiento horario) y existen `GET /bloqueos/{id}/reservas-afectadas` y
  `GET /festivos/{id}/reservas-afectadas`. Las reservas **no se cancelan**: el panel muestra
  un diálogo para mantenerlas o cancelar las seleccionadas con confirmación explícita, motivo
  y correo al colaborador (`POST /reservas/cancelar-lote`, nuevo tipo de correo
  `cancelacion`). La vista por día muestra el día bloqueado con las reservas adentro.
- **Pruebas:** `test_bloqueo_informa_reservas_afectadas_sin_cancelarlas`,
  `test_festivo_informa_y_la_vista_por_dia_no_oculta_reservas`,
  `test_cancelar_lote_confirmado_cancela_y_notifica`.

## 4. Desactivación de eventos y áreas

- **Síntoma:** un evento (servicio) o área desactivado seguía aceptando reservas por API;
  `/agendas/publicas` y `/horarios` lo seguían ofreciendo; un área inactiva seguía visible.
- **Causa raíz:** solo se verificaba `agenda.activo`.
- **Solución:** una única regla, `horario_service.agenda_reservable` (agenda + evento + área
  activos), aplicada en el catálogo, la disponibilidad y la creación de reservas (pública y
  manual). La desactivación conserva las reservas futuras y las informa; existen endpoints
  `.../activar` que restauran exactamente las agendas que estaban activas.
- **Pruebas:** `test_desactivar_evento_corta_reservas_en_backend_y_reactivar_restaura`,
  `test_desactivar_area_saca_sus_agendas_del_portal`.

## 5. Correos de las inscripciones a actividades

- **Síntoma:** las inscripciones no enviaban confirmación.
- **Solución:** correo de confirmación (actividad, fecha, hora, lugar, estado, información
  adicional y contacto) y de cancelación por el administrador. Se envía en segundo plano
  después del commit: un fallo de SMTP queda registrado en `notificaciones` (ahora con
  `inscripcion_id`) y nunca duplica ni revierte la inscripción. Un reintento automático y
  soporte de SSL implícito (puerto 465).
- **Pruebas:** `test_correo_de_confirmacion_de_inscripcion`,
  `test_fallo_de_correo_no_duplica_ni_revierte_la_inscripcion`,
  `test_cancelacion_admin_notifica_al_participante`.

## 6. Actividades: estados, cupos y validaciones

- **Cambios:** estados calculados en el backend para actividad (`abierta`, `agotada`,
  `proximamente`, `cerrada`, `finalizada`) y sesión (`disponible`, `cupo_lleno`, `cerrada`,
  `finalizada`, `inactiva`); campo `lugar` por sesión; el portal indica si el colaborador ya
  está inscrito; la actividad sin sesiones futuras deja de anunciarse; una actividad inactiva
  no expone sus sesiones; no se puede reducir el cupo por debajo de los inscritos ni crear
  sesiones en el pasado o duplicadas; la generación por lotes no duplica, omite fechas
  pasadas y tiene límites; el colaborador no puede cancelar una inscripción de una sesión que
  ya empezó; validación de opciones de selección y claves únicas del formulario; ventana de
  inscripción coherente. Conteos de inscritos en una sola consulta (antes uno por sesión).
- **Pruebas:** `test_actividades.py` completo (flujo, concurrencia sobre el último cupo,
  ventana, estados, validaciones, lotes, cancelación) y la parte de estados de
  `test_unitarias_logica.py`.

## 7. Otros errores corregidos

| Problema | Causa raíz | Solución | Prueba |
|---|---|---|---|
| Admin bloqueado/eliminado o con rol cambiado conservaba acceso hasta 8 h | Solo se validaba la firma del JWT | `get_current_admin`/`get_current_usuario` verifican la cuenta en BD y usan el rol vigente | `test_admin_bloqueado_pierde_acceso_de_inmediato`, `test_cambio_de_rol_aplica_sin_esperar…`, `test_usuario_bloqueado_pierde_acceso…` |
| Límite de intentos compartido por todos los usuarios e IP de auditoría siempre igual | uvicorn sin `--proxy-headers` detrás de nginx | `--proxy-headers --forwarded-allow-ips` en `entrypoint.sh`; límite también en el login del panel | — (configuración) |
| Un colaborador podía cancelar una reserva que ya ocurrió | Sin chequeo de hora cuando `cancelacion_horas_minimas = 0` | Rechazo si el turno ya empezó; `puede_cancelar` en "Mis reservas" | `test_no_se_puede_cancelar_una_reserva_que_ya_ocurrio` |
| Reinicio semanal cancelaba reservas ya ocurridas y aceptaba cualquier día | Sin validaciones | Exige lunes, cancela solo futuras y notifica (el reinicio semanal se retiró en la tercera ronda) | `test_reinicio_semanal_exige_lunes` (reemplazada) |
| Valores de configuración inválidos rompían el portal | Texto libre sin validar | Validación por clave (colores, horas, URL, correo, longitudes) | `test_configuracion_rechaza_valores_invalidos`, `test_configuracion_invalida_se_rechaza_por_api` |
| Nombres duplicados al editar daban error 500 | Solo se validaba al crear | Validación en edición + manejador global de `IntegrityError` → 409 | `test_editar_servicio_con_nombre_duplicado_da_409` |
| Campos obligatorios enviados como `null` daban 500 | `exclude_unset` deja pasar `None` explícito | Rechazo explícito por campo | — |
| Semana activa con fin antes del inicio | Sin validación | Validación de orden y longitud máxima (hoy la valida la vigencia de cada evento) | unitaria |
| Bloqueo con agenda inexistente → 500 | Sin validación | 400 legible | — |
| Migración 0009 no creaba el índice `inscripciones.estado` | Diferencia modelo/migración | Migración 0010 | SQL offline revisado |
| "Mis reservas" mostraba "—" si el evento se desactivaba | El nombre se buscaba en el catálogo público | La API devuelve `evento_nombre`/`area_nombre` | `test_mis_reservas_trae_nombre…` |
| Fecha "hoy" del panel de reservas según la zona del navegador | `new Date()` local | `hoyBogota()` | — |
| La interfaz seguía "logueada" tras expirar el token del colaborador | El interceptor solo limpiaba `localStorage` | Evento que cierra la sesión en el contexto | — |
| Login del panel decía "credenciales inválidas" aunque el servidor estuviera caído | Mensaje fijo | Mensaje real del error (red, 429, credenciales) | — |
| `?next=` podía apuntar fuera del sitio | Sin validación | `destinoSeguro()` | — |
| Vista previa del correo sin aislamiento | `iframe` sin `sandbox` | `sandbox=""` y color validado en el HTML del correo | — |
| Contraseña de admin por defecto escrita en `docker-compose.yml` | Valor real como default | Placeholder | — |

## 8. Respaldo antes de migrar

`backend/scripts/respaldo_pre_migracion.py` genera un volcado SQL completo en
`data/backups/` antes de aplicar migraciones pendientes; si falla, el backend no arranca y
no se migra. La migración 0010 es 100 % aditiva (dos columnas nulas y dos índices).

## 9. Pendientes que requieren decisión del equipo

- `.env` (con `JWT_SECRET` y contraseñas) y `data/mariadb` siguen versionados en git por
  decisión previa. Recomendación: rotar los secretos, sacarlos del repositorio y del
  historial, y mover la base a respaldos SQL (ver README › Backup). No se hizo porque cambia
  el flujo de despliegue actual entre equipos.
- El puerto 3306 sigue publicado con `root@'%'` porque otros equipos de la LAN usan esa base
  compartida. Recomendación: un usuario de aplicación con permisos solo sobre `reservas` y
  restringir el acceso por firewall.

---

# Ajustes de diseño y organización — noviembre 2026 (segunda ronda)

| Pedido | Implementación | Verificación |
|---|---|---|
| Menú superior verde con buen contraste | Fondo con el verde de marca (`color_primario`, `#7f9136`). El contraste se calcula: título e íconos grandes en blanco (3,5:1, válido para texto grande) y textos pequeños en negro (6:1); botón principal negro. El color del texto de todos los botones verdes también se elige por contraste. | Compilación y revisión de contraste con la fórmula WCAG (`getContrastRatio`). |
| Pie de página negro con amarillo, contacto y "@PYP YP" | Fondo negro, acentos en el amarillo de marca (`color_secundario`, `#edcd30`), correo y teléfono desde la configuración, "@PYP YP" pequeño abajo a la derecha. Se eliminó la política de privacidad (enlace, página, mención en el registro y campo de configuración). | `test_politica_de_privacidad_ya_no_es_configurable`. |
| Título "Vive la Semana Sigra Vive \| Reserva un espacio" | El título vive en la configuración (`sistema_nombre`): la migración 0011 cambia "Reserva tu Masaje" por "Reserva un espacio" en cualquier valor que lo contenga. También `index.html`, `manifest.json` y los valores iniciales del portal. | SQL de la migración revisado en modo offline. |
| Contacto talentohumano@sigra.com / +57 3152579481 | La migración 0011 los guarda en la configuración solo si no hay valores (nunca pisa uno existente); se ven en el pie de página y en los correos. | SQL offline. |
| Tarjetas con verdes suaves y disponibilidad destacada | Sin foto: fondo verde suave y opaco derivado de la marca. Bloque de disponibilidad con número grande, barra de ocupación y colores por nivel (alta / pocos cupos / agotado). Botón amarillo con texto negro (antes texto amarillo sobre blanco, contraste 1,5:1). | `test_resumen_de_turnos_disponibles_en_el_catalogo`, `test_duracion_del_evento_sale_de_sus_agendas`. |
| Unificar Eventos y Agendas; orden Eventos, Áreas, Agendas | Módulo único "Eventos" (turnos + actividades, con sus agendas o sesiones e inscritos); menú en el orden pedido; rutas antiguas redirigidas; componentes compartidos (formulario de agenda, horario, selector de área, sesiones, inscritos) para no duplicar código. | Compilación de TypeScript y de producción. |
| Área obligatoria y filtrable | Eventos por turnos: se crean con su área y su primera agenda en una sola transacción. Actividades: columna `area_id` obligatoria (migración 0011; las antiguas quedan marcadas "sin área" y no se pueden volver a publicar sin asignarla). Filtros `area_id` en `/servicios`, `/agendas`, `/actividades` y `/actividades/publicas`. Un área inactiva oculta también sus actividades. | `test_areas_eventos.py` (13 pruebas). |

Pruebas unitarias nuevas (sin BD): días reservables, cálculo puro de turnos con bloqueos,
festivos, solapamiento y horas pasadas, y cierre de inscripciones por área inactiva.

Nota: la Ley 1581 de 2012 exige tener disponible la política de tratamiento de datos
personales; al retirarla del portal conviene publicarla por otro canal oficial de SIGRA.

---

# Ajustes funcionales y visuales — noviembre 2026 (tercera ronda)

| Pedido | Implementación | Verificación |
|---|---|---|
| Tarjetas del home sin cupos ni turnos | Las tarjetas muestran solo tipo, nombre, descripción, área, duración (turnos) y vigencia. La disponibilidad se calcula y se muestra únicamente en el detalle: `GET /eventos` ya no calcula turnos (más liviano) y `GET /eventos/{id}` trae `dias_reservables` y el resumen. | `test_disponibilidad_solo_en_el_detalle_del_evento`, compilación. |
| Bordes amarillos en el menú superior | Todos los botones del menú (y el de menú en móvil) llevan un borde amarillo de 1,5 px. El amarillo de marca da 2,2:1 sobre el verde; se usa el mismo matiz con la luminosidad justa para 3:1 (mínimo WCAG para bordes), calculado en `theme.tonoConContraste`. | Fórmula de contraste WCAG. |
| Quitar el filtro por área del home | Eliminado del portal; el filtro por tipo se conserva. La relación evento–área no cambia (y el panel la sigue filtrando). | Compilación. |
| Vigencia por evento con cierre automático | Columnas `vigencia_inicio`/`vigencia_fin`/`finalizado_en` (migración 0012). Estados próximo, vigente y finalizado calculados en cada solicitud con la fecha de Bogotá: el cierre no depende de que alguien entre al panel. Tarea programada del backend que registra el cierre (`finalizado_en` + auditoría) sin tocar reservas, inscripciones ni el flag `activo`. Filtros de vigencia e historial en el panel. | `test_vigencia_restricciones.py`, `test_vigencia_unitarias.py`. |
| "@For YP" | Reemplaza "@PYP YP": abajo a la derecha, más pequeño (0,6 rem) y más transparente. | Compilación. |
| Quitar configuraciones globales que ya no aplican | Retirados: semana activa, restricción "evento único por semana" y reinicio semanal (endpoints `/semana/*`, campos de configuración y secciones del panel). Se adaptó todo lo que dependía de ellos: disponibilidad, días del calendario, validación de reservas y aviso previo del portal. Revisadas las demás opciones: siguen en uso (el "color del botón" se renombró a "color de los botones de las tarjetas"). Las filas antiguas de configuración se conservan sin uso. | `test_semana_activa_global_ya_no_existe`. |
| Restricción de participación por evento | `limite_participaciones` + `periodo_limite` (toda la vigencia, día, semana o mes), con opciones adaptadas a cada tipo de evento. Validada en el backend sobre el historial no cancelado; excepción por colaborador; bloqueo de la fila del usuario también en las inscripciones. Aviso previo en el portal con la misma regla (`GET /reservas/verificar`, `puede_inscribirse` por sesión). | `test_una_sola_reserva_durante_toda_la_vigencia`, `test_limite_semanal_en_dias_distintos`, `test_una_sola_inscripcion_por_actividad`, `test_una_inscripcion_por_dia_y_actividades_sin_limite`. |
| Imágenes por archivo o URL | `POST /uploads/imagenes` (JPG, PNG, WEBP, GIF ≤ 5 MB, firma del archivo verificada); URL validada (http/https o archivo subido) en el backend; vista previa, reemplazar y quitar en el panel; aviso si la URL no carga; respaldo verde en tarjetas y detalle. Limpieza automática de archivos sin uso (más de un día). | `test_subir_imagen_de_evento`, `test_limpieza_de_imagenes_huerfanas`, unitarias de imágenes. |

### Errores encontrados y corregidos en esta ronda

| Problema | Causa | Solución |
|---|---|---|
| La semana activa global ya había vencido (17–21 ago.): el portal mostraba eventos sin ningún día reservable | Un único periodo para todos los eventos | Vigencia por evento; la migración la traslada a cada evento para que ninguno se reabra solo |
| El aviso previo del portal repetía en el navegador la regla de reservas y podía no coincidir con la del backend | Lógica duplicada | `GET /reservas/verificar` usa la misma función que crea la reserva |
| Una imagen con URL rota dejaba el ícono de imagen rota en la tarjeta | Sin manejo de error de carga | Respaldo verde (`onError`) en tarjetas y detalle |
| La URL de imagen aceptaba cualquier texto (p. ej. `javascript:`) | Sin validación | Validación en los esquemas del backend y en el formulario |
| Dos inscripciones simultáneas de la misma persona en sesiones distintas podían superar un límite por persona | Solo se bloqueaba la fila de la sesión | Se bloquea primero el usuario y después la sesión |
| La inscripción manual del administrador ignoraba la ventana de fechas, así que podía inscribir en una actividad ya cerrada | La ventana se omitía por completo para el admin | La vigencia aplica a todos; el admin solo omite la pausa manual del portal |

### Qué cambia al desplegar

- El backend respalda la base completa en `data/backups/` antes de aplicar la migración 0012.
- Los eventos por turnos existentes reciben como vigencia la antigua semana activa (17 al 21
  de agosto de 2026), así que aparecen como **finalizados** y fuera del portal hasta que se les
  defina una vigencia nueva desde Catálogo → Eventos → Editar. Sus reservas no se tocan.
- La restricción global "evento único por semana" estaba activa: esos eventos quedan con la
  regla "una sola reserva por persona durante toda la vigencia" (editable por evento).
- Las actividades toman como vigencia su ventana de inscripción o, si no tenían, desde su
  creación hasta su última sesión.

### Pruebas

- Ejecutadas en el equipo de desarrollo: 65 pruebas unitarias (todas pasan), `pyflakes` sin
  hallazgos, TypeScript (`tsc --noEmit`) y compilación de producción (`vite build`) sin
  errores, y el SQL de la migración 0012 generado en modo offline (subida y bajada).
- La suite tiene 177 pruebas (65 unitarias y 112 de integración), todas recolectadas sin
  errores. Las 112 de integración necesitan MariaDB y se corren en el servidor con
  `docker compose exec backend pytest`.

---

# Separación de tipos de evento, contraseñas y firma — noviembre 2026 (cuarta ronda)

| Pedido | Implementación | Verificación |
|---|---|---|
| "@For YP" en el extremo inferior derecho | Fuera del flujo del pie de página (`position: absolute`), a 6–10 px del borde derecho y 4–6 px del inferior del sitio, 0,56 rem y 20 % de opacidad, sin capturar clics (`pointer-events: none`). Queda dentro del margen inferior del pie: no tapa enlaces ni textos. | Navegador real en 6 tamaños: misma distancia al borde en todos y sin superposición con ningún elemento del pie. |
| Detalle de cada evento según su tipo | Reserva: lugar (área, descripción del área y espacio o profesional si lo hay), fechas en lenguaje natural, duración de cada sesión, regla de reserva, cómo reservar y recomendaciones; después, el calendario. Se quitó el conteo técnico de turnos ("99 turnos disponibles"); si no queda ninguno se muestra un aviso. Inscripción: área, fecha y horario de realización, periodo de inscripción, cupos, regla de participación y cómo inscribirse; cada fecha muestra sus cupos (sin contar inscritos cuando no hay límite). Tarjetas del inicio también por tipo. | Capturas de ambos detalles en móvil, tableta y escritorio. |
| Agendas dentro del evento | Se eliminó la sección «Agendas» del panel (su ruta redirige a Eventos). «Gestionar» abre una sola ventana por evento: reserva → *Información y reglas*, *Agendas y horarios* (agregar, editar, activar o desactivar) e *Historial de reservas*; inscripción → *Información y reglas* y *Fechas, cupos e inscritos*. Al crear un evento de reserva se definen de una vez una o varias agendas (`POST /servicios` acepta `agendas`). La lógica de agendas no cambió. | `test_crear_evento_de_reserva_con_varias_agendas`, `test_editar_evento_no_pierde_agendas_ni_reglas`, capturas del panel. |
| Elegir el tipo al crear y ocultar lo que no corresponde | «Nuevo evento» pregunta primero: *Evento de reserva* o *Evento de inscripción*. Cada formulario muestra solo lo suyo: reserva (agendas, horario de atención, duración de turnos, días, restricciones de reserva) e inscripción (fechas de realización, límite de participantes, periodo de inscripción, restricciones de inscripción, preguntas). Las restricciones de inscripción se expresan en fechas («solo una fecha por persona», «hasta N fechas…»), no en reservas por día. | Capturas de los dos formularios en todos los tamaños. |
| Validación del tipo en el backend | Los esquemas de cada tipo (servicios y agendas = reserva; actividades y sesiones = inscripción) rechazan con 422 cualquier campo que no les pertenece, explicando a qué tipo corresponde, al crear y al editar. El panel envía `tipo` y el backend exige que coincida con el endpoint. Nada se guarda ni se ignora en silencio. | `test_api_rechaza_configuraciones_incompatibles_sin_guardar_nada`, `test_esquema_de_reserva_rechaza_configuracion_de_inscripcion`, `test_esquema_de_inscripcion_rechaza_configuracion_de_reserva`. |
| Contraseñas de los administradores | En Administradores: lista de cuentas con la fecha de su contraseña vigente; «Contraseña» (otra cuenta) pide nueva contraseña y confirmación, muestra los requisitos en vivo, permite generar una segura y confirma el resultado; «Mi contraseña» exige la actual. `POST /administradores/{id}/password` solo para el rol con acceso total. | `test_restablecer_contrasena_de_otro_administrador`, `test_la_contrasena_propia_solo_se_cambia_con_la_actual`, `test_sin_permisos_no_se_cambian_contrasenas_por_la_api`. |
| Seguridad de las contraseñas | Solo hash Bcrypt (nunca se devuelven ni se registran). Política: 10+ caracteres con mayúscula, minúscula, número y símbolo; sin el usuario ni el nombre; sin contraseñas comunes; máximo 72 bytes; distinta de la actual (también al crear administradores). Cambiar o restablecer una contraseña cierra de inmediato las sesiones abiertas con la anterior (huella del hash en el token); quien cambia la suya recibe un token nuevo. Auditoría de cada cambio e intento fallido. Límite de intentos en el cambio propio. | `test_politica_rechaza_contrasenas_debiles`, `test_token_sin_huella_de_contrasena_no_sirve`, `test_listado_de_administradores_no_expone_contrasenas`. |
| Firma InfraestructurEF | La migración 0013 cambia `empresa_nombre` de "SIGRA S.A.S" (o vacía) a "InfraestructurEF" y respeta cualquier otro valor; también los valores iniciales del portal. Se muestra sin pasar a mayúsculas, con un acento sutil en «EF», en la portada, el pie de página (descripción y derechos) y los correos. Contacto, título del portal y logo sin cambios. | `test_migracion_cambia_solo_la_firma_sigra` (6 casos), `test_migracion_crea_la_firma_si_no_existe`. |
| Pruebas responsive reales | Microsoft Edge automatizado (Playwright) contra el backend real con datos de ejemplo, en 360, 390, 768, 1024, 1366 y 1920 px: portal sin y con sesión, detalles, formularios de reserva e inscripción, panel completo, creación y gestión de eventos, agendas, usuarios, contraseñas y pie de página. Mide desborde horizontal, elementos fuera de pantalla, desplazamiento lateral interno, objetivos táctiles menores de 24 px, textos cortados con «…» y superposición con la firma; guarda capturas. | Ver resultados abajo. |

### Errores encontrados y corregidos en esta ronda

| Problema | Causa | Solución |
|---|---|---|
| Los esquemas de eventos ignoraban en silencio los campos desconocidos: un evento de reserva podía "aceptar" `cupo_maximo` o `sesiones` sin decir nada | Pydantic descarta campos extra por defecto | Esquemas estrictos por tipo con mensaje que explica el campo incompatible |
| El restablecimiento de contraseña de otro administrador existía en la API pero sin interfaz, sin confirmación, sin política de fortaleza y permitía restablecer la propia sin la contraseña actual | Funcionalidad a medio hacer | Pantalla completa, política única y restablecimiento propio solo con la actual |
| Una sesión abierta seguía valiendo hasta 8 h después de cambiar o restablecer la contraseña | El token no dependía de la contraseña | Huella del hash en el token del panel |
| En el móvil, el diálogo de confirmación de reserva cortaba los correos largos (se salía 18 px) | Fila etiqueta–valor sin permitir saltos de línea | El valor se parte cuando no cabe |
| La tabla de turnos del día (Reservas) obligaba a desplazarse de lado en móvil y tableta vertical (566 px de contenido en 326 px) | Tabla de 6 columnas en cualquier ancho | Por debajo de 900 px cada turno se muestra como fila apilada, con sus acciones |
| El nombre del sistema se cortaba con «…» en el menú lateral del panel | Una sola línea | Solo el título (antes de «\|»), en hasta dos líneas |
| Dos etiquetas de colores se cortaban en Configuración en el móvil | Campos a media columna | Ancho completo en móvil |
| Enlaces del pie de página y «¿Olvidaste tu contraseña?» con zona táctil de 15–22 px | Enlaces de texto sin relleno | Relleno vertical para llegar a ~32 px |
| El texto por defecto de los términos decía que la regla era "una reserva por evento al día" | Quedó de antes de las reglas por evento | Redacción acorde a las reglas propias de cada evento |
| La sección de Configuración en el menú seguía describiendo la "semana activa" | Texto desactualizado | Descripción actual |
| Edge mostraba su propio botón de «ver contraseña» junto al del formulario (dos ojos) | Control nativo del navegador en los campos de contraseña | Se oculta el nativo; queda el del formulario |
| En tableta, tablas de 5–6 columnas (Eventos, Usuarios) obligaban a desplazarse de lado o partían palabras | La vista de tarjetas solo se activaba por debajo de 600 px | La tabla pasa sola a tarjetas cuando no cabe en su espacio (ancho mínimo cómodo por columna) |

### Qué cambia al desplegar

- El backend respalda la base completa en `data/backups/` antes de aplicar la migración 0013.
- La firma pasa a "InfraestructurEF" si era "SIGRA S.A.S" (o estaba vacía). Contacto, título
  del portal y logo no cambian: el logo se puede reemplazar en Configuración.
- Todas las sesiones abiertas del panel se cierran una vez: los administradores (y el visor)
  deben volver a iniciar sesión. A partir de ahí, cambiar o restablecer una contraseña cierra
  solo las sesiones de esa cuenta.
- La política de contraseñas aplica a las contraseñas nuevas: las actuales siguen
  funcionando. Conviene cambiar cuanto antes la del administrador inicial si todavía es la de
  instalación (no cumple la política).
- La sección «Agendas» desaparece del menú: las agendas se gestionan dentro de cada evento de
  reserva (Gestionar → Agendas y horarios). Los enlaces antiguos llevan a Eventos.

### Pruebas

- **Backend** (suite completa, 207 pruebas: 177 anteriores + 30 nuevas), ejecutada en el
  equipo de desarrollo sobre SQLite con las mismas columnas generadas: 205 pasan. Las 2 que
  no pasan son las de traslado de datos de la migración 0012, que usan SQL propio de MariaDB
  (`CAST … AS DATE`) y ya fallaban igual en SQLite antes de esta ronda. Deben correrse en el
  servidor contra MariaDB con `docker compose exec backend pytest`.
- `pyflakes` sin hallazgos; TypeScript (`tsc --noEmit`, también con `--noUnusedLocals`) y
  compilación de producción (`vite build`) sin errores; SQL de la migración 0013 generado en
  modo offline (subida y bajada) y cadena completa 0001 → 0013.
- **Funcionales en navegador** (Edge real contra el backend con datos de ejemplo), 10 de 10:
  reservar un turno y inscribirse desde el móvil; la restricción «solo una fecha» bloquea las
  demás; crear un evento de reserva con dos agendas y uno de inscripción desde el panel (sin
  ver campos del otro tipo); editar una agenda desde el evento; editar un evento sin perder
  sus agendas; restablecer la contraseña de otra cuenta e iniciar sesión con la nueva; el visor
  recibe 403 y un colaborador 401 al intentar cambiar contraseñas por la API; la API rechaza
  una configuración incompatible con un mensaje claro.
- **Responsive** (360, 390, 768, 1024, 1366 y 1920 px; 40 pantallas y estados por tamaño:
  portal sin y con sesión, detalles, formularios de reserva e inscripción, menús móviles, todo
  el panel, creación y gestión de eventos, agendas, usuarios, contraseñas y pie de página):
  240 capturas sin observaciones al cierre (sin desborde horizontal, sin elementos fuera de
  pantalla, sin desplazamiento lateral interno, sin textos cortados, sin objetivos táctiles
  menores de 24 px, sin errores de JavaScript). La firma «@For YP» queda a 6–10 px del borde
  derecho y 4–7 px del inferior en todos los tamaños, sin tocar ningún otro elemento.
