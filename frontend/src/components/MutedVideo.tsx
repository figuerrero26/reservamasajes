import { useEffect, useRef } from "react";
import { Box, type SxProps, type Theme } from "@mui/material";

interface Props {
  src: string;
  sx?: SxProps<Theme>;
}

/** Video en loop, autoplay y silenciado — para el banner de bienvenida (ver
 * TIPOS_BIENVENIDA_PERMITIDOS en el backend). React no siempre refleja el atributo JSX
 * `muted` como propiedad del DOM a tiempo para que el navegador permita el autoplay sin
 * interacción del usuario, así que se fija explícitamente por ref además del atributo. */
export default function MutedVideo({ src, sx }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.muted = true;
  }, [src]);

  return <Box ref={ref} component="video" src={src} autoPlay muted loop playsInline sx={sx} />;
}
