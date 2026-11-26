import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, FormControlLabel, Stack, Switch, TextField, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import type { Actividad, EstadoInscripcion, InscripcionAdmin } from "../../types";
import { buscarInscripciones, cancelarInscripcion, eliminarInscripcionCancelada } from "../../services/inscripciones";
import { mensajeError } from "../../utils/errors";
import { descargarCSV, formatearFecha, formatearHora, nombreDia } from "../../utils/fechas";
import EliminarCanceladaButton from "./EliminarCanceladaButton";
import ConfirmDialog from "../ConfirmDialog";
import DataTable, { type ColumnaDataTable } from "../DataTable";
import EstadoChip from "../EstadoChip";
import Loader from "../Loader";

const ESTADOS: { valor: EstadoInscripcion; texto: string }[] = [
  { valor: "activa", texto: "Inscritos" },
  { valor: "cancelada", texto: "Canceladas" },
];

/** Historial completo de inscripciones de un evento de inscripción, a través de todas sus
 * sesiones (fechas), en cualquier estado — también de un evento finalizado. Es el equivalente
 * de HistorialReservasPanel para eventos de tipo inscripción. No se valida asistencia. */
interface Props {
  actividad: Actividad;
  /** El rol "visor de reservas" solo consulta: puede filtrar y exportar, pero no cancelar
   * inscripciones. */
  soloLectura?: boolean;
}

export default function HistorialInscripcionesPanel({ actividad, soloLectura = false }: Props) {
  const [inscripciones, setInscripciones] = useState<InscripcionAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<EstadoInscripcion | "todas">("activa");

  const [aCancelar, setACancelar] = useState<InscripcionAdmin | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [notificarCancelar, setNotificarCancelar] = useState(true);

  async function cargar(id: number) {
    setCargando(true);
    setError(null);
    try {
      setInscripciones(await buscarInscripciones({ actividad_id: id }));
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar el historial."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    setFiltro("activa");
    setInscripciones([]);
    cargar(actividad.id);
  }, [actividad.id]);

  const conteo = useMemo(() => {
    const c: Record<string, number> = {};
    inscripciones.forEach((i) => { c[i.estado] = (c[i.estado] ?? 0) + 1; });
    return c;
  }, [inscripciones]);
  const visibles = filtro === "todas" ? inscripciones : inscripciones.filter((i) => i.estado === filtro);

  async function confirmarCancelar() {
    if (!aCancelar) return;
    setCancelando(true);
    setErrorCancelar(null);
    try {
      await cancelarInscripcion(aCancelar.id, { motivo: motivoCancelar, notificar: notificarCancelar });
      setACancelar(null);
      await cargar(actividad.id);
    } catch (e) {
      setErrorCancelar(mensajeError(e, "No se pudo cancelar la inscripción."));
    } finally {
      setCancelando(false);
    }
  }

  const columnas: ColumnaDataTable<InscripcionAdmin>[] = [
    {
      key: "sesion_fecha", label: "Fecha", principal: true,
      render: (i) => `${nombreDia(i.sesion_fecha).slice(0, 3)} ${formatearFecha(i.sesion_fecha)} ${i.sesion_fecha.slice(0, 4)} · ${formatearHora(i.sesion_hora_inicio)}`,
    },
    {
      key: "colaborador", label: "Colaborador",
      render: (i) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2">{i.usuario_nombre} {i.usuario_apellido}</Typography>
          {i.usuario_correo && <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>{i.usuario_correo}</Typography>}
        </Box>
      ),
    },
    { key: "estado", label: "Estado", render: (i) => <EstadoChip tipo="inscripcion" estado={i.estado} /> },
    {
      key: "acciones", label: "", align: "right",
      render: (i) => {
        if (soloLectura) return null;
        if (i.estado === "cancelada") return (
          <EliminarCanceladaButton
            tipo="inscripción" nombre={`${i.usuario_nombre} ${i.usuario_apellido}`}
            eliminar={() => eliminarInscripcionCancelada(i.id)} onEliminada={() => cargar(actividad.id)}
          />
        );
        if (i.estado !== "activa") return null;
        return (
          <Button
            size="small" color="error"
            onClick={() => { setACancelar(i); setErrorCancelar(null); setMotivoCancelar(""); setNotificarCancelar(true); }}
          >
            Cancelar
          </Button>
        );
      },
    },
  ];

  function exportar() {
    const preguntas = actividad.campos_formulario;
    descargarCSV(
      `historial-${actividad.nombre.replace(/[^\w-]+/g, "_")}.csv`,
      ["Fecha", "Hora", "Nombre", "Apellido", "Correo", "Estado", "Cancelada por", ...preguntas.map((p) => p.etiqueta)],
      inscripciones.map((i) => [
        i.sesion_fecha, formatearHora(i.sesion_hora_inicio), i.usuario_nombre, i.usuario_apellido,
        i.usuario_correo, i.estado, i.cancelled_by,
        ...preguntas.map((p) => {
          const v = i.respuestas_formulario?.[p.clave];
          return typeof v === "boolean" ? (v ? "Sí" : "No") : (v ?? "");
        }),
      ]),
    );
  }

  /** Listado definitivo de participantes: solo inscripciones activas (quienes conservaron su
   * cupo), sin cancelados y sin usar la asistencia como criterio (no se valida). */
  function exportarParticipantes() {
    const preguntas = actividad.campos_formulario;
    const activas = inscripciones.filter((i) => i.estado === "activa");
    descargarCSV(
      `participantes-${actividad.nombre.replace(/[^\w-]+/g, "_")}.csv`,
      ["Fecha", "Hora", "Nombre", "Apellido", "Correo", ...preguntas.map((p) => p.etiqueta)],
      activas.map((i) => [
        i.sesion_fecha, formatearHora(i.sesion_hora_inicio), i.usuario_nombre, i.usuario_apellido, i.usuario_correo,
        ...preguntas.map((p) => {
          const v = i.respuestas_formulario?.[p.clave];
          return typeof v === "boolean" ? (v ? "Sí" : "No") : (v ?? "");
        }),
      ]),
    );
  }

  return (
    <Stack spacing={2}>
      {actividad.estado_vigencia === "finalizado" && (
        <Alert severity="info">
          Este evento finalizó: ya no recibe inscripciones nuevas. Todas sus inscripciones y su historial se conservan.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={`Todas (${inscripciones.length})`} onClick={() => setFiltro("todas")}
          color={filtro === "todas" ? "primary" : "default"} variant={filtro === "todas" ? "filled" : "outlined"} />
        {ESTADOS.map((e) => (
          <Chip key={e.valor} label={`${e.texto} (${conteo[e.valor] ?? 0})`} onClick={() => setFiltro(e.valor)}
            color={filtro === e.valor ? "primary" : "default"} variant={filtro === e.valor ? "filled" : "outlined"} />
        ))}
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button size="small" startIcon={<DownloadIcon />} onClick={exportar} disabled={!inscripciones.length}>Exportar CSV</Button>
        <Button
          size="small" startIcon={<DownloadIcon />} onClick={exportarParticipantes}
          disabled={!inscripciones.some((i) => i.estado === "activa")}
        >
          Descargar participantes
        </Button>
      </Stack>
      {cargando ? <Loader /> : (
        <DataTable columnas={columnas} filas={visibles} obtenerId={(i) => i.id}
          mensajeVacio="Este evento no tiene inscripciones con ese estado." />
      )}

      <ConfirmDialog
        abierto={!!aCancelar}
        titulo="Cancelar inscripción"
        contenido={
          aCancelar && (
            <Stack spacing={2}>
              <span>
                ¿Confirmas cancelar la inscripción de {aCancelar.usuario_nombre} {aCancelar.usuario_apellido} el{" "}
                {formatearFecha(aCancelar.sesion_fecha)} a las {aCancelar.sesion_hora_inicio.slice(0, 5)}? Su cupo quedará
                libre. Esta acción no se puede deshacer.
              </span>
              <TextField
                label="Motivo (opcional, se incluye en el correo)" size="small" fullWidth
                value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} inputProps={{ maxLength: 500 }}
              />
              <FormControlLabel
                control={<Switch checked={notificarCancelar} onChange={(e) => setNotificarCancelar(e.target.checked)} />}
                label="Avisar al participante por correo"
              />
            </Stack>
          )
        }
        textoConfirmar="Cancelar inscripción"
        colorConfirmar="error"
        cargando={cancelando}
        error={errorCancelar}
        onConfirmar={confirmarCancelar}
        onCancelar={() => setACancelar(null)}
      />
    </Stack>
  );
}
