import { Box, Paper, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { useConfig } from "../hooks/useConfig";

interface Props {
  tipo: "privacidad" | "terminos";
}

const TEXTO_PRIVACIDAD_POR_DEFECTO = `Tratamos tus datos personales (nombre, apellido y correo electrónico) únicamente para gestionar tus reservas e inscripciones a las actividades de bienestar, enviarte las confirmaciones correspondientes y llevar el registro de asistencia.

Tus datos no se comparten con terceros ni se usan con fines comerciales. Solo el personal administrador de la plataforma puede consultar el historial de reservas e inscripciones.

Puedes solicitar la actualización o eliminación de tu cuenta en cualquier momento a través de los canales de contacto de la organización, de acuerdo con la Ley 1581 de 2012 de protección de datos personales.`;

const TEXTO_TERMINOS_POR_DEFECTO = `Al usar esta plataforma aceptas reservar únicamente los espacios a los que planeas asistir y cancelar con anticipación cuando no puedas hacerlo, para que otra persona pueda aprovecharlos.

Cada colaborador puede tener una reserva por evento al día, salvo las excepciones que habilite la administración. Los cupos de las actividades son limitados y se asignan por orden de inscripción.

La administración puede reprogramar o cancelar reservas e inscripciones por motivos operativos; en ese caso recibirás un aviso por correo.`;

/** Política de privacidad y términos: el texto se edita en el panel (Configuración); si no
 * se ha definido, se muestra un texto base genérico. */
export default function LegalPage({ tipo }: Props) {
  const config = useConfig();
  const esPrivacidad = tipo === "privacidad";
  const texto = (esPrivacidad ? config.politica_privacidad : config.terminos_condiciones)
    || (esPrivacidad ? TEXTO_PRIVACIDAD_POR_DEFECTO : TEXTO_TERMINOS_POR_DEFECTO);

  return (
    <Box sx={{ maxWidth: 760, mx: "auto" }}>
      <PageHeader
        antetitulo="Legal"
        titulo={esPrivacidad ? "Política de privacidad" : "Términos y condiciones"}
      />
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 } }}>
        <Typography variant="body1" sx={{ whiteSpace: "pre-line", color: "text.secondary" }}>
          {texto}
        </Typography>
      </Paper>
    </Box>
  );
}
