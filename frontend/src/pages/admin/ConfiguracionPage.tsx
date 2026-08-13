import { useEffect, useState } from "react";
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
import type { ConfiguracionGeneral, SmtpConfig } from "../../types";
import {
  actualizarConfiguracion,
  actualizarConfiguracionSmtp,
  definirSemanaActiva,
  enviarCorreoPrueba,
  obtenerConfiguracion,
  obtenerConfiguracionSmtp,
  obtenerSemanaActiva,
  reiniciarSemana,
} from "../../services/configuracion";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
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

type ClaveConfiguracion = "empresa_nombre" | "sistema_nombre" | "logo_url" | "color_primario" | "color_secundario";

interface FormularioGeneral {
  empresa_nombre: string;
  sistema_nombre: string;
  logo_url: string;
  color_primario: string;
  color_secundario: string;
}

function aFormulario(c: ConfiguracionGeneral): FormularioGeneral {
  return {
    empresa_nombre: c.empresa_nombre ?? "",
    sistema_nombre: c.sistema_nombre ?? "",
    logo_url: c.logo_url ?? "",
    color_primario: c.color_primario || "#1F3A5F",
    color_secundario: c.color_secundario || "#2E6DA4",
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

  const [semanaInicio, setSemanaInicio] = useState("");
  const [semanaFin, setSemanaFin] = useState("");
  const [guardandoSemana, setGuardandoSemana] = useState(false);
  const [errorSemana, setErrorSemana] = useState<string | null>(null);
  const [exitoSemana, setExitoSemana] = useState<string | null>(null);

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

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [config, semana, configSmtp] = await Promise.all([
        obtenerConfiguracion(),
        obtenerSemanaActiva(),
        obtenerConfiguracionSmtp(),
      ]);
      const f = aFormulario(config);
      setOriginal(f);
      setForm(f);
      setSemanaInicio(semana.inicio ?? "");
      setSemanaFin(semana.fin ?? "");
      setSmtp(aFormularioSmtp(configSmtp));
      setSmtpPasswordConfigurada(configSmtp.password_configurada);
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
