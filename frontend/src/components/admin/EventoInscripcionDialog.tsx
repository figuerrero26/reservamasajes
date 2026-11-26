import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Stack, Switch,
  Tab, Tabs, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import type { Actividad, Area, CampoFormulario } from "../../types";
import { actualizarActividad, crearActividad } from "../../services/actividades";
import { mensajeError } from "../../utils/errors";
import { hoyBogota } from "../../utils/fechas";
import AreaSelect from "./AreaSelect";
import { Seccion } from "./EventoReservaDialog";
import FechasNuevasCampos, { errorFechasNuevas, fechaNueva, fechasAPayload, type FechaNueva } from "./FechasNuevasCampos";
import { errorImagen } from "./ImagenEventoCampo";
import InformacionEventoCampos, { INFO_VACIA, infoAPayload, infoDesde, type InfoEvento } from "./InformacionEventoCampos";
import PreguntasFormularioCampos, { errorPreguntas } from "./PreguntasFormularioCampos";
import ReglaParticipacionCampo, { errorRegla, reglaDesde, reglaPorDefecto, type ReglaForm } from "./ReglaParticipacionCampo";
import SesionesPanel from "./SesionesPanel";
import VigenciaCampos, { errorVigencia, horarioDesde, vigenciaDesde, vigenciaPorDefecto, type VigenciaForm } from "./VigenciaCampos";

export type PestanaInscripcion = "info" | "fechas";

interface Props {
  abierto: boolean;
  /** null = nuevo evento de inscripción. */
  actividad: Actividad | null;
  areas: Area[];
  areaInicial?: number | "";
  pestana?: PestanaInscripcion;
  onCerrar: () => void;
  onGuardada: (actividad: Actividad, creada: boolean) => void;
  /** Cambió algo dentro del evento (fechas o inscritos): refrescar el listado. */
  onCambio: () => void;
  /** Solo al crear: volver a elegir el tipo de evento. */
  onCambiarTipo?: () => void;
}

/** Evento de inscripción: las personas se inscriben y ocupan un cupo en una fecha y horario
 * definidos, sin elegir turnos.
 * - Al crearlo se definen el área y la información, las fechas de realización (día, horario,
 *   lugar y límite de participantes), el periodo de inscripción, las restricciones de
 *   inscripción y, si hace falta, preguntas adicionales. No aparece nada propio de las
 *   reservas (agendas, duración de turnos, días de atención).
 * - Al editarlo: información y reglas, y fechas con sus cupos e inscritos, en el mismo lugar. */
export default function EventoInscripcionDialog({
  abierto, actividad, areas, areaInicial = "", pestana: pestanaInicial = "info",
  onCerrar, onGuardada, onCambio, onCambiarTipo,
}: Props) {
  const theme = useTheme();
  const pantallaChica = useMediaQuery(theme.breakpoints.down("sm"));
  const [pestana, setPestana] = useState<PestanaInscripcion>("info");
  const [areaId, setAreaId] = useState<number | "">("");
  const [info, setInfo] = useState<InfoEvento>(INFO_VACIA);
  const [fechas, setFechas] = useState<FechaNueva[]>([]);
  const [vigencia, setVigencia] = useState<VigenciaForm>(vigenciaPorDefecto());
  const [vigenciaTocada, setVigenciaTocada] = useState(false);
  const [regla, setRegla] = useState<ReglaForm>(reglaPorDefecto("inscripcion"));
  const [inscripcionAbierta, setInscripcionAbierta] = useState(true);
  const [campos, setCampos] = useState<CampoFormulario[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setPestana(actividad ? pestanaInicial : "info");
    setAreaId(actividad ? actividad.area_id ?? "" : areaInicial);
    setInfo(infoDesde(actividad));
    setFechas([fechaNueva()]);
    setVigencia(actividad ? vigenciaDesde(actividad) : vigenciaPorDefecto());
    setVigenciaTocada(false);
    setRegla(actividad ? reglaDesde("inscripcion", actividad.limite_participaciones, actividad.periodo_limite) : reglaPorDefecto("inscripcion"));
    setInscripcionAbierta(actividad?.inscripcion_abierta ?? true);
    setCampos(actividad?.campos_formulario ?? []);
    setError(null);
    setGuardado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, actividad?.id, pestanaInicial]);

  const creando = !actividad;

  // Al crear, mientras no se toque el periodo de inscripción, las inscripciones se cierran el
  // día de la primera fecha de realización (lo más habitual).
  useEffect(() => {
    if (!creando || vigenciaTocada) return;
    const primera = fechas.map((f) => f.fecha).filter((f) => f && f >= hoyBogota()).sort()[0];
    if (primera) setVigencia((v) => (v.fin === primera ? v : { ...v, fin: primera < v.inicio ? v.inicio : primera }));
  }, [fechas, creando, vigenciaTocada]);

  const problema = areaId === "" ? "Selecciona el área."
    : !info.nombre.trim() ? "Escribe el nombre."
      : errorImagen(info.imagenUrl) ?? (creando ? errorFechasNuevas(fechas, vigencia.inicio) : null)
        ?? errorVigencia(vigencia, creando) ?? errorRegla(regla, "inscripcion") ?? errorPreguntas(campos);

  async function guardar() {
    if (problema || areaId === "") return;
    setGuardando(true);
    setError(null);
    setGuardado(false);
    const payload = {
      area_id: areaId,
      ...infoAPayload(info),
      campos_formulario: campos,
      inscripcion_abierta: inscripcionAbierta,
      vigencia_inicio: vigencia.inicio,
      vigencia_fin: vigencia.fin,
      ...horarioDesde(vigencia),
      limite_participaciones: regla.limite,
      periodo_limite: regla.periodo,
    };
    try {
      if (actividad) {
        const actualizada = await actualizarActividad(actividad.id, payload);
        setGuardado(true);
        onGuardada(actualizada, false);
      } else {
        onGuardada(await crearActividad({ ...payload, sesiones: fechasAPayload(fechas) }), true);
      }
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar el evento."));
    } finally {
      setGuardando(false);
    }
  }

  let n = 0;
  const numero = () => (creando ? ++n : undefined);

  const formulario = (
    <Stack spacing={3}>
      {actividad && actividad.area_id == null && (
        <Alert severity="warning">Este evento se creó antes de que el área fuera obligatoria: asígnale una.</Alert>
      )}
      {actividad?.estado_vigencia === "sin_vigencia" && (
        <Alert severity="warning">Este evento no tiene periodo de inscripción: defínelo para controlar cuándo se publica.</Alert>
      )}
      <Seccion numero={numero()} titulo="Información">
        <Stack spacing={2.5}>
          <AreaSelect areas={areas} valor={areaId} onChange={setAreaId} label="Área" helperText="Área que organiza el evento" />
          <InformacionEventoCampos
            valor={info} onChange={setInfo} maxNombre={160} maxDescripcionCorta={300}
            ayudaAdicional="Qué llevar, punto de encuentro, requisitos… (también va en el correo de confirmación)"
          />
        </Stack>
      </Seccion>
      {creando && (
        <>
          <Divider />
          <Seccion numero={numero()} titulo="Fecha y horario de realización"
            ayuda="Cuándo y dónde se realiza, y cuántas personas pueden participar en cada fecha.">
            <FechasNuevasCampos valor={fechas} onChange={setFechas} />
          </Seccion>
        </>
      )}
      <Divider />
      <Seccion numero={numero()} titulo="Periodo de inscripción"
        ayuda="Configura la publicación y el plazo de inscripción. Las horas se interpretan en la zona horaria de la aplicación.">
        <Stack spacing={2}>
          <VigenciaCampos
            valor={vigencia} onChange={(v) => { setVigenciaTocada(true); setVigencia(v); }}
            creando={creando} participaciones="inscripciones"
          />
          {!creando && (
            <FormControlLabel
              control={<Switch checked={inscripcionAbierta} onChange={(e) => setInscripcionAbierta(e.target.checked)} />}
              label={
                <Box>
                  <Typography variant="body2">Inscripciones habilitadas en el portal</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Apágalo para pausarlas temporalmente dentro del periodo (tú sí puedes inscribir desde el panel).
                  </Typography>
                </Box>
              }
            />
          )}
        </Stack>
      </Seccion>
      <Divider />
      <Seccion numero={numero()} titulo="Restricciones de inscripción" ayuda="En cuántas fechas puede inscribirse cada persona.">
        <ReglaParticipacionCampo tipo="inscripcion" valor={regla} onChange={setRegla} />
      </Seccion>
      <Divider />
      <Seccion numero={numero()} titulo="Formulario de inscripción (opcional)" ayuda="Datos adicionales que se piden al inscribirse.">
        <PreguntasFormularioCampos valor={campos} onChange={setCampos} />
      </Seccion>
    </Stack>
  );

  const enFormulario = creando || pestana === "info";

  return (
    <Dialog open={abierto} onClose={() => !guardando && onCerrar()} maxWidth="md" fullWidth fullScreen={pantallaChica}
      scroll="paper">
      <DialogTitle sx={{ pb: creando ? 2 : 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
          <Chip size="small" icon={<GroupsOutlinedIcon />} label="Evento de inscripción" color="primary" variant="outlined" />
          {creando && onCambiarTipo && (
            <Button size="small" startIcon={<ArrowBackIcon />} onClick={onCambiarTipo} disabled={guardando}>Cambiar tipo</Button>
          )}
        </Stack>
        <Box component="span" sx={{ display: "block", wordBreak: "break-word" }}>
          {creando ? "Nuevo evento de inscripción" : actividad.nombre}
        </Box>
        {!creando && (
          <Tabs value={pestana} onChange={(_, v: PestanaInscripcion) => setPestana(v)}
            variant="scrollable" allowScrollButtonsMobile sx={{ mt: 1, mx: -1 }}>
            <Tab value="info" label="Información y reglas" />
            <Tab value="fechas" label={`Fechas, cupos e inscritos (${actividad.resumen.sesiones_futuras})`} />
          </Tabs>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {guardado && enFormulario && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setGuardado(false)}>Cambios guardados.</Alert>}
        {enFormulario && formulario}
        {!creando && pestana === "fechas" && <SesionesPanel actividad={actividad} onCambio={onCambio} />}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
        {enFormulario && problema && (
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto", pl: 1 }}>{problema}</Typography>
        )}
        <Button onClick={onCerrar} disabled={guardando}>{creando ? "Cancelar" : "Cerrar"}</Button>
        {enFormulario && (
          <Button variant="contained" onClick={guardar} disabled={guardando || !!problema}>
            {guardando ? "Guardando…" : creando ? "Crear evento" : "Guardar cambios"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
