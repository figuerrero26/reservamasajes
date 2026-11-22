import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, Navigate } from "react-router-dom";
import { Alert, Box, Button, Link, Tab, Tabs } from "@mui/material";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import Loader from "../components/Loader";
import DataTable, { type ColumnaDataTable } from "../components/DataTable";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import EstadoChip from "../components/EstadoChip";
import PageHeader from "../components/PageHeader";
import type { MiInscripcion } from "../types";
import { cancelarInscripcionPropia, misInscripciones } from "../services/inscripciones";
import { mensajeError } from "../utils/errors";
import { formatearFecha, hoyBogota, nombreDia } from "../utils/fechas";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

export default function MisInscripcionesPage() {
  const { token } = useUsuarioAuth();
  const [inscripciones, setInscripciones] = useState<MiInscripcion[]>([]);
  const [pestana, setPestana] = useState<"proximas" | "historial">("proximas");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [aCancelar, setACancelar] = useState<MiInscripcion | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setInscripciones(await misInscripciones());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar tus inscripciones."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (token) cargar();
  }, [token]);

  const hoy = hoyBogota();
  const [proximas, historial] = useMemo(() => {
    const esProxima = (i: MiInscripcion) => i.estado === "activa" && i.sesion_fecha >= hoy;
    const p = inscripciones.filter(esProxima).sort((a, b) => (a.sesion_fecha + a.sesion_hora_inicio).localeCompare(b.sesion_fecha + b.sesion_hora_inicio));
    return [p, inscripciones.filter((i) => !esProxima(i))];
  }, [inscripciones, hoy]);

  if (!token) {
    return <Navigate to="/login?next=/mis-inscripciones" replace />;
  }

  async function confirmarCancelacion() {
    if (!aCancelar) return;
    setCancelando(true);
    setErrorCancelar(null);
    try {
      await cancelarInscripcionPropia(aCancelar.id);
      setACancelar(null);
      setAviso("Tu inscripción fue cancelada y el cupo quedó disponible.");
      await cargar();
    } catch (e) {
      setErrorCancelar(mensajeError(e, "No se pudo cancelar la inscripción."));
    } finally {
      setCancelando(false);
    }
  }

  const columnas: ColumnaDataTable<MiInscripcion>[] = [
    {
      key: "actividad",
      label: "Actividad",
      principal: true,
      render: (i) => (
        <Link component={RouterLink} to={`/actividades/${i.actividad_id}`} color="inherit">{i.actividad_nombre}</Link>
      ),
    },
    { key: "fecha", label: "Fecha", render: (i) => `${nombreDia(i.sesion_fecha)} ${formatearFecha(i.sesion_fecha)}` },
    { key: "hora", label: "Hora", render: (i) => `${i.sesion_hora_inicio} – ${i.sesion_hora_fin}` },
    { key: "lugar", label: "Lugar", render: (i) => i.sesion_lugar || "—" },
    { key: "estado", label: "Estado", render: (i) => <EstadoChip tipo="inscripcion" estado={i.estado} /> },
    {
      key: "acciones",
      label: "",
      align: "right",
      render: (i) =>
        i.puede_cancelar ? (
          <Button size="small" color="error" onClick={() => { setACancelar(i); setErrorCancelar(null); }}>
            Cancelar
          </Button>
        ) : null,
    },
  ];

  const filas = pestana === "proximas" ? proximas : historial;

  return (
    <Box>
      <PageHeader
        antetitulo="Mi cuenta"
        titulo="Mis inscripciones"
        descripcion="Las actividades en las que tienes un cupo reservado."
      />

      {aviso && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Tabs value={pestana} onChange={(_, v) => setPestana(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab value="proximas" label={`Próximas (${proximas.length})`} />
        <Tab value="historial" label="Historial" />
      </Tabs>

      {cargando ? (
        <Loader />
      ) : filas.length === 0 ? (
        <EmptyState
          icono={<GroupsOutlinedIcon />}
          titulo={pestana === "proximas" ? "No tienes inscripciones próximas" : "Aún no hay historial"}
          descripcion={pestana === "proximas" ? "Revisa las actividades disponibles en el inicio." : undefined}
          accion={pestana === "proximas" ? <Button component={RouterLink} to="/" variant="outlined">Ver actividades</Button> : undefined}
        />
      ) : (
        <DataTable columnas={columnas} filas={filas} obtenerId={(i) => i.id} />
      )}

      <ConfirmDialog
        abierto={!!aCancelar}
        titulo="Cancelar inscripción"
        contenido={aCancelar && `¿Confirmas cancelar tu inscripción a «${aCancelar.actividad_nombre}»? Tu cupo quedará disponible para otra persona.`}
        textoConfirmar="Cancelar inscripción"
        colorConfirmar="error"
        cargando={cancelando}
        error={errorCancelar}
        onConfirmar={confirmarCancelacion}
        onCancelar={() => !cancelando && setACancelar(null)}
      />
    </Box>
  );
}
