import { Box, type SxProps, type Theme } from "@mui/material";

/** Firma institucional del portal cuando la configuración aún no llega (o está vacía). */
export const FIRMA_POR_DEFECTO = "InfraestructurEF";

/** Nombre de la organización (configuración `empresa_nombre`) escrito tal cual, sin
 * convertirlo a mayúsculas: en "InfraestructurEF" las siglas finales llevan un acento de
 * color sutil. Cualquier otro nombre se muestra sin adornos. */
export default function Marca({ nombre, acento, sx }: { nombre?: string | null; acento?: string; sx?: SxProps<Theme> }) {
  const texto = (nombre || FIRMA_POR_DEFECTO).trim();
  const partes = texto.match(/^(.*[a-záéíóúñ])([A-ZÁÉÍÓÚÑ]{2,4})$/);
  return (
    <Box
      component="span"
      sx={[{ fontWeight: 700, letterSpacing: "0.01em", whiteSpace: "nowrap" }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {partes ? (
        <>
          {partes[1]}
          <Box component="span" sx={{ color: acento ?? "inherit", fontWeight: 800 }}>{partes[2]}</Box>
        </>
      ) : texto}
    </Box>
  );
}
