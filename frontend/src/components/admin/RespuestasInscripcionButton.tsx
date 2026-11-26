import { useId, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import type { CampoFormulario, InscripcionAdmin } from "../../types";
import { formatearFechaLarga, formatearHora } from "../../utils/fechas";
import { formatearRespuesta, preguntasConRespuestas } from "../../utils/respuestasInscripcion";
import EstadoChip from "../EstadoChip";

interface Props {
  campos: CampoFormulario[];
  inscripcion: InscripcionAdmin;
}

export default function RespuestasInscripcionButton({ campos, inscripcion }: Props) {
  const [abierto, setAbierto] = useState(false);
  const tituloId = useId();
  if (!campos.length && !Object.keys(inscripcion.respuestas_formulario ?? {}).length) return null;

  return (
    <>
      <Button size="small" onClick={() => setAbierto(true)}>Ver respuestas</Button>
      {abierto && (
        <Dialog open onClose={() => setAbierto(false)} aria-labelledby={tituloId} fullWidth maxWidth="sm">
          <DialogTitle id={tituloId}>Respuestas de la inscripción</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Box sx={{ overflowWrap: "anywhere" }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {inscripcion.usuario_nombre} {inscripcion.usuario_apellido}
                </Typography>
                {inscripcion.usuario_correo && (
                  <Typography variant="body2" color="text.secondary">{inscripcion.usuario_correo}</Typography>
                )}
                <Typography variant="body2" sx={{ mt: 1 }}>{inscripcion.actividad_nombre}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatearFechaLarga(inscripcion.sesion_fecha)} · {formatearHora(inscripcion.sesion_hora_inicio)}
                </Typography>
                <Box sx={{ mt: 1 }}><EstadoChip tipo="inscripcion" estado={inscripcion.estado} /></Box>
              </Box>
              <Stack component="dl" spacing={1.5} sx={{ m: 0, overflowWrap: "anywhere" }}>
                {preguntasConRespuestas(campos, [inscripcion]).map(({ clave, etiqueta }) => {
                  const respuesta = formatearRespuesta(inscripcion, clave);
                  return (
                    <Box key={clave}>
                      <Typography component="dt" variant="subtitle2">{etiqueta}</Typography>
                      <Typography component="dd" variant="body2" color={respuesta ? "text.primary" : "text.secondary"}
                        sx={{ m: 0, whiteSpace: "pre-wrap" }}>
                        {respuesta || "Sin respuesta"}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAbierto(false)}>Cerrar</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
