import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import type { Actividad, Agenda, Area, ReservaAdmin } from "../../types";
import { activarArea, actualizarArea, crearArea, desactivarArea, listarAreas } from "../../services/areas";
import { listarAgendas } from "../../services/agendas";
import { listarActividades } from "../../services/actividades";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import ReservasAfectadasDialog from "../../components/ReservasAfectadasDialog";

/** Áreas: organizan los eventos. Un evento por turnos pertenece a un área por sus agendas y
 * una actividad por su campo de área; ambos son obligatorios al crear. */
export default function AreasPage() {
  const navigate = useNavigate();
  const [areas, setAreas] = useState<Area[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [afectadas, setAfectadas] = useState<{ nombre: string; reservas: ReservaAdmin[] } | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [editando, setEditando] = useState<Area | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [ar, ag, ac] = await Promise.all([listarAreas(), listarAgendas(), listarActividades()]);
      setAreas(ar);
      setAgendas(ag);
      setActividades(ac);
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar las áreas."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirCrear() {
    setEditando(null);
    setNombre("");
    setDescripcion("");
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  function abrirEditar(area: Area) {
    setEditando(area);
    setNombre(area.nombre);
    setDescripcion(area.descripcion ?? "");
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    setErrorDialog(null);
    try {
      if (editando) {
        await actualizarArea(editando.id, { nombre: nombre.trim(), descripcion: descripcion.trim() || null });
      } else {
        await crearArea({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined });
      }
      setDialogAbierto(false);
      await cargar();
    } catch (e) {
      setErrorDialog(mensajeError(e, "No se pudo guardar el área."));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEstado(area: Area) {
    setAviso(null);
    try {
      if (area.activo) {
        const r = await desactivarArea(area.id);
        const actividadesTexto = r.actividades_afectadas
          ? ` y ${r.actividades_afectadas} actividad(es) se ocultaron del portal (sus inscripciones se conservan)`
          : "";
        if (r.reservas_afectadas.length > 0) setAfectadas({ nombre: area.nombre, reservas: r.reservas_afectadas });
        setAviso(`«${area.nombre}» quedó desactivada: sus agendas dejan de ofrecer turnos${actividadesTexto}.`);
      } else {
        await activarArea(area.id);
        setAviso(`«${area.nombre}» está activa de nuevo.`);
      }
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado del área."));
    }
  }

  const columnas: ColumnaDataTable<Area>[] = [
    { key: "nombre", label: "Nombre", principal: true },
    { key: "descripcion", label: "Descripción", render: (a) => a.descripcion || "—" },
    {
      key: "eventos",
      label: "Agendas / actividades",
      render: (a) => {
        const nAgendas = agendas.filter((g) => g.area_id === a.id).length;
        const nActividades = actividades.filter((x) => x.area_id === a.id).length;
        return `${nAgendas} agenda(s) · ${nActividades} actividad(es)`;
      },
    },
    {
      key: "activo",
      label: "Estado",
      render: (a) => (
        <Chip size="small" label={a.activo ? "Activa" : "Inactiva"} color={a.activo ? "success" : "default"} variant={a.activo ? "filled" : "outlined"} />
      ),
    },
    {
      key: "acciones",
      label: "",
      align: "right",
      render: (a) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" onClick={() => navigate(`/admin/eventos?area=${a.id}`)}>
            Ver eventos
          </Button>
          <Button size="small" onClick={() => abrirEditar(a)}>
            Editar
          </Button>
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
        titulo="Áreas"
        descripcion="Las áreas organizan los eventos: todo evento, agenda y actividad pertenece a una. Un área inactiva deja de ofrecer sus turnos y oculta sus actividades del portal."
        acciones={<Button variant="contained" startIcon={<AddIcon />} onClick={abrirCrear}>Nueva área</Button>}
      />

      {aviso && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <ReservasAfectadasDialog
        abierto={!!afectadas}
        titulo={`«${afectadas?.nombre ?? ""}» desactivada`}
        descripcion="El área ya no acepta reservas nuevas. Estas reservas futuras siguen vigentes: puedes mantenerlas o cancelarlas y avisar a cada colaborador."
        reservas={afectadas?.reservas ?? []}
        motivoSugerido="El área no estará disponible en esa fecha."
        onCerrar={() => setAfectadas(null)}
      />

      {cargando ? (
        <Loader />
      ) : (
        <DataTable columnas={columnas} filas={areas} obtenerId={(a) => a.id} mensajeVacio="No hay áreas registradas." />
      )}

      <Dialog open={dialogAbierto} onClose={() => setDialogAbierto(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editando ? "Editar área" : "Nueva área"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorDialog && <Alert severity="error">{errorDialog}</Alert>}
            <TextField
              label="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              fullWidth
            />
            <TextField
              label="Descripción"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogAbierto(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={guardar} disabled={guardando || !nombre.trim()}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
