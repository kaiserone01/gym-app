import { describe, expect, it } from "vitest";
import { claveDeFragmento } from "./config";

describe("claveDeFragmento", () => {
  it("lee la clave del fragmento", () => {
    expect(claveDeFragmento("#clave=abc123")).toBe("abc123");
  });
  it("decodifica y recorta espacios", () => {
    expect(claveDeFragmento("#clave=%20a%2Bb%20")).toBe("a+b");
  });
  it("devuelve cadena vacía sin fragmento o sin clave", () => {
    expect(claveDeFragmento("")).toBe("");
    expect(claveDeFragmento("#otra=1")).toBe("");
    expect(claveDeFragmento("#clave=")).toBe("");
  });
});
