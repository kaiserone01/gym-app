import { describe, expect, it } from "vitest";
import { claveDeFragmento } from "./claveFragmento";

describe("claveDeFragmento", () => {
  it("lee la clave de #clave=...", () => {
    expect(claveDeFragmento("#clave=abc123")).toBe("abc123");
    expect(claveDeFragmento("clave=abc123")).toBe("abc123");
  });

  it("decodifica los caracteres especiales que codificó encodeURIComponent", () => {
    expect(claveDeFragmento(`#clave=${encodeURIComponent("a+b/c=d&e#f g")}`)).toBe("a+b/c=d&e#f g");
  });

  it("quita espacios sobrantes de los bordes", () => {
    expect(claveDeFragmento("#clave=%20abc%20")).toBe("abc");
  });

  it("devuelve null si no hay clave", () => {
    expect(claveDeFragmento("")).toBeNull();
    expect(claveDeFragmento("#")).toBeNull();
    expect(claveDeFragmento("#clave=")).toBeNull();
    expect(claveDeFragmento("#clave=%20")).toBeNull();
    expect(claveDeFragmento("#otra=1")).toBeNull();
  });
});
