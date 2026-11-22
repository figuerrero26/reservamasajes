import { Chip, type ChipProps } from "@mui/material";
import type { EstadoActividad, EstadoInscripcion, EstadoReserva, EstadoSesion } from "../types";

type Color = ChipProps["color"];

/** Etiqueta y color de cada estado, en un solo lugar (antes estaba repetido en varias
 * páginas con pequeñas diferencias). Reserva e inscripción comparten valores pero no
 * siempre la misma etiqueta: "completada" es "Asistió" en ambos para el usuario final. */
const RESERVA: Record<EstadoReserva, [string, Color]> = {
  activa: ["Confirmada", "primary"],
  cancelada: ["Cancelada", "default"],
  completada: ["Asistió", "success"],
  no_asistio: ["No asistió", "warning"],
};

const INSCRIPCION: Record<EstadoInscripcion, [string, Color]> = {
  activa: ["Inscrito", "primary"],
  cancelada: ["Cancelada", "default"],
  completada: ["Asistió", "success"],
  no_asistio: ["No asistió", "warning"],
};

export const ETIQUETA_ACTIVIDAD: Record<EstadoActividad, [string, Color]> = {
  abierta: ["Inscripciones abiertas", "success"],
  agotada: ["Cupos agotados", "warning"],
  proximamente: ["Próximamente", "info"],
  cerrada: ["Inscripciones cerradas", "default"],
  finalizada: ["Finalizada", "default"],
};

const SESION: Record<EstadoSesion, [string, Color]> = {
  disponible: ["Disponible", "success"],
  cupo_lleno: ["Cupo lleno", "warning"],
  cerrada: ["Inscripciones cerradas", "default"],
  finalizada: ["Finalizada", "default"],
  inactiva: ["Inactiva", "default"],
};

type Props =
  | { tipo: "reserva"; estado: EstadoReserva }
  | { tipo: "inscripcion"; estado: EstadoInscripcion }
  | { tipo: "actividad"; estado: EstadoActividad }
  | { tipo: "sesion"; estado: EstadoSesion };

export default function EstadoChip(props: Props & Omit<ChipProps, "label" | "color">) {
  const { tipo, estado, ...resto } = props;
  const mapa = { reserva: RESERVA, inscripcion: INSCRIPCION, actividad: ETIQUETA_ACTIVIDAD, sesion: SESION }[tipo] as
    Record<string, [string, Color]>;
  const [label, color] = mapa[estado] ?? [estado, "default"];
  return <Chip size="small" label={label} color={color} variant={color === "default" ? "outlined" : "filled"} {...resto} />;
}
