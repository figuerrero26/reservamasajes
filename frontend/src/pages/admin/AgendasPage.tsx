import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Agenda, Area, ReservaAdmin, Servicio } from "../../types";
import { listarAreas } from "../../services/areas";
import { listarServicios } from "../../services/servicios";
import { cambiarEstadoAgenda, listarAgendas } from "../../services/agendas";
import { mensajeError } from "../../utils/errors";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import Loader from "../../components/Loader";
import PageHeader from "../../components/PageHeader";
import ReservasAfectadasDialog from "../../components/ReservasAfectadasDialog";
import AgendaFormDialog from "../../components/admin/AgendaFormDialog";
import { resumenDias } from "../../components/admin/AgendasEventoDialog";

/** Vista general de todas las agendas (evento + área + horario). Las mismas agendas se
 * gestionan también desde cada evento en «Eventos»; aquí se consultan y filtran juntas. */
export default function AgendasPage() {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroArea, setFiltroArea] = useState<number | "todas">("todas");
  const [filtroEvento, setFiltroEvento] = useState<number | "todos">("todos");
  const [form, setForm] = useState<{ agenda: Agenda | null } | null>(null);
  const [afectadas, setAfectadas] = useState<{ nombre: string; reservas: ReservaAdmin[] } | null>(null);

  async function cargar() {
    setError(null);
    try {
      const [a, ar, sv] = await Promise.all([listarAgendas(), listarAreas(), listarServicios()]);
      setAgendas(a);
      setAreas(ar);
      setServicios(sv);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar la información de agendas."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const area = (id: number) => areas.find((a) => a.id === id);
  const servicio = (id: number) => servicios.find((s) => s.id === id);

  async function alternarEstado(agenda: Agenda) {
    try {
      const r = await cambiarEstadoAgenda(agenda.id, !agenda.activo);
      if (r.reservas_afectadas.length > 0) setAfectadas({ nombre: agenda.nombre, reservas: r.reservas_afectadas });
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado de la agenda."));
    }
  }

  const visibles = agendas.filter(
    (a) => (filtroArea === "todas" || a.area_id === filtroArea) && (filtroEvento === "todos" || a.servicio_id === filtroEvento),
  );

  const columnas: ColumnaDataTable<Agenda>[] = [
    {
      key: "area",
      label: "Área",
      render: (a) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <span>{area(a.area_id)?.nombre ?? `#${a.area_id}`}</span>
          {area(a.area_id) && !area(a.area_id)!.activo && <Chip size="small" variant="outlined" color="warning" label="Inactiva" />}
        </Stack>
      ),
    },
    {
      key: "evento",
      label: "Evento",
      principal: true,
      render: (a) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>{servicio(a.servicio_id)?.nombre ?? `#${a.servicio_id}`}</Typography>
          <Typography variant="caption" color="text.secondary">{a.nombre}</Typography>
        </Box>
      ),
    },
    { key: "horario", label: "Horario", render: (a) => `${a.hora_inicio.slice(0, 5)}–${a.hora_fin.slice(0, 5)}` },
    { key: "turno", label: "Turno", render: (a) => `${a.duracion_minutos} min` },
    { key: "dias", label: "Días", render: (a) => resumenDias(a.dias_habilitados) },
    {
      key: "activo",
      label: "Estado",
      render: (a) => {
        const evento = servicio(a.servicio_id);
        return (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap justifyContent={{ xs: "flex-end", sm: "flex-start" }}>
            <Chip size="small" label={a.activo ? "Activa" : "Inactiva"} color={a.activo ? "success" : "default"} variant={a.activo ? "filled" : "outlined"} />
            {evento && !evento.activo && <Chip size="small" variant="outlined" color="warning" label="Evento inactivo" />}
          </Stack>
        );
      },
    },
    {
      key: "acciones",
      label: "",
      align: "right",
      render: (a) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <Button size="small" onClick={() => setForm({ agenda: a })}>Editar</Button>
          <Button size="small" color={a.activo ? "error" : "primary"} onClick={() => alternarEstado(a)}>
            {a.activo ? "Desactivar" : "Activar"}
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        titulo="Agendas"
        descripcion="Cada agenda define en qué área se ofrece un evento, su horario y la duración de los turnos. Los cambios que dejarían reservas futuras fuera de los nuevos turnos se bloquean hasta resolverlas."
        acciones={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ agenda: null })}
            disabled={!areas.some((a) => a.activo) || !servicios.some((s) => s.activo)}>
            Nueva agenda
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField select size="small" label="Área" value={filtroArea} sx={{ minWidth: 200 }}
          onChange={(e) => setFiltroArea(e.target.value === "todas" ? "todas" : Number(e.target.value))}>
          <MenuItem value="todas">Todas las áreas</MenuItem>
          {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nombre}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Evento" value={filtroEvento} sx={{ minWidth: 220 }}
          onChange={(e) => setFiltroEvento(e.target.value === "todos" ? "todos" : Number(e.target.value))}>
          <MenuItem value="todos">Todos los eventos</MenuItem>
          {servicios.map((s) => <MenuItem key={s.id} value={s.id}>{s.nombre}</MenuItem>)}
        </TextField>
      </Stack>

      {cargando ? (
        <Loader />
      ) : (
        <DataTable columnas={columnas} filas={visibles} obtenerId={(a) => a.id}
          mensajeVacio={agendas.length ? "No hay agendas con esos filtros." : "No hay agendas registradas."} />
      )}

      <AgendaFormDialog
        abierto={!!form}
        agenda={form?.agenda ?? null}
        areas={areas}
        servicios={servicios}
        onCerrar={() => setForm(null)}
        onGuardada={async () => { setForm(null); await cargar(); }}
      />
      <ReservasAfectadasDialog
        abierto={!!afectadas}
        titulo={`«${afectadas?.nombre ?? ""}» desactivada`}
        descripcion="La agenda ya no acepta reservas nuevas. Estas reservas futuras siguen vigentes: puedes mantenerlas o cancelarlas y avisar a cada colaborador."
        reservas={afectadas?.reservas ?? []}
        motivoSugerido="El servicio no estará disponible en esa área."
        onCerrar={() => setAfectadas(null)}
      />
    </Box>
  );
}
