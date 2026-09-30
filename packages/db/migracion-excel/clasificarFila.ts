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

// Planes reales de la organización (nombres tal como aparecen en /planes). Los nombres y
// atributos de los planes creados por la migración salen de acá.
export const PLANES_REALES: Record<number, { nombre: string; frecuencia: "SEMANAL" | "MENSUAL"; diasCiclo: number; incluyeEntrenador: boolean }> = {
  8: { nombre: "Semanal", frecuencia: "SEMANAL", diasCiclo: 7, incluyeEntrenador: false },
  20: { nombre: "Plan Viejo", frecuencia: "MENSUAL", diasCiclo: 30, incluyeEntrenador: false },
  22: { nombre: "Corporativo", frecuencia: "MENSUAL", diasCiclo: 30, incluyeEntrenador: false },
  25: { nombre: "Mensual sin entrenador", frecuencia: "MENSUAL", diasCiclo: 30, incluyeEntrenador: false },
  30: { nombre: "Mensual con entrenador", frecuencia: "MENSUAL", diasCiclo: 30, incluyeEntrenador: true },
};
const PRECIOS_PLANES_REALES = Object.keys(PLANES_REALES).map(Number);
const DIAS_VENCIDO_PARA_APROXIMAR_PLAN = 60;
// Solo se migra a quien venció hace 90 días o menos (o tiene vencimiento futuro); el resto se descarta.
const DIAS_CORTE_VENCIMIENTO = 90;

function precioRealMasCercano(precio: number): number {
  return PRECIOS_PLANES_REALES.reduce((mejor, p) => (Math.abs(p - precio) < Math.abs(mejor - precio) ? p : mejor));
}

export function clasificarFila(
  fila: FilaNormalizada,
  mapeoPlan: MapeoPlanEntry[],
  reglasCedula: ReglasCedula,
  obtenerFechaPlaceholder: () => Date,
  fechaReferencia: Date = new Date(),
): FilaClasificada {
  if (fila.estado === null) {
    return { categoria: "excluida", motivo: "status-sin-dato", numeroFila: fila.numeroFila };
  }

  // Corte por vencimiento: fuera de los últimos 90 días (o sin fecha real) no se migra.
  const corte = new Date(fechaReferencia);
  corte.setUTCDate(corte.getUTCDate() - DIAS_CORTE_VENCIMIENTO);
  if (fila.fVenc.tipo !== "valida" || fila.fVenc.fecha < corte) {
    return {
      categoria: "excluida",
      motivo: "vencimiento-fuera-de-corte",
      numeroFila: fila.numeroFila,
      detalle: fila.fVenc.tipo === "valida" ? undefined : "sin-fecha-vencimiento",
    };
  }

  // Duplicados de cédula: si fusionan, solo migra la ganadora. Si son personas distintas
  // (fusionar:false), migran ambas y la que no es ganadora recibe cédula placeholder.
  const parDuplicado =
    fila.cedulaOriginal !== null
      ? reglasCedula.duplicados.find((d) => d.filaA === fila.numeroFila || d.filaB === fila.numeroFila)
      : undefined;
  const esPerdedoraFusionada =
    parDuplicado?.fusionar === true && parDuplicado.filaGanadora !== fila.numeroFila;
  if (esPerdedoraFusionada) {
    return {
      categoria: "excluida",
      motivo: "duplicado-pendiente-revision",
      numeroFila: fila.numeroFila,
      detalle: parDuplicado.cedula,
    };
  }
  const cedulaEnConflicto = parDuplicado?.fusionar === false && parDuplicado.filaGanadora !== fila.numeroFila;

  const flags: MotivoFlagRevision[] = [];

  // Cédula
  let cedula: string;
  if (fila.cedulaOriginal !== null && !cedulaEnConflicto) {
    cedula = fila.cedulaOriginal;
  } else {
    cedula = `PLACEHOLDER-${fila.numeroFila}`;
    flags.push("cedula-placeholder");
  }

  // Plan
  let precioPlanUSD: number;
  let planNombre: string;
  let planLegacy = false;
  let precioPlanOriginalUSD: number | undefined;

  if (fila.plan.tipo === "dominante") {
    precioPlanUSD = fila.plan.valorUSD;
    planNombre = PLANES_REALES[fila.plan.valorUSD]?.nombre ?? `Plan $${fila.plan.valorUSD}`;
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
    // Plan legacy con vencimiento de más de 2 meses: se asigna el plan real de precio más
    // cercano (conservando el precio original en el miembro); los recientes o sin fecha
    // real quedan en su plan legacy. Cortesía ($0) no se aproxima.
    const limite = new Date(fechaReferencia);
    limite.setUTCDate(limite.getUTCDate() - DIAS_VENCIDO_PARA_APROXIMAR_PLAN);
    if (planLegacy && precioPlanUSD > 0 && fila.fVenc.tipo === "valida" && fila.fVenc.fecha < limite) {
      precioPlanOriginalUSD = precioPlanUSD;
      planNombre = PLANES_REALES[precioRealMasCercano(precioPlanUSD)].nombre;
      planLegacy = false;
      flags.push("plan-aproximado");
    }
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
  const diasCiclo = Object.values(PLANES_REALES).find((p) => p.nombre === planNombre)?.diasCiclo ?? diasCicloMensual();
  fechaInicio.setUTCDate(fechaInicio.getUTCDate() - diasCiclo);

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
    ...(precioPlanOriginalUSD !== undefined ? { precioPlanOriginalUSD } : {}),
    estado: fila.estado,
    fechaVencimiento,
    fechaInicio,
    fechaUltimoPago,
    pago,
  };

  const filaFusionadaDescartada =
    parDuplicado?.fusionar === true
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
