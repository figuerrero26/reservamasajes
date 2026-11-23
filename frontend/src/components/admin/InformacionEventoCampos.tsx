import type { Dispatch, SetStateAction } from "react";
import { Stack, TextField } from "@mui/material";
import ImagenEventoCampo from "./ImagenEventoCampo";

export interface InfoEvento {
  nombre: string;
  descripcionCorta: string;
  descripcionLarga: string;
  imagenUrl: string;
  informacionAdicional: string;
}

export const INFO_VACIA: InfoEvento = { nombre: "", descripcionCorta: "", descripcionLarga: "", imagenUrl: "", informacionAdicional: "" };

export function infoDesde(e: {
  nombre: string; descripcion_corta?: string | null; descripcion_larga?: string | null;
  imagen_url?: string | null; informacion_adicional?: string | null;
} | null): InfoEvento {
  return e ? {
    nombre: e.nombre,
    descripcionCorta: e.descripcion_corta ?? "",
    descripcionLarga: e.descripcion_larga ?? "",
    imagenUrl: e.imagen_url ?? "",
    informacionAdicional: e.informacion_adicional ?? "",
  } : INFO_VACIA;
}

export function infoAPayload(i: InfoEvento) {
  return {
    nombre: i.nombre.trim(),
    descripcion_corta: i.descripcionCorta.trim() || null,
    descripcion_larga: i.descripcionLarga.trim() || null,
    imagen_url: i.imagenUrl.trim() || null,
    informacion_adicional: i.informacionAdicional.trim() || null,
  };
}

interface Props {
  valor: InfoEvento;
  /** Setter del estado (acepta función): la carga de la imagen termina de forma asíncrona y
   * no debe pisar lo que se escribió mientras tanto. */
  onChange: Dispatch<SetStateAction<InfoEvento>>;
  maxNombre: number;
  maxDescripcionCorta: number;
  /** Texto de ayuda de «Información adicional», según el tipo de evento. */
  ayudaAdicional: string;
  autoFocus?: boolean;
}

/** Información general del evento (común a los dos tipos): nombre, descripciones, imagen e
 * indicaciones para el colaborador. */
export default function InformacionEventoCampos({ valor, onChange, maxNombre, maxDescripcionCorta, ayudaAdicional, autoFocus }: Props) {
  const set = (cambios: Partial<InfoEvento>) => onChange((v) => ({ ...v, ...cambios }));
  return (
    <Stack spacing={2.5}>
      <TextField label="Nombre" required value={valor.nombre} onChange={(e) => set({ nombre: e.target.value })}
        inputProps={{ maxLength: maxNombre }} fullWidth autoFocus={autoFocus} />
      <TextField label="Descripción corta" helperText="Se muestra en la tarjeta del portal" value={valor.descripcionCorta}
        onChange={(e) => set({ descripcionCorta: e.target.value })} inputProps={{ maxLength: maxDescripcionCorta }} fullWidth />
      <TextField label="Descripción larga" value={valor.descripcionLarga} multiline minRows={3}
        onChange={(e) => set({ descripcionLarga: e.target.value })} fullWidth />
      <ImagenEventoCampo valor={valor.imagenUrl} onChange={(imagenUrl) => set({ imagenUrl })} />
      <TextField label="Información adicional" helperText={ayudaAdicional} value={valor.informacionAdicional} multiline minRows={2}
        onChange={(e) => set({ informacionAdicional: e.target.value })} fullWidth />
    </Stack>
  );
}
