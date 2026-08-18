/** Debe coincidir con backend/app/models/rol.py */
export const ROL_ADMINISTRADOR = "administrador";
export const ROL_VISOR_RESERVAS = "visor_reservas";

export const ETIQUETA_ROL: Record<string, string> = {
  [ROL_ADMINISTRADOR]: "Administrador",
  [ROL_VISOR_RESERVAS]: "Solo ver reservas",
};
