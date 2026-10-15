import { describe, expect, test } from "vitest";
import { itemDePrueba } from "../entities/vitrinaItemDePrueba";
import { armarManifiesto, itemsDeManifiesto, urlsDeManifiesto } from "./manifiestoVitrina";

const AHORA = new Date("2026-10-15T16:00:00Z");
const ajustes = { duracionSeg: 12, transicion: "FUNDIDO" as const, version: 7 };
const armar = (items: ReturnType<typeof itemDePrueba>[], tasaBcv = null as { valor: number; fecha: string } | null) =>
  armarManifiesto({ items, ajustes, tasaBcv, ahora: AHORA });

describe("armarManifiesto", () => {
  test("excluye inactivos y vencidos, mantiene los futuros", () => {
    const m = armar([
      itemDePrueba({ id: "activo", orden: 1 }),
      itemDePrueba({ id: "inactivo", orden: 2, activo: false }),
      itemDePrueba({ id: "vencido", orden: 3, fin: new Date("2026-10-10T00:00:00Z") }),
      itemDePrueba({ id: "futuro", orden: 4, inicio: new Date("2026-11-01T00:00:00Z") }),
    ]);
    expect(m.items.map((i) => i.id)).toEqual(["activo", "futuro"]);
  });

  test("copia versión, ajustes, tasa y la hora del servidor", () => {
    const tasa = { valor: 40.5, fecha: "2026-10-15T00:00:00.000Z" };
    const m = armar([], tasa);
    expect(m).toMatchObject({ version: 7, duracionSeg: 12, transicion: "FUNDIDO", tasaBcv: tasa, items: [] });
    expect(m.servidorAhora).toBe("2026-10-15T16:00:00.000Z");
  });

  test("ordena por orden y serializa las fechas en ISO", () => {
    const m = armar([
      itemDePrueba({ id: "b", orden: 2 }),
      itemDePrueba({ id: "a", orden: 1, inicio: new Date("2026-10-01T04:00:00Z"), fin: new Date("2026-10-31T03:59:59.999Z") }),
    ]);
    expect(m.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(m.items[0].inicio).toBe("2026-10-01T04:00:00.000Z");
    expect(m.items[0].fin).toBe("2026-10-31T03:59:59.999Z");
    expect(m.items[1].inicio).toBeNull();
  });
});

describe("itemsDeManifiesto", () => {
  test("revive las fechas", () => {
    const original = itemDePrueba({ id: "a", inicio: new Date("2026-10-01T04:00:00Z"), fin: new Date("2026-10-31T03:59:59.999Z") });
    const [item] = itemsDeManifiesto(JSON.parse(JSON.stringify(armar([original]))));
    expect(item.inicio).toEqual(original.inicio);
    expect(item.fin).toEqual(original.fin);
    expect(item.activo).toBe(true);
  });
});

describe("urlsDeManifiesto", () => {
  test("incluye medios y pósters, sin repetir ni nulos", () => {
    const m = armar([
      itemDePrueba({ id: "a", orden: 1, mediaUrl: "https://r2.test/vitrina/a.mp4", mediaTipo: "VIDEO", posterUrl: "https://r2.test/vitrina/a.jpg" }),
      itemDePrueba({ id: "b", orden: 2, mediaUrl: "https://r2.test/vitrina/b.webp" }),
      itemDePrueba({ id: "c", orden: 3, mediaUrl: "https://r2.test/vitrina/b.webp" }),
    ]);
    expect(urlsDeManifiesto(m).sort()).toEqual([
      "https://r2.test/vitrina/a.jpg",
      "https://r2.test/vitrina/a.mp4",
      "https://r2.test/vitrina/b.webp",
    ]);
  });
});
