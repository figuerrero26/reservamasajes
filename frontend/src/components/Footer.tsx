import { Box, Container, Link, Stack, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { Link as RouterLink } from "react-router-dom";
import { useConfig } from "../hooks/useConfig";

const FONDO = "#0E0E0E";
const TEXTO = "#F2F2F2";
const TEXTO_SUAVE = "#A8A8A8";

/** Pie de página con identidad propia: fondo negro y detalles en el amarillo de SIGRA (color
 * secundario de la configuración). Contacto y textos salen de la configuración del panel. */
export default function Footer() {
  const config = useConfig();
  const theme = useTheme();
  const amarillo = theme.palette.secondary.main;
  const anio = new Date().getFullYear();
  const titular = config.empresa_nombre || "SIGRA S.A.S";
  const [titulo, lema] = (config.sistema_nombre || "").split("|").map((p) => p.trim());
  const telefonoHref = config.contacto_telefono ? `tel:${config.contacto_telefono.replace(/[^\d+]/g, "")}` : undefined;

  const enlace = {
    color: TEXTO, fontSize: "0.9rem", width: "fit-content",
    "&:hover": { color: amarillo, textDecoration: "none" },
  };
  const encabezado = { color: amarillo, fontWeight: 700, letterSpacing: "0.14em", fontSize: "0.72rem", textTransform: "uppercase" as const };

  return (
    <Box component="footer" sx={{ mt: { xs: 8, sm: 12 }, bgcolor: FONDO, color: TEXTO, borderTop: `3px solid ${amarillo}` }}>
      <Container maxWidth="lg" sx={{ pt: { xs: 5, sm: 6 }, pb: 3, px: { xs: 2.5, sm: 3 } }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={{ xs: 4, md: 8 }}>
          <Box sx={{ maxWidth: 380 }}>
            <Box sx={{ width: 36, height: 3, bgcolor: amarillo, borderRadius: 2, mb: 2 }} />
            <Typography sx={{ fontWeight: 700, fontSize: "1.15rem", lineHeight: 1.3 }}>
              {titulo || "Semana Sigra Vive"}
            </Typography>
            {lema && <Typography sx={{ color: amarillo, fontWeight: 600, fontSize: "0.9rem", mt: 0.5 }}>{lema}</Typography>}
            <Typography sx={{ color: TEXTO_SUAVE, fontSize: "0.9rem", mt: 1.5, lineHeight: 1.6 }}>
              Espacios de bienestar y actividades para todo el equipo de {titular}.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 4, sm: 8 }}>
            <Stack spacing={1}>
              <Typography sx={encabezado}>Explorar</Typography>
              <Link component={RouterLink} to="/" sx={enlace}>Inicio</Link>
              <Link component={RouterLink} to="/mis-reservas" sx={enlace}>Mis reservas</Link>
              <Link component={RouterLink} to="/mis-inscripciones" sx={enlace}>Mis inscripciones</Link>
            </Stack>

            <Stack spacing={1.25}>
              <Typography sx={encabezado}>Contacto</Typography>
              {config.contacto_correo && (
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <MailOutlineIcon sx={{ fontSize: 18, color: amarillo }} />
                  <Link href={`mailto:${config.contacto_correo}`} sx={{ ...enlace, wordBreak: "break-all" }}>
                    {config.contacto_correo}
                  </Link>
                </Stack>
              )}
              {config.contacto_telefono && (
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <PhoneOutlinedIcon sx={{ fontSize: 18, color: amarillo }} />
                  <Link href={telefonoHref} sx={enlace}>{config.contacto_telefono}</Link>
                </Stack>
              )}
              {config.contacto_direccion && (
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <PlaceOutlinedIcon sx={{ fontSize: 18, color: amarillo }} />
                  <Typography sx={{ color: TEXTO_SUAVE, fontSize: "0.9rem" }}>{config.contacto_direccion}</Typography>
                </Stack>
              )}
            </Stack>
          </Stack>
        </Stack>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "flex-end" }}
          spacing={1.5}
          sx={{ mt: 5, pt: 2.5, borderTop: `1px solid ${alpha(TEXTO, 0.12)}` }}
        >
          <Typography sx={{ color: TEXTO_SUAVE, fontSize: "0.78rem" }}>
            © {anio} {titular}. Todos los derechos reservados.{" "}
            <Link component={RouterLink} to="/terminos" sx={{ color: TEXTO_SUAVE, "&:hover": { color: amarillo } }}>
              Términos y condiciones
            </Link>
          </Typography>
          <Typography sx={{ alignSelf: { xs: "flex-end", sm: "auto" }, color: alpha(TEXTO, 0.38), fontSize: "0.68rem", letterSpacing: "0.04em" }}>
            @PYP YP
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
