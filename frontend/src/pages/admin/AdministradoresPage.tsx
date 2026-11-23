import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import type { Administrador } from "../../types";
import {
  activarAdministrador, crearAdministrador, desactivarAdministrador, eliminarAdministrador,
  listarAdministradores, restablecerPasswordAdministrador,
} from "../../services/administradores";
import { mensajeError } from "../../utils/errors";
import { formatearFechaHora } from "../../utils/fechas";
import { datosDelToken } from "../../utils/sesion";
import { useAuth } from "../../hooks/useAuth";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import ConfirmDialog from "../../components/ConfirmDialog";
import PageHeader from "../../components/PageHeader";
import CambiarPasswordPropiaDialog from "../../components/admin/CambiarPasswordPropiaDialog";
import PasswordNuevaCampos, { PASSWORD_VACIA, passwordNuevaLista, type PasswordNueva } from "../../components/admin/PasswordNuevaCampos";
import { ETIQUETA_ROL, ROL_ADMINISTRADOR, ROL_VISOR_RESERVAS } from "../../constants/roles";

function fechaPassword(a: Administrador): string {
  return a.password_actualizada_en ? formatearFechaHora(a.password_actualizada_en) : "Sin registro";
}

/** Restablecer la contraseña de OTRA cuenta administrativa: nueva contraseña + confirmación,
 * con la misma política que valida el backend. Nunca se muestra la contraseña actual (no se
 * conoce: solo se guarda su hash). */
function RestablecerPasswordDialog({ cuenta, onCerrar, onHecho }: {
  cuenta: Administrador | null;
  onCerrar: () => void;
  onHecho: (cuenta: Administrador) => void;
}) {
  const [valor, setValor] = useState<PasswordNueva>(PASSWORD_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValor(PASSWORD_VACIA);
    setError(null);
  }, [cuenta]);

  const lista = !!cuenta && passwordNuevaLista(valor, { usuario: cuenta.usuario, nombre: cuenta.nombre });

  async function guardar() {
    if (!cuenta || !lista) return;
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await restablecerPasswordAdministrador(cuenta.id, valor.nueva, valor.confirmacion);
      setValor(PASSWORD_VACIA);
      onHecho(actualizada);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar la contraseña."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={!!cuenta} onClose={() => !guardando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Restablecer contraseña</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {cuenta && (
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "background.default" }}>
              <Typography variant="subtitle2">{cuenta.nombre}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-all" }}>{cuenta.usuario}</Typography>
              <Typography variant="caption" color="text.secondary">
                {ETIQUETA_ROL[cuenta.rol] ?? cuenta.rol} · Contraseña actual fijada: {fechaPassword(cuenta).toLowerCase()}
              </Typography>
            </Paper>
          )}
          <Alert severity="info" icon={false}>
            Al guardar, las sesiones abiertas de esta cuenta se cierran y la operación queda en la auditoría. Comunica la
            contraseña nueva por un canal seguro.
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
          <PasswordNuevaCampos valor={valor} onChange={setValor} usuario={cuenta?.usuario} nombre={cuenta?.nombre} autoFocus />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        <Button variant="contained" onClick={guardar} disabled={guardando || !lista}>
          {guardando ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AdministradoresPage() {
  const { token } = useAuth();
  const propio = datosDelToken(token);
  const [administradores, setAdministradores] = useState<Administrador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<number | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState<PasswordNueva>(PASSWORD_VACIA);
  const [rol, setRol] = useState(ROL_ADMINISTRADOR);
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  const [cuentaPassword, setCuentaPassword] = useState<Administrador | null>(null);
  const [passwordPropiaAbierta, setPasswordPropiaAbierta] = useState(false);

  const [dialogEliminar, setDialogEliminar] = useState<Administrador | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const esPropia = (a: Administrador) => a.id === propio.id;

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setAdministradores(await listarAdministradores());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los administradores."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirDialog() {
    setUsuario("");
    setNombre("");
    setPassword(PASSWORD_VACIA);
    setRol(ROL_ADMINISTRADOR);
    setErrorDialog(null);
    setDialogAbierto(true);
  }

  function abrirPassword(a: Administrador) {
    setAviso(null);
    if (esPropia(a)) setPasswordPropiaAbierta(true);
    else setCuentaPassword(a);
  }

  async function alternarActivo(admin: Administrador) {
    setActualizandoId(admin.id);
    setError(null);
    try {
      if (admin.activo) {
        await desactivarAdministrador(admin.id);
      } else {
        await activarAdministrador(admin.id);
      }
      await cargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado del administrador."));
    } finally {
      setActualizandoId(null);
    }
  }

  async function confirmarEliminar() {
    if (!dialogEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await eliminarAdministrador(dialogEliminar.id);
      setDialogEliminar(null);
      await cargar();
    } catch (e) {
      setErrorEliminar(mensajeError(e, "No se pudo eliminar el administrador."));
    } finally {
      setEliminando(false);
    }
  }

  const formularioValido = usuario.trim().length >= 3 && !!nombre.trim()
    && passwordNuevaLista(password, { usuario: usuario.trim(), nombre: nombre.trim() });

  async function guardar() {
    if (!formularioValido) return;
    setGuardando(true);
    setErrorDialog(null);
    try {
      await crearAdministrador(usuario.trim(), nombre.trim(), password.nueva, rol);
      setDialogAbierto(false);
      setAviso(`Cuenta «${usuario.trim()}» creada.`);
      await cargar();
    } catch (e) {
      setErrorDialog(mensajeError(e, "No se pudo crear el administrador."));
    } finally {
      setGuardando(false);
    }
  }

  const columnas: ColumnaDataTable<Administrador>[] = [
    {
      key: "usuario",
      label: "Usuario",
      principal: true,
      render: (a) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} sx={{ wordBreak: "break-all" }}>
            {a.usuario}
            {esPropia(a) && <Chip size="small" label="Tú" sx={{ ml: 1 }} />}
          </Typography>
          <Typography variant="caption" color="text.secondary">{a.nombre}</Typography>
        </Box>
      ),
    },
    { key: "rol", label: "Rol", render: (a) => ETIQUETA_ROL[a.rol] ?? a.rol },
    {
      key: "activo",
      label: "Estado",
      render: (a) => (
        <Chip size="small" label={a.activo ? "Activo" : "Bloqueado"} color={a.activo ? "success" : "error"} />
      ),
    },
    { key: "password", label: "Contraseña", render: (a) => <Typography variant="body2" color="text.secondary">{fechaPassword(a)}</Typography> },
    {
      key: "acciones",
      label: "",
      align: "right",
      render: (a) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" startIcon={<KeyOutlinedIcon />} onClick={() => abrirPassword(a)}>
            {esPropia(a) ? "Mi contraseña" : "Contraseña"}
          </Button>
          {!esPropia(a) && (
            <>
              <Button
                size="small"
                color={a.activo ? "error" : "primary"}
                disabled={actualizandoId === a.id}
                onClick={() => alternarActivo(a)}
              >
                {a.activo ? "Bloquear" : "Desbloquear"}
              </Button>
              <Button size="small" color="error" onClick={() => { setDialogEliminar(a); setErrorEliminar(null); }}>
                Eliminar
              </Button>
            </>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        titulo="Administradores"
        descripcion="Cuentas del panel y sus contraseñas. Bloquear, eliminar o cambiar la contraseña de una cuenta tiene efecto inmediato sobre sus sesiones abiertas."
        acciones={<Button variant="contained" startIcon={<AddIcon />} onClick={abrirDialog}>Nuevo administrador</Button>}
      />

      {aviso && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
        Las contraseñas nunca se muestran: solo se guarda una versión cifrada (hash). Para cambiar la de otra cuenta usa
        «Contraseña»; la tuya se cambia con tu contraseña actual.
      </Typography>

      {cargando ? (
        <Loader />
      ) : (
        <DataTable
          columnas={columnas}
          filas={administradores}
          obtenerId={(a) => a.id}
          mensajeVacio="No hay administradores registrados."
        />
      )}

      <Dialog open={dialogAbierto} onClose={() => !guardando && setDialogAbierto(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nuevo administrador</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorDialog && <Alert severity="error">{errorDialog}</Alert>}
            <TextField
              label="Usuario (correo)"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="off"
              fullWidth
              autoFocus
            />
            <TextField
              label="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="nuevo-admin-rol-label">Rol</InputLabel>
              <Select
                labelId="nuevo-admin-rol-label"
                label="Rol"
                value={rol}
                onChange={(e) => setRol(e.target.value)}
                renderValue={(v) => ETIQUETA_ROL[v] ?? v}
              >
                <MenuItem value={ROL_ADMINISTRADOR}>{ETIQUETA_ROL[ROL_ADMINISTRADOR]} (acceso total)</MenuItem>
                <MenuItem value={ROL_VISOR_RESERVAS}>{ETIQUETA_ROL[ROL_VISOR_RESERVAS]} (solo lectura)</MenuItem>
              </Select>
            </FormControl>
            <PasswordNuevaCampos valor={password} onChange={setPassword} usuario={usuario} nombre={nombre} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogAbierto(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={guardar} disabled={guardando || !formularioValido}>
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      <RestablecerPasswordDialog
        cuenta={cuentaPassword}
        onCerrar={() => setCuentaPassword(null)}
        onHecho={async (cuenta) => {
          setCuentaPassword(null);
          setAviso(`La contraseña de ${cuenta.nombre} (${cuenta.usuario}) se actualizó correctamente. Sus sesiones abiertas se cerraron.`);
          await cargar();
        }}
      />
      <CambiarPasswordPropiaDialog
        abierto={passwordPropiaAbierta}
        usuario={propio.usuario}
        onCerrar={() => { setPasswordPropiaAbierta(false); cargar(); }}
      />

      <ConfirmDialog
        abierto={!!dialogEliminar}
        titulo="Eliminar administrador"
        contenido={
          dialogEliminar && (
            <span>
              Esta acción elimina la cuenta de {dialogEliminar.nombre} ({dialogEliminar.usuario}) de forma
              permanente. No podrá volver a iniciar sesión.
            </span>
          )
        }
        textoConfirmar="Eliminar cuenta"
        colorConfirmar="error"
        cargando={eliminando}
        error={errorEliminar}
        onConfirmar={confirmarEliminar}
        onCancelar={() => setDialogEliminar(null)}
      />
    </Box>
  );
}
