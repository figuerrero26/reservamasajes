import { Box, Paper, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { useConfig } from "../hooks/useConfig";

const TEXTO_POR_DEFECTO = `Al usar esta plataforma aceptas reservar únicamente los espacios a los que planeas asistir y cancelar con anticipación cuando no puedas hacerlo, para que otra persona pueda aprovecharlos.

Cada evento define sus propias fechas y reglas de participación, que se muestran en su detalle (por ejemplo, una reserva por día o una sola inscripción), salvo las excepciones que habilite la administración. Los cupos de los eventos de inscripción son limitados y se asignan por orden de inscripción.

La administración puede reprogramar o cancelar reservas e inscripciones por motivos operativos; en ese caso recibirás un aviso por correo.`;

/** Términos y condiciones: el texto se edita en el panel (Configuración); si no se ha
 * definido, se muestra un texto base. */
export default function TerminosPage() {
  const config = useConfig();
  return (
    <Box sx={{ maxWidth: 760, mx: "auto" }}>
      <PageHeader antetitulo="Legal" titulo="Términos y condiciones" />
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 } }}>
        <Typography variant="body1" sx={{ whiteSpace: "pre-line", color: "text.secondary" }}>
          {config.terminos_condiciones || TEXTO_POR_DEFECTO}
        </Typography>
      </Paper>
    </Box>
  );
}
