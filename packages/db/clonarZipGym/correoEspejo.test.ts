import { describe, expect, test } from "vitest";
import { correoEspejo } from "./correoEspejo";

describe("correoEspejo", () => {
  test("cambia el dominio por @zipgym.local conservando la parte local", () => {
    expect(correoEspejo("jorge@gym.com", new Set())).toBe("jorge@zipgym.local");
  });

  test("pasa la parte local a minúsculas", () => {
    expect(correoEspejo("Jelias@gymdemo.com", new Set())).toBe("jelias@zipgym.local");
  });

  test("entrenador interno recibe un uuid nuevo (dominio en cualquier mayúscula)", () => {
    const usados = new Set<string>();
    expect(correoEspejo("entrenador-viejo@sinacceso.interno", usados, () => "uuid-1")).toBe("entrenador-uuid-1@sinacceso.interno");
    expect(correoEspejo("entrenador-otro@SinAcceso.Interno", usados, () => "uuid-2")).toBe("entrenador-uuid-2@sinacceso.interno");
    expect(usados.has("entrenador-uuid-1@sinacceso.interno")).toBe(true);
  });

  test("desambigua con sufijo numérico si dos orígenes dan el mismo correo", () => {
    const usados = new Set<string>();
    expect(correoEspejo("jorge@gym.com", usados)).toBe("jorge@zipgym.local");
    expect(correoEspejo("jorge@gymdemo.com", usados)).toBe("jorge-2@zipgym.local");
    expect(correoEspejo("JORGE@otro.com", usados)).toBe("jorge-3@zipgym.local");
  });

  test("respeta los correos ya ocupados en la base y registra el resultado", () => {
    const usados = new Set(["socio@zipgym.local"]);
    expect(correoEspejo("socio@gymdemo.com", usados)).toBe("socio-2@zipgym.local");
    expect(usados.has("socio-2@zipgym.local")).toBe(true);
  });

  test("los correos ajenos a @zipgym.local en el conjunto no provocan sufijo ni se alteran", () => {
    const usados = new Set(["jorge@gym.com", "zipnegocios@gmail.com"]);
    expect(correoEspejo("jorge@gym.com", usados)).toBe("jorge@zipgym.local");
    expect(usados.has("jorge@gym.com")).toBe(true);
    expect(usados.has("zipnegocios@gmail.com")).toBe(true);
  });

  test("correo sin @ lanza error", () => {
    expect(() => correoEspejo("sin-arroba", new Set())).toThrow(/correo/i);
  });
});
