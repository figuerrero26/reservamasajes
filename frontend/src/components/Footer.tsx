import { Box, Container, Divider, Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useConfig } from "../hooks/useConfig";

/** Pie de página discreto: identidad, contacto (si está configurado), enlaces útiles y
 * textos legales. Todo sale de la configuración del panel; lo que no esté configurado no se
 * muestra. */
export default function Footer() {
  const config = useConfig();
  const anio = new Date().getFullYear();
  const titular = config.empresa_nombre || config.sistema_nombre || "Reservas de Bienestar";
  const contacto = [config.contacto_correo, config.contacto_telefono, config.contacto_direccion].filter(Boolean);

  return (
    <Box component="footer" sx={{ mt: { xs: 8, sm: 12 }, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      <Container maxWidth="lg" sx={{ py: { xs: 4, sm: 5 }, px: { xs: 2.5, sm: 3 } }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={{ xs: 3, md: 6 }}>
          <Box sx={{ maxWidth: 360 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {config.sistema_nombre || "Reservas de Bienestar"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Espacios de bienestar y actividades para todo el equipo.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 3, sm: 8 }}>
            <Stack spacing={0.75}>
              <Typography variant="overline" color="text.secondary">Explorar</Typography>
              <Link component={RouterLink} to="/" color="inherit" variant="body2">Inicio</Link>
              <Link component={RouterLink} to="/mis-reservas" color="inherit" variant="body2">Mis reservas</Link>
              <Link component={RouterLink} to="/mis-inscripciones" color="inherit" variant="body2">Mis inscripciones</Link>
            </Stack>
            <Stack spacing={0.75}>
              <Typography variant="overline" color="text.secondary">Legal</Typography>
              <Link component={RouterLink} to="/privacidad" color="inherit" variant="body2">Política de privacidad</Link>
              <Link component={RouterLink} to="/terminos" color="inherit" variant="body2">Términos y condiciones</Link>
            </Stack>
            {contacto.length > 0 && (
              <Stack spacing={0.75}>
                <Typography variant="overline" color="text.secondary">Contacto</Typography>
                {config.contacto_correo && (
                  <Link href={`mailto:${config.contacto_correo}`} color="inherit" variant="body2">
                    {config.contacto_correo}
                  </Link>
                )}
                {config.contacto_telefono && (
                  <Link href={`tel:${config.contacto_telefono.replace(/\s+/g, "")}`} color="inherit" variant="body2">
                    {config.contacto_telefono}
                  </Link>
                )}
                {config.contacto_direccion && (
                  <Typography variant="body2" color="text.secondary">{config.contacto_direccion}</Typography>
                )}
              </Stack>
            )}
          </Stack>
        </Stack>

        <Divider sx={{ my: 3 }} />
        <Typography variant="caption" color="text.secondary">
          © {anio} {titular}. Todos los derechos reservados.
        </Typography>
      </Container>
    </Box>
  );
}
