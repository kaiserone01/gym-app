import { describe, expect, test } from "vitest";
import { anularPago } from "./AnularPago";
import type { Pago } from "../entities/Pago";

function crearDeps(opciones: { grupoPagoId?: string | null; vigentesEnElGrupo?: number } = {}) {
  const { grupoPagoId = "g1", vigentesEnElGrupo = 0 } = opciones;
  const pago = { id: "p1", grupoPagoId, anuladoEn: null } as unknown as Pago;
  const anuladas: string[] = [];
  const reabiertos: string[] = [];

  const deps = {
    pagos: {
      buscarPorId: async () => pago,
      anular: async (_org: string, id: string) => {
        anuladas.push(id);
        return pago;
      },
      contarVigentesPorGrupo: async () => vigentesEnElGrupo,
    },
    deudas: {
      reabrirPorGrupo: async (grupo: string) => {
        reabiertos.push(grupo);
        return 1;
      },
    },
    autorizacion: { tienePermiso: async () => true },
  } as unknown as Parameters<typeof anularPago>[0];

  return { deps, anuladas, reabiertos };
}

const input = { organizacionId: "org", pagoId: "p1", anuladoPorId: "u1", rolAnulador: "SOCIO" as const, motivo: "método equivocado" };

describe("anularPago y deudas cobradas", () => {
  test("al anular el último pago vigente de un cobro de deudas, las deudas vuelven a pendiente", async () => {
    const { deps, anuladas, reabiertos } = crearDeps({ vigentesEnElGrupo: 0 });
    await anularPago(deps, input);
    expect(anuladas).toEqual(["p1"]);
    expect(reabiertos).toEqual(["g1"]);
  });

  test("si quedan otras líneas vigentes del mismo cobro, las deudas siguen cobradas", async () => {
    const { deps, reabiertos } = crearDeps({ vigentesEnElGrupo: 1 });
    await anularPago(deps, input);
    expect(reabiertos).toEqual([]);
  });

  test("un pago sin grupo (pago normal de membresía) no toca deudas", async () => {
    const { deps, reabiertos } = crearDeps({ grupoPagoId: null });
    await anularPago(deps, input);
    expect(reabiertos).toEqual([]);
  });
});
