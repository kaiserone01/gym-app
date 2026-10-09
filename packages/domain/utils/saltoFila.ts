// "Ir a fila" del espejo del Excel: los números son los reales del archivo (la fila 3 son los títulos).
export const PRIMERA_FILA_DATOS = 4;

// numerosDeFila: filas presentes en el sistema, en orden ascendente. Las ausentes (sin cédula o
// cédula repetida) cuentan en el rango; pedir una salta a la siguiente existente con un aviso.
export function resolverSaltoFila(numerosDeFila: number[], pedido: number): { destino: number | null; mensaje: string | null } {
  if (numerosDeFila.length === 0) return { destino: null, mensaje: "No hay filas." };
  const ultima = numerosDeFila[numerosDeFila.length - 1];
  if (!Number.isInteger(pedido) || pedido < PRIMERA_FILA_DATOS || pedido > ultima) {
    return { destino: null, mensaje: `Escribe una fila entre ${PRIMERA_FILA_DATOS} y ${ultima}.` };
  }
  const siguiente = numerosDeFila.find((n) => n >= pedido)!;
  if (siguiente === pedido) return { destino: pedido, mensaje: null };
  return {
    destino: siguiente,
    mensaje: `La fila ${pedido} del Excel no está en el sistema (sin cédula o cédula repetida); se muestra la ${siguiente}.`,
  };
}
