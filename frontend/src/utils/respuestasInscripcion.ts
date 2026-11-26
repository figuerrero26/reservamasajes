import type { CampoFormulario, Inscripcion, RespuestaFormulario } from "../types";

export function preguntasConRespuestas(campos: CampoFormulario[], inscripciones: Inscripcion[]) {
  const preguntas = new Map(campos.map(({ clave, etiqueta }) => [clave, { clave, etiqueta }]));
  for (const inscripcion of inscripciones) {
    for (const clave of Object.keys(inscripcion.respuestas_formulario ?? {})) {
      if (!preguntas.has(clave)) preguntas.set(clave, { clave, etiqueta: clave });
    }
  }
  return [...preguntas.values()];
}

export function formatearRespuesta(inscripcion: Inscripcion, clave: string): string {
  const respuestas = inscripcion.respuestas_formulario;
  const valor: RespuestaFormulario | undefined = respuestas && Object.prototype.hasOwnProperty.call(respuestas, clave)
    ? respuestas[clave]
    : undefined;
  if (Array.isArray(valor)) return valor.join("; ");
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "string" && !valor.trim()) return "";
  return valor == null ? "" : String(valor);
}
