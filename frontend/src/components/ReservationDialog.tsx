import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { Link as RouterLink } from "react-router-dom";
import type { AgendaPublica, ReservaCreada, Slot } from "../types";
import { crearReserva, verificarReserva } from "../services/reservas";
import { mensajeError, esConflicto } from "../utils/errors";
import { formatearFechaLarga, formatearHora } from "../utils/fechas";
import { useUsuarioAuth } from "../hooks/useUsuarioAuth";

interface Props {
  open: boolean;
  agenda: AgendaPublica;
  fecha: string;
  slot: Slot;
  /** Se llama al cerrar el diálogo, tanto al cancelar como después de confirmar. */
  onClose: () => void;
  /** El horario elegido ya no está disponible (409): la página refresca el calendario. */
  onConflicto?: () => void;
  /** Justo después de crear la reserva. */
  onReservada?: (reserva: ReservaCreada) => void;
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600} textAlign="right">{valor}</Typography>
    </Stack>
  );
}

export default function ReservationDialog({ open, agenda, fecha, slot, onClose, onConflicto, onReservada }: Props) {
  const { nombre, correo } = useUsuarioAuth();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservaCreada, setReservaCreada] = useState<ReservaCreada | null>(null);
  const [impedimento, setImpedimento] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(true);

  // Aviso previo con la MISMA regla del backend (vigencia del evento y su límite de
  // participación por persona, con la excepción que habilita el administrador). La barrera
  // real está en el backend al confirmar; esto solo avisa antes.
  useEffect(() => {
    let cancelado = false;
    setVerificando(true);
    setImpedimento(null);
    verificarReserva(agenda.id, fecha)
      .then((v) => {
        if (!cancelado) setImpedimento(v.permitido ? null : v.motivo || "No puedes reservar en este evento ese día.");
      })
      .catch(() => undefined) // si falla la verificación, el backend igual protege al confirmar
      .finally(() => {
        if (!cancelado) setVerificando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [agenda.id, fecha]);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const reserva = await crearReserva({ agenda_id: agenda.id, fecha, hora_inicio: slot.hora_inicio });
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
        <DialogContent sx={{ textAlign: "center", pt: 4 }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
          <Typography variant="h6" gutterBottom>¡Reserva confirmada!</Typography>
          <Typography variant="body2" color="text.secondary">
            {agenda.servicio_nombre} · {formatearFechaLarga(fecha)} a las {formatearHora(slot.hora_inicio)}.
            Te enviaremos un correo con los detalles.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center" }}>
          <Button onClick={onClose}>Cerrar</Button>
          <Button variant="contained" component={RouterLink} to="/mis-reservas">Ver mis reservas</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={enviando ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Confirmar reserva</DialogTitle>
      <DialogContent>
        <Stack spacing={1.25}>
          {impedimento && <Alert severity="warning">{impedimento}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: "background.default", border: 1, borderColor: "divider" }}>
            <Typography variant="subtitle1">{agenda.servicio_nombre}</Typography>
            <Typography variant="body2" color="text.secondary">
              {formatearFechaLarga(fecha)} · {formatearHora(slot.hora_inicio)} – {formatearHora(slot.hora_fin)}
            </Typography>
          </Box>
          <Fila label="Área" valor={agenda.area_nombre} />
          <Divider />
          <Fila label="A nombre de" valor={nombre ?? ""} />
          <Fila label="Correo" valor={correo ?? ""} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="contained" onClick={confirmar} disabled={enviando || verificando || !!impedimento}>
          {enviando ? "Reservando…" : "Confirmar reserva"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
