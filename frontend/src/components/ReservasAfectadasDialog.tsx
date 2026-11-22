import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Stack, Switch, TextField, Typography,
} from "@mui/material";
import type { ReservaAdmin } from "../types";
import { cancelarReservasLote } from "../services/reservas";
import { mensajeError } from "../utils/errors";
import { formatearFecha, formatearHora, nombreDia } from "../utils/fechas";

interface Props {
  abierto: boolean;
  titulo: string;
  /** Contexto: por qué estas reservas están afectadas y qué pasa si no se hace nada. */
  descripcion: string;
  reservas: ReservaAdmin[];
  motivoSugerido?: string;
  /** Si es false, el diálogo solo informa (p. ej. un cambio de agenda rechazado). */
  permitirCancelar?: boolean;
  onCerrar: (huboCancelaciones: boolean) => void;
}

/** Reservas futuras afectadas por un cambio administrativo (bloqueo, festivo, desactivación
 * de un evento/área/agenda, cambio de agenda rechazado).
 *
 * Nunca cancela por su cuenta: el administrador elige cuáles cancelar y lo confirma
 * explícitamente; por defecto se notifica a cada colaborador por correo con el motivo. Si
 * cierra sin hacer nada, las reservas siguen vigentes. */
export default function ReservasAfectadasDialog({
  abierto, titulo, descripcion, reservas, motivoSugerido = "", permitirCancelar = true, onCerrar,
}: Props) {
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [motivo, setMotivo] = useState(motivoSugerido);
  const [notificar, setNotificar] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setSeleccion(new Set(reservas.map((r) => r.id)));
      setMotivo(motivoSugerido);
      setNotificar(true);
      setConfirmando(false);
      setError(null);
      setResultado(null);
    }
  }, [abierto, reservas, motivoSugerido]);

  function alternar(id: number) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function cancelar() {
    setEnviando(true);
    setError(null);
    try {
      const r = await cancelarReservasLote(Array.from(seleccion), { motivo: motivo.trim() || null, notificar });
      setResultado(
        `${r.canceladas.length} reserva(s) cancelada(s)${notificar ? " y notificada(s) por correo" : ""}.` +
          (r.omitidas.length ? ` ${r.omitidas.length} ya no estaban activas.` : ""),
      );
      setConfirmando(false);
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cancelar las reservas."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierto} onClose={() => !enviando && onCerrar(!!resultado)} maxWidth="sm" fullWidth>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {resultado ? (
            <Alert severity="success">{resultado}</Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">{descripcion}</Typography>
              {error && <Alert severity="error">{error}</Alert>}
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, maxHeight: 280, overflowY: "auto" }}>
                {reservas.map((r, i) => (
                  <Stack
                    key={r.id}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ px: 1.5, py: 1, borderTop: i ? 1 : 0, borderColor: "divider" }}
                  >
                    {permitirCancelar && (
                      <Checkbox size="small" checked={seleccion.has(r.id)} onChange={() => alternar(r.id)} />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {r.usuario_nombre} {r.usuario_apellido}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" noWrap>
                        {nombreDia(r.fecha)} {formatearFecha(r.fecha)} · {formatearHora(r.hora_inicio)} ·{" "}
                        {r.evento_nombre} · {r.area_nombre}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Box>
              {permitirCancelar && (
                <>
                  <TextField
                    label="Motivo (se incluye en el correo)"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    size="small"
                    fullWidth
                    inputProps={{ maxLength: 500 }}
                  />
                  <FormControlLabel
                    control={<Switch checked={notificar} onChange={(e) => setNotificar(e.target.checked)} />}
                    label="Notificar a cada colaborador por correo"
                  />
                  {confirmando && (
                    <Alert severity="warning">
                      Se cancelarán {seleccion.size} reserva(s). Esta acción no se puede deshacer.
                    </Alert>
                  )}
                </>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onCerrar(!!resultado)} disabled={enviando}>
          {resultado || !permitirCancelar ? "Cerrar" : "Mantener reservas"}
        </Button>
        {permitirCancelar && !resultado && (
          confirmando ? (
            <Button variant="contained" color="error" onClick={cancelar} disabled={enviando || seleccion.size === 0}>
              {enviando ? "Cancelando..." : "Confirmar cancelación"}
            </Button>
          ) : (
            <Button variant="outlined" color="error" onClick={() => setConfirmando(true)} disabled={seleccion.size === 0}>
              Cancelar seleccionadas ({seleccion.size})
            </Button>
          )
        )}
      </DialogActions>
    </Dialog>
  );
}
