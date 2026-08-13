import { useEffect, useState } from "react";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import type { AgendaPublica, ReservaCreada, Slot } from "../types";
import { crearReserva, misReservas } from "../services/reservas";
import { mensajeError, esConflicto } from "../utils/errors";
import { formatearFecha, formatearHora, nombreDia } from "../utils/fechas";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

interface Props {
  open: boolean;
  agenda: AgendaPublica;
  fecha: string;
  slot: Slot;
  /** Se llama al cerrar el diálogo, tanto al cancelar como después de confirmar. */
  onClose: () => void;
  /** Se llama cuando el horario elegido ya no está disponible (409), para que la página
   * pueda refrescar el calendario. */
  onConflicto?: () => void;
  /** Se llama justo después de crear la reserva exitosamente. */
  onReservada?: (reserva: ReservaCreada) => void;
}

const MENSAJE_EVENTO_DIA = "Ya tienes una reserva para este evento en esta fecha.";

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600}>{valor}</Typography>
    </Stack>
  );
}

function mensajeCorreo(estado: ReservaCreada["correo_confirmacion"]): string {
  if (estado === "enviado") return "Te enviamos un correo de confirmación.";
  if (estado === "fallido") return "No pudimos enviarte el correo de confirmación, pero tu reserva quedó registrada.";
  return "Te enviaremos un correo de confirmación en breve.";
}

export default function ReservationDialog({ open, agenda, fecha, slot, onClose, onConflicto, onReservada }: Props) {
  const { nombre, correo } = useUsuarioAuth();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservaCreada, setReservaCreada] = useState<ReservaCreada | null>(null);
  const [yaReservado, setYaReservado] = useState(false);
  const [verificando, setVerificando] = useState(true);

  // Validación en el frontend, en espejo de la regla del backend: como máximo una reserva
  // activa por usuario+evento+día. La barrera real está en la base de datos (índice único);
  // esto solo evita un viaje innecesario al servidor y avisa antes de que el usuario confirme.
  useEffect(() => {
    let cancelado = false;
    setVerificando(true);
    setYaReservado(false);
    misReservas()
      .then((reservas) => {
        if (cancelado) return;
        const conflicto = reservas.some(
          (r) => r.estado === "activa" && r.servicio_id === agenda.servicio_id && r.fecha === fecha
        );
        setYaReservado(conflicto);
      })
      .catch(() => undefined) // si falla la verificación, el backend igual protege al confirmar
      .finally(() => {
        if (!cancelado) setVerificando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [agenda.servicio_id, fecha]);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const reserva = await crearReserva({
        agenda_id: agenda.id,
        fecha,
        hora_inicio: slot.hora_inicio,
      });
      setReservaCreada(reserva);
      onReservada?.(reserva);
    } catch (e) {
      setError(mensajeError(e, "No se pudo crear la reserva"));
      if (esConflicto(e)) onConflicto?.();
    } finally {
      setEnviando(false);
    }
  }

  if (reservaCreada) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
          <Typography variant="h6" gutterBottom>¡Reserva confirmada!</Typography>
          <Typography variant="body2" color="text.secondary">
            {mensajeCorreo(reservaCreada.correo_confirmacion)}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: "center" }}>
          <Button variant="contained" onClick={onClose}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={enviando ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Confirmar reserva</DialogTitle>
      <DialogContent>
        <Stack spacing={1.25} sx={{ mt: 0.5 }}>
          {yaReservado && <Alert severity="warning">{MENSAJE_EVENTO_DIA}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <Fila label="Colaborador" valor={nombre ?? ""} />
          <Fila label="Correo" valor={correo ?? ""} />
          <Fila label="Servicio" valor={agenda.servicio_nombre} />
          <Fila label="Área" valor={agenda.area_nombre} />
          <Fila label="Agenda" valor={agenda.nombre} />
          <Divider />
          <Fila label="Día" valor={`${nombreDia(fecha)} ${formatearFecha(fecha)}`} />
          <Fila label="Hora" valor={`${formatearHora(slot.hora_inicio)} - ${formatearHora(slot.hora_fin)}`} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="contained" onClick={confirmar} disabled={enviando || verificando || yaReservado}>
          {enviando ? "Reservando..." : "Confirmar reserva"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
