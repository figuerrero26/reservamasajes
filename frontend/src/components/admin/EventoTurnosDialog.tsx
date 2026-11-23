import { useEffect, useState } from "react";
import {
  Alert, Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography,
} from "@mui/material";
import type { Area, Servicio } from "../../types";
import { actualizarServicio, crearServicio } from "../../services/servicios";
import { mensajeError } from "../../utils/errors";
import AreaSelect from "./AreaSelect";
import HorarioCampos, { HORARIO_POR_DEFECTO, errorHorario, horarioAPayload, type HorarioForm } from "./HorarioCampos";

interface Props {
  abierto: boolean;
  /** null = nuevo evento. */
  servicio: Servicio | null;
  areas: Area[];
  areaInicial?: number | "";
  onCerrar: () => void;
  onGuardado: (servicio: Servicio, creado: boolean) => void;
}

interface Info {
  nombre: string;
  descripcionCorta: string;
  descripcionLarga: string;
  imagenUrl: string;
  informacionAdicional: string;
}

const INFO_VACIA: Info = { nombre: "", descripcionCorta: "", descripcionLarga: "", imagenUrl: "", informacionAdicional: "" };

/** Evento de reserva por turnos. Al crearlo se eligen, en este orden, el área (obligatoria),
 * la información y el horario: el evento y su primera agenda se guardan en una sola
 * operación. Al editarlo solo se cambia la información; las áreas y horarios se gestionan
 * en sus agendas. */
export default function EventoTurnosDialog({ abierto, servicio, areas, areaInicial = "", onCerrar, onGuardado }: Props) {
  const [areaId, setAreaId] = useState<number | "">("");
  const [info, setInfo] = useState<Info>(INFO_VACIA);
  const [horario, setHorario] = useState<HorarioForm>(HORARIO_POR_DEFECTO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setAreaId(servicio ? "" : areaInicial);
    setInfo(servicio ? {
      nombre: servicio.nombre,
      descripcionCorta: servicio.descripcion_corta ?? "",
      descripcionLarga: servicio.descripcion_larga ?? "",
      imagenUrl: servicio.imagen_url ?? "",
      informacionAdicional: servicio.informacion_adicional ?? "",
    } : INFO_VACIA);
    setHorario(HORARIO_POR_DEFECTO);
    setError(null);
  }, [abierto, servicio, areaInicial]);

  const creando = !servicio;
  const problema = !info.nombre.trim()
    ? "Escribe el nombre del evento."
    : creando && areaId === "" ? "Selecciona el área." : creando ? errorHorario(horario) : null;

  async function guardar() {
    if (problema) return;
    setGuardando(true);
    setError(null);
    const datos = {
      nombre: info.nombre.trim(),
      descripcion_corta: info.descripcionCorta.trim() || null,
      descripcion_larga: info.descripcionLarga.trim() || null,
      imagen_url: info.imagenUrl.trim() || null,
      informacion_adicional: info.informacionAdicional.trim() || null,
    };
    try {
      const guardado = servicio
        ? await actualizarServicio(servicio.id, datos)
        : await crearServicio({ ...datos, agenda: { area_id: areaId as number, ...horarioAPayload(horario) } });
      onGuardado(guardado, creando);
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar el evento."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onClose={() => !guardando && onCerrar()} maxWidth="sm" fullWidth>
      <DialogTitle>{creando ? "Nuevo evento con reserva por turnos" : "Editar evento"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {creando && (
            <>
              <Typography variant="overline" color="text.secondary">1 · Área</Typography>
              <AreaSelect areas={areas} valor={areaId} onChange={setAreaId}
                helperText="Para ofrecerlo luego en otra área, agrégale otra agenda." />
              <Typography variant="overline" color="text.secondary">2 · Información</Typography>
            </>
          )}
          <TextField label="Nombre" required value={info.nombre} onChange={(e) => setInfo({ ...info, nombre: e.target.value })}
            inputProps={{ maxLength: 120 }} fullWidth autoFocus={!creando} />
          <TextField label="Descripción corta" helperText="Se muestra en la tarjeta del portal" value={info.descripcionCorta}
            onChange={(e) => setInfo({ ...info, descripcionCorta: e.target.value })} inputProps={{ maxLength: 255 }} fullWidth />
          <TextField label="Descripción larga" value={info.descripcionLarga} multiline minRows={3}
            onChange={(e) => setInfo({ ...info, descripcionLarga: e.target.value })} fullWidth />
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField label="URL de la imagen (opcional)" value={info.imagenUrl}
              onChange={(e) => setInfo({ ...info, imagenUrl: e.target.value })} fullWidth />
            {info.imagenUrl.trim() && <Avatar src={info.imagenUrl.trim()} variant="rounded" sx={{ width: 56, height: 56 }} />}
          </Stack>
          <TextField label="Información adicional" helperText="Recomendaciones para el colaborador (también va en el correo de confirmación)"
            value={info.informacionAdicional} multiline minRows={2}
            onChange={(e) => setInfo({ ...info, informacionAdicional: e.target.value })} fullWidth />
          {creando && (
            <Box>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="overline" color="text.secondary" component="p" sx={{ mb: 1.5 }}>3 · Horario y turnos</Typography>
              <HorarioCampos valor={horario} onChange={setHorario} />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button variant="contained" onClick={guardar} disabled={guardando || !!problema}>
          {guardando ? "Guardando…" : creando ? "Crear evento" : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
