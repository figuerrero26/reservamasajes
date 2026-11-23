import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography,
} from "@mui/material";
import type { Area, ReservaAdmin, Servicio } from "../../types";
import { actualizarServicio, crearServicio } from "../../services/servicios";
import { mensajeError } from "../../utils/errors";
import AreaSelect from "./AreaSelect";
import HorarioCampos, { HORARIO_POR_DEFECTO, errorHorario, horarioAPayload, type HorarioForm } from "./HorarioCampos";
import ImagenEventoCampo, { errorImagen } from "./ImagenEventoCampo";
import ReglaParticipacionCampo, { errorRegla, reglaDesde, reglaPorDefecto, type ReglaForm } from "./ReglaParticipacionCampo";
import VigenciaCampos, { errorVigencia, vigenciaDesde, vigenciaPorDefecto, type VigenciaForm } from "./VigenciaCampos";

interface Props {
  abierto: boolean;
  /** null = nuevo evento. */
  servicio: Servicio | null;
  areas: Area[];
  areaInicial?: number | "";
  onCerrar: () => void;
  /** `afectadas`: reservas futuras que quedaron fuera de una vigencia acortada (se conservan). */
  onGuardado: (servicio: Servicio, creado: boolean, afectadas: ReservaAdmin[]) => void;
}

interface Info {
  nombre: string;
  descripcionCorta: string;
  descripcionLarga: string;
  imagenUrl: string;
  informacionAdicional: string;
}

const INFO_VACIA: Info = { nombre: "", descripcionCorta: "", descripcionLarga: "", imagenUrl: "", informacionAdicional: "" };

function Paso({ texto }: { texto: string }) {
  return <Typography variant="overline" color="text.secondary">{texto}</Typography>;
}

/** Evento de reserva por turnos. Al crearlo se eligen el área (obligatoria), la información,
 * la vigencia, la regla de participación y el horario: el evento y su primera agenda se
 * guardan en una sola operación. Al editarlo se cambian la información, la vigencia y la
 * regla; las áreas y horarios se gestionan en sus agendas. */
export default function EventoTurnosDialog({ abierto, servicio, areas, areaInicial = "", onCerrar, onGuardado }: Props) {
  const [areaId, setAreaId] = useState<number | "">("");
  const [info, setInfo] = useState<Info>(INFO_VACIA);
  const [vigencia, setVigencia] = useState<VigenciaForm>(vigenciaPorDefecto());
  const [regla, setRegla] = useState<ReglaForm>(reglaPorDefecto("turnos"));
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
    setVigencia(servicio ? vigenciaDesde(servicio.vigencia_inicio, servicio.vigencia_fin) : vigenciaPorDefecto());
    setRegla(servicio ? reglaDesde("turnos", servicio.limite_participaciones, servicio.periodo_limite) : reglaPorDefecto("turnos"));
    setHorario(HORARIO_POR_DEFECTO);
    setError(null);
  }, [abierto, servicio, areaInicial]);

  const creando = !servicio;
  const problema = !info.nombre.trim()
    ? "Escribe el nombre del evento."
    : creando && areaId === "" ? "Selecciona el área."
      : errorImagen(info.imagenUrl) ?? errorVigencia(vigencia, creando) ?? errorRegla(regla, "turnos")
        ?? (creando ? errorHorario(horario) : null);

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
      vigencia_inicio: vigencia.inicio,
      vigencia_fin: vigencia.fin,
      limite_participaciones: regla.limite,
      periodo_limite: regla.periodo,
    };
    try {
      if (servicio) {
        const { reservas_afectadas, ...guardado } = await actualizarServicio(servicio.id, datos);
        onGuardado(guardado, false, reservas_afectadas ?? []);
      } else {
        const creado = await crearServicio({ ...datos, agenda: { area_id: areaId as number, ...horarioAPayload(horario) } });
        onGuardado(creado, true, []);
      }
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
          {servicio?.estado_vigencia === "sin_vigencia" && (
            <Alert severity="warning">Este evento se creó antes de que existiera la vigencia: defínela para controlar cuándo se publica.</Alert>
          )}
          {creando && (
            <>
              <Paso texto="1 · Área" />
              <AreaSelect areas={areas} valor={areaId} onChange={setAreaId}
                helperText="Para ofrecerlo luego en otra área, agrégale otra agenda." />
            </>
          )}
          <Paso texto={creando ? "2 · Información" : "Información"} />
          <TextField label="Nombre" required value={info.nombre} onChange={(e) => setInfo({ ...info, nombre: e.target.value })}
            inputProps={{ maxLength: 120 }} fullWidth autoFocus={!creando} />
          <TextField label="Descripción corta" helperText="Se muestra en la tarjeta del portal" value={info.descripcionCorta}
            onChange={(e) => setInfo({ ...info, descripcionCorta: e.target.value })} inputProps={{ maxLength: 255 }} fullWidth />
          <TextField label="Descripción larga" value={info.descripcionLarga} multiline minRows={3}
            onChange={(e) => setInfo({ ...info, descripcionLarga: e.target.value })} fullWidth />
          <ImagenEventoCampo valor={info.imagenUrl} onChange={(imagenUrl) => setInfo((i) => ({ ...i, imagenUrl }))} />
          <TextField label="Información adicional" helperText="Recomendaciones para el colaborador (también va en el correo de confirmación)"
            value={info.informacionAdicional} multiline minRows={2}
            onChange={(e) => setInfo({ ...info, informacionAdicional: e.target.value })} fullWidth />

          <Divider />
          <Paso texto={creando ? "3 · Vigencia" : "Vigencia"} />
          <VigenciaCampos valor={vigencia} onChange={setVigencia} creando={creando} participaciones="reservas" />

          <Divider />
          <Paso texto={creando ? "4 · Regla de participación" : "Regla de participación"} />
          <ReglaParticipacionCampo tipo="turnos" valor={regla} onChange={setRegla} />

          {creando && (
            <Box>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="overline" color="text.secondary" component="p" sx={{ mb: 1.5 }}>5 · Horario y turnos</Typography>
              <HorarioCampos valor={horario} onChange={setHorario} />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {problema && <Typography variant="caption" color="text.secondary" sx={{ mr: "auto", pl: 1 }}>{problema}</Typography>}
        <Button onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button variant="contained" onClick={guardar} disabled={guardando || !!problema}>
          {guardando ? "Guardando…" : creando ? "Crear evento" : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
