// packages/db/migracion-excel/normalizarFila.ts
import type { ClasificacionPlan, EstadoSuscripcionNormalizado, FilaExcelCruda, FilaNormalizada, ResultadoFecha } from "./tipos";

const VALORES_PLAN_DOMINANTES = [20, 8, 25, 30, 22];

export function normalizarStatus(valor: string): EstadoSuscripcionNormalizado {
  const limpio = valor.trim().toUpperCase();
  if (limpio === "") return null;
  if (limpio === "ACTIVO" || limpio === "ACTIVA") return "ACTIVA";
  if (limpio === "S/V") return "VENCIDA";
  return null;
}

export function clasificarValorPlan(valor: string | number | null): ClasificacionPlan {
  if (valor === null) return { tipo: "requiereMapeo", valorOriginal: "" };

  const comoTexto = String(valor).trim();
  if (comoTexto === "") return { tipo: "requiereMapeo", valorOriginal: "" };

  // Solo un número puro (sin asterisco, sin +, sin letras) puede ser "dominante".
  const esNumeroPuro = /^-?\d+(\.\d+)?$/.test(comoTexto);
  if (esNumeroPuro) {
    const numero = Number(comoTexto);
    if (VALORES_PLAN_DOMINANTES.includes(numero)) {
      return { tipo: "dominante", valorUSD: numero };
    }
  }

  return { tipo: "requiereMapeo", valorOriginal: comoTexto };
}

export function excelSerialADate(serial: number): Date {
  // Excel epoch: día 0 = 1899-12-30 (compensa el bug histórico del año bisiesto 1900).
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + serial * 86400000);
}

export function parsearFechaExcel(valor: string | number | null): ResultadoFecha {
  if (valor === null) return { tipo: "invalida", motivo: "vacia", valorOriginal: null };

  if (typeof valor === "number") {
    return { tipo: "valida", fecha: excelSerialADate(valor) };
  }

  const texto = valor.trim();
  if (texto === "") return { tipo: "invalida", motivo: "vacia", valorOriginal: valor };

  const match = texto.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return { tipo: "invalida", motivo: "malformada", valorOriginal: valor };

  const [, dia, mes, anio] = match;
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  return { tipo: "valida", fecha };
}

export function normalizarFila(fila: FilaExcelCruda): FilaNormalizada {
  const cedulaTexto = fila.cedula === null ? "" : String(fila.cedula).trim();
  const celularTexto = fila.celular === null ? "" : String(fila.celular).trim();

  let fechaPago: FilaNormalizada["fechaPago"];
  const fechaPagoParsed = parsearFechaExcel(fila.fechaPago);
  if (fechaPagoParsed.tipo === "valida") {
    fechaPago = { tipo: "fecha", fecha: fechaPagoParsed.fecha };
  } else if (fechaPagoParsed.motivo === "vacia") {
    fechaPago = { tipo: "vacia" };
  } else {
    // "malformada" en FECHA PAGO significa: no es fecha en absoluto → nota de texto operativa.
    fechaPago = { tipo: "notaTexto", texto: String(fila.fechaPago).trim() };
  }

  return {
    numeroFila: fila.numeroFila,
    nombre: fila.nombre.trim(),
    estado: normalizarStatus(fila.status),
    cedulaOriginal: cedulaTexto === "" ? null : cedulaTexto,
    celularOriginal: celularTexto === "" ? null : celularTexto,
    plan: clasificarValorPlan(fila.plan),
    fVenc: parsearFechaExcel(fila.fVenc),
    fechaPago,
  };
}
