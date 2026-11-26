import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert, Box, Button, Chip, InputAdornment, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import type { Actividad, Agenda, Area, EstadoVigencia, ReservaAdmin, Servicio } from "../../types";
import { listarActividades, activarActividad, desactivarActividad, eliminarActividad } from "../../services/actividades";
import { listarAgendas } from "../../services/agendas";
import { listarAreas } from "../../services/areas";
import { activarServicio, desactivarServicio, eliminarServicio, listarServicios } from "../../services/servicios";
import { mensajeError } from "../../utils/errors";
import { formatearFecha, formatearHora, nombreDia, textoVigencia } from "../../utils/fechas";
import ConfirmDialog from "../../components/ConfirmDialog";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import EstadoChip from "../../components/EstadoChip";
import Loader from "../../components/Loader";
import PageHeader from "../../components/PageHeader";
import ReservasAfectadasDialog from "../../components/ReservasAfectadasDialog";
import EventoInscripcionDialog, { type PestanaInscripcion } from "../../components/admin/EventoInscripcionDialog";
import EventoReservaDialog, { type PestanaReserva } from "../../components/admin/EventoReservaDialog";
import type { TipoEvento } from "../../components/admin/ReglaParticipacionCampo";
import TipoEventoDialog, { NOMBRE_TIPO_EVENTO } from "../../components/admin/TipoEventoDialog";

interface Fila {
  key: string;
  tipo: TipoEvento;
  nombre: string;
  areaIds: number[];
  activo: boolean;
  estadoVigencia: EstadoVigencia;
  vigenciaInicio?: string | null;
  vigenciaFin?: string | null;
  servicio?: Servicio;
  actividad?: Actividad;
  agendas: Agenda[];
}

type FiltroVigencia = EstadoVigencia | "todos";

const VIGENCIA: Record<EstadoVigencia, { texto: string; filtro: string; color: "success" | "info" | "default" | "warning" }> = {
  vigente: { texto: "Vigente", filtro: "Vigentes", color: "success" },
  proximo: { texto: "Próximo", filtro: "Próximos", color: "info" },
  finalizado: { texto: "Finalizado", filtro: "Finalizados", color: "default" },
  sin_vigencia: { texto: "Sin vigencia", filtro: "Sin vigencia", color: "warning" },
};

/** Enlaces antiguos (?tipo=turnos / ?tipo=actividad) siguen funcionando. */
function tipoDesdeUrl(valor: string | null): TipoEvento | "todos" {
  if (valor === "reserva" || valor === "turnos") return "reserva";
  if (valor === "inscripcion" || valor === "actividad") return "inscripcion";
  return "todos";
}

interface Afectadas {
  titulo: string;
  descripcion: string;
  motivo: string;
  reservas: ReservaAdmin[];
}

/** Módulo único de eventos. «Nuevo evento» pide primero el tipo:
 * - Evento de reserva (turnos individuales): se crea con sus agendas —lugar, horario de
 *   atención y duración de turnos— y se gestiona entero desde aquí (agendas e historial
 *   incluidos, sin ir a otra sección).
 * - Evento de inscripción (cupos): se crea con sus fechas de realización y límite de
 *   participantes, y aquí mismo se gestionan sus fechas e inscritos.
 * Cada tipo conserva su propia lógica y el backend rechaza configuraciones del otro tipo. Los
 * eventos se filtran por área, tipo y vigencia; los finalizados conservan todo su historial. */
export default function EventosAdminPage() {
  const [params, setParams] = useSearchParams();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [eligiendoTipo, setEligiendoTipo] = useState(false);
  const [reservaAbierta, setReservaAbierta] = useState<{ id: number | null; pestana: PestanaReserva } | null>(null);
  const [inscripcionAbierta, setInscripcionAbierta] = useState<{ id: number | null; pestana: PestanaInscripcion } | null>(null);
  const [afectadas, setAfectadas] = useState<Afectadas | null>(null);
  const [aEliminar, setAEliminar] = useState<Fila | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  // Filtros en la URL: permiten llegar filtrado desde Áreas ("Ver eventos") o desde un enlace.
  const filtroArea = params.get("area") ?? "todas"; // "todas" | "sin" | id
  const filtroTipo = tipoDesdeUrl(params.get("tipo"));
  const filtroVigencia = (params.get("vigencia") ?? "todos") as FiltroVigencia;
  const setFiltro = (clave: string, valor: string) => {
    const nuevos = new URLSearchParams(params);
    if (valor === "todas" || valor === "todos") nuevos.delete(clave);
    else nuevos.set(clave, valor);
    setParams(nuevos, { replace: true });
  };

  async function cargar() {
    setError(null);
    try {
      const [sv, ac, ag, ar] = await Promise.all([listarServicios(), listarActividades(), listarAgendas(), listarAreas()]);
      setServicios(sv);
      setActividades(ac);
      setAgendas(ag);
      setAreas(ar);
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los eventos."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const filas = useMemo<Fila[]>(() => [
    ...servicios.map((s) => {
      const propias = agendas.filter((a) => a.servicio_id === s.id);
      return {
        key: `s-${s.id}`, tipo: "reserva" as const, nombre: s.nombre, activo: s.activo, servicio: s, agendas: propias,
        areaIds: Array.from(new Set(propias.map((a) => a.area_id))),
        estadoVigencia: s.estado_vigencia, vigenciaInicio: s.vigencia_inicio, vigenciaFin: s.vigencia_fin,
      };
    }),
    ...actividades.map((a) => ({
      key: `a-${a.id}`, tipo: "inscripcion" as const, nombre: a.nombre, activo: a.activo, actividad: a, agendas: [],
      areaIds: a.area_id ? [a.area_id] : [],
      estadoVigencia: a.estado_vigencia, vigenciaInicio: a.vigencia_inicio, vigenciaFin: a.vigencia_fin,
    })),
  ].sort((x, y) => x.nombre.localeCompare(y.nombre)), [servicios, actividades, agendas]);

  const texto = busqueda.trim().toLowerCase();
  const visibles = filas.filter((f) =>
    (filtroTipo === "todos" || f.tipo === filtroTipo)
    && (filtroVigencia === "todos" || f.estadoVigencia === filtroVigencia)
    && (filtroArea === "todas" || (filtroArea === "sin" ? f.areaIds.length === 0 : f.areaIds.includes(Number(filtroArea))))
    && (!texto || f.nombre.toLowerCase().includes(texto)),
  );
  const porVigencia = (estado: EstadoVigencia) => filas.filter((f) => f.estadoVigencia === estado).length;

  const nombreArea = (id: number) => areas.find((a) => a.id === id)?.nombre ?? `#${id}`;
  const hayAreasActivas = areas.some((a) => a.activo);
  const areaInicial = filtroArea !== "todas" && filtroArea !== "sin" ? Number(filtroArea) : "";
  const sinArea = filas.filter((f) => f.areaIds.length === 0).length;

  const servicioAbierto = reservaAbierta?.id != null ? servicios.find((s) => s.id === reservaAbierta.id) ?? null : null;
  const actividadAbierta = inscripcionAbierta?.id != null ? actividades.find((a) => a.id === inscripcionAbierta.id) ?? null : null;

  function elegirTipo(tipo: TipoEvento) {
    setEligiendoTipo(false);
    setAviso(null);
    if (tipo === "reserva") setReservaAbierta({ id: null, pestana: "info" });
    else setInscripcionAbierta({ id: null, pestana: "info" });
  }

  function cambiarTipo() {
    setReservaAbierta(null);
    setInscripcionAbierta(null);
    setEligiendoTipo(true);
  }

  async function alternarServicio(s: Servicio) {
    setAviso(null);
    try {
      if (s.activo) {
        const r = await desactivarServicio(s.id);
        if (r.reservas_afectadas.length > 0) {
          setAfectadas({
            titulo: `«${s.nombre}» desactivado`,
            descripcion: "El evento ya no acepta reservas nuevas. Estas reservas futuras siguen vigentes: puedes mantenerlas (se atienden normalmente) o cancelarlas y avisar a cada colaborador.",
            motivo: "El evento fue suspendido temporalmente.",
            reservas: r.reservas_afectadas,
          });
        } else setAviso(`«${s.nombre}» quedó desactivado: ya no se muestra ni acepta reservas.`);
      } else {
        await activarServicio(s.id);
        setAviso(`«${s.nombre}» está activo de nuevo con las agendas que tenía habilitadas.`);
      }
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado del evento."));
    }
  }

  async function alternarActividad(a: Actividad) {
    setAviso(null);
    try {
      if (a.activo) {
        await desactivarActividad(a.id);
        setAviso(`«${a.nombre}» se ocultó del portal.` + (a.resumen.inscritos_futuros ? ` Sus ${a.resumen.inscritos_futuros} inscripción(es) futura(s) se conservan.` : ""));
      } else {
        const resultado = await activarActividad(a.id);
        setAviso(resultado.publicado
          ? `«${a.nombre}» está publicado de nuevo.`
          : `«${a.nombre}» está activo. Su visibilidad depende de la fecha de publicación y del estado del área.`);
      }
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado del evento."));
    }
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      if (aEliminar.tipo === "reserva") {
        const r = await eliminarServicio(aEliminar.servicio!.id);
        setAviso(`«${aEliminar.nombre}» se eliminó de forma permanente: ${r.reservas_eliminadas} reserva(s) y ${r.agendas_eliminadas} agenda(s) borradas.`);
      } else {
        const r = await eliminarActividad(aEliminar.actividad!.id);
        setAviso(`«${aEliminar.nombre}» se eliminó de forma permanente: ${r.inscripciones_eliminadas} inscripción(es) y ${r.sesiones_eliminadas} fecha(s) borradas.`);
      }
      setAEliminar(null);
      await cargar();
    } catch (e) {
      setErrorEliminar(mensajeError(e, "No se pudo eliminar el evento."));
    } finally {
      setEliminando(false);
    }
  }

  const programacion = (f: Fila) => {
    if (f.tipo === "reserva") {
      if (f.agendas.length === 0) return <Typography variant="body2" color="warning.main">Sin agendas</Typography>;
      const activas = f.agendas.filter((a) => a.activo).length;
      const duraciones = Array.from(new Set(f.agendas.map((a) => a.duracion_minutos))).sort((x, y) => x - y);
      return `${activas} de ${f.agendas.length} agenda(s) activa(s) · turnos de ${duraciones.join("/")} min`;
    }
    const r = f.actividad!.resumen;
    if (!r.proxima_fecha) return <Typography variant="body2" color="text.secondary">Sin fechas próximas</Typography>;
    return `${nombreDia(r.proxima_fecha).slice(0, 3)} ${formatearFecha(r.proxima_fecha)} · ${formatearHora(r.proxima_hora_inicio ?? "")}`
      + (r.sesiones_futuras > 1 ? ` (+${r.sesiones_futuras - 1} fecha${r.sesiones_futuras > 2 ? "s" : ""})` : "");
  };

  const columnas: ColumnaDataTable<Fila>[] = [
    {
      key: "nombre",
      label: "Evento",
      principal: true,
      render: (f) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600}>{f.nombre}</Typography>
          <Typography variant="caption" color="text.secondary">{NOMBRE_TIPO_EVENTO[f.tipo]}</Typography>
        </Box>
      ),
    },
    {
      key: "area",
      label: "Área",
      render: (f) => f.areaIds.length
        ? f.areaIds.map(nombreArea).join(" · ")
        : <Chip size="small" color="warning" variant="outlined" label="Sin área" />,
    },
    {
      key: "vigencia",
      label: "Vigencia",
      render: (f) => (
        <Stack spacing={0.5} alignItems={{ xs: "flex-end", sm: "flex-start" }}>
          <Chip size="small" label={VIGENCIA[f.estadoVigencia].texto} color={VIGENCIA[f.estadoVigencia].color}
            variant={f.estadoVigencia === "vigente" ? "filled" : "outlined"} />
          {textoVigencia(f.vigenciaInicio, f.vigenciaFin) && (
            <Typography variant="caption" color="text.secondary">
              {f.tipo === "inscripcion" ? "Inscripciones: " : ""}{textoVigencia(f.vigenciaInicio, f.vigenciaFin)}
            </Typography>
          )}
        </Stack>
      ),
    },
    { key: "programacion", label: "Programación", render: programacion },
    {
      key: "estado",
      label: "Estado",
      render: (f) => (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center" justifyContent={{ xs: "flex-end", sm: "flex-start" }}>
          {(() => {
            const publicado = Boolean(f.servicio?.publicado || f.actividad?.publicado);
            const texto = publicado ? "Publicado" : !f.activo ? "Oculto" : "Aún no publicado";
            return <Chip size="small" label={texto} color={publicado ? "success" : "default"} variant={publicado ? "filled" : "outlined"} />;
          })()}
          {f.tipo === "inscripcion" && f.activo && (
            <EstadoChip tipo="actividad" estado={f.actividad!.estado_inscripcion} />
          )}
          {f.tipo === "inscripcion" && (
            <Typography variant="caption" color="text.secondary">
              {f.actividad!.resumen.inscritos_futuros} inscrito(s)
              {f.actividad!.resumen.cupos_disponibles != null ? ` · ${f.actividad!.resumen.cupos_disponibles} cupo(s) libre(s)` : ""}
            </Typography>
          )}
        </Stack>
      ),
    },
    {
      key: "acciones",
      label: "",
      align: "right",
      render: (f) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          {f.tipo === "reserva" ? (
            <>
              <Button size="small" variant="outlined" onClick={() => setReservaAbierta({ id: f.servicio!.id, pestana: "info" })}>Gestionar</Button>
              <Button size="small" onClick={() => setReservaAbierta({ id: f.servicio!.id, pestana: "agendas" })}>
                Agendas ({f.agendas.length})
              </Button>
              <Button size="small" color={f.activo ? "error" : "primary"} onClick={() => alternarServicio(f.servicio!)}>
                {f.activo ? "Desactivar" : "Activar"}
              </Button>
              <Button size="small" color="error" onClick={() => { setAEliminar(f); setErrorEliminar(null); }}>
                Eliminar
              </Button>
            </>
          ) : (
            <>
              <Button size="small" variant="outlined" onClick={() => setInscripcionAbierta({ id: f.actividad!.id, pestana: "info" })}>Gestionar</Button>
              <Button size="small" onClick={() => setInscripcionAbierta({ id: f.actividad!.id, pestana: "fechas" })}>
                Fechas e inscritos
              </Button>
              <Button size="small" color={f.activo ? "error" : "primary"} onClick={() => alternarActividad(f.actividad!)}>
                {f.activo ? "Ocultar" : "Publicar"}
              </Button>
              <Button size="small" color="error" onClick={() => { setAEliminar(f); setErrorEliminar(null); }}>
                Eliminar
              </Button>
            </>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        titulo="Eventos"
        descripcion="Todo lo de cada evento en un solo lugar. Los eventos de reserva se configuran con sus agendas (lugar, horario de atención y turnos); los de inscripción, con sus fechas y límite de participantes. Cada evento pertenece a un área y tiene sus fechas: al terminar se cierra solo y conserva su historial."
        acciones={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEligiendoTipo(true)} disabled={!hayAreasActivas}>
            Nuevo evento
          </Button>
        }
      />

      {!cargando && !hayAreasActivas && (
        <Alert severity="info" sx={{ mb: 2 }}>Para crear eventos primero registra al menos un área activa en la sección Áreas.</Alert>
      )}
      {sinArea > 0 && filtroArea !== "sin" && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => setFiltro("area", "sin")}>Ver</Button>}>
          {sinArea} evento(s) sin área asignada. Edítalos para asignarles una.
        </Alert>
      )}
      {porVigencia("sin_vigencia") > 0 && filtroVigencia !== "sin_vigencia" && (
        <Alert severity="warning" sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={() => setFiltro("vigencia", "sin_vigencia")}>Ver</Button>}>
          {porVigencia("sin_vigencia")} evento(s) sin vigencia definida. Edítalos para indicar sus fechas de inicio y finalización.
        </Alert>
      )}
      {aviso && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 2 }} alignItems={{ md: "center" }} flexWrap="wrap" useFlexGap>
        <TextField
          select size="small" label="Área" value={filtroArea} onChange={(e) => setFiltro("area", e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="todas">Todas las áreas</MenuItem>
          {areas.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.nombre}{a.activo ? "" : " (inactiva)"}</MenuItem>)}
          <MenuItem value="sin">Sin área asignada</MenuItem>
        </TextField>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {([["todos", "Todos"], ["reserva", "De reserva"], ["inscripcion", "De inscripción"]] as [string, string][]).map(([v, t]) => (
            <Chip key={v} label={t} onClick={() => setFiltro("tipo", v)}
              color={filtroTipo === v ? "primary" : "default"} variant={filtroTipo === v ? "filled" : "outlined"} />
          ))}
        </Stack>
        <TextField
          select size="small" label="Vigencia" value={filtroVigencia} onChange={(e) => setFiltro("vigencia", e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="todos">Todas ({filas.length})</MenuItem>
          {(["vigente", "proximo", "finalizado", "sin_vigencia"] as EstadoVigencia[])
            .filter((e) => e !== "sin_vigencia" || porVigencia(e) > 0)
            .map((e) => <MenuItem key={e} value={e}>{VIGENCIA[e].filtro} ({porVigencia(e)})</MenuItem>)}
        </TextField>
        <TextField
          size="small" placeholder="Buscar por nombre" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          sx={{ ml: { md: "auto" }, minWidth: { md: 240 } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
      </Stack>

      {cargando ? (
        <Loader />
      ) : (
        <DataTable columnas={columnas} filas={visibles} obtenerId={(f) => f.key}
          mensajeVacio={filas.length ? "No hay eventos con esos filtros." : "Todavía no hay eventos. Crea el primero con «Nuevo evento»."} />
      )}

      <TipoEventoDialog abierto={eligiendoTipo} onCerrar={() => setEligiendoTipo(false)} onElegir={elegirTipo} />

      <EventoReservaDialog
        abierto={!!reservaAbierta}
        servicio={servicioAbierto}
        agendas={agendas}
        areas={areas}
        areaInicial={areaInicial}
        pestana={reservaAbierta?.pestana}
        onCerrar={() => setReservaAbierta(null)}
        onCambio={cargar}
        onCambiarTipo={cambiarTipo}
        onGuardado={async (s, creado, fueraDeVigencia) => {
          if (creado) {
            setReservaAbierta(null);
            const publicado = s.publicado;
            setAviso(`«${s.nombre}» creado con sus agendas. ${publicado ? "Ya aparece en el portal." : "Se mostrará según la publicación programada."}`);
          }
          if (fueraDeVigencia.length > 0) {
            setAfectadas({
              titulo: `Reservas fuera de las nuevas fechas de «${s.nombre}»`,
              descripcion: "Con las nuevas fechas, estas reservas futuras quedaron fuera de la vigencia del evento. Se conservan tal cual (no se cancelan solas): puedes mantenerlas o cancelarlas y avisar a cada colaborador.",
              motivo: "Cambió la programación del evento.",
              reservas: fueraDeVigencia,
            });
          }
          await cargar();
        }}
      />
      <EventoInscripcionDialog
        abierto={!!inscripcionAbierta}
        actividad={actividadAbierta}
        areas={areas}
        areaInicial={areaInicial}
        pestana={inscripcionAbierta?.pestana}
        onCerrar={() => setInscripcionAbierta(null)}
        onCambio={cargar}
        onCambiarTipo={cambiarTipo}
        onGuardada={async (a, creada) => {
          if (creada) {
            setInscripcionAbierta(null);
            setAviso(`«${a.nombre}» creado${a.publicado ? " y publicado" : ": visibilidad según la publicación programada"}.`);
          }
          await cargar();
        }}
      />
      <ReservasAfectadasDialog
        abierto={!!afectadas}
        titulo={afectadas?.titulo ?? ""}
        descripcion={afectadas?.descripcion ?? ""}
        reservas={afectadas?.reservas ?? []}
        motivoSugerido={afectadas?.motivo ?? ""}
        onCerrar={() => setAfectadas(null)}
      />
      <ConfirmDialog
        abierto={!!aEliminar}
        titulo={`Eliminar «${aEliminar?.nombre ?? ""}»`}
        contenido={
          aEliminar && (
            <Alert severity="error">
              Esto borra el evento de forma permanente, junto con <strong>todo su registro</strong>:
              {aEliminar.tipo === "reserva"
                ? " todas sus agendas y todas sus reservas, pasadas y futuras, en cualquier estado."
                : " todas sus fechas y todas sus inscripciones, pasadas y futuras, en cualquier estado."}
              {" "}No es lo mismo que desactivar u ocultar (eso conserva el historial): esta acción{" "}
              <strong>no se puede deshacer</strong> y el historial no se podrá recuperar.
            </Alert>
          )
        }
        textoConfirmar="Eliminar definitivamente"
        colorConfirmar="error"
        cargando={eliminando}
        error={errorEliminar}
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />
    </Box>
  );
}
