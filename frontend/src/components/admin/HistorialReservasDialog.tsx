import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import type { EstadoReserva, ReservaAdmin, Servicio } from "../../types";
import { buscarReservas } from "../../services/reservas";
import { mensajeError } from "../../utils/errors";
import { descargarCSV, formatearFecha, formatearHora, horaBogota, hoyBogota, nombreDia, textoVigencia } from "../../utils/fechas";
import DataTable, { type ColumnaDataTable } from "../DataTable";
import EstadoChip from "../EstadoChip";
import Loader from "../Loader";
import ReservasAfectadasDialog from "../ReservasAfectadasDialog";

const ESTADOS: { valor: EstadoReserva; texto: string }[] = [
  { valor: "activa", texto: "Confirmadas" },
  { valor: "completada", texto: "Asistieron" },
  { valor: "no_asistio", texto: "No asistieron" },
  { valor: "cancelada", texto: "Canceladas" },
];

function esFutura(r: ReservaAdmin, hoy: string, hora: string): boolean {
  return r.fecha > hoy || (r.fecha === hoy && r.hora_inicio.slice(0, 5) > hora);
}

interface Props {
  servicio: Servicio | null;
  onCerrar: () => void;
}

/** Historial completo de reservas de un evento por turnos, en cualquier estado — también de
 * un evento finalizado, cuyas reservas se conservan intactas. Cancelar reservas futuras es
 * una acción aparte y explícita (con motivo y aviso por correo opcional). */
export default function HistorialReservasDialog({ servicio, onCerrar }: Props) {
  const [reservas, setReservas] = useState<ReservaAdmin[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<EstadoReserva | "todas">("todas");
  const [cancelando, setCancelando] = useState(false);

  async function cargar(id: number) {
    setCargando(true);
    setError(null);
    try {
      setReservas(await buscarReservas({ servicio_id: id }));
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar el historial."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (!servicio) return;
    setFiltro("todas");
    setReservas([]);
    cargar(servicio.id);
  }, [servicio]);

  const conteo = useMemo(() => {
    const c: Record<string, number> = {};
    reservas.forEach((r) => { c[r.estado] = (c[r.estado] ?? 0) + 1; });
    return c;
  }, [reservas]);
  // Memorizada: el diálogo de cancelación reinicia su selección si cambia esta lista.
  const futurasActivas = useMemo(() => {
    const hoy = hoyBogota();
    const hora = horaBogota();
    return reservas.filter((r) => r.estado === "activa" && esFutura(r, hoy, hora));
  }, [reservas]);
  const visibles = filtro === "todas" ? reservas : reservas.filter((r) => r.estado === filtro);

  const columnas: ColumnaDataTable<ReservaAdmin>[] = [
    {
      key: "fecha", label: "Fecha", principal: true,
      render: (r) => `${nombreDia(r.fecha).slice(0, 3)} ${formatearFecha(r.fecha)} ${r.fecha.slice(0, 4)} · ${formatearHora(r.hora_inicio)}`,
    },
    {
      key: "colaborador", label: "Colaborador",
      render: (r) => (
        <Box>
          <Typography variant="body2">{r.usuario_nombre} {r.usuario_apellido}</Typography>
          {r.usuario_correo && <Typography variant="caption" color="text.secondary">{r.usuario_correo}</Typography>}
        </Box>
      ),
    },
    { key: "area_nombre", label: "Área" },
    { key: "estado", label: "Estado", render: (r) => <EstadoChip tipo="reserva" estado={r.estado} /> },
  ];

  function exportar() {
    if (!servicio) return;
    descargarCSV(
      `historial-${servicio.nombre.replace(/[^\w-]+/g, "_")}.csv`,
      ["Fecha", "Hora inicio", "Hora fin", "Nombre", "Apellido", "Correo", "Área", "Estado", "Cancelada por"],
      reservas.map((r) => [
        r.fecha, formatearHora(r.hora_inicio), formatearHora(r.hora_fin), r.usuario_nombre, r.usuario_apellido,
        r.usuario_correo, r.area_nombre, r.estado, r.cancelled_by,
      ]),
    );
  }

  const vigencia = servicio ? textoVigencia(servicio.vigencia_inicio, servicio.vigencia_fin) : null;

  return (
    <>
      <Dialog open={!!servicio} onClose={onCerrar} maxWidth="md" fullWidth>
        <DialogTitle>
          Historial de reservas · {servicio?.nombre}
          {vigencia && (
            <Typography variant="body2" color="text.secondary" component="span" sx={{ display: "block", fontWeight: 400 }}>
              Vigencia: {vigencia.toLowerCase()}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {servicio?.estado_vigencia === "finalizado" && (
              <Alert severity="info">
                Este evento finalizó: ya no recibe reservas nuevas. Todas sus reservas y su historial se conservan.
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Todas (${reservas.length})`} onClick={() => setFiltro("todas")}
                color={filtro === "todas" ? "primary" : "default"} variant={filtro === "todas" ? "filled" : "outlined"} />
              {ESTADOS.map((e) => (
                <Chip key={e.valor} label={`${e.texto} (${conteo[e.valor] ?? 0})`} onClick={() => setFiltro(e.valor)}
                  color={filtro === e.valor ? "primary" : "default"} variant={filtro === e.valor ? "filled" : "outlined"} />
              ))}
            </Stack>
            {cargando ? <Loader /> : (
              <DataTable columnas={columnas} filas={visibles} obtenerId={(r) => r.id}
                mensajeVacio="Este evento no tiene reservas con ese estado." />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {futurasActivas.length > 0 && (
            <Button color="error" onClick={() => setCancelando(true)} sx={{ mr: "auto" }}>
              Cancelar reservas futuras ({futurasActivas.length})…
            </Button>
          )}
          <Button startIcon={<DownloadIcon />} onClick={exportar} disabled={!reservas.length}>Exportar CSV</Button>
          <Button variant="contained" onClick={onCerrar}>Cerrar</Button>
        </DialogActions>
      </Dialog>
      <ReservasAfectadasDialog
        abierto={cancelando}
        titulo="Cancelar reservas futuras"
        descripcion="Elige qué reservas cancelar. Es una operación aparte del fin de la vigencia: nada se cancela solo. Se conserva el registro de cada reserva y, si lo indicas, se avisa a cada colaborador por correo."
        reservas={futurasActivas}
        motivoSugerido="El evento finalizó."
        onCerrar={(hubo) => {
          setCancelando(false);
          if (hubo && servicio) cargar(servicio.id);
        }}
      />
    </>
  );
}
