export interface AgendaPublica {
  id: number;
  nombre: string;
  area_id: number;
  servicio_id: number;
  area_nombre: string;
  servicio_nombre: string;
  duracion_minutos: number;
}

export interface Area {
  id: number;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/** "Servicio" es el nombre interno; en el portal público se presenta como "Evento". */
export interface Servicio {
  id: number;
  nombre: string;
  descripcion_corta?: string | null;
  descripcion_larga?: string | null;
  imagen_url?: string | null;
  duracion_minutos: number;
  informacion_adicional?: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Agenda {
  id: number;
  nombre: string;
  area_id: number;
  servicio_id: number;
  hora_inicio: string;
  hora_fin: string;
  almuerzo_inicio?: string | null;
  almuerzo_fin?: string | null;
  duracion_minutos: number;
  dias_habilitados: string;
  activo: boolean;
}

/** Referencia mínima usada por el sub-selector de área/agenda de un evento. */
export interface AgendaResumen {
  id: number;
  area_id: number;
  area_nombre: string;
}

/** Tarjeta pública de un evento por turnos. Duración y disponibilidad salen de sus agendas
 * reservables (ver backend EventoPublico). */
export interface EventoPublico {
  id: number;
  nombre: string;
  descripcion_corta?: string | null;
  descripcion_larga?: string | null;
  imagen_url?: string | null;
  duracion_minutos: number;
  duracion_maxima: number;
  informacion_adicional?: string | null;
  areas: string[];
  area_ids: number[];
  agendas: AgendaResumen[];
  turnos_disponibles: number;
  proximo_turno_fecha?: string | null;
  proximo_turno_hora?: string | null;
}

export type EstadoSlot = "disponible" | "ocupado" | "bloqueado" | "pasado";

export interface Slot {
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoSlot;
  disponible: boolean;
}

export interface HorariosResponse {
  fecha: string;
  agenda_id: number;
  slots: Slot[];
}

/** Un turno del día para una agenda, vista administrativa: si está ocupado, trae quién lo
 * reservó (ver GET /reservas/dia). `reserva_estado` distingue si la reserva sigue activa o
 * ya se cerró (completada/no_asistio); `puede_marcar_asistencia` indica si el panel debe
 * ofrecer esa acción (solo reservas activas cuyo horario ya pasó). */
export interface SlotDia {
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoSlot;
  reserva_id: number | null;
  reserva_estado?: "activa" | "completada" | "no_asistio" | null;
  puede_marcar_asistencia?: boolean;
  usuario_nombre?: string | null;
  usuario_apellido?: string | null;
  usuario_correo?: string | null;
  notes?: string | null;
  /** La reserva no coincide con ningún turno de la configuración actual (dato histórico). */
  fuera_de_grilla?: boolean;
}

/** Agenda completa (todos sus turnos) de un día — vista "por día" del panel admin. */
export interface AgendaDia {
  agenda_id: number;
  agenda_nombre: string;
  area_nombre: string;
  evento_nombre: string;
  /** false si la agenda, su evento o su área están desactivados (se muestra por sus reservas). */
  agenda_activa?: boolean;
  slots: SlotDia[];
}

export type EstadoReserva = "activa" | "cancelada" | "completada" | "no_asistio";

export interface Reserva {
  id: number;
  agenda_id: number;
  servicio_id: number;
  usuario_id: number | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoReserva;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
}

/** Vista administrativa de una reserva: agrega identidad del colaborador y nombres
 * legibles de evento/área/agenda (ver GET /reservas, solo para el panel). */
export interface ReservaAdmin extends Reserva {
  usuario_nombre: string;
  usuario_apellido: string;
  usuario_correo?: string | null;
  evento_nombre: string;
  area_nombre: string;
  agenda_nombre: string;
}

/** Vista propia del colaborador (GET /reservas/mias). */
export interface MiReserva extends Reserva {
  evento_nombre: string;
  area_nombre: string;
  puede_cancelar: boolean;
}

/** Respuesta de creación de reserva. El correo se envía en segundo plano: siempre "pendiente". */
export interface ReservaCreada extends Reserva {
  correo_confirmacion: "pendiente";
}

/** Respuesta de acciones administrativas que no cancelan reservas pero las afectan
 * (desactivar evento/área/agenda, crear bloqueo o festivo). */
export interface ConReservasAfectadas {
  reservas_afectadas: ReservaAdmin[];
  /** Solo al desactivar un área: actividades activas que quedan ocultas del portal. */
  actividades_afectadas?: number;
}

export interface CancelarLoteResultado {
  canceladas: number[];
  omitidas: number[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  rol: string;
  nombre: string;
}

/** Cuenta de colaborador (login por correo). Distinta de la autenticación administrativa.
 * Registro abierto: no pide cédula, cualquier persona puede crear una cuenta. */
export interface RegistroRequest {
  nombre: string;
  apellido: string;
  correo: string;
  password: string;
}

export interface LoginUsuarioRequest {
  correo: string;
  password: string;
}

export interface TokenUsuarioResponse {
  access_token: string;
  token_type: string;
  nombre: string;
  apellido: string;
  correo: string;
}

export interface PerfilUsuario {
  id: number;
  nombre: string;
  apellido: string;
  correo: string;
  permite_reservas_multiples: boolean;
}

export interface OlvidePasswordRequest {
  correo: string;
}

export interface RestablecerPasswordRequest {
  token: string;
  password_nueva: string;
}

/** Vista administrativa del colaborador (uso interno, nunca expuesta al portal público).
 * Solo lo mínimo: identidad, correo, estado de la cuenta y campos técnicos. */
export interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  correo?: string | null;
  tiene_cuenta: boolean;
  activo: boolean;
  permite_reservas_multiples: boolean;
  created_at: string;
  updated_at: string;
}

export type TipoBloqueo = "dia" | "rango";

export interface Bloqueo {
  id: number;
  agenda_id?: number | null;
  tipo: TipoBloqueo;
  fecha: string;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  motivo?: string | null;
  creado_por?: number | null;
  created_at: string;
}

export interface Festivo {
  id: number;
  fecha: string;
  nombre: string;
  descripcion?: string | null;
  estado: boolean;
}

export interface ConfiguracionGeneral {
  empresa_nombre?: string | null;
  sistema_nombre?: string | null;
  logo_url?: string | null;
  color_primario?: string | null;
  color_secundario?: string | null;
  mensaje_bienvenida?: string | null;
  imagen_bienvenida_url?: string | null;
  color_boton_disponibilidad?: string | null;
  color_fondo_bienvenida?: string | null;
  evento_unico_por_semana?: boolean;
  contacto_correo?: string | null;
  contacto_telefono?: string | null;
  contacto_direccion?: string | null;
  terminos_condiciones?: string | null;
  zona_horaria: string;
  semana_activa_inicio?: string | null;
  semana_activa_fin?: string | null;
}

/** Plantilla efectiva del correo de confirmación de reserva (ver GET /configuracion/plantilla-correo). */
export interface PlantillaCorreo {
  asunto: string;
  cuerpo: string;
  imagen_url?: string | null;
  placeholders: string[];
}

export interface Administrador {
  id: number;
  usuario: string;
  nombre: string;
  rol: string;
  activo: boolean;
  created_at: string;
}

export interface SmtpConfig {
  host?: string | null;
  port?: number | null;
  usuario?: string | null;
  password_configurada: boolean;
  tls: boolean;
  from_email?: string | null;
  from_nombre?: string | null;
}

export interface SmtpConfigUpdate {
  host: string;
  port: number;
  usuario?: string | null;
  password?: string | null; // vacío/omitido = conservar la ya guardada
  tls: boolean;
  from_email: string;
  from_nombre: string;
}

export interface Auditoria {
  id: number;
  admin_id?: number | null;
  accion: string;
  entidad?: string | null;
  entidad_id?: number | null;
  datos_anteriores?: Record<string, unknown> | null;
  datos_nuevos?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface ApiErrorBody {
  detail?: string | { msg?: string }[];
  /** Presente en los 409 de edición de agendas: reservas que impiden el cambio. */
  reservas_afectadas?: ReservaAdmin[];
}

// ---- Módulo de actividades genéricas (inscripciones con cupo configurable) ----

export type TipoCampoFormulario = "texto" | "numero" | "si_no" | "seleccion";

export interface CampoFormulario {
  clave: string;
  etiqueta: string;
  tipo: TipoCampoFormulario;
  requerido: boolean;
  opciones?: string[] | null;
}

/** Estado de inscripción evaluado por el backend (ver app/schemas/actividad.py). */
export type EstadoActividad = "abierta" | "agotada" | "proximamente" | "cerrada" | "finalizada";

/** Estado de una sesión tal como lo ve el portal (ver app/schemas/sesion.py). */
export type EstadoSesion = "disponible" | "cupo_lleno" | "cerrada" | "finalizada" | "inactiva";

export interface ResumenSesiones {
  sesiones_futuras: number;
  proxima_fecha?: string | null;
  proxima_hora_inicio?: string | null;
  proxima_hora_fin?: string | null;
  proximo_lugar?: string | null;
  inscritos_futuros: number;
  cupos_disponibles?: number | null; // null = alguna sesión sin límite
}

export interface Actividad {
  id: number;
  /** null solo en actividades creadas antes de que el área fuera obligatoria. */
  area_id?: number | null;
  area_nombre?: string | null;
  nombre: string;
  descripcion_corta?: string | null;
  descripcion_larga?: string | null;
  imagen_url?: string | null;
  informacion_adicional?: string | null;
  campos_formulario: CampoFormulario[];
  inscripcion_abierta: boolean;
  fecha_apertura_inscripciones?: string | null;
  fecha_cierre_inscripciones?: string | null;
  activo: boolean;
  estado_inscripcion: EstadoActividad;
  resumen: ResumenSesiones;
}

/** Catálogo público: con el estado de inscripción y la próxima sesión ya evaluados. */
export interface ActividadPublica {
  id: number;
  area_id?: number | null;
  area_nombre?: string | null;
  nombre: string;
  descripcion_corta?: string | null;
  descripcion_larga?: string | null;
  imagen_url?: string | null;
  informacion_adicional?: string | null;
  campos_formulario: CampoFormulario[];
  inscripcion_disponible: boolean;
  estado_inscripcion: EstadoActividad;
  fecha_apertura_inscripciones?: string | null;
  fecha_cierre_inscripciones?: string | null;
  resumen: ResumenSesiones;
}

export interface Sesion {
  id: number;
  actividad_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  cupo_maximo?: number | null;
  lugar?: string | null;
  activa: boolean;
  inscritos: number;
  cupos_disponibles?: number | null; // null = sin límite
  estado: EstadoSesion;
  /** Solo en el portal con sesión iniciada: si el colaborador ya está inscrito. */
  inscrito?: boolean | null;
}

export type EstadoInscripcion = "activa" | "cancelada" | "completada" | "no_asistio";

export interface Inscripcion {
  id: number;
  sesion_id: number;
  usuario_id?: number | null;
  respuestas_formulario?: Record<string, string | number | boolean | null> | null;
  estado: EstadoInscripcion;
  notes?: string | null;
  created_at: string;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
}

/** Vista propia del colaborador (GET /inscripciones/mias): agrega nombres legibles. */
export interface MiInscripcion extends Inscripcion {
  actividad_id: number;
  actividad_nombre: string;
  sesion_fecha: string;
  sesion_hora_inicio: string;
  sesion_hora_fin: string;
  sesion_lugar?: string | null;
  puede_cancelar: boolean;
}

/** Vista administrativa (GET /inscripciones): agrega identidad del colaborador. */
export interface InscripcionAdmin extends Inscripcion {
  usuario_nombre: string;
  usuario_apellido: string;
  usuario_correo?: string | null;
  actividad_id: number;
  actividad_nombre: string;
  sesion_fecha: string;
  sesion_hora_inicio: string;
  puede_marcar_asistencia: boolean;
}
