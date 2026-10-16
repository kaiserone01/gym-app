import { describe, expect, test } from "vitest";
import { itemsReproducibles } from "./reproducibles";

describe("itemsReproducibles", () => {
  const items = [{ mediaUrl: "https://r/a.webp" }, { mediaUrl: "https://r/b.mp4" }, { mediaUrl: "https://r/c.webp" }];

  test("excluye los ítems cuyo medio no está en el almacén y conserva el orden", () => {
    const locales = new Set(["https://r/a.webp", "https://r/c.webp"]);
    expect(itemsReproducibles(items, (url) => locales.has(url))).toEqual([items[0], items[2]]);
  });

  test("si todos están, devuelve todos; si ninguno, lista vacía (pantalla de marca)", () => {
    expect(itemsReproducibles(items, () => true)).toEqual(items);
    expect(itemsReproducibles(items, () => false)).toEqual([]);
  });
});
