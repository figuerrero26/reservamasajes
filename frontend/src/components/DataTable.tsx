import type { ReactNode } from "react";
import { useState } from "react";
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
}

/** Tabla paginada. En pantallas pequeñas cada fila se presenta como una tarjeta apilada
 * (etiqueta: valor), para que nada se desborde ni obligue a desplazarse horizontalmente. */
export default function DataTable<T>({
  columnas,
  filas,
  obtenerId,
  cargando = false,
  mensajeVacio = "No hay registros para mostrar.",
  filasPorPaginaOpciones = [10, 25, 50],
}: DataTableProps<T>) {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(filasPorPaginaOpciones[0]);

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
      labelRowsPerPage={esMovil ? "Filas" : "Filas por página"}
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

  if (esMovil) {
    return (
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
    );
  }

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <TableContainer sx={{ overflowX: "auto" }}>
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
  );
}
