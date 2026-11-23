import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack,
  Switch, TextField, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import type { EstadoReserva, ReservaAdmin, Servicio } from "../../types";
import { buscarReservas, cancelarReserva } from "../../services/reservas";
import { mensajeError } from "../../utils/errors";
import { descargarCSV, formatearFecha, formatearHora, horaBogota, hoyBogota, nombreDia } from "../../utils/fechas";
import ConfirmDialog from "../ConfirmDialog";
import DataTable, { type ColumnaDataTable } from "../DataTable";
import EstadoChip from "../EstadoChip";
import Loader from "../Loader";
import ReservasAfectadasDialog from "../ReservasAfectadasDialog";

const ESTADOS: { valor: EstadoReserva; texto: string }[] = [
  { valor: "activa", texto: "Confirmadas" },
  { valor: "cancelada", texto: "Canceladas" },
];

function esFutura(r: ReservaAdmin, hoy: string, hora: string): boolean {
  return r.fecha > hoy || (r.fecha === hoy && r.hora_inicio.slice(0, 5) > hora);
}

/** Historial completo de reservas de un evento de reserva, en cualquier estado — también de
 * un evento finalizado, cuyas reservas se conservan intactas. Cancelar una reserva puntual es
 * una acción individual; cancelar varias reservas futuras a la vez es una acción aparte y
 * explícita (con motivo y aviso por correo opcional). No se valida asistencia. */
interface Props {
  servicio: Servicio;
  /** El rol "visor de reservas" solo consulta: puede filtrar y exportar, pero no cancelar
   * reservas. */
  soloLectura?: boolean;
}

export default function HistorialReservasPanel({ servicio, soloLectura = false }: Props) {
  const [reservas, setReservas] = useState<ReservaAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<EstadoReserva | "todas">("activa");
  // El mismo evento puede tener agendas en varias áreas (p. ej. Masaje de relajación en
  // Oficinas y en Planta); este filtro ayuda a ubicar de un vistazo dónde reservó cada quien.
  const [filtroArea, setFiltroArea] = useState<string | "todas">("todas");
  const [cancelando, setCancelando] = useState(false);

  const [aCancelar, setACancelar] = useState<ReservaAdmin | null>(null);
  const [cancelandoUna, setCancelandoUna] = useState(false);
  const [errorCancelarUna, setErrorCancelarUna] = useState<string | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [notificarCancelar, setNotificarCancelar] = useState(true);

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
    setFiltro("activa");
    setFiltroArea("todas");
    setReservas([]);
    cargar(servicio.id);
  }, [servicio.id]);

  const ahora = useMemo(() => ({ hoy: hoyBogota(), hora: horaBogota() }), [reservas]);
  const conteo = useMemo(() => {
    const c: Record<string, number> = {};
    reservas.forEach((r) => { c[r.estado] = (c[r.estado] ?? 0) + 1; });
    return c;
  }, [reservas]);
  // Memorizada: el diálogo de cancelación en lote reinicia su selección si cambia esta lista.
  const futurasActivas = useMemo(
    () => reservas.filter((r) => r.estado === "activa" && esFutura(r, ahora.hoy, ahora.hora)),
    [reservas, ahora],
  );
  const areas = useMemo(
    () => Array.from(new Set(reservas.map((r) => r.area_nombre))).sort((a, b) => a.localeCompare(b)),
    [reservas],
  );
  const activas = useMemo(() => reservas.filter((r) => r.estado === "activa"), [reservas]);
  const visibles = reservas
    .filter((r) => filtro === "todas" || r.estado === filtro)
    .filter((r) => filtroArea === "todas" || r.area_nombre === filtroArea);

  async function confirmarCancelarUna() {
    if (!aCancelar) return;
    setCancelandoUna(true);
    setErrorCancelarUna(null);
    try {
      await cancelarReserva(aCancelar.id, { motivo: motivoCancelar, notificar: notificarCancelar });
      setACancelar(null);
      await cargar(servicio.id);
    } catch (e) {
      setErrorCancelarUna(mensajeError(e, "No se pudo cancelar la reserva."));
    } finally {
      setCancelandoUna(false);
    }
  }

  const columnas: ColumnaDataTable<ReservaAdmin>[] = [
    {
      key: "fecha", label: "Fecha", principal: true,
      render: (r) => `${nombreDia(r.fecha).slice(0, 3)} ${formatearFecha(r.fecha)} ${r.fecha.slice(0, 4)} · ${formatearHora(r.hora_inicio)}`,
    },
    {
      key: "colaborador", label: "Colaborador",
      render: (r) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2">{r.usuario_nombre} {r.usuario_apellido}</Typography>
          {r.usuario_correo && <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>{r.usuario_correo}</Typography>}
        </Box>
      ),
    },
    { key: "area_nombre", label: "Área" },
    { key: "estado", label: "Estado", render: (r) => <EstadoChip tipo="reserva" estado={r.estado} /> },
    {
      key: "acciones", label: "", align: "right",
      render: (r) => {
        if (soloLectura || r.estado !== "activa") return null;
        return (
          <Button
            size="small" color="error"
            onClick={() => {
              setACancelar(r); setErrorCancelarUna(null); setMotivoCancelar(""); setNotificarCancelar(true);
            }}
          >
            Cancelar
          </Button>
        );
      },
    },
  ];

  function exportar() {
    descargarCSV(
      `historial-${servicio.nombre.replace(/[^\w-]+/g, "_")}.csv`,
      ["Fecha", "Hora inicio", "Hora fin", "Nombre", "Apellido", "Correo", "Área", "Estado", "Cancelada por"],
      reservas.map((r) => [
        r.fecha, formatearHora(r.hora_inicio), formatearHora(r.hora_fin), r.usuario_nombre, r.usuario_apellido,
        r.usuario_correo, r.area_nombre, r.estado, r.cancelled_by,
      ]),
    );
  }

  /** Listado definitivo de participantes: solo reservas activas (quienes conservaron su
   * cupo), sin cancelados y sin usar la asistencia como criterio (no se valida). */
  function exportarParticipantes() {
    descargarCSV(
      `participantes-${servicio.nombre.replace(/[^\w-]+/g, "_")}.csv`,
      ["Fecha", "Hora inicio", "Hora fin", "Nombre", "Apellido", "Correo", "Área"],
      activas.map((r) => [
        r.fecha, formatearHora(r.hora_inicio), formatearHora(r.hora_fin), r.usuario_nombre, r.usuario_apellido,
        r.usuario_correo, r.area_nombre,
      ]),
    );
  }

  return (
    <Stack spacing={2}>
      {servicio.estado_vigencia === "finalizado" && (
        <Alert severity="info">
          Este evento finalizó: ya no recibe reservas nuevas. Todas sus reservas y su historial se conservan.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        <Chip label={`Todas (${reservas.length})`} onClick={() => setFiltro("todas")}
          color={filtro === "todas" ? "primary" : "default"} variant={filtro === "todas" ? "filled" : "outlined"} />
        {ESTADOS.map((e) => (
          <Chip key={e.valor} label={`${e.texto} (${conteo[e.valor] ?? 0})`} onClick={() => setFiltro(e.valor)}
            color={filtro === e.valor ? "primary" : "default"} variant={filtro === e.valor ? "filled" : "outlined"} />
        ))}
        {areas.length > 1 && (
          <FormControl size="small" sx={{ minWidth: 160, ml: { sm: 1 } }}>
            <InputLabel id="historial-reservas-area-label">Área</InputLabel>
            <Select
              labelId="historial-reservas-area-label"
              label="Área"
              value={filtroArea}
              onChange={(e) => setFiltroArea(e.target.value)}
            >
              <MenuItem value="todas">Todas las áreas</MenuItem>
              {areas.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
            </Select>
          </FormControl>
        )}
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button size="small" startIcon={<DownloadIcon />} onClick={exportar} disabled={!reservas.length}>Exportar CSV</Button>
        <Button size="small" startIcon={<DownloadIcon />} onClick={exportarParticipantes} disabled={!activas.length}>
          Descargar participantes
        </Button>
        {!soloLectura && futurasActivas.length > 0 && (
          <Button size="small" color="error" onClick={() => setCancelando(true)}>
            Cancelar reservas futuras ({futurasActivas.length})…
          </Button>
        )}
      </Stack>
      {cargando ? <Loader /> : (
        <DataTable columnas={columnas} filas={visibles} obtenerId={(r) => r.id}
          mensajeVacio="Este evento no tiene reservas con esos filtros." />
      )}
      <ReservasAfectadasDialog
        abierto={cancelando}
        titulo="Cancelar reservas futuras"
        descripcion="Elige qué reservas cancelar. Es una operación aparte del fin de la vigencia: nada se cancela solo. Se conserva el registro de cada reserva y, si lo indicas, se avisa a cada colaborador por correo."
        reservas={futurasActivas}
        motivoSugerido="El evento finalizó."
        onCerrar={(hubo) => {
          setCancelando(false);
          if (hubo) cargar(servicio.id);
        }}
      />

      <ConfirmDialog
        abierto={!!aCancelar}
        titulo="Cancelar reserva"
        contenido={
          aCancelar && (
            <Stack spacing={2}>
              <span>
                ¿Confirmas cancelar la reserva de {aCancelar.usuario_nombre} {aCancelar.usuario_apellido} el{" "}
                {formatearFecha(aCancelar.fecha)} a las {aCancelar.hora_inicio.slice(0, 5)}? El horario quedará libre.
                Esta acción no se puede deshacer.
              </span>
              <TextField
                label="Motivo (opcional, se incluye en el correo)" size="small" fullWidth
                value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} inputProps={{ maxLength: 500 }}
              />
              <FormControlLabel
                control={<Switch checked={notificarCancelar} onChange={(e) => setNotificarCancelar(e.target.checked)} />}
                label="Avisar al colaborador por correo"
              />
            </Stack>
          )
        }
        textoConfirmar="Cancelar reserva"
        colorConfirmar="error"
        cargando={cancelandoUna}
        error={errorCancelarUna}
        onConfirmar={confirmarCancelarUna}
        onCancelar={() => setACancelar(null)}
      />
    </Stack>
  );
}
