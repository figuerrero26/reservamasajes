import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
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
  definirSemanaActiva,
  enviarCorreoPrueba,
  obtenerConfiguracion,
  obtenerConfiguracionSmtp,
  obtenerPlantillaCorreo,
  obtenerSemanaActiva,
  reiniciarSemana,
  subirImagenBienvenida,
} from "../../services/configuracion";
import { mensajeError } from "../../utils/errors";
import { esVideo } from "../../utils/media";
import Loader from "../../components/Loader";
import MutedVideo from "../../components/MutedVideo";
import ConfirmDialog from "../../components/ConfirmDialog";

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

type ClaveConfiguracion =
  | "empresa_nombre" | "sistema_nombre" | "logo_url" | "color_primario" | "color_secundario"
  | "mensaje_bienvenida" | "color_boton_disponibilidad" | "color_fondo_bienvenida";

interface FormularioGeneral {
  empresa_nombre: string;
  sistema_nombre: string;
  logo_url: string;
  color_primario: string;
  color_secundario: string;
  mensaje_bienvenida: string;
  color_boton_disponibilidad: string;
  color_fondo_bienvenida: string;
}

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

  const [semanaInicio, setSemanaInicio] = useState("");
  const [semanaFin, setSemanaFin] = useState("");
  const [guardandoSemana, setGuardandoSemana] = useState(false);
  const [errorSemana, setErrorSemana] = useState<string | null>(null);
  const [exitoSemana, setExitoSemana] = useState<string | null>(null);

  const [eventoUnicoPorSemana, setEventoUnicoPorSemana] = useState(false);
  const [guardandoRestriccion, setGuardandoRestriccion] = useState(false);
  const [errorRestriccion, setErrorRestriccion] = useState<string | null>(null);
  const [exitoRestriccion, setExitoRestriccion] = useState<string | null>(null);

  const [fechaLunes, setFechaLunes] = useState("");
  const [dialogReiniciar, setDialogReiniciar] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [errorReiniciar, setErrorReiniciar] = useState<string | null>(null);
  const [resultadoReinicio, setResultadoReinicio] = useState<number | null>(null);

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

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [config, semana, configSmtp, plantilla] = await Promise.all([
        obtenerConfiguracion(),
        obtenerSemanaActiva(),
        obtenerConfiguracionSmtp(),
        obtenerPlantillaCorreo(),
      ]);
      const f = aFormulario(config);
      setOriginal(f);
      setForm(f);
      setImagenBienvenidaUrl(config.imagen_bienvenida_url ?? "");
      setEventoUnicoPorSemana(config.evento_unico_por_semana ?? false);
      setSemanaInicio(semana.inicio ?? "");
      setSemanaFin(semana.fin ?? "");
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

  async function guardarSemana() {
    if (!semanaInicio || !semanaFin) return;
    setGuardandoSemana(true);
    setErrorSemana(null);
    setExitoSemana(null);
    try {
      await definirSemanaActiva(semanaInicio, semanaFin);
      setExitoSemana("Semana activa actualizada.");
    } catch (e) {
      setErrorSemana(mensajeError(e, "No se pudo definir la semana activa."));
    } finally {
      setGuardandoSemana(false);
    }
  }

  async function guardarRestriccion(valor: boolean) {
    setEventoUnicoPorSemana(valor);
    setGuardandoRestriccion(true);
    setErrorRestriccion(null);
    setExitoRestriccion(null);
    try {
      await actualizarConfiguracion("evento_unico_por_semana", String(valor));
      setExitoRestriccion(
        valor
          ? "Cada evento ahora se puede reservar como máximo una vez por semana activa."
          : "Restricción desactivada: un mismo evento puede reservarse cualquier día."
      );
    } catch (e) {
      setEventoUnicoPorSemana(!valor);
      setErrorRestriccion(mensajeError(e, "No se pudo guardar el cambio."));
    } finally {
      setGuardandoRestriccion(false);
    }
  }

  async function confirmarReinicio() {
    if (!fechaLunes) return;
    setReiniciando(true);
    setErrorReiniciar(null);
    try {
      const r = await reiniciarSemana(fechaLunes);
      setResultadoReinicio(r.reservas_afectadas);
      setDialogReiniciar(false);
    } catch (e) {
      setErrorReiniciar(mensajeError(e, "No se pudo reiniciar la semana."));
    } finally {
      setReiniciando(false);
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
    setPlaceholders(p.placeholders);
  }

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
      <Typography variant="h4" sx={{ mb: 2 }}>
        Configuración
      </Typography>

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
                label="Nombre de la empresa"
                value={form.empresa_nombre}
                onChange={(e) => setForm({ ...form, empresa_nombre: e.target.value })}
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
              <TextField
                label="URL del logo"
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
            <Grid item xs={6} sm={3}>
              <TextField
                label="Color del botón 'Ver disponibilidad'"
                type="color"
                value={form.color_boton_disponibilidad}
                onChange={(e) => setForm({ ...form, color_boton_disponibilidad: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={6} sm={3}>
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
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={guardarGeneral} disabled={guardando}>
              Guardar cambios
            </Button>
          </Box>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Semana activa
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Define el rango de fechas que los colaboradores pueden reservar en el portal público.
        </Typography>
        {errorSemana && <Alert severity="error" sx={{ mb: 2 }}>{errorSemana}</Alert>}
        {exitoSemana && <Alert severity="success" sx={{ mb: 2 }}>{exitoSemana}</Alert>}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
          <TextField
            label="Inicio"
            type="date"
            value={semanaInicio}
            onChange={(e) => setSemanaInicio(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Fin"
            type="date"
            value={semanaFin}
            onChange={(e) => setSemanaFin(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" onClick={guardarSemana} disabled={guardandoSemana || !semanaInicio || !semanaFin}>
            Guardar semana
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Restricción de reservas
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Los días del calendario del portal siempre se muestran completos — esto no oculta ningún día, solo
          decide si un colaborador puede repetir el mismo evento en un día distinto de la semana activa.
        </Typography>
        {errorRestriccion && <Alert severity="error" sx={{ mb: 2 }}>{errorRestriccion}</Alert>}
        {exitoRestriccion && <Alert severity="success" sx={{ mb: 2 }}>{exitoRestriccion}</Alert>}
        <FormControlLabel
          control={
            <Switch
              checked={eventoUnicoPorSemana}
              disabled={guardandoRestriccion}
              onChange={(e) => guardarRestriccion(e.target.checked)}
            />
          }
          label="Cada evento se puede reservar como máximo una vez por semana activa (si ya lo reservó, no puede repetirlo otro día — sí puede reservar un evento distinto)"
        />
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Reiniciar semana
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Cancela todas las reservas activas de la semana indicada. Las reservas no se eliminan, quedan marcadas
          como canceladas.
        </Typography>
        {resultadoReinicio !== null && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Semana reiniciada: {resultadoReinicio} reserva(s) afectada(s).
          </Alert>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
          <TextField
            label="Lunes de la semana"
            type="date"
            value={fechaLunes}
            onChange={(e) => setFechaLunes(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="outlined"
            color="warning"
            disabled={!fechaLunes}
            onClick={() => {
              setResultadoReinicio(null);
              setErrorReiniciar(null);
              setDialogReiniciar(true);
            }}
          >
            Reiniciar semana
          </Button>
        </Stack>
      </Paper>

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
          Correo que recibe el colaborador al reservar. El diseño (logo, color, detalle de la reserva) se toma
          automáticamente de la configuración del sistema; aquí solo se edita el asunto y el mensaje de saludo.
        </Typography>
        {placeholders.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
            Puedes usar estos datos dentro del texto: {placeholders.map((p) => `{${p}}`).join("  ")}
          </Typography>
        )}
        {errorPlantilla && <Alert severity="error" sx={{ mb: 2 }}>{errorPlantilla}</Alert>}
        {exitoPlantilla && <Alert severity="success" sx={{ mb: 2 }}>{exitoPlantilla}</Alert>}
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
      </Paper>

      <ConfirmDialog
        abierto={dialogReiniciar}
        titulo="Reiniciar semana"
        contenido={
          <span>
            Esta acción cancelará todas las reservas activas de la semana que inicia el {fechaLunes}. Las
            reservas quedarán marcadas como canceladas, no se eliminarán. ¿Deseas continuar?
          </span>
        }
        textoConfirmar="Reiniciar semana"
        colorConfirmar="warning"
        cargando={reiniciando}
        error={errorReiniciar}
        onConfirmar={confirmarReinicio}
        onCancelar={() => setDialogReiniciar(false)}
      />
    </Box>
  );
}
