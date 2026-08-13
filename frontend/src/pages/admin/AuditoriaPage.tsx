import { useEffect, useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import type { Auditoria } from "../../types";
import { listarAuditoria } from "../../services/auditoria";
import { mensajeError } from "../../utils/errors";
import Loader from "../../components/Loader";
import DataTable, { type ColumnaDataTable } from "../../components/DataTable";

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<Auditoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entidad, setEntidad] = useState("");

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setRegistros(await listarAuditoria({ entidad: entidad.trim() || undefined, limit: 200 }));
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar la auditoría."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columnas: ColumnaDataTable<Auditoria>[] = [
    { key: "created_at", label: "Fecha" },
    { key: "accion", label: "Acción" },
    { key: "entidad", label: "Entidad", render: (a) => a.entidad || "—" },
    { key: "entidad_id", label: "ID entidad", render: (a) => a.entidad_id ?? "—" },
    { key: "admin_id", label: "Admin", render: (a) => a.admin_id ?? "—" },
    { key: "ip", label: "IP", render: (a) => a.ip || "—" },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Auditoría
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Registro de solo lectura de las acciones administrativas realizadas en el sistema.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Filtrar por entidad"
          value={entidad}
          onChange={(e) => setEntidad(e.target.value)}
          size="small"
          sx={{ maxWidth: 280 }}
        />
        <Button variant="outlined" startIcon={<SearchIcon />} onClick={cargar}>
          Buscar
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cargando ? (
        <Loader />
      ) : (
        <DataTable
          columnas={columnas}
          filas={registros}
          obtenerId={(a) => a.id}
          mensajeVacio="No hay registros de auditoría."
        />
      )}
    </Box>
  );
}
