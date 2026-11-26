import { useEffect, useState, type ReactNode } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Tab, Tabs, Typography,
  useMediaQuery, useTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import type { Agenda, Area, ReservaAdmin, Servicio } from "../../types";
import { actualizarServicio, crearServicio } from "../../services/servicios";
import { mensajeError } from "../../utils/errors";
import AgendasEventoPanel from "./AgendasEventoPanel";
import AgendasNuevasCampos, { agendaNueva, agendasAPayload, errorAgendasNuevas, type AgendaNueva } from "./AgendasNuevasCampos";
import HistorialReservasPanel from "./HistorialReservasPanel";
import { errorImagen } from "./ImagenEventoCampo";
import InformacionEventoCampos, { INFO_VACIA, infoAPayload, infoDesde, type InfoEvento } from "./InformacionEventoCampos";
import ReglaParticipacionCampo, { errorRegla, reglaDesde, reglaPorDefecto, type ReglaForm } from "./ReglaParticipacionCampo";
import VigenciaCampos, { errorVigencia, horarioDesde, vigenciaDesde, vigenciaPorDefecto, type VigenciaForm } from "./VigenciaCampos";

export type PestanaReserva = "info" | "agendas" | "historial";

interface Props {
  abierto: boolean;
  /** null = nuevo evento de reserva. */
  servicio: Servicio | null;
  /** Agendas (se usan las de este evento). */
  agendas: Agenda[];
  areas: Area[];
  areaInicial?: number | "";
  pestana?: PestanaReserva;
  onCerrar: () => void;
  /** `afectadas`: reservas futuras que quedaron fuera de una vigencia acortada (se conservan). */
  onGuardado: (servicio: Servicio, creado: boolean, afectadas: ReservaAdmin[]) => void;
  /** Cambió algo dentro del evento (agendas): refrescar el listado. */
  onCambio: () => void;
  /** Solo al crear: volver a elegir el tipo de evento. */
  onCambiarTipo?: () => void;
}

export function Seccion({ numero, titulo, ayuda, children }: { numero?: number; titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: "block", lineHeight: 1.6 }}>
        {numero ? `${numero} · ` : ""}{titulo}
      </Typography>
      {ayuda && <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>{ayuda}</Typography>}
      <Box sx={{ mt: ayuda ? 0 : 1 }}>{children}</Box>
    </Box>
  );
}

/** Evento de reserva: cada persona elige un turno individual en una agenda con horario.
 * - Al crearlo se definen la información, las fechas del evento (vigencia), sus agendas (área,
 *   horario de atención, duración de los turnos y días) y las restricciones de reserva; todo se
 *   guarda en una sola operación. No aparece nada propio de las inscripciones.
 * - Al editarlo, todo lo del evento queda en el mismo lugar: información y reglas, agendas y
 *   horarios (sin ir a otra sección) e historial de reservas. */
export default function EventoReservaDialog({
  abierto, servicio, agendas, areas, areaInicial = "", pestana: pestanaInicial = "info",
  onCerrar, onGuardado, onCambio, onCambiarTipo,
}: Props) {
  const theme = useTheme();
  const pantallaChica = useMediaQuery(theme.breakpoints.down("sm"));
  const [pestana, setPestana] = useState<PestanaReserva>("info");
  const [info, setInfo] = useState<InfoEvento>(INFO_VACIA);
  const [vigencia, setVigencia] = useState<VigenciaForm>(vigenciaPorDefecto());
  const [regla, setRegla] = useState<ReglaForm>(reglaPorDefecto("reserva"));
  const [nuevas, setNuevas] = useState<AgendaNueva[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Se reinicia al abrir o al cambiar de evento (no cuando se refresca el listado: así no se
  // pierden cambios sin guardar mientras se editan las agendas).
  useEffect(() => {
    if (!abierto) return;
    setPestana(servicio ? pestanaInicial : "info");
    setInfo(infoDesde(servicio));
    setVigencia(servicio ? vigenciaDesde(servicio) : vigenciaPorDefecto());
    setRegla(servicio ? reglaDesde("reserva", servicio.limite_participaciones, servicio.periodo_limite) : reglaPorDefecto("reserva"));
    setNuevas([agendaNueva(areaInicial)]);
    setError(null);
    setGuardado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, servicio?.id, pestanaInicial]);

  const creando = !servicio;
  const propias = servicio ? agendas.filter((a) => a.servicio_id === servicio.id) : [];
  const problema = !info.nombre.trim()
    ? "Escribe el nombre del evento."
    : errorImagen(info.imagenUrl) ?? errorVigencia(vigencia, creando, true) ?? (creando ? errorAgendasNuevas(nuevas) : null)
      ?? errorRegla(regla, "reserva");

  async function guardar() {
    if (problema) return;
    setGuardando(true);
    setError(null);
    setGuardado(false);
    const datos = {
      ...infoAPayload(info),
      vigencia_inicio: vigencia.inicio,
      vigencia_fin: vigencia.fin,
      ...horarioDesde(vigencia),
      apertura_reservas_en: vigencia.aperturaReservas || null,
      limite_participaciones: regla.limite,
      periodo_limite: regla.periodo,
    };
    try {
      if (servicio) {
        const { reservas_afectadas, ...actualizado } = await actualizarServicio(servicio.id, datos);
        setGuardado(true);
        onGuardado(actualizado, false, reservas_afectadas ?? []);
      } else {
        onGuardado(await crearServicio({ ...datos, agendas: agendasAPayload(nuevas) }), true, []);
      }
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar el evento."));
    } finally {
      setGuardando(false);
    }
  }

  const formulario = (
    <Stack spacing={3}>
      {servicio?.estado_vigencia === "sin_vigencia" && (
        <Alert severity="warning">Este evento se creó antes de que existiera la vigencia: define sus fechas para controlar cuándo se publica.</Alert>
      )}
      <Seccion numero={creando ? 1 : undefined} titulo="Información">
        <InformacionEventoCampos
          valor={info} onChange={setInfo} maxNombre={120} maxDescripcionCorta={255} autoFocus={creando}
          ayudaAdicional="Recomendaciones para quien reserva (también van en el correo de confirmación)"
        />
      </Seccion>
      <Divider />
      <Seccion numero={creando ? 2 : undefined} titulo="Fechas de atención y reservas"
        ayuda="Define cuándo se atiende y desde qué momento se pueden reservar los turnos.">
        <Stack spacing={2}>
          <VigenciaCampos valor={vigencia} onChange={setVigencia} creando={creando} participaciones="reservas" />
        </Stack>
      </Seccion>
      {creando && (
        <>
          <Divider />
          <Seccion numero={3} titulo="Agendas: lugar, horario y turnos"
            ayuda="Dónde se atiende, en qué horario, qué días y cuánto dura cada turno. Puedes ofrecerlo en varias áreas.">
            <AgendasNuevasCampos valor={nuevas} onChange={setNuevas} areas={areas} />
          </Seccion>
        </>
      )}
      <Divider />
      <Seccion numero={creando ? 4 : undefined} titulo="Restricciones de reserva"
        ayuda="Cuántos turnos puede reservar cada persona. Siempre rige como máximo una reserva por día.">
        <ReglaParticipacionCampo tipo="reserva" valor={regla} onChange={setRegla} />
      </Seccion>
    </Stack>
  );

  const enFormulario = creando || pestana === "info";

  return (
    <Dialog open={abierto} onClose={() => !guardando && onCerrar()} maxWidth="md" fullWidth fullScreen={pantallaChica}
      scroll="paper">
      <DialogTitle sx={{ pb: creando ? 2 : 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
          <Chip size="small" icon={<EventAvailableOutlinedIcon />} label="Evento de reserva" color="primary" variant="outlined" />
          {creando && onCambiarTipo && (
            <Button size="small" startIcon={<ArrowBackIcon />} onClick={onCambiarTipo} disabled={guardando}>Cambiar tipo</Button>
          )}
        </Stack>
        <Box component="span" sx={{ display: "block", wordBreak: "break-word" }}>
          {creando ? "Nuevo evento de reserva" : servicio.nombre}
        </Box>
        {!creando && (
          <Tabs
            value={pestana} onChange={(_, v: PestanaReserva) => setPestana(v)}
            variant="scrollable" allowScrollButtonsMobile sx={{ mt: 1, mx: -1 }}
          >
            <Tab value="info" label="Información y reglas" />
            <Tab value="agendas" label={`Agendas y horarios (${propias.length})`} />
            <Tab value="historial" label="Historial de reservas" />
          </Tabs>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {guardado && enFormulario && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setGuardado(false)}>Cambios guardados.</Alert>}
        {enFormulario && formulario}
        {!creando && pestana === "agendas" && (
          <AgendasEventoPanel servicio={servicio} agendas={propias} areas={areas} onCambio={onCambio} />
        )}
        {!creando && pestana === "historial" && <HistorialReservasPanel servicio={servicio} />}
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
