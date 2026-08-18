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
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { Administrador } from "../../types";
import {
  activarAdministrador, crearAdministrador, desactivarAdministrador, eliminarAdministrador,
  listarAdministradores,
} from "../../services/administradores";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";
import ConfirmDialog from "../../components/ConfirmDialog";
import { ETIQUETA_ROL, ROL_ADMINISTRADOR, ROL_VISOR_RESERVAS } from "../../constants/roles";

export default function AdministradoresPage() {
  const [administradores, setAdministradores] = useState<Administrador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<number | null>(null);

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState(ROL_ADMINISTRADOR);
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  const [dialogEliminar, setDialogEliminar] = useState<Administrador | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

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
    setPassword("");
    setRol(ROL_ADMINISTRADOR);
    setErrorDialog(null);
    setDialogAbierto(true);
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

  async function guardar() {
    if (!usuario.trim() || !nombre.trim() || password.length < 8) return;
    setGuardando(true);
    setErrorDialog(null);
    try {
      await crearAdministrador(usuario.trim(), nombre.trim(), password, rol);
      setDialogAbierto(false);
      await cargar();
    } catch (e) {
      setErrorDialog(mensajeError(e, "No se pudo crear el administrador."));
    } finally {
      setGuardando(false);
    }
  }

  const columnas: ColumnaDataTable<Administrador>[] = [
    { key: "usuario", label: "Usuario" },
    { key: "nombre", label: "Nombre" },
    { key: "rol", label: "Rol", render: (a) => ETIQUETA_ROL[a.rol] ?? a.rol },
    {
      key: "activo",
      label: "Estado",
      render: (a) => (
        <Chip size="small" label={a.activo ? "Activo" : "Bloqueado"} color={a.activo ? "success" : "error"} />
      ),
    },
    {
      key: "acciones",
      label: "Acciones",
      align: "right",
      render: (a) => (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
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
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4">Administradores</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirDialog}>
          Nuevo administrador
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
        Las cuentas no se eliminan; solo se bloquean o desbloquean. Cada administrador inicia sesión con su propio
        usuario y contraseña.
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
              fullWidth
              autoFocus
            />
            <TextField
              label="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              fullWidth
            />
            <TextField
              label="Contraseña"
              type="password"
              helperText="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="nuevo-admin-rol-label">Rol</InputLabel>
              <Select
                labelId="nuevo-admin-rol-label"
                label="Rol"
                value={rol}
                onChange={(e) => setRol(e.target.value)}
              >
                <MenuItem value={ROL_ADMINISTRADOR}>{ETIQUETA_ROL[ROL_ADMINISTRADOR]} (acceso total)</MenuItem>
                <MenuItem value={ROL_VISOR_RESERVAS}>{ETIQUETA_ROL[ROL_VISOR_RESERVAS]} (solo lectura)</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogAbierto(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={guardar}
            disabled={guardando || !usuario.trim() || !nombre.trim() || password.length < 8}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>

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
