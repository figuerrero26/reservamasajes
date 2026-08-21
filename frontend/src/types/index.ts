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

/** Tarjeta pública (catálogo tipo Bookings). Sin autenticación. */
export interface EventoPublico {
  id: number;
  nombre: string;
  descripcion_corta?: string | null;
  descripcion_larga?: string | null;
  imagen_url?: string | null;
  duracion_minutos: number;
  informacion_adicional?: string | null;
  areas: string[];
  agendas: AgendaResumen[];
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
}

/** Agenda completa (todos sus turnos) de un día — vista "por día" del panel admin. */
export interface AgendaDia {
  agenda_id: number;
  agenda_nombre: string;
  area_nombre: string;
  evento_nombre: string;
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

export type EstadoCorreoConfirmacion = "pendiente" | "enviado" | "fallido";

/** Respuesta de los endpoints de creación de reserva: incluye el estado del correo. */
export interface ReservaCreada extends Reserva {
  correo_confirmacion: EstadoCorreoConfirmacion;
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
  zona_horaria: string;
  semana_activa_inicio?: string | null;
  semana_activa_fin?: string | null;
}

/** Plantilla efectiva del correo de confirmación de reserva (ver GET /configuracion/plantilla-correo). */
export interface PlantillaCorreo {
  asunto: string;
  cuerpo: string;
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
  detail?: string;
}
