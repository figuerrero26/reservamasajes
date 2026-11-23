import { useEffect, useState, type ReactNode } from "react";
import { Box, Card, CardActionArea, Stack, Typography, useTheme } from "@mui/material";
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

interface Props {
  tipo: string;
  titulo: string;
  descripcionCorta?: string | null;
  imagenUrl?: string | null;
  datos?: DatoTarjeta[];
  ruta: string;
  textoAccion: string;
}

/** Encabezado de la tarjeta (y del detalle): la imagen del evento o, si no tiene o no carga
 * (URL rota, archivo borrado…), un verde suave de la marca con un ícono. */
export function PortadaEvento({ imagenUrl, proporcion = "16 / 9", radio = 2.5 }: {
  imagenUrl?: string | null; proporcion?: string; radio?: number;
}) {
  const theme = useTheme();
  const verde = tonosSuaves(theme.palette.primary.main);
  const [fallida, setFallida] = useState(false);
  useEffect(() => setFallida(false), [imagenUrl]);
  const conImagen = Boolean(imagenUrl) && !fallida;

  return (
    <Box
      sx={{
        aspectRatio: proporcion, borderRadius: radio, overflow: "hidden",
        bgcolor: verde.fondoMedio, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {conImagen ? (
        <Box
          component="img" src={imagenUrl!} alt="" loading="lazy" onError={() => setFallida(true)}
          sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <SpaOutlinedIcon sx={{ fontSize: 46, color: alpha(verde.texto, 0.55) }} />
      )}
    </Box>
  );
}

/** Tarjeta del catálogo del portal, compartida por los eventos con turnos y las actividades
 * con inscripción. Solo muestra información general e identificativa del evento (tipo,
 * nombre, descripción, área, duración, vigencia): la disponibilidad (turnos o cupos) se
 * consulta únicamente en el detalle. Toda la tarjeta es clicable. */
export default function EventCard({ tipo, titulo, descripcionCorta, imagenUrl, datos = [], ruta, textoAccion }: Props) {
  const navigate = useNavigate();
  const config = useConfig();
  const theme = useTheme();
  const colorAccion = config.color_boton_disponibilidad || theme.palette.secondary.main;

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
        <PortadaEvento imagenUrl={imagenUrl} />

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

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="center"
            spacing={0.75}
            sx={{ mt: "auto", bgcolor: colorAccion, color: textoLegibleSobre(colorAccion), borderRadius: 999, py: 1, px: 2 }}
          >
            <Typography component="span" sx={{ fontWeight: 700, fontSize: "0.9rem", color: "inherit" }}>{textoAccion}</Typography>
            <ArrowForwardIcon sx={{ fontSize: 18 }} />
          </Stack>
        </Box>
      </CardActionArea>
    </Card>
  );
}
