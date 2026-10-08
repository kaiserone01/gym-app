import { describe, expect, it } from "vitest";
import { fondoFicha } from "./tonos";

describe("fondoFicha", () => {
  it("sin opacidad o al 100 % usa el token de superficie", () => {
    expect(fondoFicha()).toBe("var(--gx-surface)");
    expect(fondoFicha(100)).toBe("var(--gx-surface)");
  });

  it("por debajo de 100 usa rgba con esa transparencia", () => {
    expect(fondoFicha(60)).toBe("rgba(18, 22, 13, 0.6)");
    expect(fondoFicha(20)).toBe("rgba(18, 22, 13, 0.2)");
  });
});
