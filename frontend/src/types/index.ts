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

export type EstadoReserva = "activa" | "cancelada" | "completada" | "no_asistio";

export interface Reserva {
  id: number;
  agenda_id: number;
  servicio_id: number;
  usuario_id: number;
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
  zona_horaria: string;
  semana_activa_inicio?: string | null;
  semana_activa_fin?: string | null;
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
