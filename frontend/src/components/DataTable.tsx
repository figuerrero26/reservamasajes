import type { ReactNode } from "react";
import { useState } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";

export interface ColumnaDataTable<T> {
  /** Clave de la columna. Si coincide con una propiedad de T se usa como valor por defecto. */
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  /** Si se define, se usa en lugar del valor crudo de la propiedad. */
  render?: (fila: T) => ReactNode;
}

interface DataTableProps<T> {
  columnas: ColumnaDataTable<T>[];
  filas: T[];
  obtenerId: (fila: T) => number | string;
  cargando?: boolean;
  mensajeVacio?: string;
  filasPorPaginaOpciones?: number[];
}

export default function DataTable<T>({
  columnas,
  filas,
  obtenerId,
  cargando = false,
  mensajeVacio = "No hay registros para mostrar.",
  filasPorPaginaOpciones = [10, 25, 50],
}: DataTableProps<T>) {
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(filasPorPaginaOpciones[0]);

  const inicio = pagina * filasPorPagina;
  const filasPagina = filas.slice(inicio, inicio + filasPorPagina);

  return (
    <Paper variant="outlined">
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
                    {columna.render
                      ? columna.render(fila)
                      : String((fila as Record<string, unknown>)[columna.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {!cargando && filas.length === 0 && (
        <Box sx={{ py: 5, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {mensajeVacio}
          </Typography>
        </Box>
      )}

      {filas.length > 0 && (
        <TablePagination
          component="div"
          count={filas.length}
          page={pagina}
          onPageChange={(_, nuevaPagina) => setPagina(nuevaPagina)}
          rowsPerPage={filasPorPagina}
          onRowsPerPageChange={(evento) => {
            setFilasPorPagina(parseInt(evento.target.value, 10));
            setPagina(0);
          }}
          rowsPerPageOptions={filasPorPaginaOpciones}
          labelRowsPerPage="Filas por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      )}
    </Paper>
  );
}
