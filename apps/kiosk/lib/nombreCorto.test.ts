import { describe, expect, it } from "vitest";
import { nombreCorto } from "./nombreCorto";

describe("nombreCorto", () => {
  it("deja intactos los nombres de una o dos palabras", () => {
    expect(nombreCorto("Misael")).toBe("Misael");
    expect(nombreCorto("Misael Granado")).toBe("Misael Granado");
  });

  it("con tres palabras toma nombre y primer apellido", () => {
    expect(nombreCorto("Camila Ledezma Barrios")).toBe("Camila Ledezma");
  });

  it("con cuatro o más palabras salta el segundo nombre", () => {
    expect(nombreCorto("María José Pérez Gómez")).toBe("María Pérez");
  });

  it("ignora espacios repetidos y de los bordes", () => {
    expect(nombreCorto("  Ana   Gil ")).toBe("Ana Gil");
    expect(nombreCorto("")).toBe("");
  });
});
