export interface AgendaPublica {
  id: number;
  nombre: string;
  area_id: number;
  servicio_id: number;
}

export interface Area {
  id: number;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
}

export interface Servicio {
  id: number;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
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
  duracion_min: number;
  dias_habilitados: string;
  estado: boolean;
}

export interface Slot {
  hora_inicio: string;
  hora_fin: string;
  disponible: boolean;
}

export interface HorariosResponse {
  fecha: string;
  agenda_id: number;
  slots: Slot[];
}

export interface Reserva {
  id: number;
  agenda_id: number;
  usuario_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  rol: string;
  nombre: string;
}
