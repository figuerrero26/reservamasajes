import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Alert, Box, Chip, Typography } from "@mui/material";
import Loader from "../components/Loader";
import DataTable, { type ColumnaDataTable } from "../components/DataTable";
import ConfirmDialog from "../components/ConfirmDialog";
import type { EstadoInscripcion, MiInscripcion } from "../types";
import { cancelarInscripcionPropia, misInscripciones } from "../services/inscripciones";
import { mensajeError } from "../utils/errors";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

const ESTILO_ESTADO: Record<EstadoInscripcion, { label: string; color: "primary" | "default" | "success" | "warning" }> = {
  activa: { label: "Activa", color: "primary" },
  cancelada: { label: "Cancelada", color: "default" },
  completada: { label: "Asistió", color: "success" },
  no_asistio: { label: "No asistió", color: "warning" },
};

export default function MisInscripcionesPage() {
  const { token } = useUsuarioAuth();
  const [inscripciones, setInscripciones] = useState<MiInscripcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
      await cargar();
    } catch (e) {
      setErrorCancelar(mensajeError(e, "No se pudo cancelar la inscripción."));
    } finally {
      setCancelando(false);
    }
  }

  const columnas: ColumnaDataTable<MiInscripcion>[] = [
    { key: "actividad", label: "Actividad", render: (i) => i.actividad_nombre },
    { key: "fecha", label: "Fecha", render: (i) => i.sesion_fecha },
    { key: "hora", label: "Hora", render: (i) => `${i.sesion_hora_inicio} - ${i.sesion_hora_fin}` },
    {
      key: "estado",
      label: "Estado",
      render: (i) => <Chip size="small" label={ESTILO_ESTADO[i.estado].label} color={ESTILO_ESTADO[i.estado].color} />,
    },
    {
      key: "acciones",
      label: "",
      align: "right",
      render: (i) =>
        i.estado === "activa" ? (
          <Chip
            size="small" label="Cancelar" color="error" variant="outlined"
            onClick={() => { setACancelar(i); setErrorCancelar(null); }}
          />
        ) : null,
    },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Mis inscripciones</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : (
        <DataTable columnas={columnas} filas={inscripciones} obtenerId={(i) => i.id} mensajeVacio="Todavía no tienes inscripciones." />
      )}

      <ConfirmDialog
        abierto={!!aCancelar}
        titulo="Cancelar inscripción"
        contenido={aCancelar && <span>¿Confirmas cancelar tu inscripción a «{aCancelar.actividad_nombre}»?</span>}
        textoConfirmar="Cancelar inscripción"
        colorConfirmar="error"
        cargando={cancelando}
        error={errorCancelar}
        onConfirmar={confirmarCancelacion}
        onCancelar={() => setACancelar(null)}
      />
    </Box>
  );
}
