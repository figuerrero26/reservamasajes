import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, Navigate } from "react-router-dom";
import { Alert, Box, Button, Tab, Tabs } from "@mui/material";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import Loader from "../components/Loader";
import DataTable, { type ColumnaDataTable } from "../components/DataTable";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import EstadoChip from "../components/EstadoChip";
import PageHeader from "../components/PageHeader";
import type { MiReserva } from "../types";
import { cancelarReservaPropia, misReservas } from "../services/reservas";
import { mensajeError } from "../utils/errors";
import { formatearFecha, formatearHora, hoyBogota, nombreDia } from "../utils/fechas";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

export default function MisReservasPage() {
  const { token } = useUsuarioAuth();
  const [reservas, setReservas] = useState<MiReserva[]>([]);
  const [pestana, setPestana] = useState<"proximas" | "historial">("proximas");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [reservaACancelar, setReservaACancelar] = useState<MiReserva | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setReservas(await misReservas());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar tus reservas."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (token) cargar();
  }, [token]);

  const hoy = hoyBogota();
  const [proximas, historial] = useMemo(() => {
    const p = reservas.filter((r) => r.estado === "activa" && r.fecha >= hoy).reverse();
    const h = reservas.filter((r) => !(r.estado === "activa" && r.fecha >= hoy));
    return [p, h];
  }, [reservas, hoy]);

  if (!token) {
    return <Navigate to="/login?next=/mis-reservas" replace />;
  }

  async function confirmarCancelacion() {
    if (!reservaACancelar) return;
    setCancelando(true);
    setErrorCancelar(null);
    try {
      await cancelarReservaPropia(reservaACancelar.id);
      setReservaACancelar(null);
      setAviso("Tu reserva fue cancelada. El horario quedó libre para otra persona.");
      await cargar();
    } catch (e) {
      setErrorCancelar(mensajeError(e, "No se pudo cancelar la reserva."));
    } finally {
      setCancelando(false);
    }
  }

  const columnas: ColumnaDataTable<MiReserva>[] = [
    { key: "evento", label: "Evento", principal: true, render: (r) => r.evento_nombre },
    { key: "area", label: "Área", render: (r) => r.area_nombre },
    { key: "fecha", label: "Fecha", render: (r) => `${nombreDia(r.fecha)} ${formatearFecha(r.fecha)}` },
    { key: "hora", label: "Hora", render: (r) => `${formatearHora(r.hora_inicio)} – ${formatearHora(r.hora_fin)}` },
    { key: "estado", label: "Estado", render: (r) => <EstadoChip tipo="reserva" estado={r.estado} /> },
    {
      key: "acciones",
      label: "",
      align: "right",
      render: (r) =>
        r.puede_cancelar ? (
          <Button size="small" color="error" onClick={() => { setErrorCancelar(null); setReservaACancelar(r); }}>
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
        titulo="Mis reservas"
        descripcion="Consulta tus turnos reservados y cancela con anticipación si no puedes asistir."
        acciones={<Button variant="contained" component={RouterLink} to="/">Nueva reserva</Button>}
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
          icono={<EventAvailableOutlinedIcon />}
          titulo={pestana === "proximas" ? "No tienes reservas próximas" : "Aún no hay historial"}
          descripcion={pestana === "proximas" ? "Explora los eventos disponibles y aparta tu espacio." : undefined}
          accion={pestana === "proximas" ? <Button component={RouterLink} to="/" variant="outlined">Ver disponibilidad</Button> : undefined}
        />
      ) : (
        <DataTable columnas={columnas} filas={filas} obtenerId={(r) => r.id} />
      )}

      <ConfirmDialog
        abierto={!!reservaACancelar}
        titulo="Cancelar reserva"
        contenido={
          reservaACancelar &&
          `¿Deseas cancelar tu reserva de ${reservaACancelar.evento_nombre} el ${nombreDia(reservaACancelar.fecha)} ${formatearFecha(reservaACancelar.fecha)} a las ${formatearHora(reservaACancelar.hora_inicio)}?`
        }
        textoConfirmar="Cancelar reserva"
        colorConfirmar="error"
        cargando={cancelando}
        error={errorCancelar}
        onConfirmar={confirmarCancelacion}
        onCancelar={() => !cancelando && setReservaACancelar(null)}
      />
    </Box>
  );
}
