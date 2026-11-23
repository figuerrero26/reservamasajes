import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  Grid,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { ConfiguracionGeneral, PlantillaCorreo, SmtpConfig } from "../../types";
import {
  actualizarConfiguracion,
  actualizarConfiguracionSmtp,
  enviarCorreoPrueba,
  obtenerConfiguracion,
  obtenerConfiguracionSmtp,
  obtenerPlantillaCorreo,
  previsualizarPlantillaCorreo,
  subirImagenBienvenida,
  subirImagenCorreo,
  subirLogo,
} from "../../services/configuracion";
import { mensajeError } from "../../utils/errors";
import { esVideo } from "../../utils/media";
import Loader from "../../components/Loader";
import MutedVideo from "../../components/MutedVideo";
import PageHeader from "../../components/PageHeader";
import { Link as RouterLink } from "react-router-dom";

interface FormularioSmtp {
  host: string;
  port: string;
  usuario: string;
  password: string;
  tls: boolean;
  fromEmail: string;
  fromNombre: string;
}

function aFormularioSmtp(c: SmtpConfig): FormularioSmtp {
  return {
    host: c.host ?? "",
    port: c.port ? String(c.port) : "587",
    usuario: c.usuario ?? "",
    password: "",
    tls: c.tls,
    fromEmail: c.from_email ?? "",
    fromNombre: c.from_nombre ?? "",
  };
}

interface FormularioGeneral {
  empresa_nombre: string;
  sistema_nombre: string;
  logo_url: string;
  color_primario: string;
  color_secundario: string;
  mensaje_bienvenida: string;
  color_boton_disponibilidad: string;
  color_fondo_bienvenida: string;
  contacto_correo: string;
  contacto_telefono: string;
  contacto_direccion: string;
  terminos_condiciones: string;
}

type ClaveConfiguracion = keyof FormularioGeneral;

function aFormulario(c: ConfiguracionGeneral): FormularioGeneral {
  return {
    empresa_nombre: c.empresa_nombre ?? "",
    sistema_nombre: c.sistema_nombre ?? "",
    logo_url: c.logo_url ?? "",
    color_primario: c.color_primario || "#1F3A5F",
    color_secundario: c.color_secundario || "#2E6DA4",
    mensaje_bienvenida: c.mensaje_bienvenida ?? "",
    color_boton_disponibilidad: c.color_boton_disponibilidad || c.color_primario || "#1F3A5F",
    color_fondo_bienvenida: c.color_fondo_bienvenida || c.color_primario || "#1F3A5F",
    contacto_correo: c.contacto_correo ?? "",
    contacto_telefono: c.contacto_telefono ?? "",
    contacto_direccion: c.contacto_direccion ?? "",
    terminos_condiciones: c.terminos_condiciones ?? "",
  };
}

export default function ConfiguracionPage() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [original, setOriginal] = useState<FormularioGeneral | null>(null);
  const [form, setForm] = useState<FormularioGeneral | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exitoGeneral, setExitoGeneral] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const [imagenBienvenidaUrl, setImagenBienvenidaUrl] = useState("");
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);
  const inputImagenRef = useRef<HTMLInputElement>(null);

  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const inputLogoRef = useRef<HTMLInputElement>(null);

  const [smtp, setSmtp] = useState<FormularioSmtp | null>(null);
  const [smtpPasswordConfigurada, setSmtpPasswordConfigurada] = useState(false);
  const [guardandoSmtp, setGuardandoSmtp] = useState(false);
  const [errorSmtp, setErrorSmtp] = useState<string | null>(null);
  const [exitoSmtp, setExitoSmtp] = useState<string | null>(null);

  const [correoPrueba, setCorreoPrueba] = useState("");
  const [enviandoPrueba, setEnviandoPrueba] = useState(false);
  const [errorPrueba, setErrorPrueba] = useState<string | null>(null);
  const [exitoPrueba, setExitoPrueba] = useState<string | null>(null);

  const [plantillaAsunto, setPlantillaAsunto] = useState("");
  const [plantillaCuerpo, setPlantillaCuerpo] = useState("");
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);
  const [errorPlantilla, setErrorPlantilla] = useState<string | null>(null);
  const [exitoPlantilla, setExitoPlantilla] = useState<string | null>(null);

  const [imagenCorreoUrl, setImagenCorreoUrl] = useState("");
  const [subiendoImagenCorreo, setSubiendoImagenCorreo] = useState(false);
  const [errorImagenCorreo, setErrorImagenCorreo] = useState<string | null>(null);
  const inputImagenCorreoRef = useRef<HTMLInputElement>(null);

  const [previewHtml, setPreviewHtml] = useState("");
  const [cargandoPreview, setCargandoPreview] = useState(false);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [config, configSmtp, plantilla] = await Promise.all([
        obtenerConfiguracion(),
        obtenerConfiguracionSmtp(),
        obtenerPlantillaCorreo(),
      ]);
      const f = aFormulario(config);
      setOriginal(f);
      setForm(f);
      setImagenBienvenidaUrl(config.imagen_bienvenida_url ?? "");
      setSmtp(aFormularioSmtp(configSmtp));
      setSmtpPasswordConfigurada(configSmtp.password_configurada);
      aplicarPlantilla(plantilla);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar la configuración."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function guardarGeneral() {
    if (!form || !original) return;
    setGuardando(true);
    setErrorGeneral(null);
    setExitoGeneral(null);
    const cambios: [ClaveConfiguracion, string][] = (Object.keys(form) as ClaveConfiguracion[])
      .filter((clave) => form[clave] !== original[clave])
      .map((clave) => [clave, form[clave]]);
    if (cambios.length === 0) {
      setGuardando(false);
      return;
    }
    try {
      await Promise.all(cambios.map(([clave, valor]) => actualizarConfiguracion(clave, valor)));
      setOriginal(form);
      setExitoGeneral("Configuración guardada.");
    } catch (e) {
      setErrorGeneral(mensajeError(e, "No se pudo guardar la configuración."));
    } finally {
      setGuardando(false);
    }
  }

  async function subirLogoArchivo(archivo: File) {
    setSubiendoLogo(true);
    setErrorLogo(null);
    try {
      const url = await subirLogo(archivo);
      if (form) setForm({ ...form, logo_url: url });
      if (original) setOriginal({ ...original, logo_url: url });
    } catch (e) {
      setErrorLogo(mensajeError(e, "No se pudo subir el logo."));
    } finally {
      setSubiendoLogo(false);
      if (inputLogoRef.current) inputLogoRef.current.value = "";
    }
  }

  async function subirImagen(archivo: File) {
    setSubiendoImagen(true);
    setErrorImagen(null);
    try {
      const url = await subirImagenBienvenida(archivo);
      setImagenBienvenidaUrl(url);
    } catch (e) {
      setErrorImagen(mensajeError(e, "No se pudo subir la imagen."));
    } finally {
      setSubiendoImagen(false);
      if (inputImagenRef.current) inputImagenRef.current.value = "";
    }
  }

  async function quitarImagen() {
    setSubiendoImagen(true);
    setErrorImagen(null);
    try {
      await actualizarConfiguracion("imagen_bienvenida_url", null);
      setImagenBienvenidaUrl("");
    } catch (e) {
      setErrorImagen(mensajeError(e, "No se pudo quitar la imagen."));
    } finally {
      setSubiendoImagen(false);
    }
  }

  async function guardarSmtp() {
    if (!smtp || !smtp.host.trim() || !smtp.port || !smtp.fromEmail.trim() || !smtp.fromNombre.trim()) return;
    setGuardandoSmtp(true);
    setErrorSmtp(null);
    setExitoSmtp(null);
    try {
      const actualizado = await actualizarConfiguracionSmtp({
        host: smtp.host.trim(),
        port: Number(smtp.port),
        usuario: smtp.usuario.trim() || null,
        password: smtp.password || null,
        tls: smtp.tls,
        from_email: smtp.fromEmail.trim(),
        from_nombre: smtp.fromNombre.trim(),
      });
      setSmtp(aFormularioSmtp(actualizado));
      setSmtpPasswordConfigurada(actualizado.password_configurada);
      setExitoSmtp("Configuración SMTP guardada.");
    } catch (e) {
      setErrorSmtp(mensajeError(e, "No se pudo guardar la configuración SMTP."));
    } finally {
      setGuardandoSmtp(false);
    }
  }

  function aplicarPlantilla(p: PlantillaCorreo) {
    setPlantillaAsunto(p.asunto);
    setPlantillaCuerpo(p.cuerpo);
    setImagenCorreoUrl(p.imagen_url ?? "");
    setPlaceholders(p.placeholders);
  }

  // Vista previa en vivo: se recalcula al escribir (con una pequeña pausa) y al subir/quitar
  // la imagen, para que el admin vea el correo completo (saludo + detalle de la reserva +
  // imagen) sin tener que guardar primero.
  useEffect(() => {
    if (!plantillaCuerpo.trim()) {
      setPreviewHtml("");
      return;
    }
    const temporizador = setTimeout(() => {
      setCargandoPreview(true);
      previsualizarPlantillaCorreo(plantillaCuerpo)
        .then(setPreviewHtml)
        .catch(() => undefined)
        .finally(() => setCargandoPreview(false));
    }, 400);
    return () => clearTimeout(temporizador);
  }, [plantillaCuerpo, imagenCorreoUrl]);

  async function guardarPlantilla() {
    if (!plantillaAsunto.trim() || !plantillaCuerpo.trim()) return;
    setGuardandoPlantilla(true);
    setErrorPlantilla(null);
    setExitoPlantilla(null);
    try {
      await Promise.all([
        actualizarConfiguracion("email_confirmacion_asunto", plantillaAsunto.trim()),
        actualizarConfiguracion("email_confirmacion_cuerpo", plantillaCuerpo.trim()),
      ]);
      setExitoPlantilla("Plantilla de correo guardada.");
    } catch (e) {
      setErrorPlantilla(mensajeError(e, "No se pudo guardar la plantilla."));
    } finally {
      setGuardandoPlantilla(false);
    }
  }

  async function restaurarPlantilla() {
    setGuardandoPlantilla(true);
    setErrorPlantilla(null);
    setExitoPlantilla(null);
    try {
      await Promise.all([
        actualizarConfiguracion("email_confirmacion_asunto", null),
        actualizarConfiguracion("email_confirmacion_cuerpo", null),
      ]);
      aplicarPlantilla(await obtenerPlantillaCorreo());
      setExitoPlantilla("Se restauró la plantilla por defecto.");
    } catch (e) {
      setErrorPlantilla(mensajeError(e, "No se pudo restaurar la plantilla."));
    } finally {
      setGuardandoPlantilla(false);
    }
  }

  async function subirImagenDelCorreo(archivo: File) {
    setSubiendoImagenCorreo(true);
    setErrorImagenCorreo(null);
    try {
      const url = await subirImagenCorreo(archivo);
      setImagenCorreoUrl(url);
    } catch (e) {
      setErrorImagenCorreo(mensajeError(e, "No se pudo subir la imagen."));
    } finally {
      setSubiendoImagenCorreo(false);
      if (inputImagenCorreoRef.current) inputImagenCorreoRef.current.value = "";
    }
  }

  async function quitarImagenDelCorreo() {
    setSubiendoImagenCorreo(true);
    setErrorImagenCorreo(null);
    try {
      await actualizarConfiguracion("email_confirmacion_imagen_url", null);
      setImagenCorreoUrl("");
    } catch (e) {
      setErrorImagenCorreo(mensajeError(e, "No se pudo quitar la imagen."));
    } finally {
      setSubiendoImagenCorreo(false);
    }
  }

  async function enviarPrueba() {
    if (!correoPrueba.trim()) return;
    setEnviandoPrueba(true);
    setErrorPrueba(null);
    setExitoPrueba(null);
    try {
      await enviarCorreoPrueba(correoPrueba.trim());
      setExitoPrueba(`Correo de prueba enviado a ${correoPrueba.trim()}.`);
    } catch (e) {
      setErrorPrueba(mensajeError(e, "No se pudo enviar el correo de prueba."));
    } finally {
      setEnviandoPrueba(false);
    }
  }

  if (cargando) return <Loader />;

  return (
    <Box>
      <PageHeader
        titulo="Configuración"
        descripcion="Identidad del portal, contacto y correo."
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {form && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Datos generales
          </Typography>
          {errorGeneral && <Alert severity="error" sx={{ mb: 2 }}>{errorGeneral}</Alert>}
          {exitoGeneral && <Alert severity="success" sx={{ mb: 2 }}>{exitoGeneral}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Firma de la plataforma (organización)"
                value={form.empresa_nombre}
                onChange={(e) => setForm({ ...form, empresa_nombre: e.target.value })}
                helperText="Aparece en la portada, el pie de página y los correos (p. ej. InfraestructurEF)"
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nombre del sistema"
                value={form.sistema_nombre}
                onChange={(e) => setForm({ ...form, sistema_nombre: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" sx={{ mb: 1 }}>Logo</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Mejor subirlo al servidor: un enlace a otro sitio puede dejar de funcionar si ese sitio cambia o se cae.
              </Typography>
              {errorLogo && <Alert severity="error" sx={{ mb: 1 }}>{errorLogo}</Alert>}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
                {form.logo_url.trim() && (
                  <Box
                    component="img"
                    src={form.logo_url}
                    alt="Vista previa del logo"
                    sx={{ height: 48, maxWidth: 140, objectFit: "contain", border: 1, borderColor: "divider", borderRadius: 1, p: 0.5 }}
                  />
                )}
                <Button variant="outlined" component="label" disabled={subiendoLogo}>
                  {subiendoLogo ? "Subiendo..." : "Subir logo"}
                  <input
                    ref={inputLogoRef}
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const archivo = e.target.files?.[0];
                      if (archivo) subirLogoArchivo(archivo);
                    }}
                  />
                </Button>
              </Stack>
              <TextField
                label="URL del logo"
                helperText="También puedes pegar la URL de una imagen ya publicada en otro sitio"
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                label="Color primario"
                type="color"
                value={form.color_primario}
                onChange={(e) => setForm({ ...form, color_primario: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                label="Color secundario"
                type="color"
                value={form.color_secundario}
                onChange={(e) => setForm({ ...form, color_secundario: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Mensaje de bienvenida"
                value={form.mensaje_bienvenida}
                onChange={(e) => setForm({ ...form, mensaje_bienvenida: e.target.value })}
                placeholder="Ej: Aparta un momento para relajarte en la semana"
                helperText="Se muestra destacado en la pantalla principal del portal. Déjalo en blanco para ocultarlo."
                multiline
                minRows={2}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Color de los botones de las tarjetas"
                type="color"
                value={form.color_boton_disponibilidad}
                onChange={(e) => setForm({ ...form, color_boton_disponibilidad: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Color de fondo de la bienvenida"
                type="color"
                value={form.color_fondo_bienvenida}
                onChange={(e) => setForm({ ...form, color_fondo_bienvenida: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Imagen o video de bienvenida
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Fondo del banner de bienvenida en la pantalla principal del portal. Imagen (JPG, PNG, WEBP hasta
                5 MB; GIF hasta 10 MB) o video (MP4, WEBM, MOV hasta 30 MB).
              </Typography>
              {errorImagen && <Alert severity="error" sx={{ mb: 1 }}>{errorImagen}</Alert>}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
                {imagenBienvenidaUrl && (
                  esVideo(imagenBienvenidaUrl) ? (
                    <MutedVideo
                      src={imagenBienvenidaUrl}
                      sx={{ width: 160, height: 90, objectFit: "cover", borderRadius: 1, border: 1, borderColor: "divider" }}
                    />
                  ) : (
                    <Box
                      component="img"
                      src={imagenBienvenidaUrl}
                      alt="Vista previa de la imagen de bienvenida"
                      sx={{ width: 160, height: 90, objectFit: "cover", borderRadius: 1, border: 1, borderColor: "divider" }}
                    />
                  )
                )}
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    component="label"
                    disabled={subiendoImagen}
                  >
                    {subiendoImagen ? "Subiendo..." : imagenBienvenidaUrl ? "Cambiar archivo" : "Subir imagen o video"}
                    <input
                      ref={inputImagenRef}
                      type="file"
                      hidden
                      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                      onChange={(e) => {
                        const archivo = e.target.files?.[0];
                        if (archivo) subirImagen(archivo);
                      }}
                    />
                  </Button>
                  {imagenBienvenidaUrl && (
                    <Button color="error" onClick={quitarImagen} disabled={subiendoImagen}>
                      Quitar
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" sx={{ mt: 1 }}>Contacto y pie de página</Typography>
              <Typography variant="caption" color="text.secondary">
                Se muestran en el pie de página del portal y en los correos. Lo que dejes vacío no se muestra.
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Correo de contacto"
                type="email"
                value={form.contacto_correo}
                onChange={(e) => setForm({ ...form, contacto_correo: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Teléfono de contacto"
                value={form.contacto_telefono}
                onChange={(e) => setForm({ ...form, contacto_telefono: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Dirección o ubicación"
                value={form.contacto_direccion}
                onChange={(e) => setForm({ ...form, contacto_direccion: e.target.value })}
                inputProps={{ maxLength: 300 }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Términos y condiciones"
                helperText="Página /terminos del portal. Si la dejas vacía se muestra un texto base."
                value={form.terminos_condiciones}
                onChange={(e) => setForm({ ...form, terminos_condiciones: e.target.value })}
                multiline
                minRows={4}
                fullWidth
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={guardarGeneral} disabled={guardando}>
              Guardar cambios
            </Button>
          </Box>
        </Paper>
      )}

      <Alert severity="info" sx={{ mb: 3 }}>
        La vigencia (fechas de inicio y fin) y la regla de participación ya no son globales: se definen en cada
        evento, al crearlo o editarlo en <RouterLink to="/admin/eventos">Catálogo → Eventos</RouterLink>. Al terminar
        su vigencia, cada evento se cierra solo y conserva su historial.
      </Alert>

      {smtp && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Configuración SMTP
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Se usa para enviar los correos de confirmación de reserva a los colaboradores.
          </Typography>
          {errorSmtp && <Alert severity="error" sx={{ mb: 2 }}>{errorSmtp}</Alert>}
          {exitoSmtp && <Alert severity="success" sx={{ mb: 2 }}>{exitoSmtp}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField
                label="Host"
                value={smtp.host}
                onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Puerto"
                type="number"
                value={smtp.port}
                onChange={(e) => setSmtp({ ...smtp, port: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Usuario"
                value={smtp.usuario}
                onChange={(e) => setSmtp({ ...smtp, usuario: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Contraseña"
                type="password"
                value={smtp.password}
                onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                placeholder="Dejar en blanco para conservar la actual"
                helperText={smtpPasswordConfigurada ? "Contraseña configurada ✓" : "Sin contraseña configurada"}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Correo remitente"
                type="email"
                value={smtp.fromEmail}
                onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Nombre remitente"
                value={smtp.fromNombre}
                onChange={(e) => setSmtp({ ...smtp, fromNombre: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch checked={smtp.tls} onChange={(e) => setSmtp({ ...smtp, tls: e.target.checked })} />}
                label="Usar TLS"
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={guardarSmtp} disabled={guardandoSmtp}>
              Guardar
            </Button>
          </Box>

          <Box sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: "divider" }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Enviar correo de prueba
            </Typography>
            {errorPrueba && <Alert severity="error" sx={{ mb: 2 }}>{errorPrueba}</Alert>}
            {exitoPrueba && <Alert severity="success" sx={{ mb: 2 }}>{exitoPrueba}</Alert>}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
              <TextField
                label="Correo destino"
                type="email"
                value={correoPrueba}
                onChange={(e) => setCorreoPrueba(e.target.value)}
                size="small"
              />
              <Button variant="outlined" onClick={enviarPrueba} disabled={enviandoPrueba || !correoPrueba.trim()}>
                {enviandoPrueba ? "Enviando..." : "Enviar correo de prueba"}
              </Button>
            </Stack>
          </Box>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Plantilla del correo de confirmación
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Correo que recibe el colaborador al reservar. El logo y el color se toman de la configuración
          general; el detalle de la reserva (evento, fecha, hora, código) siempre se agrega automáticamente,
          con el mismo formato, debajo de lo que escribas aquí — la vista previa de la derecha muestra el
          correo completo, tal como llegaría.
        </Typography>
        {placeholders.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
            Puedes usar estos datos dentro del texto: {placeholders.map((p) => `{${p}}`).join("  ")}
          </Typography>
        )}
        {errorPlantilla && <Alert severity="error" sx={{ mb: 2 }}>{errorPlantilla}</Alert>}
        {exitoPlantilla && <Alert severity="success" sx={{ mb: 2 }}>{exitoPlantilla}</Alert>}
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Stack spacing={2}>
              <TextField
                label="Asunto"
                value={plantillaAsunto}
                onChange={(e) => setPlantillaAsunto(e.target.value)}
                fullWidth
              />
              <TextField
                label="Mensaje de saludo"
                value={plantillaCuerpo}
                onChange={(e) => setPlantillaCuerpo(e.target.value)}
                helperText="Debajo de este mensaje, el correo siempre agrega el detalle de la reserva (evento, fecha, hora, código)."
                multiline
                minRows={3}
                fullWidth
              />
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Imagen del correo (opcional)
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Banner que aparece debajo del encabezado. JPG, PNG o WEBP hasta 3 MB; GIF hasta 5 MB.
                </Typography>
                {errorImagenCorreo && <Alert severity="error" sx={{ mb: 1 }}>{errorImagenCorreo}</Alert>}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
                  {imagenCorreoUrl && (
                    <Box
                      component="img"
                      src={imagenCorreoUrl}
                      alt="Vista previa de la imagen del correo"
                      sx={{ width: 160, height: 60, objectFit: "cover", borderRadius: 1, border: 1, borderColor: "divider" }}
                    />
                  )}
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" component="label" disabled={subiendoImagenCorreo}>
                      {subiendoImagenCorreo ? "Subiendo..." : imagenCorreoUrl ? "Cambiar imagen" : "Subir imagen"}
                      <input
                        ref={inputImagenCorreoRef}
                        type="file"
                        hidden
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={(e) => {
                          const archivo = e.target.files?.[0];
                          if (archivo) subirImagenDelCorreo(archivo);
                        }}
                      />
                    </Button>
                    {imagenCorreoUrl && (
                      <Button color="error" onClick={quitarImagenDelCorreo} disabled={subiendoImagenCorreo}>
                        Quitar
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Box>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                onClick={guardarPlantilla}
                disabled={guardandoPlantilla || !plantillaAsunto.trim() || !plantillaCuerpo.trim()}
              >
                Guardar plantilla
              </Button>
              <Button variant="outlined" onClick={restaurarPlantilla} disabled={guardandoPlantilla}>
                Restaurar por defecto
              </Button>
            </Stack>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Vista previa {cargandoPreview && "(actualizando...)"}
            </Typography>
            <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden", bgcolor: "#F4F7FB" }}>
              {previewHtml ? (
                <Box
                  component="iframe"
                  title="Vista previa del correo de confirmación"
                  sandbox=""
                  srcDoc={previewHtml}
                  sx={{ width: "100%", height: 520, border: 0, display: "block" }}
                />
              ) : (
                <Box sx={{ p: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    Escribe un mensaje de saludo para ver la vista previa.
                  </Typography>
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

    </Box>
  );
}
