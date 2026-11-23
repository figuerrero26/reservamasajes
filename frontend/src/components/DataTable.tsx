import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

export interface ColumnaDataTable<T> {
  /** Clave de la columna. Si coincide con una propiedad de T se usa como valor por defecto. */
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  /** Si se define, se usa en lugar del valor crudo de la propiedad. */
  render?: (fila: T) => ReactNode;
  /** Columna principal: en móvil se muestra como título de la tarjeta. */
  principal?: boolean;
}

interface DataTableProps<T> {
  columnas: ColumnaDataTable<T>[];
  filas: T[];
  obtenerId: (fila: T) => number | string;
  cargando?: boolean;
  mensajeVacio?: string;
  filasPorPaginaOpciones?: number[];
  /** Ancho mínimo (px) para mostrarla como tabla; por defecto ~125 px por columna. Por
   * debajo se muestran tarjetas, en vez de columnas tan angostas que parten las palabras. */
  anchoMinimo?: number;
}

/** Tabla paginada. En pantallas pequeñas —o cuando la tabla no cabe en el espacio disponible,
 * p. ej. en una tableta con el menú lateral abierto— cada fila se presenta como una tarjeta
 * apilada (etiqueta: valor), para que nada se desborde ni obligue a desplazarse de lado. */
export default function DataTable<T>({
  columnas,
  filas,
  obtenerId,
  cargando = false,
  mensajeVacio = "No hay registros para mostrar.",
  filasPorPaginaOpciones = [10, 25, 50],
  anchoMinimo,
}: DataTableProps<T>) {
  const theme = useTheme();
  const pantallaChica = useMediaQuery(theme.breakpoints.down("sm"));
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(filasPorPaginaOpciones[0]);

  // Ancho disponible y ancho que pidió la tabla la última vez que no cupo: si no cabe, se
  // pasa a tarjetas; si el espacio vuelve a alcanzar, se vuelve a la tabla.
  const envoltorio = useRef<HTMLDivElement>(null);
  const contenedorTabla = useRef<HTMLDivElement>(null);
  const [anchoDisponible, setAnchoDisponible] = useState<number | null>(null);
  const [anchoNecesario, setAnchoNecesario] = useState<number | null>(null);
  const anchoMinimoTabla = anchoMinimo ?? columnas.length * 125;
  const comoTarjetas = pantallaChica
    || (anchoDisponible != null && anchoDisponible < anchoMinimoTabla)
    || (anchoNecesario != null && anchoDisponible != null && anchoDisponible < anchoNecesario);

  useLayoutEffect(() => {
    const el = envoltorio.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(([entrada]) => setAnchoDisponible(Math.floor(entrada.contentRect.width)));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  // Al cambiar los datos se vuelve a medir la tabla (antes de pintar: no hay parpadeo).
  useLayoutEffect(() => {
    setAnchoNecesario(null);
  }, [filas, columnas.length]);

  useLayoutEffect(() => {
    const tc = contenedorTabla.current;
    if (comoTarjetas || !tc) return;
    if (tc.scrollWidth > tc.clientWidth + 1) setAnchoNecesario(tc.scrollWidth);
  });

  const paginaSegura = Math.min(pagina, Math.max(0, Math.ceil(filas.length / filasPorPagina) - 1));
  const inicio = paginaSegura * filasPorPagina;
  const filasPagina = filas.slice(inicio, inicio + filasPorPagina);

  const valor = (fila: T, columna: ColumnaDataTable<T>) =>
    columna.render ? columna.render(fila) : String((fila as Record<string, unknown>)[columna.key] ?? "");

  const principal = columnas.find((c) => c.principal) ?? columnas.find((c) => c.label);

  const paginacion = filas.length > filasPorPaginaOpciones[0] && (
    <TablePagination
      component="div"
      count={filas.length}
      page={paginaSegura}
      onPageChange={(_, nuevaPagina) => setPagina(nuevaPagina)}
      rowsPerPage={filasPorPagina}
      onRowsPerPageChange={(evento) => {
        setFilasPorPagina(parseInt(evento.target.value, 10));
        setPagina(0);
      }}
      rowsPerPageOptions={filasPorPaginaOpciones}
      labelRowsPerPage={pantallaChica ? "Filas" : "Filas por página"}
      labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
    />
  );

  const vacio = !cargando && filas.length === 0 && (
    <Box sx={{ py: 6, textAlign: "center" }}>
      <Typography variant="body2" color="text.secondary">
        {mensajeVacio}
      </Typography>
    </Box>
  );

  // Envoltorio estable (el mismo elemento en los dos modos): es el que se mide.
  if (comoTarjetas) {
    return (
      <Box ref={envoltorio}>
      <Paper variant="outlined">
        {filasPagina.map((fila, i) => (
          <Box key={obtenerId(fila)} sx={{ p: 2, borderTop: i ? 1 : 0, borderColor: "divider" }}>
            {principal && (
              <Box sx={{ fontWeight: 600, mb: 1, wordBreak: "break-word" }}>{valor(fila, principal)}</Box>
            )}
            <Stack spacing={0.75}>
              {columnas
                .filter((c) => c !== principal)
                .map((c) =>
                  c.label ? (
                    <Stack key={c.key} direction="row" justifyContent="space-between" spacing={2} alignItems="center">
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {c.label}
                      </Typography>
                      <Box sx={{ textAlign: "right", fontSize: "0.875rem", minWidth: 0, wordBreak: "break-word" }}>
                        {valor(fila, c)}
                      </Box>
                    </Stack>
                  ) : (
                    <Box key={c.key} sx={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 1 }}>
                      {valor(fila, c)}
                    </Box>
                  ),
                )}
            </Stack>
          </Box>
        ))}
        {vacio}
        {paginacion}
      </Paper>
      </Box>
    );
  }

  return (
    <Box ref={envoltorio}>
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <TableContainer sx={{ overflowX: "auto" }} ref={contenedorTabla}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {columnas.map((columna) => (
                <TableCell key={columna.key} align={columna.align ?? "left"}>
                  {columna.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filasPagina.map((fila) => (
              <TableRow key={obtenerId(fila)} hover>
                {columnas.map((columna) => (
                  <TableCell key={columna.key} align={columna.align ?? "left"}>
                    {valor(fila, columna)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {vacio}
      {paginacion}
    </Paper>
    </Box>
  );
}
