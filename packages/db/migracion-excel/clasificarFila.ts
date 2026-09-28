import type {
  DatosMiembroAMigrar,
  FilaClasificada,
  FilaNormalizada,
  MapeoPlanEntry,
  MotivoFlagRevision,
  ReglasCedula,
} from "./tipos";

function diasCicloMensual(): number {
  return 30;
}

export function clasificarFila(
  fila: FilaNormalizada,
  mapeoPlan: MapeoPlanEntry[],
  reglasCedula: ReglasCedula,
  obtenerFechaPlaceholder: () => Date,
): FilaClasificada {
  if (fila.estado === null) {
    return { categoria: "excluida", motivo: "status-sin-dato", numeroFila: fila.numeroFila };
  }

  // Duplicados de cédula: resolver antes que cualquier otra cosa.
  if (fila.cedulaOriginal !== null) {
    const parDuplicado = reglasCedula.duplicados.find(
      (d) => d.filaA === fila.numeroFila || d.filaB === fila.numeroFila,
    );
    if (parDuplicado) {
      if (!parDuplicado.fusionar) {
        return {
          categoria: "excluida",
          motivo: "duplicado-pendiente-revision",
          numeroFila: fila.numeroFila,
          detalle: parDuplicado.cedula,
        };
      }
      if (parDuplicado.filaGanadora !== fila.numeroFila) {
        return {
          categoria: "excluida",
          motivo: "duplicado-pendiente-revision",
          numeroFila: fila.numeroFila,
          detalle: parDuplicado.cedula,
        };
      }
      // Es la fila ganadora: sigue el flujo normal, y al final se marca filaFusionadaDescartada.
    }
  }

  const flags: MotivoFlagRevision[] = [];

  // Cédula
  let cedula: string;
  if (fila.cedulaOriginal !== null) {
    cedula = fila.cedulaOriginal;
  } else {
    cedula = `PLACEHOLDER-${fila.numeroFila}`;
    flags.push("cedula-placeholder");
  }

  // Plan
  let precioPlanUSD: number;
  let planNombre: string;
  let planLegacy = false;

  if (fila.plan.tipo === "dominante") {
    precioPlanUSD = fila.plan.valorUSD;
    planNombre = `Plan $${fila.plan.valorUSD}`;
  } else {
    const entrada = mapeoPlan.find((m) => m.valorExcel === fila.plan.valorOriginal);
    if (!entrada || entrada.accion !== "mapear") {
      return {
        categoria: "excluida",
        motivo: "sin-mapeo-plan-definido",
        numeroFila: fila.numeroFila,
        detalle: fila.plan.valorOriginal,
      };
    }
    if (entrada.precioPlanOverrideUSD !== undefined) {
      precioPlanUSD = entrada.precioPlanOverrideUSD;
    } else {
      const valorNumerico = Number(entrada.valorExcel);
      // Sin override explícito: si el valorExcel original es un número válido, usarlo como precio.
      // Si no (ej. "Pend"), no hay más señal de precio disponible en esta función pura (no tiene
      // acceso al catálogo real de Plan, eso vive en migrarExcelAdrenalina.ts/Task 7) — cae a 0
      // solo como último recurso; migrarExcelAdrenalina.ts respeta el precio de un Plan existente
      // al reusarlo, así que este 0 solo aplica cuando el script fuera a CREAR un Plan nuevo.
      precioPlanUSD = Number.isFinite(valorNumerico) && entrada.valorExcel.trim() !== "" ? valorNumerico : 0;
    }
    planNombre = entrada.planNombreDestino ?? `Plan (mapeado desde "${fila.plan.valorOriginal}")`;
    planLegacy = entrada.planLegacy ?? false;
    if (planLegacy) flags.push("plan-legacy");
  }

  // Fecha de vencimiento
  let fechaVencimiento: Date;
  if (fila.fVenc.tipo === "valida") {
    fechaVencimiento = fila.fVenc.fecha;
  } else {
    fechaVencimiento = obtenerFechaPlaceholder();
    flags.push("fecha-vencimiento-placeholder");
  }

  const fechaInicio = new Date(fechaVencimiento);
  fechaInicio.setUTCDate(fechaInicio.getUTCDate() - diasCicloMensual());

  // Pago histórico opcional
  let pago: DatosMiembroAMigrar["pago"] = null;
  let fechaUltimoPago: Date | null;
  if (fila.fechaPago.tipo === "fecha") {
    fechaUltimoPago = fila.fechaPago.fecha;
  } else if (fila.fechaPago.tipo === "notaTexto") {
    pago = { monto: 0, metodo: fila.fechaPago.texto, fechaPago: fechaVencimiento };
    fechaUltimoPago = fechaVencimiento;
    flags.push("pago-aproximado");
  } else {
    fechaUltimoPago = null;
  }

  const datos: DatosMiembroAMigrar = {
    cedula,
    nombre: fila.nombre,
    celular: fila.celularOriginal,
    precioPlanUSD,
    planNombre,
    planLegacy,
    estado: fila.estado,
    fechaVencimiento,
    fechaInicio,
    fechaUltimoPago,
    pago,
  };

  const parDuplicado = fila.cedulaOriginal
    ? reglasCedula.duplicados.find((d) => d.filaGanadora === fila.numeroFila)
    : undefined;
  const filaFusionadaDescartada = parDuplicado
    ? (parDuplicado.filaA === fila.numeroFila ? parDuplicado.filaB : parDuplicado.filaA)
    : undefined;

  return {
    categoria: "migrada",
    flags,
    datos,
    numeroFila: fila.numeroFila,
    ...(filaFusionadaDescartada !== undefined ? { filaFusionadaDescartada } : {}),
  };
}
