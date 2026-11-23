"""Separación estricta entre los dos tipos de evento.

- Evento de RESERVA: el colaborador elige un turno individual. Se guarda como servicio con
  sus agendas (área, horario de atención, duración de los turnos y días) en /servicios y
  /agendas.
- Evento de INSCRIPCIÓN: el colaborador se inscribe y ocupa un cupo en una fecha y horario
  definidos. Se guarda como actividad con sus sesiones (fecha, horario, lugar y cupo) en
  /actividades.

Cada esquema de entrada declara a qué tipo pertenece y rechaza (422) cualquier campo que no
conoce, explicando a qué tipo de evento corresponde ese campo: una configuración de un tipo
nunca se guarda —ni se ignora en silencio— en el otro. Si el panel envía `tipo`, debe
coincidir con el tipo del formulario.
"""
from typing import ClassVar, Literal

from pydantic import BaseModel, ConfigDict, model_validator

TipoEvento = Literal["reserva", "inscripcion"]

NOMBRE_TIPO: dict[str, str] = {"reserva": "evento de reserva", "inscripcion": "evento de inscripción"}

# Campos que solo tienen sentido en un tipo de evento (para explicar el rechazo).
CAMPOS_PROPIOS: dict[str, frozenset[str]] = {
    "reserva": frozenset({
        "agenda", "agendas", "agenda_id", "servicio_id", "almuerzo_inicio", "almuerzo_fin",
        "duracion_minutos", "dias_habilitados", "turnos", "permite_reservas_multiples",
    }),
    "inscripcion": frozenset({
        "sesiones", "sesion_id", "actividad_id", "cupo_maximo", "cupos", "lugar", "campos_formulario",
        "inscripcion_abierta", "fecha_apertura_inscripciones", "fecha_cierre_inscripciones",
        "dias_semana", "inscritos",
    }),
}


def _tipo_de_campo(campo: str) -> str | None:
    for tipo, campos in CAMPOS_PROPIOS.items():
        if campo in campos:
            return tipo
    return None


def mensaje_campos_ajenos(campos: list[str], tipo: str) -> str:
    """Explica por qué no se aceptan esos campos en un formulario del tipo `tipo`."""
    del_otro = [c for c in campos if _tipo_de_campo(c) not in (None, tipo)]
    otro = "inscripcion" if tipo == "reserva" else "reserva"
    if del_otro:
        lista = ", ".join(f"«{c}»" for c in del_otro)
        return (
            f"Configuración incompatible: {lista} corresponde{'n' if len(del_otro) > 1 else ''} a un "
            f"{NOMBRE_TIPO[otro]} y no se puede guardar en un {NOMBRE_TIPO[tipo]}."
        )
    lista = ", ".join(f"«{c}»" for c in campos)
    return f"Campo{'s' if len(campos) > 1 else ''} no reconocido{'s' if len(campos) > 1 else ''} para un {NOMBRE_TIPO[tipo]}: {lista}."


class EsquemaDeTipo(BaseModel):
    """Base de los esquemas de entrada de cada tipo de evento: solo admite sus propios campos."""
    model_config = ConfigDict(extra="forbid")
    TIPO_EVENTO: ClassVar[str] = "reserva"

    @model_validator(mode="before")
    @classmethod
    def _solo_campos_del_tipo(cls, datos):
        if not isinstance(datos, dict):
            return datos
        tipo = datos.get("tipo")
        if "tipo" in cls.model_fields and tipo in NOMBRE_TIPO and tipo != cls.TIPO_EVENTO:
            raise ValueError(
                f"Este formulario guarda un {NOMBRE_TIPO[cls.TIPO_EVENTO]}; la configuración recibida es de un "
                f"{NOMBRE_TIPO[tipo]}. Créalo con el tipo correcto."
            )
        ajenos = sorted(k for k in datos if k not in cls.model_fields)
        if ajenos:
            raise ValueError(mensaje_campos_ajenos(ajenos, cls.TIPO_EVENTO))
        return datos


class EsquemaDeReserva(EsquemaDeTipo):
    TIPO_EVENTO: ClassVar[str] = "reserva"


class EsquemaDeInscripcion(EsquemaDeTipo):
    TIPO_EVENTO: ClassVar[str] = "inscripcion"
