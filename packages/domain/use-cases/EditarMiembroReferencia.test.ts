import { describe, expect, test } from "vitest";
import {
  editarMiembroReferencia, EdicionInvalidaError, MiembroYaActivadoError, ReferenciaNoEncontradaError, RolNoAutorizadoError,
  type EditarMiembroReferenciaDeps,
} from "./EditarMiembroReferencia";
import type { MiembroReferencia } from "../entities/MiembroReferencia";

const base: MiembroReferencia = {
  id: "r1", organizacionId: "org", sucursalId: "principal", cedula: "123", numeroFila: 5, nombre: "Ana Pérez",
  status: "ACTIVO", fNacimiento: null, celular: "0414", fVenc: "2026-10-01", fechaPago: null, plan: "30",
  fechaVencimiento: new Date("2026-10-01T00:00:00Z"), fechaUltimoPago: null, fechaNacimiento: null,
  planNombre: "Mensual con entrenador", precioPlanUSD: 30, archivoOrigen: "x.xlsm", importadoAt: new Date(),
  camposEditados: [], editadoAt: null, editadoPor: null,
  colI: null, colJ: null, colK: null, estilos: null, resaltado: null, resaltadoEditado: false,
};
const input = { organizacionId: "org", sucursalId: "principal", cedula: "123", usuarioId: "u1", usuarioNombre: "Jorge", cambios: {} };

function crearDeps(opciones: { permitido?: boolean; referencia?: Partial<MiembroReferencia> | null; esMiembro?: boolean } = {}) {
  const escrituras: unknown[] = [];
  const deps = {
    autorizacion: { tienePermiso: async () => opciones.permitido ?? true },
    miembros: { buscarPorOrganizacionYCedula: async () => (opciones.esMiembro ? { id: "m1" } : null) },
    referencias: {
      buscarPorCedula: async () => (opciones.referencia === null ? null : { ...base, ...opciones.referencia }),
      actualizarEdicion: async (id: string, datos: unknown) => {
        escrituras.push({ id, datos });
        return { ...base, ...(datos as object) } as MiembroReferencia;
      },
    },
  } as unknown as EditarMiembroReferenciaDeps;
  return { deps, escrituras };
}

describe("editarMiembroReferencia", () => {
  test("sin permiso MIEMBROS/EDITAR", async () => {
    await expect(editarMiembroReferencia(crearDeps({ permitido: false }).deps, input)).rejects.toBeInstanceOf(RolNoAutorizadoError);
  });
  test("no existe o es de otra sede", async () => {
    await expect(editarMiembroReferencia(crearDeps({ referencia: null }).deps, input)).rejects.toBeInstanceOf(ReferenciaNoEncontradaError);
    await expect(editarMiembroReferencia(crearDeps().deps, { ...input, sucursalId: "otra" })).rejects.toBeInstanceOf(ReferenciaNoEncontradaError);
  });
  test("si ya es miembro se bloquea y se manda a la ficha", async () => {
    const error = await editarMiembroReferencia(crearDeps({ esMiembro: true }).deps, { ...input, cambios: { celular: "1" } }).catch((e) => e);
    expect(error).toBeInstanceOf(MiembroYaActivadoError);
    expect(error.message).toContain("ficha");
  });
  test("nombre vacío y fechas inválidas se rechazan", async () => {
    const { deps } = crearDeps();
    await expect(editarMiembroReferencia(deps, { ...input, cambios: { nombre: "  " } })).rejects.toBeInstanceOf(EdicionInvalidaError);
    await expect(editarMiembroReferencia(deps, { ...input, cambios: { fVenc: "mañana" } })).rejects.toBeInstanceOf(EdicionInvalidaError);
    await expect(editarMiembroReferencia(deps, { ...input, cambios: { fNacimiento: "31-02-2026" } })).rejects.toBeInstanceOf(EdicionInvalidaError);
  });
  test("edita, recalcula las normalizadas y registra quién y qué campos", async () => {
    const { deps, escrituras } = crearDeps();
    await editarMiembroReferencia(deps, { ...input, cambios: { fVenc: "01-12-2026", plan: "25", celular: "  0416  " } });
    const { id, datos } = escrituras[0] as { id: string; datos: any };
    expect(id).toBe("r1");
    expect(datos.crudos).toEqual({ fVenc: "01-12-2026", plan: "25", celular: "0416" });
    expect(datos.normalizados.fechaVencimiento).toEqual(new Date("2026-12-01T00:00:00Z"));
    expect(datos.normalizados.planNombre).toBe("Mensual sin entrenador");
    expect(datos.camposEditados.sort()).toEqual(["celular", "fVenc", "plan"]);
    expect(datos.editadoPor).toBe("Jorge");
  });
  test("vaciar la fecha de vencimiento la deja en null; los campos editados previos se conservan", async () => {
    const { deps, escrituras } = crearDeps({ referencia: { camposEditados: ["status"] } });
    await editarMiembroReferencia(deps, { ...input, cambios: { fVenc: "" } });
    const { datos } = escrituras[0] as { datos: any };
    expect(datos.crudos).toEqual({ fVenc: null });
    expect(datos.normalizados.fechaVencimiento).toBeNull();
    expect(datos.camposEditados.sort()).toEqual(["fVenc", "status"]);
  });
  test("sin cambios reales no escribe", async () => {
    const { deps, escrituras } = crearDeps();
    await editarMiembroReferencia(deps, { ...input, cambios: { celular: "0414", nombre: "Ana Pérez" } });
    expect(escrituras).toEqual([]);
  });
  test("una clave fuera de la lista (cédula) se ignora y no escribe", async () => {
    const { deps, escrituras } = crearDeps();
    await editarMiembroReferencia(deps, { ...input, cambios: { cedula: "999" } as any });
    expect(escrituras).toEqual([]);
  });
  test("una fecha de nacimiento aaaa-mm-dd válida se acepta y se normaliza", async () => {
    const { deps, escrituras } = crearDeps();
    await editarMiembroReferencia(deps, { ...input, cambios: { fNacimiento: "1990-05-17" } });
    const { datos } = escrituras[0] as { datos: any };
    expect(datos.crudos).toEqual({ fNacimiento: "1990-05-17" });
    expect(datos.normalizados.fechaNacimiento).toEqual(new Date("1990-05-17T00:00:00Z"));
  });
  test("colJ es texto libre: va en crudos y camposEditados sin normalizar fecha", async () => {
    const { deps, escrituras } = crearDeps();
    await editarMiembroReferencia(deps, { ...input, cambios: { colJ: "  mañana  " } });
    const { datos } = escrituras[0] as { datos: any };
    expect(datos.crudos).toEqual({ colJ: "mañana" });
    expect(datos.camposEditados).toEqual(["colJ"]);
    expect(datos.resaltado).toBeUndefined();
  });
  test("resaltado válido: envía resaltado sin tocar camposEditados ni normalizados", async () => {
    const { deps, escrituras } = crearDeps({ referencia: { camposEditados: ["status"] } });
    await editarMiembroReferencia(deps, { ...input, cambios: { resaltado: "FFFF00" } });
    const { datos } = escrituras[0] as { datos: any };
    expect(datos.resaltado).toBe("FFFF00");
    expect(datos.crudos).toEqual({});
    expect(datos.normalizados).toBeUndefined();
    expect(datos.camposEditados).toBeUndefined();
  });
  test("resaltado fuera de la paleta se rechaza", async () => {
    const error = await editarMiembroReferencia(crearDeps().deps, { ...input, cambios: { resaltado: "123456" } }).catch((e) => e);
    expect(error).toBeInstanceOf(EdicionInvalidaError);
    expect(error.message).toBe("Color de resaltado no permitido.");
  });
  test("quitar el color (null) cuando había color", async () => {
    const { deps, escrituras } = crearDeps({ referencia: { resaltado: "FFFF00" } });
    await editarMiembroReferencia(deps, { ...input, cambios: { resaltado: null } });
    const { datos } = escrituras[0] as { datos: any };
    expect(datos.resaltado).toBeNull();
  });
  test("resaltado igual al actual no escribe", async () => {
    const { deps, escrituras } = crearDeps({ referencia: { resaltado: "FFFF00" } });
    await editarMiembroReferencia(deps, { ...input, cambios: { resaltado: "FFFF00" } });
    expect(escrituras).toEqual([]);
  });
  test("texto y resaltado juntos en una sola escritura", async () => {
    const { deps, escrituras } = crearDeps();
    await editarMiembroReferencia(deps, { ...input, cambios: { celular: "0416", resaltado: "92D050" } });
    expect(escrituras).toHaveLength(1);
    const { datos } = escrituras[0] as { datos: any };
    expect(datos.crudos).toEqual({ celular: "0416" });
    expect(datos.resaltado).toBe("92D050");
    expect(datos.camposEditados).toEqual(["celular"]);
    expect(datos.normalizados).toBeDefined();
  });
});
