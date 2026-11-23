import type { ReactNode } from "react";
import { Box, Card, CardActionArea, LinearProgress, Stack, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SpaOutlinedIcon from "@mui/icons-material/SpaOutlined";
import { useNavigate } from "react-router-dom";
import { useConfig } from "../hooks/useConfig";
import { textoLegibleSobre, tonosSuaves } from "../theme";

export interface DatoTarjeta {
  icono: ReactNode;
  texto: string;
}

/** Bloque de disponibilidad: el dato más importante de la tarjeta. */
export interface Disponibilidad {
  /** Número protagonista (cupos o turnos libres). Sin número = solo la etiqueta. */
  numero?: number | null;
  etiqueta: string;
  detalle?: string;
  /** Ocupación 0–100 para la barra (solo si hay un cupo total conocido). */
  progreso?: number;
  nivel: "alta" | "baja" | "agotada";
}

interface Props {
  tipo: string;
  titulo: string;
  descripcionCorta?: string | null;
  imagenUrl?: string | null;
  datos?: DatoTarjeta[];
  disponibilidad?: Disponibilidad;
  estado?: ReactNode;
  ruta: string;
  textoAccion: string;
}

const AMBAR = "#B7791F";
const GRIS = { fondo: "#F1F1EE", fondoMedio: "#E4E4DF", texto: "#5F5F5A" };

/** Tarjeta del catálogo del portal, compartida por los eventos con turnos y las actividades
 * con inscripción: misma estructura visual, distinto contenido. Toda la tarjeta es clicable.
 * Sin foto, el encabezado usa un verde suave de la marca (no gris). */
export default function EventCard({
  tipo, titulo, descripcionCorta, imagenUrl, datos = [], disponibilidad, estado, ruta, textoAccion,
}: Props) {
  const navigate = useNavigate();
  const config = useConfig();
  const theme = useTheme();
  const verde = tonosSuaves(theme.palette.primary.main);
  const colorAccion = config.color_boton_disponibilidad || theme.palette.secondary.main;
  const tono = !disponibilidad || disponibilidad.nivel === "alta"
    ? verde
    : disponibilidad.nivel === "baja" ? tonosSuaves(AMBAR) : GRIS;

  return (
    <Card
      sx={{
        height: "100%",
        "&:hover": { borderColor: "text.primary", boxShadow: "0 14px 34px rgba(17,17,17,.08)", transform: "translateY(-2px)" },
      }}
    >
      <CardActionArea
        onClick={() => navigate(ruta)}
        sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch", p: 1.25 }}
      >
        <Box
          sx={{
            aspectRatio: "16 / 9", borderRadius: 2.5, overflow: "hidden", position: "relative",
            bgcolor: verde.fondoMedio, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {imagenUrl ? (
            <Box component="img" src={imagenUrl} alt="" loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <SpaOutlinedIcon sx={{ fontSize: 46, color: alpha(verde.texto, 0.55) }} />
          )}
          {estado && <Box sx={{ position: "absolute", top: 10, left: 10 }}>{estado}</Box>}
        </Box>

        <Box sx={{ px: 1.25, pt: 2, pb: 1, flexGrow: 1, display: "flex", flexDirection: "column" }}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }} noWrap>
            {tipo}
          </Typography>
          <Typography variant="h6" component="h3" sx={{ mb: 0.75, lineHeight: 1.3 }}>
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
                <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ color: "text.secondary", minWidth: 0 }}>
                  <Box sx={{ display: "flex", flexShrink: 0, "& svg": { fontSize: 17 } }}>{d.icono}</Box>
                  <Typography variant="body2" noWrap>{d.texto}</Typography>
                </Stack>
              ))}
            </Stack>
          )}

          <Box sx={{ mt: "auto" }}>
            {disponibilidad && (
              <Box sx={{ borderRadius: 2.5, px: 1.75, py: 1.5, mb: 1.5, bgcolor: tono.fondo, color: tono.texto }}>
                <Stack direction="row" alignItems="baseline" spacing={1}>
                  {disponibilidad.numero != null && (
                    <Typography component="span" sx={{ fontSize: "1.9rem", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>
                      {disponibilidad.numero}
                    </Typography>
                  )}
                  <Typography component="span" sx={{ fontWeight: 700, fontSize: disponibilidad.numero != null ? "0.92rem" : "1rem" }}>
                    {disponibilidad.etiqueta}
                  </Typography>
                </Stack>
                {disponibilidad.progreso != null && (
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, Math.max(0, disponibilidad.progreso))}
                    sx={{
                      mt: 1, height: 6, borderRadius: 3, bgcolor: alpha(tono.texto, 0.15),
                      "& .MuiLinearProgress-bar": { bgcolor: tono.texto, borderRadius: 3 },
                    }}
                  />
                )}
                {disponibilidad.detalle && (
                  <Typography component="span" sx={{ display: "block", mt: 0.75, fontSize: "0.78rem", fontWeight: 500 }}>
                    {disponibilidad.detalle}
                  </Typography>
                )}
              </Box>
            )}
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="center"
              spacing={0.75}
              sx={{ bgcolor: colorAccion, color: textoLegibleSobre(colorAccion), borderRadius: 999, py: 1, px: 2 }}
            >
              <Typography component="span" sx={{ fontWeight: 700, fontSize: "0.9rem", color: "inherit" }}>{textoAccion}</Typography>
              <ArrowForwardIcon sx={{ fontSize: 18 }} />
            </Stack>
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
}
