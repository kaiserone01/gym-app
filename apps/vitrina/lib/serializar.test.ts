import { describe, expect, test } from "vitest";
import { crearSerializador } from "./serializar";

// Tarea con promesas controladas: cada ejecución queda esperando hasta que la prueba la resuelva o rechace.
function tareaControlada() {
  const pendientes: { resolver: () => void; rechazar: (e: Error) => void }[] = [];
  let ejecuciones = 0;
  const tarea = () => {
    ejecuciones++;
    return new Promise<void>((resolver, rechazar) => pendientes.push({ resolver, rechazar }));
  };
  return { tarea, pendientes, ejecuciones: () => ejecuciones };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("crearSerializador", () => {
  test("una llamada simple ejecuta la tarea una vez", async () => {
    const t = tareaControlada();
    const lanzar = crearSerializador(t.tarea);
    const fin = lanzar();
    t.pendientes[0].resolver();
    await fin;
    expect(t.ejecuciones()).toBe(1);
  });

  test("un aviso durante la ejecución provoca exactamente una repetición", async () => {
    const t = tareaControlada();
    const lanzar = crearSerializador(t.tarea);
    const fin = lanzar();
    void lanzar();
    t.pendientes[0].resolver();
    await tick();
    expect(t.ejecuciones()).toBe(2);
    t.pendientes[1].resolver();
    await fin;
    expect(t.ejecuciones()).toBe(2);
  });

  test("varios avisos durante la ejecución se fusionan en una sola repetición", async () => {
    const t = tareaControlada();
    const lanzar = crearSerializador(t.tarea);
    const fin = lanzar();
    void lanzar();
    void lanzar();
    void lanzar();
    t.pendientes[0].resolver();
    await tick();
    t.pendientes[1].resolver();
    await fin;
    expect(t.ejecuciones()).toBe(2);
  });

  test("un error no bloquea las siguientes llamadas", async () => {
    const t = tareaControlada();
    const lanzar = crearSerializador(t.tarea);
    const primera = lanzar();
    t.pendientes[0].rechazar(new Error("sin red"));
    await primera;
    const segunda = lanzar();
    expect(t.ejecuciones()).toBe(2);
    t.pendientes[1].resolver();
    await segunda;
  });
});
