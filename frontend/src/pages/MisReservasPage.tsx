import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Alert, Box, Button, Chip, Typography } from "@mui/material";
import Loader from "../components/Loader";
import DataTable, { type ColumnaDataTable } from "../components/DataTable";
import ConfirmDialog from "../components/ConfirmDialog";
import type { EstadoReserva, Reserva } from "../types";
import { cancelarReservaPropia, misReservas } from "../services/reservas";
import { listarEventos } from "../services/eventos";
import { mensajeError } from "../utils/errors";
import { formatearFecha, formatearHora, nombreDia } from "../utils/fechas";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

const ESTILO_ESTADO: Record<EstadoReserva, { label: string; color: "primary" | "default" | "success" | "warning" }> = {
  activa: { label: "Activa", color: "primary" },
  cancelada: { label: "Cancelada", color: "default" },
  completada: { label: "Completada", color: "success" },
  no_asistio: { label: "No asistió", color: "warning" },
};

export default function MisReservasPage() {
  const { token } = useUsuarioAuth();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [nombrePorEvento, setNombrePorEvento] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reservaACancelar, setReservaACancelar] = useState<Reserva | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [misr, eventos] = await Promise.all([misReservas(), listarEventos()]);
      setReservas(misr);
      const mapa: Record<number, string> = {};
      eventos.forEach((evento) => {
        mapa[evento.id] = evento.nombre;
      });
      setNombrePorEvento(mapa);
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar tus reservas."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (token) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
      await cargar();
    } catch (e) {
      setErrorCancelar(mensajeError(e, "No se pudo cancelar la reserva."));
    } finally {
      setCancelando(false);
    }
  }

  const columnas: ColumnaDataTable<Reserva>[] = [
    { key: "evento", label: "Evento", render: (r) => nombrePorEvento[r.servicio_id] ?? "—" },
    { key: "fecha", label: "Fecha", render: (r) => `${nombreDia(r.fecha)} ${formatearFecha(r.fecha)}` },
    { key: "hora", label: "Hora", render: (r) => `${formatearHora(r.hora_inicio)} - ${formatearHora(r.hora_fin)}` },
    {
      key: "estado",
      label: "Estado",
      render: (r) => <Chip size="small" label={ESTILO_ESTADO[r.estado].label} color={ESTILO_ESTADO[r.estado].color} />,
    },
    { key: "notes", label: "Notas", render: (r) => r.notes || "—" },
    {
      key: "acciones",
      label: "Acciones",
      align: "right",
      render: (r) =>
        r.estado === "activa" ? (
          <Button
            size="small"
            color="error"
            onClick={() => {
              setErrorCancelar(null);
              setReservaACancelar(r);
            }}
          >
            Cancelar
          </Button>
        ) : null,
    },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Mis reservas</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : (
        <DataTable columnas={columnas} filas={reservas} obtenerId={(r) => r.id} mensajeVacio="Aún no tienes reservas." />
      )}

      <ConfirmDialog
        abierto={!!reservaACancelar}
        titulo="Cancelar reserva"
        contenido="¿Deseas cancelar esta reserva? Esta acción no se puede deshacer."
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
