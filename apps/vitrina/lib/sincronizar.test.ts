import { describe, expect, test } from "vitest";
import { itemDePrueba } from "@gym-app/domain/entities/vitrinaItemDePrueba";
import { armarManifiesto } from "@gym-app/domain/services/manifiestoVitrina";
import type { Almacen } from "./almacen";
import { sincronizar } from "./sincronizar";

function fakeAlmacen(inicial: string[] = [], fallan: string[] = []) {
  const guardadas = new Set(inicial);
  const llamadas: string[] = [];
  const almacen: Almacen & { guardadas: Set<string>; llamadas: string[] } = {
    guardadas,
    llamadas,
    async iniciar() {},
    rutaLocal: (url) => (guardadas.has(url) ? `local:${url}` : null),
    async guardar(url) {
      llamadas.push(`guardar:${url}`);
      if (fallan.includes(url)) throw new Error("sin red");
      guardadas.add(url);
    },
    async eliminar(url) {
      llamadas.push(`eliminar:${url}`);
      guardadas.delete(url);
    },
    async listar() {
      return [...guardadas];
    },
  };
  return almacen;
}

const manifiestoCon = (...urls: string[]) =>
  armarManifiesto({
    items: urls.map((mediaUrl, i) => itemDePrueba({ id: `i${i}`, orden: i, mediaUrl })),
    ajustes: { duracionSeg: 12, transicion: "FUNDIDO", version: 1 },
    tasaBcv: null,
    ahora: new Date("2026-10-15T16:00:00Z"),
  });

describe("sincronizar", () => {
  test("descarga solo lo que falta", async () => {
    const almacen = fakeAlmacen(["https://r/a.webp"]);
    const resultado = await sincronizar(manifiestoCon("https://r/a.webp", "https://r/b.webp"), almacen);
    expect(resultado).toMatchObject({ completo: true, descargadas: ["https://r/b.webp"], eliminadas: [], fallidas: [] });
  });

  test("borra del disco lo que ya no está en el manifiesto (pieza sustituida, retirada o vencida)", async () => {
    const almacen = fakeAlmacen(["https://r/vieja.webp"]);
    const resultado = await sincronizar(manifiestoCon("https://r/nueva.webp"), almacen);
    expect(resultado.eliminadas).toEqual(["https://r/vieja.webp"]);
    expect([...almacen.guardadas]).toEqual(["https://r/nueva.webp"]);
  });

  test("sin cambios no descarga ni borra nada", async () => {
    const almacen = fakeAlmacen(["https://r/a.webp"]);
    await sincronizar(manifiestoCon("https://r/a.webp"), almacen);
    expect(almacen.llamadas).toEqual([]);
  });

  test("si una descarga falla no borra NADA (lo viejo sigue en pantalla), continúa con las demás y marca incompleto", async () => {
    const almacen = fakeAlmacen(["https://r/vieja.webp"], ["https://r/nueva1.webp"]);
    const resultado = await sincronizar(manifiestoCon("https://r/nueva1.webp", "https://r/nueva2.webp"), almacen);
    expect(resultado.completo).toBe(false);
    expect(resultado.fallidas).toEqual(["https://r/nueva1.webp"]);
    expect(resultado.descargadas).toEqual(["https://r/nueva2.webp"]);
    expect(resultado.eliminadas).toEqual([]);
    expect(almacen.guardadas.has("https://r/vieja.webp")).toBe(true);
  });

  test("incluye los pósters y descarga cada URL una sola vez", async () => {
    const manifiesto = armarManifiesto({
      items: [
        itemDePrueba({ id: "a", orden: 1, mediaUrl: "https://r/a.mp4", mediaTipo: "VIDEO", posterUrl: "https://r/a.jpg" }),
        itemDePrueba({ id: "b", orden: 2, mediaUrl: "https://r/a.jpg" }),
      ],
      ajustes: { duracionSeg: 12, transicion: "FUNDIDO", version: 1 },
      tasaBcv: null,
      ahora: new Date("2026-10-15T16:00:00Z"),
    });
    const almacen = fakeAlmacen();
    await sincronizar(manifiesto, almacen);
    expect(almacen.llamadas.sort()).toEqual(["guardar:https://r/a.jpg", "guardar:https://r/a.mp4"]);
  });

  test("orden: descargas → manifiesto adoptado → eliminaciones, con una pieza conservada, una nueva y una obsoleta", async () => {
    const almacen = fakeAlmacen(["https://r/conservada.webp", "https://r/obsoleta.webp"]);
    const orden: string[] = [];
    const guardarOriginal = almacen.guardar;
    const eliminarOriginal = almacen.eliminar;
    almacen.guardar = async (url) => {
      orden.push(`guardar:${url}`);
      await guardarOriginal(url);
    };
    almacen.eliminar = async (url) => {
      orden.push(`eliminar:${url}`);
      await eliminarOriginal(url);
    };
    const resultado = await sincronizar(manifiestoCon("https://r/conservada.webp", "https://r/nueva.webp"), almacen, () => {
      orden.push("adoptado");
    });
    expect(orden).toEqual(["guardar:https://r/nueva.webp", "adoptado", "eliminar:https://r/obsoleta.webp"]);
    expect(resultado).toMatchObject({ completo: true, descargadas: ["https://r/nueva.webp"], eliminadas: ["https://r/obsoleta.webp"] });
    expect([...almacen.guardadas].sort()).toEqual(["https://r/conservada.webp", "https://r/nueva.webp"]);
  });

  test("con una descarga fallida no se adopta el manifiesto ni se elimina nada", async () => {
    const almacen = fakeAlmacen(["https://r/vieja.webp"], ["https://r/nueva.webp"]);
    let adoptado = false;
    await sincronizar(manifiestoCon("https://r/nueva.webp"), almacen, () => {
      adoptado = true;
    });
    expect(adoptado).toBe(false);
    expect(almacen.llamadas.some((l) => l.startsWith("eliminar:"))).toBe(false);
  });

  test("si adoptar el manifiesto lanza, no se borra nada", async () => {
    const almacen = fakeAlmacen(["https://r/vieja.webp"]);
    await expect(
      sincronizar(manifiestoCon("https://r/nueva.webp"), almacen, () => {
        throw new Error("cancelado");
      })
    ).rejects.toThrow("cancelado");
    expect(almacen.guardadas.has("https://r/vieja.webp")).toBe(true);
  });

  test("un eliminar que falla se tolera: las demás se borran y sigue completo", async () => {
    const almacen = fakeAlmacen(["https://r/o1.webp", "https://r/o2.webp"]);
    const eliminarOriginal = almacen.eliminar;
    almacen.eliminar = async (url) => {
      if (url === "https://r/o1.webp") throw new Error("disco");
      await eliminarOriginal(url);
    };
    const resultado = await sincronizar(manifiestoCon("https://r/nueva.webp"), almacen);
    expect(resultado.completo).toBe(true);
    expect(resultado.eliminadas).toEqual(["https://r/o2.webp"]);
  });

  test("un manifiesto vacío borra todo lo guardado", async () => {
    const almacen = fakeAlmacen(["https://r/a.webp"]);
    const resultado = await sincronizar(manifiestoCon(), almacen);
    expect(resultado.completo).toBe(true);
    expect(almacen.guardadas.size).toBe(0);
  });
});
