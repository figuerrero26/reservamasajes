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
  Grid,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import type { Usuario } from "../../types";
import {
  activarUsuario, buscarUsuarios, desactivarUsuario, eliminarUsuario, resetearPasswordUsuario,
  setReservasMultiples,
} from "../../services/usuarios";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import ConfirmDialog from "../../components/ConfirmDialog";

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [actualizandoId, setActualizandoId] = useState<number | null>(null);

  const [dialogPassword, setDialogPassword] = useState<Usuario | null>(null);
  const [passwordNueva, setPasswordNueva] = useState("");
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [exitoPassword, setExitoPassword] = useState(false);

  const [dialogEliminar, setDialogEliminar] = useState<Usuario | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  async function buscar() {
    setCargando(true);
    setError(null);
    try {
      setUsuarios(await buscarUsuarios({ nombre: nombre.trim() || undefined, correo: correo.trim() || undefined }));
    } catch (e) {
      setError(mensajeError(e, "No se pudieron buscar los usuarios."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function alternarActivo(usuario: Usuario) {
    setActualizandoId(usuario.id);
    try {
      if (usuario.activo) {
        await desactivarUsuario(usuario.id);
      } else {
        await activarUsuario(usuario.id);
      }
      await buscar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el estado del usuario."));
    } finally {
      setActualizandoId(null);
    }
  }

  async function alternarReservasMultiples(usuario: Usuario) {
    setActualizandoId(usuario.id);
    try {
      await setReservasMultiples(usuario.id, !usuario.permite_reservas_multiples);
      await buscar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el permiso de reservas múltiples."));
    } finally {
      setActualizandoId(null);
    }
  }

  function abrirCambiarPassword(usuario: Usuario) {
    setDialogPassword(usuario);
    setPasswordNueva("");
    setErrorPassword(null);
    setExitoPassword(false);
  }

  async function confirmarEliminar() {
    if (!dialogEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await eliminarUsuario(dialogEliminar.id);
      setDialogEliminar(null);
      await buscar();
    } catch (e) {
      setErrorEliminar(mensajeError(e, "No se pudo eliminar el colaborador."));
    } finally {
      setEliminando(false);
    }
  }

  async function guardarPassword() {
    if (!dialogPassword || passwordNueva.length < 8) return;
    setGuardandoPassword(true);
    setErrorPassword(null);
    try {
      await resetearPasswordUsuario(dialogPassword.id, passwordNueva);
      setExitoPassword(true);
      setPasswordNueva("");
    } catch (e) {
      setErrorPassword(mensajeError(e, "No se pudo restablecer la contraseña."));
    } finally {
      setGuardandoPassword(false);
    }
  }

  const columnas: ColumnaDataTable<Usuario>[] = [
    { key: "nombre", label: "Nombre", render: (u) => `${u.nombre} ${u.apellido}` },
    { key: "correo", label: "Correo", render: (u) => u.correo || "—" },
    {
      key: "activo",
      label: "Estado",
      render: (u) => (
        <Chip size="small" label={u.activo ? "Activo" : "Bloqueado"} color={u.activo ? "success" : "error"} />
      ),
    },
    {
      key: "tiene_cuenta",
      label: "Cuenta",
      render: (u) => (
        <Chip size="small" label={u.tiene_cuenta ? "Con cuenta" : "Sin cuenta"} color={u.tiene_cuenta ? "info" : "default"} variant="outlined" />
      ),
    },
    {
      key: "permite_reservas_multiples",
      label: "Reservas múltiples",
      render: (u) => (
        <Switch
          checked={u.permite_reservas_multiples}
          disabled={actualizandoId === u.id}
          onChange={() => alternarReservasMultiples(u)}
        />
      ),
    },
    {
      key: "acciones",
      label: "Acciones",
      align: "right",
      render: (u) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          {u.tiene_cuenta && (
            <Button size="small" onClick={() => abrirCambiarPassword(u)}>
              Contraseña
            </Button>
          )}
          <Button
            size="small"
            color={u.activo ? "error" : "primary"}
            disabled={actualizandoId === u.id}
            onClick={() => alternarActivo(u)}
          >
            {u.activo ? "Bloquear" : "Desbloquear"}
          </Button>
          <Button size="small" color="error" onClick={() => { setDialogEliminar(u); setErrorEliminar(null); }}>
            Eliminar
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Usuarios
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }} alignItems="center">
        <Grid item xs={12} sm={4}>
          <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} fullWidth size="small" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField label="Correo" value={correo} onChange={(e) => setCorreo(e.target.value)} fullWidth size="small" />
        </Grid>
        <Grid item xs={12} sm={2}>
          <Button variant="outlined" startIcon={<SearchIcon />} onClick={buscar}>
            Buscar
          </Button>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack spacing={0.5} sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Las cuentas nunca se eliminan; solo se bloquean o desbloquean. El historial de reservas se conserva.
        </Typography>
      </Stack>

      {cargando ? (
        <Loader />
      ) : (
        <DataTable
          columnas={columnas}
          filas={usuarios}
          obtenerId={(u) => u.id}
          mensajeVacio="No se encontraron usuarios."
        />
      )}

      <Dialog open={!!dialogPassword} onClose={() => setDialogPassword(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Restablecer contraseña</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogPassword && (
              <Typography variant="body2" color="text.secondary">
                {dialogPassword.nombre} {dialogPassword.apellido} — {dialogPassword.correo}
              </Typography>
            )}
            {errorPassword && <Alert severity="error">{errorPassword}</Alert>}
            {exitoPassword && <Alert severity="success">Contraseña actualizada correctamente.</Alert>}
            <TextField
              label="Nueva contraseña"
              type="password"
              helperText="Mínimo 8 caracteres"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              fullWidth
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogPassword(null)} disabled={guardandoPassword}>
            Cerrar
          </Button>
          <Button
            variant="contained"
            onClick={guardarPassword}
            disabled={guardandoPassword || passwordNueva.length < 8}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        abierto={!!dialogEliminar}
        titulo="Eliminar colaborador"
        contenido={
          dialogEliminar && (
            <span>
              Esta acción elimina la cuenta de {dialogEliminar.nombre} {dialogEliminar.apellido} de forma
              permanente (no es un bloqueo). Sus reservas activas que todavía no han ocurrido se cancelarán;
              las reservas ya pasadas quedarán en el historial con su nombre y correo, tal como están hoy.
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
