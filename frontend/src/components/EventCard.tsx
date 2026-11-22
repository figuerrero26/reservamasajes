import type { ReactNode } from "react";
import { Box, Card, CardActionArea, Stack, Typography, useTheme } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SpaOutlinedIcon from "@mui/icons-material/SpaOutlined";
import { alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import { useConfig } from "../hooks/useConfig";

export interface DatoTarjeta {
  icono: ReactNode;
  texto: string;
}

interface Props {
  tipo: string;
  titulo: string;
  descripcionCorta?: string | null;
  imagenUrl?: string | null;
  datos?: DatoTarjeta[];
  estado?: ReactNode;
  ruta: string;
  textoAccion: string;
}

/** Tarjeta del catálogo del portal, compartida por los eventos con turnos y las actividades
 * con inscripción: misma estructura visual, distinto contenido. Toda la tarjeta es clicable. */
export default function EventCard({
  tipo, titulo, descripcionCorta, imagenUrl, datos = [], estado, ruta, textoAccion,
}: Props) {
  const navigate = useNavigate();
  const config = useConfig();
  const theme = useTheme();
  const colorAccion = config.color_boton_disponibilidad || theme.palette.primary.main;

  return (
    <Card
      sx={{
        height: "100%",
        "&:hover": { borderColor: "text.primary", boxShadow: "0 12px 32px rgba(17,17,17,.08)", transform: "translateY(-2px)" },
      }}
    >
      <CardActionArea
        onClick={() => navigate(ruta)}
        sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch", p: 1.25 }}
      >
        <Box
          sx={{
            aspectRatio: "16 / 10", borderRadius: 2.5, overflow: "hidden", position: "relative",
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {imagenUrl ? (
            <Box component="img" src={imagenUrl} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
          ) : (
            <SpaOutlinedIcon sx={{ fontSize: 44, color: alpha(theme.palette.primary.main, 0.55) }} />
          )}
          {estado && <Box sx={{ position: "absolute", top: 10, left: 10 }}>{estado}</Box>}
        </Box>

        <Box sx={{ px: 1.25, pt: 2, pb: 1, flexGrow: 1, display: "flex", flexDirection: "column" }}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {tipo}
          </Typography>
          <Typography variant="h6" component="h3" sx={{ mb: 0.75 }}>
            {titulo}
          </Typography>
          {descripcionCorta && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", mb: 1.5 }}
            >
              {descripcionCorta}
            </Typography>
          )}
          {datos.length > 0 && (
            <Stack spacing={0.5} sx={{ mb: 2 }}>
              {datos.map((d, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ color: "text.secondary" }}>
                  <Box sx={{ display: "flex", "& svg": { fontSize: 17 } }}>{d.icono}</Box>
                  <Typography variant="body2" noWrap>{d.texto}</Typography>
                </Stack>
              ))}
            </Stack>
          )}
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: "auto", color: colorAccion, fontWeight: 600 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: "inherit" }}>{textoAccion}</Typography>
            <ArrowForwardIcon sx={{ fontSize: 18 }} />
          </Stack>
        </Box>
      </CardActionArea>
    </Card>
  );
}
