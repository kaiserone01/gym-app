// packages/db/migracion-excel/config.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { FilaNormalizada, MapeoPlanEntry, ReglasCedula } from "./tipos";

export function generarTemplateMapeoPlan(filas: FilaNormalizada[]): MapeoPlanEntry[] {
  const valoresVistos = new Set<string>();
  const entradas: MapeoPlanEntry[] = [];

  for (const fila of filas) {
    if (fila.plan.tipo !== "requiereMapeo") continue;
    if (valoresVistos.has(fila.plan.valorOriginal)) continue;
    valoresVistos.add(fila.plan.valorOriginal);
    entradas.push({ valorExcel: fila.plan.valorOriginal, accion: "pendiente" });
  }

  return entradas;
}

function similitudNombre(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[^a-záéíóúñ]/gi, "");
  const normB = b.toLowerCase().replace(/[^a-záéíóúñ]/gi, "");
  if (normA === normB) return 1;
  const largo = Math.max(normA.length, normB.length);
  if (largo === 0) return 0;
  let coincidencias = 0;
  for (let i = 0; i < Math.min(normA.length, normB.length); i++) {
    if (normA[i] === normB[i]) coincidencias++;
  }
  return coincidencias / largo;
}

export function generarTemplateReglasCedula(filas: FilaNormalizada[]): ReglasCedula {
  const porCedula = new Map<string, FilaNormalizada[]>();
  for (const fila of filas) {
    if (fila.cedulaOriginal === null) continue;
    const lista = porCedula.get(fila.cedulaOriginal) ?? [];
    lista.push(fila);
    porCedula.set(fila.cedulaOriginal, lista);
  }

  const duplicados: ReglasCedula["duplicados"] = [];
  for (const [cedula, lista] of porCedula) {
    if (lista.length !== 2) continue;
    const [a, b] = lista;
    const similitud = similitudNombre(a.nombre, b.nombre);
    const filaGanadora = a.nombre.length >= b.nombre.length ? a.numeroFila : b.numeroFila;
    duplicados.push({
      cedula,
      filaA: a.numeroFila,
      filaB: b.numeroFila,
      fusionar: similitud >= 0.6,
      filaGanadora,
    });
  }

  return { vaciaAccion: "placeholder", duplicados };
}

export function cargarOCrearConfig<T>(rutaArchivo: string, generador: () => T): T {
  if (existsSync(rutaArchivo)) {
    return JSON.parse(readFileSync(rutaArchivo, "utf-8")) as T;
  }
  const valor = generador();
  writeFileSync(rutaArchivo, JSON.stringify(valor, null, 2), "utf-8");
  return valor;
}
