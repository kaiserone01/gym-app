import type { ResultadoCheckIn } from "./api";
import type { CaraFicha } from "./cara";

// Lo que se muestra al terminar una verificación. `cara` y `diasParaVencer` se calculan al
// llegar la respuesta (no en el render) para que la ficha no cambie con el reloj.
export type Ficha =
  | { tipo: "resultado"; resultado: ResultadoCheckIn; hora: string; cara: CaraFicha; diasParaVencer: number | null; fotoOk: boolean }
  | { tipo: "pendiente" }
  | { tipo: "error"; mensaje: string };

export type FichaActiva = Ficha & { id: number };

export interface EstadoPantalla {
  // null = reposo.
  ficha: FichaActiva | null;
  // "Verificando…": no cambia la ficha visible, que sigue hasta que llegue la respuesta.
  procesando: boolean;
  siguienteId: number;
}

export type EventoPantalla =
  | { tipo: "enviar" }
  | { tipo: "respuesta"; ficha: Ficha }
  | { tipo: "vencio"; id: number };

export const estadoInicial: EstadoPantalla = { ficha: null, procesando: false, siguienteId: 1 };

export function reducirPantalla(estado: EstadoPantalla, evento: EventoPantalla): EstadoPantalla {
  switch (evento.tipo) {
    case "enviar":
      return { ...estado, procesando: true };
    case "respuesta":
      return {
        ficha: { ...evento.ficha, id: estado.siguienteId },
        procesando: false,
        siguienteId: estado.siguienteId + 1,
      };
    case "vencio":
      // El id evita que el temporizador de una ficha vieja borre la que la reemplazó.
      return estado.ficha?.id === evento.id ? { ...estado, ficha: null } : estado;
  }
}
