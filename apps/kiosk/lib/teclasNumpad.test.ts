import { describe, expect, it } from "vitest";
import { mensajeDeTecla } from "./teclasNumpad";

describe("mensajeDeTecla", () => {
  it("convierte Numpad0-9 en dígitos", () => {
    expect(mensajeDeTecla({ code: "Numpad0" })).toEqual({ type: "digit", value: "0" });
    expect(mensajeDeTecla({ code: "Numpad7" })).toEqual({ type: "digit", value: "7" });
  });

  it("mapea Enter del numpad, Backspace y Escape", () => {
    expect(mensajeDeTecla({ code: "NumpadEnter" })).toEqual({ type: "enter" });
    expect(mensajeDeTecla({ code: "Backspace" })).toEqual({ type: "backspace" });
    expect(mensajeDeTecla({ code: "Escape" })).toEqual({ type: "clear" });
  });

  it("ignora la fila numérica, el Enter normal y otras teclas del numpad", () => {
    expect(mensajeDeTecla({ code: "Digit1" })).toBeNull();
    expect(mensajeDeTecla({ code: "Enter" })).toBeNull();
    expect(mensajeDeTecla({ code: "NumpadAdd" })).toBeNull();
    expect(mensajeDeTecla({ code: "KeyA" })).toBeNull();
  });
});
