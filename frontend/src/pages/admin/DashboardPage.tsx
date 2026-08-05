import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Divider, List, ListItem, ListItemText, Stack,
  Tab, Tabs, TextField, Typography,
} from "@mui/material";
import type { Agenda, Area, Servicio } from "../../types";
import {
  cambiarEstadoAgenda, crearArea, crearServicio, listarAgendas, listarAreas, listarServicios,
} from "../../services/agendas";

export default function DashboardPage() {
  const [tab, setTab] = useState(0);
  const [areas, setAreas] = useState<Area[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [nuevaArea, setNuevaArea] = useState("");
  const [nuevoServicio, setNuevoServicio] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function recargar() {
    try {
      const [a, s, g] = await Promise.all([listarAreas(), listarServicios(), listarAgendas()]);
      setAreas(a); setServicios(s); setAgendas(g);
    } catch {
      setError("No se pudo cargar la información");
    }
  }
  useEffect(() => { recargar(); }, []);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Configuración</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Áreas" /><Tab label="Servicios" /><Tab label="Agendas" />
      </Tabs>

      {tab === 0 && (
        <Box>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField size="small" label="Nueva área" value={nuevaArea} onChange={(e) => setNuevaArea(e.target.value)} />
            <Button variant="contained" onClick={async () => { await crearArea(nuevaArea.trim()); setNuevaArea(""); recargar(); }} disabled={!nuevaArea.trim()}>Agregar</Button>
          </Stack>
          <Divider />
          <List>{areas.map((a) => <ListItem key={a.id}><ListItemText primary={a.nombre} /></ListItem>)}</List>
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField size="small" label="Nuevo servicio" value={nuevoServicio} onChange={(e) => setNuevoServicio(e.target.value)} />
            <Button variant="contained" onClick={async () => { await crearServicio(nuevoServicio.trim()); setNuevoServicio(""); recargar(); }} disabled={!nuevoServicio.trim()}>Agregar</Button>
          </Stack>
          <Divider />
          <List>{servicios.map((s) => <ListItem key={s.id}><ListItemText primary={s.nombre} /></ListItem>)}</List>
        </Box>
      )}

      {tab === 2 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            La creación de agendas (área + servicio + horarios) se realiza vía API. Aquí puedes activarlas o desactivarlas.
          </Typography>
          <List>
            {agendas.map((g) => (
              <ListItem key={g.id} secondaryAction={
                <Button size="small" variant="outlined" onClick={async () => { await cambiarEstadoAgenda(g.id, !g.estado); recargar(); }}>
                  {g.estado ? "Desactivar" : "Activar"}
                </Button>
              }>
                <ListItemText
                  primary={g.nombre}
                  secondary={`${g.hora_inicio?.slice(0,5)} - ${g.hora_fin?.slice(0,5)} · cada ${g.duracion_min} min`}
                />
                <Chip size="small" color={g.estado ? "success" : "default"} label={g.estado ? "Activa" : "Inactiva"} sx={{ mr: 2 }} />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
}
