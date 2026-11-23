import { useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LinkIcon from "@mui/icons-material/Link";
import { PortadaEvento } from "../EventCard";
import { TAMANO_MAXIMO_IMAGEN_MB, TIPOS_IMAGEN_EVENTO, subirImagenEvento } from "../../services/uploads";
import { mensajeError } from "../../utils/errors";

type Modo = "archivo" | "url";

const PREFIJO_SUBIDAS = "/api/uploads/";

/** Formato de la URL (el backend aplica la misma regla): web http/https o archivo subido. */
export function errorImagen(url: string): string | null {
  const valor = url.trim();
  if (!valor) return null;
  if (/\s/.test(valor) || !(/^https?:\/\//i.test(valor) || valor.startsWith(PREFIJO_SUBIDAS))) {
    return "La URL de la imagen debe empezar por http:// o https://.";
  }
  return null;
}

interface Props {
  valor: string;
  onChange: (url: string) => void;
}

/** Imagen del evento: se sube un archivo (JPG, PNG, WEBP o GIF, hasta 5 MB) o se pega una URL.
 * Muestra la vista previa, permite reemplazarla o quitarla y avisa si la URL no carga; sin
 * imagen (o si no carga) el portal usa el fondo verde suave de la marca. */
export default function ImagenEventoCampo({ valor, onChange }: Props) {
  const [modo, setModo] = useState<Modo>(valor && !valor.startsWith(PREFIJO_SUBIDAS) ? "url" : "archivo");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rota, setRota] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const formatoInvalido = errorImagen(valor);
  const url = valor.trim();

  // Comprueba si la imagen carga (URL rota, sin permiso, archivo borrado…).
  useEffect(() => {
    setRota(false);
    if (!url || formatoInvalido) return;
    const img = new Image();
    let vigente = true;
    img.onerror = () => vigente && setRota(true);
    img.src = url;
    return () => {
      vigente = false;
    };
  }, [url, formatoInvalido]);

  async function elegirArchivo(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    if (!TIPOS_IMAGEN_EVENTO.includes(archivo.type)) {
      setError("Formato no soportado. Usa una imagen JPG, PNG, WEBP o GIF.");
      return;
    }
    if (archivo.size > TAMANO_MAXIMO_IMAGEN_MB * 1024 * 1024) {
      setError(`La imagen no puede superar ${TAMANO_MAXIMO_IMAGEN_MB} MB.`);
      return;
    }
    setSubiendo(true);
    try {
      onChange(await subirImagenEvento(archivo));
    } catch (e) {
      setError(mensajeError(e, "No se pudo subir la imagen."));
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
        <Typography variant="subtitle2">Imagen del evento (opcional)</Typography>
        <ToggleButtonGroup size="small" exclusive value={modo} onChange={(_, m: Modo | null) => m && setModo(m)}>
          <ToggleButton value="archivo"><CloudUploadOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} />Subir archivo</ToggleButton>
          <ToggleButton value="url"><LinkIcon fontSize="small" sx={{ mr: 0.75 }} />Usar URL</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-start" }}>
        <Box sx={{ width: { xs: "100%", sm: 200 }, flexShrink: 0, position: "relative" }}>
          <PortadaEvento imagenUrl={formatoInvalido ? null : url || null} />
          {subiendo && (
            <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CircularProgress size={28} />
            </Box>
          )}
        </Box>

        <Stack spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
          {modo === "archivo" ? (
            <>
              <input
                ref={entrada} type="file" hidden accept={TIPOS_IMAGEN_EVENTO.join(",")}
                onChange={(e) => elegirArchivo(e.target.files?.[0])}
              />
              <Button
                variant="outlined" startIcon={<CloudUploadOutlinedIcon />} disabled={subiendo}
                onClick={() => entrada.current?.click()} sx={{ alignSelf: "flex-start" }}
              >
                {url ? "Reemplazar imagen" : "Elegir imagen"}
              </Button>
              <Typography variant="caption" color="text.secondary">
                JPG, PNG, WEBP o GIF, hasta {TAMANO_MAXIMO_IMAGEN_MB} MB. Recomendado: horizontal (16:9).
              </Typography>
            </>
          ) : (
            <TextField
              label="URL de la imagen" size="small" fullWidth placeholder="https://…"
              value={valor} onChange={(e) => onChange(e.target.value)}
              error={!!formatoInvalido} helperText={formatoInvalido ?? "Pega el enlace directo a una imagen."}
            />
          )}
          {url && (
            <Button
              size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => onChange("")}
              disabled={subiendo} sx={{ alignSelf: "flex-start" }}
            >
              Quitar imagen
            </Button>
          )}
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {rota && !formatoInvalido && (
        <Alert severity="warning">
          No se pudo cargar la imagen desde esa dirección. Revisa el enlace o sube un archivo; mientras tanto, el portal
          mostrará el fondo verde.
        </Alert>
      )}
      {!url && (
        <Typography variant="caption" color="text.secondary">Sin imagen, la tarjeta usa un fondo verde suave.</Typography>
      )}
    </Stack>
  );
}
