// Proyección puramente de cliente: mientras el usuario distribuye montos
// entre métodos en el Paso 3 del wizard de Caja (modalidad "pago
// combinado"), esta función calcula cómo quedaría el resumen del turno SIN
// persistir nada — el resumen real se recalcula recién cuando el pago se
// confirma y ObtenerResumenTurno vuelve a correr sobre filas Pago
// guardadas. Ver diseño en
// docs/superpowers/specs/2026-09-26-pagos-combinados-caja-design.md.

export interface LineaEnProgreso {
  metodo: string;
  monto: number;
  enBs: boolean;
}

export interface LineaProyectada {
  metodo: string;
  enBs: boolean;
  actual: number;
  proyectado: number;
}

export function proyectarResumenTurno(
  lineasActuales: Array<{ metodo: string; enBs: boolean; montoEsperado: number }>,
  lineasEnProgreso: LineaEnProgreso[]
): LineaProyectada[] {
  const metodos = new Set<string>();

  lineasActuales.forEach((l) => metodos.add(l.metodo));
  lineasEnProgreso.forEach((l) => metodos.add(l.metodo));

  const metodosArray = Array.from(metodos);

  return metodosArray.map((metodo) => {
    const lineaActual = lineasActuales.find((l) => l.metodo === metodo);
    const enBs = lineaActual?.enBs ?? lineasEnProgreso.find((l) => l.metodo === metodo)?.enBs ?? false;
    const actual = lineaActual?.montoEsperado ?? 0;
    const sumaEnProgreso = lineasEnProgreso
      .filter((l) => l.metodo === metodo)
      .reduce((suma, l) => suma + l.monto, 0);

    return { metodo, enBs, actual, proyectado: actual + sumaEnProgreso };
  });
}
