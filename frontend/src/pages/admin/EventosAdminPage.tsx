import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert, Box, Button, Chip, InputAdornment, ListItemText, Menu, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { Actividad, Agenda, Area, ReservaAdmin, Servicio } from "../../types";
import { listarActividades, activarActividad, desactivarActividad } from "../../services/actividades";
import { listarAgendas } from "../../services/agendas";
import { listarAreas } from "../../services/areas";
import { activarServicio, desactivarServicio, listarServicios } from "../../services/servicios";
import { mensajeError } from "../../utils/errors";
import { formatearFecha, formatearHora, nombreDia } from "../../utils/fechas";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import EstadoChip from "../../components/EstadoChip";
import Loader from "../../components/Loader";
import PageHeader from "../../components/PageHeader";
import ReservasAfectadasDialog from "../../components/ReservasAfectadasDialog";
import ActividadFormDialog from "../../components/admin/ActividadFormDialog";
import AgendasEventoDialog from "../../components/admin/AgendasEventoDialog";
import EventoTurnosDialog from "../../components/admin/EventoTurnosDialog";
import SesionesDialog from "../../components/admin/SesionesDialog";

type Tipo = "turnos" | "actividad";

interface Fila {
  key: string;
  tipo: Tipo;
  nombre: string;
  areaIds: number[];
  activo: boolean;
  servicio?: Servicio;
  actividad?: Actividad;
  agendas: Agenda[];
}

const ETIQUETA_TIPO: Record<Tipo, string> = { turnos: "Reserva por turnos", actividad: "Actividad con inscripción" };

/** Módulo unificado de eventos: los eventos de reserva por turnos (con sus agendas) y las
 * actividades con inscripción (con sus sesiones) se crean, consultan y filtran por área en
 * un solo lugar. Cada tipo conserva su propia lógica: las agendas generan turnos y las
 * actividades controlan inscripciones y cupos. */
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

  const [menuNuevo, setMenuNuevo] = useState<HTMLElement | null>(null);
  const [eventoForm, setEventoForm] = useState<{ servicio: Servicio | null } | null>(null);
  const [actividadForm, setActividadForm] = useState<{ actividad: Actividad | null } | null>(null);
  const [agendasDe, setAgendasDe] = useState<Servicio | null>(null);
  const [sesionesDe, setSesionesDe] = useState<Actividad | null>(null);
  const [afectadas, setAfectadas] = useState<{ nombre: string; reservas: ReservaAdmin[] } | null>(null);

  // Filtros en la URL: permiten llegar filtrado desde Áreas ("Ver eventos") o desde un enlace.
  const filtroArea = params.get("area") ?? "todas"; // "todas" | "sin" | id
  const filtroTipo = (params.get("tipo") ?? "todos") as Tipo | "todos";
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
        key: `s-${s.id}`, tipo: "turnos" as const, nombre: s.nombre, activo: s.activo, servicio: s, agendas: propias,
        areaIds: Array.from(new Set(propias.map((a) => a.area_id))),
      };
    }),
    ...actividades.map((a) => ({
      key: `a-${a.id}`, tipo: "actividad" as const, nombre: a.nombre, activo: a.activo, actividad: a, agendas: [],
      areaIds: a.area_id ? [a.area_id] : [],
    })),
  ].sort((x, y) => x.nombre.localeCompare(y.nombre)), [servicios, actividades, agendas]);

  const texto = busqueda.trim().toLowerCase();
  const visibles = filas.filter((f) =>
    (filtroTipo === "todos" || f.tipo === filtroTipo)
    && (filtroArea === "todas" || (filtroArea === "sin" ? f.areaIds.length === 0 : f.areaIds.includes(Number(filtroArea))))
    && (!texto || f.nombre.toLowerCase().includes(texto)),
  );

  const nombreArea = (id: number) => areas.find((a) => a.id === id)?.nombre ?? `#${id}`;
  const hayAreasActivas = areas.some((a) => a.activo);
  const areaInicial = filtroArea !== "todas" && filtroArea !== "sin" ? Number(filtroArea) : "";
  const sinArea = filas.filter((f) => f.areaIds.length === 0).length;

  async function alternarServicio(s: Servicio) {
    setAviso(null);
    try {
      if (s.activo) {
        const r = await desactivarServicio(s.id);
        if (r.reservas_afectadas.length > 0) setAfectadas({ nombre: s.nombre, reservas: r.reservas_afectadas });
        else setAviso(`«${s.nombre}» quedó desactivado: ya no se muestra ni acepta reservas.`);
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
        await activarActividad(a.id);
        setAviso(`«${a.nombre}» está publicada de nuevo.`);
      }
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado de la actividad."));
    }
  }

  const programacion = (f: Fila) => {
    if (f.tipo === "turnos") {
      if (f.agendas.length === 0) return <Typography variant="body2" color="warning.main">Sin agendas</Typography>;
      const activas = f.agendas.filter((a) => a.activo).length;
      const duraciones = Array.from(new Set(f.agendas.map((a) => a.duracion_minutos))).sort((x, y) => x - y);
      return `${activas} de ${f.agendas.length} agenda(s) activa(s) · ${duraciones.join("/")} min`;
    }
    const r = f.actividad!.resumen;
    if (!r.proxima_fecha) return <Typography variant="body2" color="text.secondary">Sin sesiones próximas</Typography>;
    return `${nombreDia(r.proxima_fecha).slice(0, 3)} ${formatearFecha(r.proxima_fecha)} · ${formatearHora(r.proxima_hora_inicio ?? "")}`
      + (r.sesiones_futuras > 1 ? ` (+${r.sesiones_futuras - 1})` : "");
  };

  const columnas: ColumnaDataTable<Fila>[] = [
    {
      key: "nombre",
      label: "Evento",
      principal: true,
      render: (f) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>{f.nombre}</Typography>
          <Typography variant="caption" color="text.secondary">{ETIQUETA_TIPO[f.tipo]}</Typography>
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
    { key: "programacion", label: "Programación", render: programacion },
    {
      key: "estado",
      label: "Estado",
      render: (f) => (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center" justifyContent={{ xs: "flex-end", sm: "flex-start" }}>
          <Chip size="small" label={f.activo ? "Publicado" : "Oculto"} color={f.activo ? "success" : "default"} variant={f.activo ? "filled" : "outlined"} />
          {f.tipo === "actividad" && f.activo && <EstadoChip tipo="actividad" estado={f.actividad!.estado_inscripcion} />}
          {f.tipo === "actividad" && (
            <Typography variant="caption" color="text.secondary">
              {f.actividad!.resumen.inscritos_futuros} inscrito(s)
              {f.actividad!.resumen.cupos_disponibles != null ? ` · ${f.actividad!.resumen.cupos_disponibles} libre(s)` : ""}
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
          {f.tipo === "turnos" ? (
            <>
              <Button size="small" variant="outlined" onClick={() => setAgendasDe(f.servicio!)}>Agendas ({f.agendas.length})</Button>
              <Button size="small" onClick={() => setEventoForm({ servicio: f.servicio! })}>Editar</Button>
              <Button size="small" color={f.activo ? "error" : "primary"} onClick={() => alternarServicio(f.servicio!)}>
                {f.activo ? "Desactivar" : "Activar"}
              </Button>
            </>
          ) : (
            <>
              <Button size="small" variant="outlined" onClick={() => setSesionesDe(f.actividad!)}>Sesiones</Button>
              <Button size="small" onClick={() => setActividadForm({ actividad: f.actividad! })}>Editar</Button>
              <Button size="small" color={f.activo ? "error" : "primary"} onClick={() => alternarActividad(f.actividad!)}>
                {f.activo ? "Ocultar" : "Publicar"}
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
        descripcion="Todos los eventos en un solo lugar: reservas por turnos (con sus agendas) y actividades con inscripción (con sus sesiones y cupos). Cada evento pertenece a un área."
        acciones={
          <Button variant="contained" startIcon={<AddIcon />} endIcon={<KeyboardArrowDownIcon />}
            onClick={(e) => setMenuNuevo(e.currentTarget)} disabled={!hayAreasActivas}>
            Nuevo evento
          </Button>
        }
      />
      <Menu anchorEl={menuNuevo} open={!!menuNuevo} onClose={() => setMenuNuevo(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <MenuItem onClick={() => { setMenuNuevo(null); setEventoForm({ servicio: null }); }}>
          <ListItemText primary="Reserva por turnos" secondary="Turnos individuales con horario (p. ej. masajes)" />
        </MenuItem>
        <MenuItem onClick={() => { setMenuNuevo(null); setActividadForm({ actividad: null }); }}>
          <ListItemText primary="Actividad con inscripción" secondary="Cupos por sesión (p. ej. caminata o taller)" />
        </MenuItem>
      </Menu>

      {!cargando && !hayAreasActivas && (
        <Alert severity="info" sx={{ mb: 2 }}>Para crear eventos primero registra al menos un área activa en la sección Áreas.</Alert>
      )}
      {sinArea > 0 && filtroArea !== "sin" && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => setFiltro("area", "sin")}>Ver</Button>}>
          {sinArea} evento(s) sin área asignada. Edítalos para asignarles una.
        </Alert>
      )}
      {aviso && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 2 }} alignItems={{ md: "center" }}>
        <TextField
          select size="small" label="Área" value={filtroArea} onChange={(e) => setFiltro("area", e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="todas">Todas las áreas</MenuItem>
          {areas.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.nombre}{a.activo ? "" : " (inactiva)"}</MenuItem>)}
          <MenuItem value="sin">Sin área asignada</MenuItem>
        </TextField>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {([["todos", "Todos"], ["turnos", "Reservas por turnos"], ["actividad", "Actividades"]] as [string, string][]).map(([v, t]) => (
            <Chip key={v} label={t} onClick={() => setFiltro("tipo", v)}
              color={filtroTipo === v ? "primary" : "default"} variant={filtroTipo === v ? "filled" : "outlined"} />
          ))}
        </Stack>
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

      <EventoTurnosDialog
        abierto={!!eventoForm}
        servicio={eventoForm?.servicio ?? null}
        areas={areas}
        areaInicial={areaInicial}
        onCerrar={() => setEventoForm(null)}
        onGuardado={async (s, creado) => {
          setEventoForm(null);
          setAviso(creado ? `«${s.nombre}» creado con su agenda. Ya aparece en el portal.` : `«${s.nombre}» actualizado.`);
          await cargar();
        }}
      />
      <ActividadFormDialog
        abierto={!!actividadForm}
        actividad={actividadForm?.actividad ?? null}
        areas={areas}
        areaInicial={areaInicial}
        onCerrar={() => setActividadForm(null)}
        onGuardada={async (a, creada) => {
          setActividadForm(null);
          await cargar();
          if (creada && a.resumen.sesiones_futuras === 0) {
            setAviso(`«${a.nombre}» creada. Agrega al menos una sesión para publicarla en el portal.`);
            setSesionesDe(a);
          } else {
            setAviso(creada ? `«${a.nombre}» creada y publicada.` : `«${a.nombre}» actualizada.`);
          }
        }}
      />
      <AgendasEventoDialog
        servicio={agendasDe}
        agendas={agendas}
        areas={areas}
        servicios={servicios}
        onCerrar={() => setAgendasDe(null)}
        onCambio={cargar}
      />
      <SesionesDialog actividad={sesionesDe} onCerrar={() => setSesionesDe(null)} onCambio={cargar} />
      <ReservasAfectadasDialog
        abierto={!!afectadas}
        titulo={`«${afectadas?.nombre ?? ""}» desactivado`}
        descripcion="El evento ya no acepta reservas nuevas. Estas reservas futuras siguen vigentes: puedes mantenerlas (se atienden normalmente) o cancelarlas y avisar a cada colaborador."
        reservas={afectadas?.reservas ?? []}
        motivoSugerido="El evento fue suspendido temporalmente."
        onCerrar={() => setAfectadas(null)}
      />
    </Box>
  );
}
