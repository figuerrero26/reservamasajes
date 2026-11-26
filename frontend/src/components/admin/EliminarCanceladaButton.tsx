import { useState } from "react";
import { Button } from "@mui/material";
import ConfirmDialog from "../ConfirmDialog";
import { mensajeError } from "../../utils/errors";

interface Props {
  tipo: "reserva" | "inscripción";
  nombre: string;
  eliminar: () => Promise<void>;
  onEliminada: () => Promise<void>;
}

export default function EliminarCanceladaButton({ tipo, nombre, eliminar, onEliminada }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setGuardando(true);
    setError(null);
    try {
      await eliminar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo eliminar el registro."));
      setGuardando(false);
      return;
    }
    setAbierto(false);
    setGuardando(false);
    await onEliminada();
  }

  return (
    <>
      <Button size="small" color="error" onClick={() => { setError(null); setAbierto(true); }}>
        Eliminar
      </Button>
      {abierto && (
        <ConfirmDialog
          abierto
          titulo={`Eliminar ${tipo} cancelada`}
          contenido={`¿Eliminar definitivamente la ${tipo} cancelada de ${nombre}?`}
          textoConfirmar="Eliminar"
          colorConfirmar="error"
          cargando={guardando}
          error={error}
          onConfirmar={confirmar}
          onCancelar={() => { if (!guardando) setAbierto(false); }}
        />
      )}
    </>
  );
}
