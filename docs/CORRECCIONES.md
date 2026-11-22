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
| Reinicio semanal cancelaba reservas ya ocurridas y aceptaba cualquier día | Sin validaciones | Exige lunes, cancela solo futuras y notifica | `test_reinicio_semanal_exige_lunes` |
| Valores de configuración inválidos rompían el portal | Texto libre sin validar | Validación por clave (colores, horas, URL, correo, longitudes) | `test_configuracion_rechaza_valores_invalidos`, `test_configuracion_invalida_se_rechaza_por_api` |
| Nombres duplicados al editar daban error 500 | Solo se validaba al crear | Validación en edición + manejador global de `IntegrityError` → 409 | `test_editar_servicio_con_nombre_duplicado_da_409` |
| Campos obligatorios enviados como `null` daban 500 | `exclude_unset` deja pasar `None` explícito | Rechazo explícito por campo | — |
| Semana activa con fin antes del inicio | Sin validación | Validación de orden y longitud máxima | unitaria |
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
