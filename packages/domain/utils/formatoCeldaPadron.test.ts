import { describe, expect, it } from "vitest";
import { formatearCeldaPadron } from "./formatoCeldaPadron";

describe("formatearCeldaPadron", () => {
  it("muestra una fecha ISO real como dd/mm/aaaa", () => {
    expect(formatearCeldaPadron("2026-08-19")).toBe("19/08/2026");
  });

  it("deja el texto libre intacto, con sus espacios", () => {
    expect(formatearCeldaPadron("resta 7 ")).toBe("resta 7 ");
    expect(formatearCeldaPadron("VIRGEN DEL VALLE")).toBe("VIRGEN DEL VALLE");
  });

  it("deja intacta una fecha mal escrita", () => {
    expect(formatearCeldaPadron("19-082026")).toBe("19-082026");
  });

  it("null se muestra vacío", () => {
    expect(formatearCeldaPadron(null)).toBe("");
  });

  it("deja intacta una fecha ISO inexistente", () => {
    expect(formatearCeldaPadron("2026-02-30")).toBe("2026-02-30");
  });
});
