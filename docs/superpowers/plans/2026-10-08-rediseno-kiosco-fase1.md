# Rediseño del kiosco — Fase 1 (sin migración) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el kiosco muestre siempre una ficha de reposo de marca (con `placeholder-profile.jpg`) que gira en 3D hacia la ficha del miembro durante 7 s y vuelve sola, con video de fondo que reacciona al resultado y entrada de numpad por `keydown` para el TV.

**Architecture:** La lógica pura (nombre corto, cara de la ficha, bolsa de frases, reducer de pantalla, mapa de teclas) vive en `apps/kiosk/lib/` con tests Vitest; los componentes visuales son delgados y la página (`app/page.tsx`) solo conecta reducer, hooks y componentes. Un endpoint nuevo `GET /api/kiosco/estado` en `apps/web-admin` entrega sede y tasa BCV al reposo, con un helper CORS/auth compartido con `/api/checkin`.

**Tech Stack:** Next.js 16 (export estático) + React 19 + Tailwind 4 en `apps/kiosk`; Vitest 5.0.2 (nuevo en `apps/kiosk`); route handlers de Next en `apps/web-admin`; Prisma/dominio existentes (sin cambios de schema).

**Spec:** `docs/superpowers/specs/2026-10-08-rediseno-kiosco-design.md` (§3 estados, §4 caras, §5 coreografía, §6 frases, §7 API, §8 numpad, §10 Fase 1). Este plan cubre **solo la Fase 1**; las Fases 2 (saludo) y 3 (APK) tendrán planes propios.

## Global Constraints

- Sin migraciones ni cambios en `schema.prisma` en esta fase. Todo cambio al API es opcional/aditivo: un kiosco viejo debe seguir funcionando.
- WebView objetivo: Chromium 90+ → **sin** `color-mix()`, `:has`, `backdrop-filter` ni blur. Solo se animan `transform` y `opacity`.
- Ficha real: **7 s** con barra de cuenta regresiva (`DURACION_FICHA_MS = 7_000`); flip **~700 ms** con `cubic-bezier(0.34, 1.56, 0.64, 1)`; precarga de foto con espera máxima **1,5 s**; overscan **5 %** (`p-[5vmin]`).
- Umbral "por vencer": `UMBRAL_POR_VENCER_DIAS = 5` (activo con vencimiento ≤ 5 días).
- Entrada de numpad en APK: solo `event.code` `Numpad0`–`Numpad9`, `NumpadEnter`, `Backspace`, `Escape`; la fila numérica normal se ignora; sin `<input>` enfocado.
- La `@` solo aparece en "¡BIENVENID@, ADRENALINER!" (en F1 es el saludo fijo de la ficha, porque `saludo` aún no existe).
- Los textos de mensajes de `AccessCard` se conservan tal cual (incluido el voseo existente: "Tenés", "acercate").
- Rechazos y gracia muestran todo el detalle como hoy (decisión del usuario); nombre en pantalla = nombre + primer apellido (`nombreCorto`).
- Commits: **un solo renglón en español, sin firma ni trailers** (CLAUDE.md). Tras cada tarea: commit y `git push origin main` (preferencia guardada del usuario para este repo).
- `AGENTS.md` de `apps/kiosk` y `apps/web-admin` avisa que este Next.js tiene cambios incompatibles: antes de usar una API de Next que no esté ya usada en el repo, leer `node_modules/next/dist/docs/`. Este plan solo usa patrones ya presentes (`"use client"`, route handlers `GET/POST/OPTIONS`, `NextResponse`).

## Review Focus

1. **Escribir la cédula siguiente con una ficha visible** no debe cerrarla ni mostrar a medias datos de otra persona; la ficha solo se reemplaza por una respuesta nueva o por el fin de los 7 s (Task 4 `reducer`, Task 12 manual).
2. **Dos respuestas seguidas:** el temporizador de la ficha vieja no debe borrar la nueva (Task 4: test de `vencio` con `id` viejo).
3. **Foto lenta o rota:** si `fotoUrl` falla o tarda más de 1,5 s, la ficha gira igual y muestra iniciales (Task 7 `precargarFoto`, Task 9 `AccessCard`).
4. **Miembro `activo` con `fechaVencimiento` nula o ya pasada:** no debe romper ni marcarse "por vencer" (Task 2 tests).
5. **Sin red al arrancar / sin API de estado:** el reposo debe verse completo sin tasa ni sede (muestra "—"), y el kiosco nuevo no debe depender de campos que un API viejo no envía (Task 7 `useInfoKiosco`, Task 8 `FichaReposo`). Además, teclas fuera del numpad (`Digit1`, `Enter` normal, `NumpadAdd`) no deben escribir cédula (Task 5 tests).

---

### Task 1: Vitest en `apps/kiosk` + `nombreCorto`

**Files:**
- Modify: `apps/kiosk/package.json`
- Create: `apps/kiosk/lib/nombreCorto.ts`
- Test: `apps/kiosk/lib/nombreCorto.test.ts`

**Interfaces:**
- Produces: `nombreCorto(nombre: string): string` — usado por `AccessCard` (Task 9).

- [ ] **Step 1: Agregar Vitest al kiosco**

En `apps/kiosk/package.json`, añadir el script `"test": "vitest run"` dentro de `scripts` y `"vitest": "5.0.2"` en `devDependencies` (misma versión que `packages/domain`). Luego, desde la raíz:

Run: `npm install`
Expected: termina sin errores y `apps/kiosk` queda con vitest resuelto.

- [ ] **Step 2: Escribir el test que falla**

`apps/kiosk/lib/nombreCorto.test.ts`:

```ts
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
```

- [ ] **Step 3: Verificar que falla**

Run: `npm test --workspace apps/kiosk`
Expected: FAIL — no se puede resolver `./nombreCorto`.

- [ ] **Step 4: Implementar**

`apps/kiosk/lib/nombreCorto.ts`:

```ts
// Nombre + primer apellido para la pantalla pública: con 4 o más palabras se asume
// "Nombre Segundo Apellido1 Apellido2" y se toma la tercera; si no, la segunda.
export function nombreCorto(nombre: string): string {
  const partes = nombre.split(/\s+/).filter(Boolean);
  if (partes.length <= 2) return partes.join(" ");
  const apellido = partes.length >= 4 ? partes[2] : partes[1];
  return `${partes[0]} ${apellido}`;
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm test --workspace apps/kiosk`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/package.json package-lock.json apps/kiosk/lib/nombreCorto.ts apps/kiosk/lib/nombreCorto.test.ts
git commit -m "agrega vitest al kiosco y la función nombreCorto"
git push origin main
```

---

### Task 2: Cara de la ficha (`cara.ts`) y tonos de color

**Files:**
- Create: `apps/kiosk/lib/cara.ts`
- Create: `apps/kiosk/lib/tonos.ts`
- Test: `apps/kiosk/lib/cara.test.ts`

**Interfaces:**
- Consumes: `ResultadoCheckIn` de `apps/kiosk/lib/api.ts` (solo tipo).
- Produces (usados en Tasks 4, 8, 9):
  - `type CaraFicha = "permitido" | "por_vencer" | "en_gracia" | "vencido" | "abono_vencido" | "sucursal_incorrecta"`
  - `type Tono = "verde" | "ambar" | "rojo"`
  - `const UMBRAL_POR_VENCER_DIAS = 5`
  - `diasParaVencer(fechaVencimiento: string | null, ahora: Date): number | null`
  - `caraDeResultado(resultado: Pick<ResultadoCheckIn, "estado" | "fechaVencimiento">, ahora: Date): { cara: CaraFicha; diasParaVencer: number | null }`
  - `tonoDeCara(cara: CaraFicha): Tono`
  - `textoPorVencer(dias: number): string`
  - `COLOR_TONO: Record<Tono, { color: string; tinta: string; brillo: string }>` (en `tonos.ts`)

- [ ] **Step 1: Escribir el test que falla**

`apps/kiosk/lib/cara.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { caraDeResultado, diasParaVencer, textoPorVencer, tonoDeCara } from "./cara";

const AHORA = new Date("2026-10-08T12:00:00Z");
const enDias = (n: number) => new Date(AHORA.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

describe("diasParaVencer", () => {
  it("devuelve null sin fecha", () => {
    expect(diasParaVencer(null, AHORA)).toBeNull();
  });

  it("redondea hacia arriba los días restantes", () => {
    expect(diasParaVencer(enDias(3), AHORA)).toBe(3);
    expect(diasParaVencer(new Date(AHORA.getTime() + 36 * 60 * 60 * 1000).toISOString(), AHORA)).toBe(2);
  });
});

describe("caraDeResultado", () => {
  it("activo con vencimiento lejano es permitido", () => {
    expect(caraDeResultado({ estado: "activo", fechaVencimiento: enDias(10) }, AHORA).cara).toBe("permitido");
    expect(caraDeResultado({ estado: "activo", fechaVencimiento: enDias(6) }, AHORA).cara).toBe("permitido");
  });

  it("activo que vence en 5 días o menos es por_vencer", () => {
    expect(caraDeResultado({ estado: "activo", fechaVencimiento: enDias(5) }, AHORA)).toEqual({ cara: "por_vencer", diasParaVencer: 5 });
    expect(caraDeResultado({ estado: "activo", fechaVencimiento: enDias(1) }, AHORA).cara).toBe("por_vencer");
  });

  it("activo sin fecha de vencimiento es permitido (no rompe)", () => {
    expect(caraDeResultado({ estado: "activo", fechaVencimiento: null }, AHORA)).toEqual({ cara: "permitido", diasParaVencer: null });
  });

  it("los demás estados pasan tal cual, aunque la fecha ya haya pasado", () => {
    expect(caraDeResultado({ estado: "en_gracia", fechaVencimiento: enDias(-2) }, AHORA).cara).toBe("en_gracia");
    expect(caraDeResultado({ estado: "vencido", fechaVencimiento: enDias(-40) }, AHORA).cara).toBe("vencido");
    expect(caraDeResultado({ estado: "abono_vencido", fechaVencimiento: null }, AHORA).cara).toBe("abono_vencido");
    expect(caraDeResultado({ estado: "sucursal_incorrecta", fechaVencimiento: null }, AHORA).cara).toBe("sucursal_incorrecta");
  });
});

describe("tonoDeCara", () => {
  it("verde con acceso, ámbar en gracia, rojo en el resto", () => {
    expect(tonoDeCara("permitido")).toBe("verde");
    expect(tonoDeCara("por_vencer")).toBe("verde");
    expect(tonoDeCara("en_gracia")).toBe("ambar");
    expect(tonoDeCara("vencido")).toBe("rojo");
    expect(tonoDeCara("abono_vencido")).toBe("rojo");
    expect(tonoDeCara("sucursal_incorrecta")).toBe("rojo");
  });
});

describe("textoPorVencer", () => {
  it("usa hoy, mañana o N días", () => {
    expect(textoPorVencer(0)).toBe("Vence hoy");
    expect(textoPorVencer(1)).toBe("Vence mañana");
    expect(textoPorVencer(4)).toBe("Vence en 4 días");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test --workspace apps/kiosk -- cara`
Expected: FAIL — no se puede resolver `./cara`.

- [ ] **Step 3: Implementar `cara.ts`**

`apps/kiosk/lib/cara.ts`:

```ts
import type { ResultadoCheckIn } from "./api";

export const UMBRAL_POR_VENCER_DIAS = 5;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export type CaraFicha =
  | "permitido"
  | "por_vencer"
  | "en_gracia"
  | "vencido"
  | "abono_vencido"
  | "sucursal_incorrecta";

export type Tono = "verde" | "ambar" | "rojo";

export function diasParaVencer(fechaVencimiento: string | null, ahora: Date): number | null {
  if (!fechaVencimiento) return null;
  return Math.ceil((new Date(fechaVencimiento).getTime() - ahora.getTime()) / MS_POR_DIA);
}

// "por_vencer" no existe en el servidor: es un acceso "activo" que vence en pocos días.
export function caraDeResultado(
  resultado: Pick<ResultadoCheckIn, "estado" | "fechaVencimiento">,
  ahora: Date
): { cara: CaraFicha; diasParaVencer: number | null } {
  const dias = diasParaVencer(resultado.fechaVencimiento, ahora);
  if (resultado.estado === "activo") {
    const porVencer = dias !== null && dias <= UMBRAL_POR_VENCER_DIAS;
    return { cara: porVencer ? "por_vencer" : "permitido", diasParaVencer: dias };
  }
  return { cara: resultado.estado, diasParaVencer: dias };
}

export function tonoDeCara(cara: CaraFicha): Tono {
  if (cara === "permitido" || cara === "por_vencer") return "verde";
  return cara === "en_gracia" ? "ambar" : "rojo";
}

export function textoPorVencer(dias: number): string {
  if (dias <= 0) return "Vence hoy";
  return dias === 1 ? "Vence mañana" : `Vence en ${dias} días`;
}
```

- [ ] **Step 4: Crear `tonos.ts`**

`apps/kiosk/lib/tonos.ts`:

```ts
import type { Tono } from "./cara";

// El brillo usa rgba fijo (los mismos colores de temaAdrenalinaXtreme) porque el WebView del TV
// puede no soportar color-mix().
export const COLOR_TONO: Record<Tono, { color: string; tinta: string; brillo: string }> = {
  verde: { color: "var(--gx-accent)", tinta: "var(--gx-accent-ink)", brillo: "rgba(147, 232, 58, 0.4)" },
  ambar: { color: "var(--gx-warn)", tinta: "var(--gx-warn-ink)", brillo: "rgba(245, 166, 35, 0.4)" },
  rojo: { color: "var(--gx-bad)", tinta: "var(--gx-bad-ink)", brillo: "rgba(255, 59, 78, 0.4)" },
};
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm test --workspace apps/kiosk`
Expected: PASS (todos los tests, incluidos los de `nombreCorto`).

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/lib/cara.ts apps/kiosk/lib/tonos.ts apps/kiosk/lib/cara.test.ts
git commit -m "agrega la cara de la ficha del kiosco (por vencer incluida) y los tonos de color"
git push origin main
```

---

### Task 3: Bolsa barajada de frases y lista de reposo

**Files:**
- Create: `apps/kiosk/lib/bolsaFrases.ts`
- Create: `apps/kiosk/lib/frases.ts`
- Test: `apps/kiosk/lib/bolsaFrases.test.ts`

**Interfaces:**
- Produces (usados en Tasks 7 y 9):
  - `crearBolsa<T>(items: readonly T[], aleatorio?: () => number): () => T`
  - `FRASES_REPOSO: readonly string[]` (10 frases)
  - `FRASE_BIENVENIDA_NEUTRA: string` (= `"¡BIENVENID@, ADRENALINER!"`)

- [ ] **Step 1: Escribir el test que falla**

`apps/kiosk/lib/bolsaFrases.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { crearBolsa } from "./bolsaFrases";

const ITEMS = ["a", "b", "c", "d", "e"];

describe("crearBolsa", () => {
  it("entrega todos los elementos sin repetir antes de agotar la bolsa", () => {
    const siguiente = crearBolsa(ITEMS);
    const ronda = ITEMS.map(() => siguiente());
    expect([...ronda].sort()).toEqual(ITEMS);
  });

  it("vuelve a barajar y en la segunda ronda también salen todos", () => {
    const siguiente = crearBolsa(ITEMS);
    ITEMS.forEach(() => siguiente());
    const ronda2 = ITEMS.map(() => siguiente());
    expect([...ronda2].sort()).toEqual(ITEMS);
  });

  it("la primera de una ronda nueva no repite la última de la anterior", () => {
    // Con 2 elementos cada barajada consume un número: 0 → [b, a]; 0,99 → [a, b].
    const valores = [0, 0.99];
    let i = 0;
    const siguiente = crearBolsa(["a", "b"], () => valores[i++]);
    expect([siguiente(), siguiente()]).toEqual(["b", "a"]);
    // La ronda 2 saldría [a, b] (empezaría con "a", la última de la ronda 1): se intercambia.
    expect(siguiente()).toBe("b");
  });

  it("con un solo elemento lo repite sin romperse", () => {
    const siguiente = crearBolsa(["x"]);
    expect([siguiente(), siguiente(), siguiente()]).toEqual(["x", "x", "x"]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test --workspace apps/kiosk -- bolsaFrases`
Expected: FAIL — no se puede resolver `./bolsaFrases`.

- [ ] **Step 3: Implementar**

`apps/kiosk/lib/bolsaFrases.ts`:

```ts
function barajar<T>(items: readonly T[], aleatorio: () => number): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// "Bolsa barajada": sortea sin repetir hasta agotar la lista y vuelve a barajar; la primera de
// una ronda nueva nunca es la última de la anterior.
export function crearBolsa<T>(items: readonly T[], aleatorio: () => number = Math.random): () => T {
  let cola: T[] = [];
  let ultimo: T | undefined;
  return () => {
    if (cola.length === 0) {
      cola = barajar(items, aleatorio);
      if (items.length > 1 && cola[0] === ultimo) {
        const fin = cola.length - 1;
        [cola[0], cola[fin]] = [cola[fin], cola[0]];
      }
    }
    ultimo = cola.shift() as T;
    return ultimo;
  };
}
```

- [ ] **Step 4: Crear la lista de frases**

`apps/kiosk/lib/frases.ts`:

```ts
// Reposo: solo frases neutras (el kiosco no sabe quién está enfrente). Spec §6.
export const FRASES_REPOSO: readonly string[] = [
  "ESTA HORA ES TUYA",
  "CADA REPETICIÓN CUENTA",
  "SUDA HOY, SONRÍE MAÑANA",
  "LA DISCIPLINA VENCE AL TALENTO",
  "NO TE COMPARES, SUPÉRATE",
  "TU ÚNICO RIVAL ERES TÚ",
  "UNA REPETICIÓN MÁS",
  "EL DOLOR DE HOY ES LA FUERZA DE MAÑANA",
  "CONSTANCIA ANTES QUE MOTIVACIÓN",
  "AQUÍ SE VIENE A DARLO TODO",
];

// Fase 1: todavía no existe `saludo`, así que la ficha real saluda siempre con la frase sin
// género. La "@" solo se permite en esta frase.
export const FRASE_BIENVENIDA_NEUTRA = "¡BIENVENID@, ADRENALINER!";
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm test --workspace apps/kiosk`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/lib/bolsaFrases.ts apps/kiosk/lib/frases.ts apps/kiosk/lib/bolsaFrases.test.ts
git commit -m "agrega la bolsa barajada y la lista de frases de reposo del kiosco"
git push origin main
```

---

### Task 4: Reducer de la pantalla (`estadoPantalla.ts`)

**Files:**
- Create: `apps/kiosk/lib/estadoPantalla.ts`
- Test: `apps/kiosk/lib/estadoPantalla.test.ts`

**Interfaces:**
- Consumes: `ResultadoCheckIn` (`lib/api.ts`), `CaraFicha` (Task 2).
- Produces (usados en Tasks 8 y 9):
  - `type Ficha = { tipo: "resultado"; resultado: ResultadoCheckIn; hora: string; cara: CaraFicha; diasParaVencer: number | null } | { tipo: "pendiente" } | { tipo: "error"; mensaje: string }`
  - `type FichaActiva = Ficha & { id: number }`
  - `interface EstadoPantalla { ficha: FichaActiva | null; procesando: boolean; siguienteId: number }`
  - `type EventoPantalla = { tipo: "enviar" } | { tipo: "respuesta"; ficha: Ficha } | { tipo: "vencio"; id: number }`
  - `estadoInicial: EstadoPantalla`, `reducirPantalla(estado, evento): EstadoPantalla`

- [ ] **Step 1: Escribir el test que falla**

`apps/kiosk/lib/estadoPantalla.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { estadoInicial, reducirPantalla, type Ficha } from "./estadoPantalla";

const errorFicha: Ficha = { tipo: "error", mensaje: "No se encontró ningún miembro con esa cédula." };
const pendiente: Ficha = { tipo: "pendiente" };

describe("reducirPantalla", () => {
  it("arranca en reposo: sin ficha y sin procesar", () => {
    expect(estadoInicial).toEqual({ ficha: null, procesando: false, siguienteId: 1 });
  });

  it("enviar marca procesando sin tocar la ficha visible", () => {
    const conFicha = reducirPantalla(estadoInicial, { tipo: "respuesta", ficha: errorFicha });
    const enviando = reducirPantalla(conFicha, { tipo: "enviar" });
    expect(enviando.procesando).toBe(true);
    expect(enviando.ficha).toEqual(conFicha.ficha);
  });

  it("una respuesta muestra la ficha con id nuevo y deja de procesar", () => {
    const e = reducirPantalla(reducirPantalla(estadoInicial, { tipo: "enviar" }), { tipo: "respuesta", ficha: errorFicha });
    expect(e.procesando).toBe(false);
    expect(e.ficha).toEqual({ ...errorFicha, id: 1 });
    expect(e.siguienteId).toBe(2);
  });

  it("otra respuesta con una ficha visible la reemplaza directo (id mayor)", () => {
    const e1 = reducirPantalla(estadoInicial, { tipo: "respuesta", ficha: errorFicha });
    const e2 = reducirPantalla(e1, { tipo: "respuesta", ficha: pendiente });
    expect(e2.ficha).toEqual({ tipo: "pendiente", id: 2 });
  });

  it("vencio con el id vigente vuelve al reposo", () => {
    const e1 = reducirPantalla(estadoInicial, { tipo: "respuesta", ficha: errorFicha });
    expect(reducirPantalla(e1, { tipo: "vencio", id: 1 }).ficha).toBeNull();
  });

  it("vencio con un id viejo NO borra la ficha nueva", () => {
    const e1 = reducirPantalla(estadoInicial, { tipo: "respuesta", ficha: errorFicha });
    const e2 = reducirPantalla(e1, { tipo: "respuesta", ficha: pendiente });
    expect(reducirPantalla(e2, { tipo: "vencio", id: 1 })).toBe(e2);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test --workspace apps/kiosk -- estadoPantalla`
Expected: FAIL — no se puede resolver `./estadoPantalla`.

- [ ] **Step 3: Implementar**

`apps/kiosk/lib/estadoPantalla.ts`:

```ts
import type { ResultadoCheckIn } from "./api";
import type { CaraFicha } from "./cara";

// Lo que se muestra al terminar una verificación. `cara` y `diasParaVencer` se calculan al
// llegar la respuesta (no en el render) para que la ficha no cambie con el reloj.
export type Ficha =
  | { tipo: "resultado"; resultado: ResultadoCheckIn; hora: string; cara: CaraFicha; diasParaVencer: number | null }
  | { tipo: "pendiente" }
  | { tipo: "error"; mensaje: string };

export type FichaActiva = Ficha & { id: number };

export interface EstadoPantalla {
  // null = reposo.
  ficha: FichaActiva | null;
  // "Verificando…": no cambia la ficha visible, que sigue hasta que llegue la respuesta.
  procesando: boolean;
  siguienteId: number;
}

export type EventoPantalla =
  | { tipo: "enviar" }
  | { tipo: "respuesta"; ficha: Ficha }
  | { tipo: "vencio"; id: number };

export const estadoInicial: EstadoPantalla = { ficha: null, procesando: false, siguienteId: 1 };

export function reducirPantalla(estado: EstadoPantalla, evento: EventoPantalla): EstadoPantalla {
  switch (evento.tipo) {
    case "enviar":
      return { ...estado, procesando: true };
    case "respuesta":
      return {
        ficha: { ...evento.ficha, id: estado.siguienteId },
        procesando: false,
        siguienteId: estado.siguienteId + 1,
      };
    case "vencio":
      // El id evita que el temporizador de una ficha vieja borre la que la reemplazó.
      return estado.ficha?.id === evento.id ? { ...estado, ficha: null } : estado;
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test --workspace apps/kiosk`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/kiosk/lib/estadoPantalla.ts apps/kiosk/lib/estadoPantalla.test.ts
git commit -m "agrega el reducer de la pantalla del kiosco (reposo, procesando y ficha con id)"
git push origin main
```

---

### Task 5: Entrada del numpad por `keydown` (tercera fuente)

**Files:**
- Create: `apps/kiosk/lib/teclasNumpad.ts`
- Test: `apps/kiosk/lib/teclasNumpad.test.ts`
- Modify (reescribir): `apps/kiosk/lib/useEntradaCedula.ts`
- Modify: `apps/kiosk/app/page.tsx` (solo los usos de `nativo`, ver Step 5)

**Interfaces:**
- Produces: `type MensajeTeclado`, `mensajeDeTecla(evento: { code: string }): MensajeTeclado | null`.
- Cambia el contrato del hook: `useEntradaCedula({ alEscribir?, alEnviar })` devuelve `{ cedula, limpiar, sinInput, propsInput }` (antes `nativo` en lugar de `sinInput`; `alEscribir` ahora es opcional). `sinInput` = hay host nativo **o** es Android (no se renderiza `<input>`).

- [ ] **Step 1: Escribir el test que falla**

`apps/kiosk/lib/teclasNumpad.test.ts`:

```ts
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
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test --workspace apps/kiosk -- teclasNumpad`
Expected: FAIL — no se puede resolver `./teclasNumpad`.

- [ ] **Step 3: Implementar `teclasNumpad.ts`**

`apps/kiosk/lib/teclasNumpad.ts`:

```ts
// Mensajes de teclado que entiende el kiosco: los manda apps/kiosk-host (WebView2) y, en la APK
// de Android TV, los genera mensajeDeTecla a partir de `keydown`.
export type MensajeTeclado =
  | { type: "digit"; value: string }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "clear" };

// Solo teclas del numpad (event.code): la fila numérica normal se ignora a propósito para que un
// teclado común conectado al TV no pueda escribir cédulas.
export function mensajeDeTecla(evento: { code: string }): MensajeTeclado | null {
  const digito = /^Numpad(\d)$/.exec(evento.code);
  if (digito) return { type: "digit", value: digito[1] };
  switch (evento.code) {
    case "NumpadEnter":
      return { type: "enter" };
    case "Backspace":
      return { type: "backspace" };
    case "Escape":
      return { type: "clear" };
    default:
      return null;
  }
}
```

- [ ] **Step 4: Reescribir `useEntradaCedula.ts`**

Reemplazar todo el archivo `apps/kiosk/lib/useEntradaCedula.ts` por:

```ts
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from "react";
import { mensajeDeTecla, type MensajeTeclado } from "./teclasNumpad";

type EscuchaMensaje = (evento: { data: unknown }) => void;

interface WebView2 {
  addEventListener(tipo: "message", escucha: EscuchaMensaje): void;
  removeEventListener(tipo: "message", escucha: EscuchaMensaje): void;
}

function obtenerWebView(): WebView2 | undefined {
  return (window as unknown as { chrome?: { webview?: WebView2 } }).chrome?.webview;
}

const TIEMPO_INACTIVIDAD_MS = 7_000;

const sinSuscripcion = () => () => {};
const hayHostNativo = () => obtenerWebView() !== undefined;
const esAndroid = () => /Android/i.test(navigator.userAgent);
const sinHostEnServidor = () => false;

interface Opciones {
  // Cada vez que se escribe o borra (opcional).
  alEscribir?: () => void;
  alEnviar: (cedula: string) => Promise<void>;
}

// Fuente de la cédula, por orden: host de Windows (mensajes nativos de WebView2), APK de Android TV
// (keydown global solo de numpad, sin <input> para que no salga el teclado en pantalla) y, en un
// navegador normal (dev), el <input> con eventos DOM de siempre.
export function useEntradaCedula({ alEscribir, alEnviar }: Opciones) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cedula, setCedula] = useState("");
  // Espejo síncrono: "dígito + Enter" seguidos deben ver el valor actual sin esperar al render.
  const cedulaRef = useRef("");
  const opciones = useRef({ alEscribir, alEnviar });
  const nativo = useSyncExternalStore(sinSuscripcion, hayHostNativo, sinHostEnServidor);
  const android = useSyncExternalStore(sinSuscripcion, esAndroid, sinHostEnServidor);
  const sinInput = nativo || android;
  // Mientras se envía una cédula se ignora todo: evita el doble envío y dígitos que se perderían.
  const enviandoRef = useRef(false);

  useEffect(() => {
    opciones.current = { alEscribir, alEnviar };
  });

  const asignar = useCallback((valor: string) => {
    cedulaRef.current = valor;
    setCedula(valor);
  }, []);

  const manejar = useCallback(
    (mensaje: MensajeTeclado) => {
      if (enviandoRef.current) return;
      const { alEscribir, alEnviar } = opciones.current;

      switch (mensaje.type) {
        case "digit":
          if (!/^\d$/.test(mensaje.value)) return;
          alEscribir?.();
          asignar(cedulaRef.current + mensaje.value);
          return;
        case "backspace":
          alEscribir?.();
          asignar(cedulaRef.current.slice(0, -1));
          return;
        case "clear":
          alEscribir?.();
          asignar("");
          return;
        case "enter":
          enviandoRef.current = true;
          alEnviar(cedulaRef.current).finally(() => {
            enviandoRef.current = false;
          });
      }
    },
    [asignar]
  );

  useEffect(() => {
    const webview = obtenerWebView();
    if (!nativo || !webview) return;

    const alRecibir: EscuchaMensaje = ({ data }) => {
      if (typeof data !== "object" || data === null) return;
      manejar(data as MensajeTeclado);
    };

    webview.addEventListener("message", alRecibir);
    return () => webview.removeEventListener("message", alRecibir);
  }, [nativo, manejar]);

  useEffect(() => {
    if (nativo || !android) return;

    const alTeclear = (evento: globalThis.KeyboardEvent) => {
      const mensaje = mensajeDeTecla(evento);
      if (!mensaje) return;
      evento.preventDefault();
      // Mantener una tecla pulsada no debe repetir dígitos ni, peor, el Enter.
      if (evento.repeat) return;
      manejar(mensaje);
    };

    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [nativo, android, manejar]);

  // Una cédula a medias que nadie termina de teclear no debe quedar a la vista del siguiente socio.
  useEffect(() => {
    if (!cedula) return;
    const temporizador = setTimeout(() => asignar(""), TIEMPO_INACTIVIDAD_MS);
    return () => clearTimeout(temporizador);
  }, [cedula, asignar]);

  // Sin host ni Android, el kiosco tiene un teclado numérico físico y no pantalla táctil (ADR v1 §2.5):
  // el input siempre debe estar enfocado para capturarlo sin que el staff toque nada.
  useEffect(() => {
    if (!sinInput) inputRef.current?.focus();
  });

  const propsInput = {
    ref: inputRef,
    value: cedula,
    onChange: (evento: ChangeEvent<HTMLInputElement>) => {
      opciones.current.alEscribir?.();
      asignar(evento.target.value.replace(/\D/g, ""));
    },
    onKeyDown: (evento: KeyboardEvent<HTMLInputElement>) => {
      if (evento.key === "Enter") void opciones.current.alEnviar(cedulaRef.current);
      if (evento.key === "Escape") asignar("");
    },
    onBlur: () => inputRef.current?.focus(),
    inputMode: "numeric" as const,
    autoFocus: true,
  };

  return { cedula, limpiar: () => asignar(""), sinInput, propsInput };
}
```

- [ ] **Step 5: Adaptar `page.tsx` al nuevo nombre**

En `apps/kiosk/app/page.tsx`: cambiar `const { cedula, limpiar, nativo, propsInput } = useEntradaCedula({` por `const { cedula, limpiar, sinInput, propsInput } = useEntradaCedula({`, y `{nativo ? (` por `{sinInput ? (`. No tocar nada más en esa página (se reescribe en la Task 9).

- [ ] **Step 6: Verificar**

Run: `npm test --workspace apps/kiosk` → Expected: PASS.
Run: `npx tsc --noEmit -p apps/kiosk` → Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk/lib/teclasNumpad.ts apps/kiosk/lib/teclasNumpad.test.ts apps/kiosk/lib/useEntradaCedula.ts apps/kiosk/app/page.tsx
git commit -m "agrega la entrada de numpad por keydown para Android TV en el kiosco"
git push origin main
```

---

### Task 6: API `GET /api/kiosco/estado` y helper compartido con `/api/checkin`

**Files:**
- Create: `apps/web-admin/lib/kiosco.ts`
- Create: `apps/web-admin/app/api/kiosco/estado/route.ts`
- Modify (reescribir): `apps/web-admin/app/api/checkin/route.ts`

**Interfaces:**
- Produces (en `lib/kiosco.ts`):
  - `jsonKiosco(body: unknown, status: number): NextResponse` (con CORS)
  - `opcionesKiosco(): NextResponse` (preflight 204)
  - `sucursalDeKiosco(req: NextRequest): Promise<Sucursal | NextResponse>` — devuelve la sucursal o la respuesta 401 lista para retornar.
- Produces (HTTP): `GET /api/kiosco/estado` con header `X-Kiosk-Api-Key` → `200 { sucursalNombre: string, tasaBcv: { valor: number, fecha: string /* ISO */ } | null }`; `401` sin clave o con clave inválida; `OPTIONS` → 204 con CORS.

Este paquete no tiene tests automáticos de rutas en el repo; se verifica con `tsc` y `curl` (Step 5).

- [ ] **Step 1: Crear el helper `lib/kiosco.ts`**

`apps/web-admin/lib/kiosco.ts`:

```ts
// Utilidades de las rutas que consume el kiosco (/api/checkin, /api/kiosco/*).
//
// CORS: apps/kiosk se sirve desde su propio origen, distinto al de apps/web-admin — el navegador
// del kiosco hace peticiones cross-origin con un header custom (X-Kiosk-Api-Key), lo que dispara un
// preflight OPTIONS. Es seguro permitir cualquier origen acá porque la autenticación real es el
// apiKey (un header que el navegador nunca adjunta automáticamente, a diferencia de una cookie) —
// sin conocerlo, ningún origen puede hacer nada.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { KioskTokenValidator } from "@gym-app/infrastructure/auth/KioskTokenValidator";
import type { Sucursal } from "@gym-app/domain/entities/Sucursal";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Kiosk-Api-Key",
};

export function jsonKiosco(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function opcionesKiosco() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// La sucursal dueña de la clave (header X-Kiosk-Api-Key, ADR-001 v1 §4.2 — el sucursalId NO viaja
// en el body), o la respuesta 401 que la ruta debe devolver tal cual.
export async function sucursalDeKiosco(req: NextRequest): Promise<Sucursal | NextResponse> {
  const apiKey = req.headers.get("x-kiosk-api-key");
  if (!apiKey) return jsonKiosco({ error: "Falta el header X-Kiosk-Api-Key." }, 401);

  const sucursal = await new KioskTokenValidator(prisma).validar(apiKey);
  if (!sucursal) return jsonKiosco({ error: "API key de sucursal inválida." }, 401);

  return sucursal;
}
```

- [ ] **Step 2: Reescribir `/api/checkin` usando el helper**

Reemplazar todo `apps/web-admin/app/api/checkin/route.ts` por (misma lógica y mismo cuerpo de respuesta que hoy; solo desaparece el código movido al helper):

```ts
// app/api/checkin/route.ts
// Endpoint de check-in: el kiosco se autentica con su apiKey de Sucursal (ver lib/kiosco.ts). Este
// handler solo valida entrada/salida HTTP; toda la lógica de negocio vive en el caso de uso
// RegistrarCheckIn (packages/domain).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonKiosco, opcionesKiosco, sucursalDeKiosco } from "@/lib/kiosco";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaCheckInRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCheckInRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { registrarCheckIn, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/RegistrarCheckIn";

export async function OPTIONS() {
  return opcionesKiosco();
}

export async function POST(req: NextRequest) {
  try {
    const sucursal = await sucursalDeKiosco(req);
    if (sucursal instanceof NextResponse) return sucursal;

    const { cedula } = await req.json();

    if (!cedula) {
      return jsonKiosco({ error: "Cédula es requerida." }, 400);
    }

    const resultado = await registrarCheckIn(
      {
        miembros: new PrismaMemberRepository(prisma),
        checkIns: new PrismaCheckInRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        sucursales: new PrismaSucursalRepository(prisma),
      },
      { organizacionId: sucursal.organizacionId, sucursalId: sucursal.id, cedula }
    );

    return jsonKiosco(
      {
        nombre: resultado.nombre,
        fotoUrl: resultado.fotoUrl,
        entrenador: resultado.entrenadorNombre,
        fechaVencimiento: resultado.fechaVencimiento,
        estado: resultado.estado,
        sucursalAsignadaNombre: resultado.sucursalAsignadaNombre,
        sucursalAsignadaDireccion: resultado.sucursalAsignadaDireccion,
        diasGraciaRestantes: resultado.diasGraciaRestantes,
        tieneGraciaConfigurada: resultado.tieneGraciaConfigurada,
      },
      200
    );
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError) {
      return jsonKiosco({ error: error.message }, 404);
    }
    console.error("Error en check-in:", error);
    return jsonKiosco({ error: "Error interno al procesar el check-in." }, 500);
  }
}
```

- [ ] **Step 3: Crear la ruta de estado**

`apps/web-admin/app/api/kiosco/estado/route.ts`:

```ts
// GET /api/kiosco/estado — lo que el reposo del kiosco muestra: sede y última tasa BCV.
// Autenticado con la apiKey de la sucursal (ver lib/kiosco.ts).
import { NextRequest, NextResponse } from "next/server";
import { jsonKiosco, opcionesKiosco, sucursalDeKiosco } from "@/lib/kiosco";
import { orquestadorTasa } from "@/lib/tasaBcv";
import { SinTasaDisponibleError } from "@gym-app/domain/use-cases/ObtenerTasaVigente";

export async function OPTIONS() {
  return opcionesKiosco();
}

export async function GET(req: NextRequest) {
  try {
    const sucursal = await sucursalDeKiosco(req);
    if (sucursal instanceof NextResponse) return sucursal;

    // Sin tasa guardada el reposo se ve igual, solo que sin ese dato.
    let tasaBcv: { valor: number; fecha: string } | null = null;
    try {
      const { tasa } = await orquestadorTasa.obtenerTasaVigenteFresca();
      tasaBcv = { valor: tasa.valor, fecha: tasa.fecha.toISOString() };
    } catch (error) {
      if (!(error instanceof SinTasaDisponibleError)) console.error("Error al leer la tasa para el kiosco:", error);
    }

    return jsonKiosco({ sucursalNombre: sucursal.nombre, tasaBcv }, 200);
  } catch (error) {
    console.error("Error en el estado del kiosco:", error);
    return jsonKiosco({ error: "Error interno al leer el estado del kiosco." }, 500);
  }
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit -p apps/web-admin`
Expected: sin errores.

- [ ] **Step 5: Verificar con curl**

Run (en una terminal): `npm run dev --workspace apps/web-admin` (puerto 3000) y, en otra:

```bash
curl -i http://localhost:3000/api/kiosco/estado
curl -i -H "X-Kiosk-Api-Key: clave-que-no-existe" http://localhost:3000/api/kiosco/estado
curl -i -X OPTIONS http://localhost:3000/api/kiosco/estado
```

Expected: 1.ª → `401` con `{"error":"Falta el header X-Kiosk-Api-Key."}` y `Access-Control-Allow-Origin: *`; 2.ª → `401` con `API key de sucursal inválida.`; 3.ª → `204` con `Access-Control-Allow-Methods: GET, POST, OPTIONS`. Con una clave real de sucursal (visible en el panel, Sucursales) → `200` con `sucursalNombre` y `tasaBcv`. Comprobar también que `POST /api/checkin` con clave real sigue respondiendo igual que antes.

- [ ] **Step 6: Commit**

```bash
git add apps/web-admin/lib/kiosco.ts apps/web-admin/app/api/kiosco/estado/route.ts apps/web-admin/app/api/checkin/route.ts
git commit -m "agrega el endpoint de estado del kiosco y comparte el helper de CORS y clave con el check-in"
git push origin main
```

---

### Task 7: Hooks de apoyo del kiosco (estado de sede/tasa, hora, frases, foto)

**Files:**
- Modify: `apps/kiosk/lib/api.ts`
- Create: `apps/kiosk/lib/useInfoKiosco.ts`
- Create: `apps/kiosk/lib/useHoraActual.ts`
- Create: `apps/kiosk/lib/useFraseRotativa.ts`
- Create: `apps/kiosk/lib/precargarFoto.ts`

**Interfaces:**
- Consumes: `crearBolsa` (Task 3), endpoint de la Task 6.
- Produces (usados en Tasks 8 y 9):
  - `interface InfoKiosco { sucursalNombre: string; tasaBcv: { valor: number; fecha: string } | null }` y `obtenerInfoKiosco(apiKey: string): Promise<InfoKiosco>` (en `api.ts`)
  - `useInfoKiosco(apiKey: string | null): InfoKiosco | null`
  - `useHoraActual(): string` (`""` hasta montar; `"9:41 p. m."`)
  - `useFraseRotativa(frases: readonly string[]): { frase: string; saliendo: boolean }`
  - `precargarFoto(url: string, esperaMaxMs: number): Promise<void>` (nunca rechaza)

Estos hooks son finos y dependen del navegador (timers, `localStorage`, `Image`); se verifican con `tsc`/`lint` y en la verificación manual (Task 12). La lógica que sí es pura (`crearBolsa`) ya tiene tests.

- [ ] **Step 1: Agregar `obtenerInfoKiosco` a `lib/api.ts`**

Al final de `apps/kiosk/lib/api.ts` añadir:

```ts
// Sede y última tasa BCV para la ficha de reposo (GET /api/kiosco/estado).
export interface InfoKiosco {
  sucursalNombre: string;
  tasaBcv: { valor: number; fecha: string } | null;
}

export async function obtenerInfoKiosco(apiKey: string): Promise<InfoKiosco> {
  if (!URL_API) {
    throw new ErrorCheckIn("NEXT_PUBLIC_API_URL no está configurada en este build.", 0);
  }

  const respuesta = await fetch(`${URL_API}/api/kiosco/estado`, { headers: { "X-Kiosk-Api-Key": apiKey } });
  if (!respuesta.ok) {
    throw new ErrorCheckIn(`Error ${respuesta.status} al leer el estado del kiosco.`, respuesta.status);
  }

  return (await respuesta.json()) as InfoKiosco;
}
```

- [ ] **Step 2: Crear `useInfoKiosco.ts`**

`apps/kiosk/lib/useInfoKiosco.ts`:

```ts
import { useEffect, useState } from "react";
import { obtenerInfoKiosco, type InfoKiosco } from "./api";

const CLAVE_STORAGE = "kiosco_info";
const REFRESCO_MS = 10 * 60_000;

// Sede y tasa del reposo. Se guarda la última respuesta en localStorage para que el reposo se vea
// completo aunque el kiosco arranque sin red; si no hay nada guardado devuelve null y el reposo
// muestra "—".
export function useInfoKiosco(apiKey: string | null): InfoKiosco | null {
  const [info, setInfo] = useState<InfoKiosco | null>(null);

  useEffect(() => {
    if (!apiKey) return;

    try {
      const guardada = window.localStorage.getItem(CLAVE_STORAGE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lee localStorage tras el montaje (SSR-safe, export estático)
      if (guardada) setInfo(JSON.parse(guardada) as InfoKiosco);
    } catch {
      // localStorage bloqueado o JSON dañado: se ignora y se espera a la red.
    }

    let activo = true;
    const refrescar = () => {
      obtenerInfoKiosco(apiKey)
        .then((nueva) => {
          if (!activo) return;
          setInfo(nueva);
          try {
            window.localStorage.setItem(CLAVE_STORAGE, JSON.stringify(nueva));
          } catch {
            // sin almacenamiento: solo se pierde el respaldo sin red.
          }
        })
        .catch(() => {
          // sin red o API vieja: se conserva lo que ya hay.
        });
    };

    refrescar();
    const temporizador = setInterval(refrescar, REFRESCO_MS);
    return () => {
      activo = false;
      clearInterval(temporizador);
    };
  }, [apiKey]);

  return info;
}
```

- [ ] **Step 3: Crear `useHoraActual.ts`**

`apps/kiosk/lib/useHoraActual.ts`:

```ts
import { useEffect, useState } from "react";

const formatoHora = () => new Date().toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });

// "" hasta montar: el export estático se prerenderiza en Node y la hora real no debe quedar
// horneada en el HTML.
export function useHoraActual(): string {
  const [hora, setHora] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reloj: se lee tras el montaje (SSR-safe)
    setHora(formatoHora());
    const temporizador = setInterval(() => setHora(formatoHora()), 15_000);
    return () => clearInterval(temporizador);
  }, []);

  return hora;
}
```

- [ ] **Step 4: Crear `useFraseRotativa.ts`**

`apps/kiosk/lib/useFraseRotativa.ts`:

```ts
import { useEffect, useState } from "react";
import { crearBolsa } from "./bolsaFrases";

const INTERVALO_MS = 4_500;
// Debe coincidir con la transición de .frase-salida en globals.css.
const SALIDA_MS = 300;

// Frase actual de la bolsa barajada. `saliendo` es true los últimos 300 ms antes del cambio para
// que la ficha anime la salida. La primera frase es la primera de la lista (no aleatoria) para no
// diferir entre el prerender y el cliente.
export function useFraseRotativa(frases: readonly string[]): { frase: string; saliendo: boolean } {
  const [frase, setFrase] = useState(frases[0]);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    const siguiente = crearBolsa(frases);
    let cambio: ReturnType<typeof setTimeout> | undefined;

    const temporizador = setInterval(() => {
      setSaliendo(true);
      cambio = setTimeout(() => {
        setFrase(siguiente());
        setSaliendo(false);
      }, SALIDA_MS);
    }, INTERVALO_MS);

    return () => {
      clearInterval(temporizador);
      clearTimeout(cambio);
    };
  }, [frases]);

  return { frase, saliendo };
}
```

- [ ] **Step 5: Crear `precargarFoto.ts`**

`apps/kiosk/lib/precargarFoto.ts`:

```ts
// Descarga la foto antes de voltear la ficha para que no aparezca a medio cargar. Nunca rechaza:
// si la foto falla o tarda más de `esperaMaxMs`, la ficha gira igual (AccessCard cae a iniciales).
export function precargarFoto(url: string, esperaMaxMs: number): Promise<void> {
  return new Promise((resolver) => {
    const imagen = new Image();
    const tope = setTimeout(resolver, esperaMaxMs);
    const terminar = () => {
      clearTimeout(tope);
      resolver();
    };
    imagen.onload = terminar;
    imagen.onerror = terminar;
    imagen.src = url;
  });
}
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit -p apps/kiosk` → Expected: sin errores.
Run: `npm run lint --workspace apps/kiosk` → Expected: 0 errores (el warning de fuentes en `layout.tsx` ya existía).

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk/lib/api.ts apps/kiosk/lib/useInfoKiosco.ts apps/kiosk/lib/useHoraActual.ts apps/kiosk/lib/useFraseRotativa.ts apps/kiosk/lib/precargarFoto.ts
git commit -m "agrega los hooks de sede, tasa, hora, frases y precarga de foto del kiosco"
git push origin main
```

---

### Task 8: Componentes visuales de la ficha (marco, reposo, aviso, flip) y CSS

**Files:**
- Modify: `apps/kiosk/app/globals.css`
- Create: `apps/kiosk/components/MarcoFicha.tsx`
- Create: `apps/kiosk/components/FichaReposo.tsx`
- Create: `apps/kiosk/components/FichaAviso.tsx`
- Create: `apps/kiosk/components/FichaGiratoria.tsx`

**Interfaces:**
- Consumes: `COLOR_TONO`, `Tono` (Task 2); `InfoKiosco` (Task 7).
- Produces (usados en Task 9):
  - `<MarcoFicha color: string; brillo?: string; duracionMs?: number; children />`
  - `<FichaReposo frase: string; saliendo: boolean; hora: string; tasa: InfoKiosco["tasaBcv"]; sede: string | null />`
  - `<FichaAviso tono: Tono; titulo: string; detalle: string; duracionMs?: number />`
  - `<FichaGiratoria<T extends { id: number }> ficha: T | null; renderReposo: () => ReactNode; renderFicha: (ficha: T) => ReactNode />` — `ficha.id` distinto = nuevo giro; `null` = reposo.

Son componentes de presentación sin test propio; se verifican con `tsc`/`lint` aquí y a ojo en la Task 12.

- [ ] **Step 1: Agregar el CSS**

Añadir al final de `apps/kiosk/app/globals.css`:

```css
/* Flip 3D de la ficha: dos caras en la misma celda; cada giro suma 180°. Solo transform. */
.flip-escena {
  perspective: 1600px;
}
.flip-tarjeta {
  display: grid;
  transform-style: preserve-3d;
  transition: transform 700ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.flip-cara {
  grid-area: 1 / 1;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.flip-cara-trasera {
  transform: rotateY(180deg);
}

/* Barra de cuenta regresiva de la ficha real. */
.barra-cuenta {
  transform-origin: left;
  animation-name: cuenta-regresiva;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}
@keyframes cuenta-regresiva {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

/* Cambio de frase del reposo (la duración de la salida debe coincidir con SALIDA_MS en useFraseRotativa). */
.frase-entrada {
  animation: frase-entrada 300ms ease-out;
}
.frase-salida {
  opacity: 0;
  transform: translateY(-0.75rem);
  transition: opacity 300ms ease-in, transform 300ms ease-in;
}
@keyframes frase-entrada {
  from {
    opacity: 0;
    transform: translateY(0.75rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Destello radial sobre el video al validar una cédula (verde, ámbar o rojo). */
.destello {
  position: fixed;
  inset: 0;
  z-index: -10;
  pointer-events: none;
  opacity: 0;
  animation: destello 1200ms ease-out;
}
.destello-verde {
  background: radial-gradient(circle at center, rgba(147, 232, 58, 0.55) 0%, transparent 65%);
}
.destello-ambar {
  background: radial-gradient(circle at center, rgba(245, 166, 35, 0.55) 0%, transparent 65%);
}
.destello-rojo {
  background: radial-gradient(circle at center, rgba(255, 59, 78, 0.55) 0%, transparent 65%);
}
@keyframes destello {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .flip-tarjeta {
    transition-duration: 1ms;
  }
  .frase-entrada {
    animation: none;
  }
  .destello {
    animation: none;
  }
}
```

- [ ] **Step 2: Crear `MarcoFicha.tsx`**

`apps/kiosk/components/MarcoFicha.tsx`:

```tsx
import type { ReactNode } from "react";

// Marco común de todas las caras: borde de color, franja con el logo y, si se pasa `duracionMs`,
// la barra de cuenta regresiva. El `key` del padre reinicia la barra en cada ficha nueva.
export function MarcoFicha({
  color,
  brillo,
  duracionMs,
  children,
}: {
  color: string;
  brillo?: string;
  duracionMs?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-3xl border-4"
      style={{
        borderColor: color,
        background: "var(--gx-surface)",
        boxShadow: brillo ? `0 30px 70px -20px ${brillo}` : undefined,
      }}
    >
      <div
        className="flex items-center justify-center gap-4 px-8 py-4"
        style={{ borderBottom: "1px solid var(--gx-edge)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image */}
        <img src="/branding/logo-adrenalina-gym.jpg" alt="" className="h-12 w-12 rounded-full object-cover" />
        <span
          className="text-2xl font-bold uppercase"
          style={{ fontFamily: '"Barlow Condensed", sans-serif', letterSpacing: "0.3em", color: "var(--gx-muted)" }}
        >
          Adrenalina Xtreme Gym
        </span>
      </div>

      {children}

      {duracionMs !== undefined && (
        <div className="h-2 w-full" style={{ background: "var(--gx-edge)" }}>
          <div className="barra-cuenta h-full" style={{ background: color, animationDuration: `${duracionMs}ms` }} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Crear `FichaReposo.tsx`**

`apps/kiosk/components/FichaReposo.tsx`:

```tsx
import type { InfoKiosco } from "@/lib/api";
import { MarcoFicha } from "./MarcoFicha";

function formatearTasa(tasa: InfoKiosco["tasaBcv"]): string {
  if (!tasa) return "—";
  return `Bs. ${tasa.valor.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Ficha en reposo: nunca muestra datos de una persona. Sin verde ni ✓ de "acceso permitido".
export function FichaReposo({
  frase,
  saliendo,
  hora,
  tasa,
  sede,
}: {
  frase: string;
  saliendo: boolean;
  hora: string;
  tasa: InfoKiosco["tasaBcv"];
  sede: string | null;
}) {
  const datos: { etiqueta: string; valor: string }[] = [
    { etiqueta: "Hora", valor: hora || "—" },
    { etiqueta: "Tasa BCV", valor: formatearTasa(tasa) },
    { etiqueta: "Sede", valor: sede ?? "—" },
  ];

  return (
    <MarcoFicha color="var(--gx-edge)">
      <div className="grid grid-cols-[auto_1fr] items-center gap-12 p-12">
        <div
          className="h-56 w-56 overflow-hidden rounded-full"
          style={{ border: "4px solid var(--gx-edge)", background: "var(--gx-surface-2)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image */}
          <img src="/branding/placeholder-profile.jpg" alt="" className="h-full w-full object-cover" />
        </div>

        <div className="flex flex-col gap-8">
          <p
            key={frase}
            className={`min-h-[8rem] text-7xl leading-none ${saliendo ? "frase-salida" : "frase-entrada"}`}
            style={{ fontFamily: '"Bebas Neue", sans-serif', color: "var(--gx-ink)" }}
          >
            {frase}
          </p>

          <div className="grid grid-cols-3 gap-6 border-t pt-6" style={{ borderColor: "var(--gx-edge)" }}>
            {datos.map(({ etiqueta, valor }) => (
              <div key={etiqueta} className="flex flex-col gap-1">
                <span className="text-2xl font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                  {etiqueta}
                </span>
                <span className="text-4xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                  {valor}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MarcoFicha>
  );
}
```

- [ ] **Step 4: Crear `FichaAviso.tsx`**

`apps/kiosk/components/FichaAviso.tsx`:

```tsx
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { Tono } from "@/lib/cara";
import { COLOR_TONO } from "@/lib/tonos";
import { MarcoFicha } from "./MarcoFicha";

// Caras sin miembro: "sin conexión" (ámbar) y error del servidor (rojo).
export function FichaAviso({
  tono,
  titulo,
  detalle,
  duracionMs,
}: {
  tono: Tono;
  titulo: string;
  detalle: string;
  duracionMs?: number;
}) {
  const { color, tinta, brillo } = COLOR_TONO[tono];

  return (
    <MarcoFicha color={color} brillo={brillo} duracionMs={duracionMs}>
      <div
        className="flex items-center gap-4 px-10 py-6 text-6xl"
        style={{ background: color, color: tinta, fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}
      >
        <WarningCircle size={56} weight="fill" />
        {titulo}
      </div>
      <p className="p-12 text-4xl" style={{ color: "var(--gx-ink)" }}>
        {detalle}
      </p>
    </MarcoFicha>
  );
}
```

- [ ] **Step 5: Crear `FichaGiratoria.tsx`**

`apps/kiosk/components/FichaGiratoria.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";

type Cara<T> = { tipo: "reposo" } | { tipo: "ficha"; ficha: T };

// Tarjeta con dos caras que alternan al girar: cada cambio de `ficha.id` (o volver a null)
// escribe el contenido nuevo en la cara oculta y suma 180°. Así reposo→ficha, ficha→ficha y
// ficha→reposo giran todos igual, sin pasar por reposo entre dos personas seguidas.
export function FichaGiratoria<T extends { id: number }>({
  ficha,
  renderReposo,
  renderFicha,
}: {
  ficha: T | null;
  renderReposo: () => ReactNode;
  renderFicha: (ficha: T) => ReactNode;
}) {
  const clave = ficha?.id ?? 0;
  const [estado, setEstado] = useState<{ caras: [Cara<T>, Cara<T>]; giros: number; clave: number }>({
    caras: [{ tipo: "reposo" }, { tipo: "reposo" }],
    giros: 0,
    clave,
  });

  // Estado derivado durante el render (patrón de React para "ajustar estado al cambiar una prop").
  if (clave !== estado.clave) {
    const oculta = (estado.giros + 1) % 2;
    const caras: [Cara<T>, Cara<T>] = [estado.caras[0], estado.caras[1]];
    caras[oculta] = ficha ? { tipo: "ficha", ficha } : { tipo: "reposo" };
    setEstado({ caras, giros: estado.giros + 1, clave });
  }

  const contenido = (cara: Cara<T>) => (cara.tipo === "reposo" ? renderReposo() : renderFicha(cara.ficha));

  return (
    <div className="flip-escena w-[60vw] min-w-[40rem] max-w-6xl">
      <div className="flip-tarjeta" style={{ transform: `rotateY(${estado.giros * 180}deg)` }}>
        <div className="flip-cara">{contenido(estado.caras[0])}</div>
        <div className="flip-cara flip-cara-trasera">{contenido(estado.caras[1])}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit -p apps/kiosk` → Expected: sin errores.
Run: `npm run lint --workspace apps/kiosk` → Expected: 0 errores.

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk/app/globals.css apps/kiosk/components/MarcoFicha.tsx apps/kiosk/components/FichaReposo.tsx apps/kiosk/components/FichaAviso.tsx apps/kiosk/components/FichaGiratoria.tsx
git commit -m "agrega la ficha de reposo, el marco, los avisos y el flip 3D del kiosco"
git push origin main
```

---

### Task 9: Integración — `AccessCard` nueva, video que reacciona y `page.tsx`

**Files:**
- Modify (reescribir): `apps/kiosk/components/AccessCard.tsx`
- Modify (reescribir): `apps/kiosk/components/FondoVideo.tsx`
- Modify (reescribir): `apps/kiosk/app/page.tsx`
- Modify: `apps/kiosk/app/layout.tsx`

**Interfaces:**
- Consumes: todo lo de Tasks 1–8.
- Produces: `<AccessCard resultado: ResultadoCheckIn; hora: string; cara: CaraFicha; diasParaVencer: number | null; duracionMs?: number />`, `type Reaccion = { id: number; tono: Tono }`, `<FondoVideo reaccion: Reaccion | null />`. Al terminar la tarea el kiosco queda funcional con todo el rediseño de F1.

El comportamiento de pantalla completa se prueba a ojo (Task 12); aquí el criterio es `tsc` + `lint` + los tests de las tareas anteriores en verde.

- [ ] **Step 1: Reescribir `AccessCard.tsx`**

Reemplazar todo `apps/kiosk/components/AccessCard.tsx` por:

```tsx
import { CheckCircle, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { ResultadoCheckIn } from "@/lib/api";
import { textoPorVencer, tonoDeCara, type CaraFicha } from "@/lib/cara";
import { FRASE_BIENVENIDA_NEUTRA } from "@/lib/frases";
import { nombreCorto } from "@/lib/nombreCorto";
import { COLOR_TONO } from "@/lib/tonos";
import { MarcoFicha } from "./MarcoFicha";

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function formatearFecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

const ETIQUETA_CARA: Record<CaraFicha, string> = {
  permitido: "Acceso permitido",
  por_vencer: "Acceso permitido",
  en_gracia: "Membresía vencida — período de gracia",
  vencido: "Membresía vencida",
  abono_vencido: "Plazo de abono vencido",
  sucursal_incorrecta: "Acceso denegado",
};

// Caras con acceso: llevan el saludo.
const CARAS_CON_ACCESO: readonly CaraFicha[] = ["permitido", "por_vencer", "en_gracia"];

const ETIQUETA_DATO = "text-2xl font-bold uppercase";
const ESTILO_ETIQUETA = { letterSpacing: "0.1em", color: "var(--gx-muted-dim)" };

export function AccessCard({
  resultado,
  hora,
  cara,
  diasParaVencer,
  duracionMs,
}: {
  resultado: ResultadoCheckIn;
  hora: string;
  cara: CaraFicha;
  diasParaVencer: number | null;
  duracionMs?: number;
}) {
  const { color, tinta, brillo } = COLOR_TONO[tonoDeCara(cara)];
  const acceso = cara === "permitido" || cara === "por_vencer";
  const nombre = nombreCorto(resultado.nombre);

  return (
    <MarcoFicha color={color} brillo={brillo} duracionMs={duracionMs}>
      <div
        className="flex items-center justify-between gap-6 px-10 py-6 text-6xl"
        style={{ background: color, color: tinta, fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}
      >
        <span className="flex items-center gap-3">
          {acceso ? <CheckCircle size={56} weight="fill" /> : <XCircle size={56} weight="fill" />}
          {ETIQUETA_CARA[cara]}
        </span>
        <span className="flex items-center gap-4">
          {cara === "por_vencer" && diasParaVencer !== null && (
            <span
              className="rounded-full px-5 py-1 text-3xl"
              style={{ background: "var(--gx-warn)", color: "var(--gx-warn-ink)", fontFamily: '"Barlow", sans-serif', fontWeight: 700 }}
            >
              {textoPorVencer(diasParaVencer)}
            </span>
          )}
          <span className="text-3xl font-semibold" style={{ fontFamily: '"Barlow", sans-serif' }}>
            {hora}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-12 p-12">
        <div
          className="relative flex h-56 w-56 items-center justify-center overflow-hidden rounded-full text-7xl"
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            color,
            background: "var(--gx-surface-2)",
            border: `4px solid ${color}`,
          }}
        >
          {resultado.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image
            <img src={resultado.fotoUrl} alt={resultado.nombre} className="h-full w-full object-cover" />
          ) : (
            iniciales(resultado.nombre)
          )}
        </div>

        <div className="flex flex-col gap-6">
          {CARAS_CON_ACCESO.includes(cara) && (
            <p className="text-4xl" style={{ fontFamily: '"Bebas Neue", sans-serif', color, letterSpacing: "0.02em" }}>
              {FRASE_BIENVENIDA_NEUTRA}
            </p>
          )}
          <p className="break-words text-8xl uppercase leading-none" style={{ fontFamily: '"Bebas Neue", sans-serif', color: "var(--gx-ink)" }}>
            {nombre}
          </p>

          {cara === "sucursal_incorrecta" ? (
            <div className="border-t pt-6" style={{ borderColor: "var(--gx-edge)" }}>
              <span className={ETIQUETA_DATO} style={ESTILO_ETIQUETA}>
                Tu sede asignada es
              </span>
              <p className="mt-1 text-4xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                {resultado.sucursalAsignadaNombre}
              </p>
              {resultado.sucursalAsignadaDireccion && (
                <p className="text-3xl" style={{ color: "var(--gx-muted)" }}>
                  {resultado.sucursalAsignadaDireccion}
                </p>
              )}
            </div>
          ) : (
            <>
              {(cara === "en_gracia" || cara === "vencido" || cara === "abono_vencido") && (
                <p className="border-t pt-6 text-3xl font-medium" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-warn)" }}>
                  {cara === "en_gracia"
                    ? `Tenés ${resultado.diasGraciaRestantes ?? 0} día(s) de gracia — acercate a recepción a renovar tu plan.`
                    : cara === "abono_vencido"
                      ? "Completa tu pago para reactivar el acceso — acércate a recepción."
                      : resultado.tieneGraciaConfigurada
                        ? "Tu período de gracia terminó — acercate a recepción a renovar tu plan."
                        : "Acercate a recepción a renovar tu plan."}
                </p>
              )}
              <div className="grid grid-cols-3 gap-6 border-t pt-6" style={{ borderColor: "var(--gx-edge)" }}>
                <div className="flex flex-col gap-1">
                  <span className={ETIQUETA_DATO} style={ESTILO_ETIQUETA}>
                    Entrada
                  </span>
                  <span className="text-4xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                    {hora}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className={ETIQUETA_DATO} style={ESTILO_ETIQUETA}>
                    Vence
                  </span>
                  <span className="text-4xl font-semibold" style={{ color: acceso ? "var(--gx-ink)" : "var(--gx-warn)" }}>
                    {formatearFecha(resultado.fechaVencimiento)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className={ETIQUETA_DATO} style={ESTILO_ETIQUETA}>
                    Entrenador
                  </span>
                  <span className="text-4xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                    {resultado.entrenador ?? "—"}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </MarcoFicha>
  );
}
```

- [ ] **Step 2: Reescribir `FondoVideo.tsx`**

Reemplazar todo `apps/kiosk/components/FondoVideo.tsx` por:

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { Tono } from "@/lib/cara";

export interface Reaccion {
  // Cambia en cada verificación para reiniciar el destello y la aceleración.
  id: number;
  tono: Tono;
}

const VELOCIDAD_PICO = 1.8;
const DURACION_REACCION_MS = 1_500;

// Video de fondo en bucle. `muted` + `playsInline` son obligatorios para que el autoplay funcione en
// navegador, PWA, WebView2 y Android TV (el mp4 puede traer pista de audio). El póster evita el
// negro al cargar. Al validar una cédula acelera a VELOCIDAD_PICO y vuelve a 1x, y lanza un
// destello radial del color del resultado.
export function FondoVideo({ reaccion }: { reaccion: Reaccion | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!reaccion || !video) return;

    const inicio = performance.now();
    let cuadro = 0;
    const paso = (ahora: number) => {
      const avance = Math.min((ahora - inicio) / DURACION_REACCION_MS, 1);
      video.playbackRate = VELOCIDAD_PICO - (VELOCIDAD_PICO - 1) * avance;
      if (avance < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);

    return () => {
      cancelAnimationFrame(cuadro);
      video.playbackRate = 1;
    };
  }, [reaccion]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/branding/backgound.jpg"
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover"
      >
        <source src="/branding/backgound1.mp4" type="video/mp4" />
      </video>
      {reaccion && <div key={reaccion.id} className={`destello destello-${reaccion.tono}`} aria-hidden />}
    </>
  );
}
```

- [ ] **Step 3: Quitar el video del layout**

En `apps/kiosk/app/layout.tsx`: borrar la línea `import { FondoVideo } from "../components/FondoVideo";` y la línea `<FondoVideo />` dentro del `<body>` (ahora lo monta la página, que es quien conoce la reacción). Dejar el resto igual.

- [ ] **Step 4: Reescribir `page.tsx`**

Reemplazar todo `apps/kiosk/app/page.tsx` por:

```tsx
"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { obtenerApiKey } from "@/lib/config";
import { registrarCheckIn, ErrorCheckIn } from "@/lib/api";
import { encolar, listarPendientes } from "@/lib/colaPendientes";
import { reintentarPendientes } from "@/lib/reintentarPendientes";
import { useEntradaCedula } from "@/lib/useEntradaCedula";
import { estadoInicial, reducirPantalla, type Ficha, type FichaActiva } from "@/lib/estadoPantalla";
import { caraDeResultado, tonoDeCara, type Tono } from "@/lib/cara";
import { precargarFoto } from "@/lib/precargarFoto";
import { FRASES_REPOSO } from "@/lib/frases";
import { useFraseRotativa } from "@/lib/useFraseRotativa";
import { useHoraActual } from "@/lib/useHoraActual";
import { useInfoKiosco } from "@/lib/useInfoKiosco";
import { AccessCard } from "@/components/AccessCard";
import { FichaAviso } from "@/components/FichaAviso";
import { FichaGiratoria } from "@/components/FichaGiratoria";
import { FichaReposo } from "@/components/FichaReposo";
import { FondoVideo, type Reaccion } from "@/components/FondoVideo";

// Cuánto tiempo se queda la ficha real en pantalla antes de volver al reposo.
const DURACION_FICHA_MS = 7_000;
// Tope de espera por la foto antes de voltear la ficha (si falla, sale con iniciales).
const ESPERA_FOTO_MS = 1_500;

// Recuadro del campo de cédula, igual con y sin host nativo.
const CLASES_CAMPO_CEDULA = "w-full max-w-2xl text-center text-6xl tracking-widest rounded-xl border-2 px-6 py-4";
const ESTILO_CAMPO_CEDULA = { borderColor: "var(--gx-accent)", color: "var(--gx-ink)" };

function contenidoFicha(ficha: FichaActiva) {
  switch (ficha.tipo) {
    case "resultado":
      return (
        <AccessCard
          resultado={ficha.resultado}
          hora={ficha.hora}
          cara={ficha.cara}
          diasParaVencer={ficha.diasParaVencer}
          duracionMs={DURACION_FICHA_MS}
        />
      );
    case "pendiente":
      return (
        <FichaAviso
          tono="ambar"
          titulo="Sin conexión"
          detalle="Tu entrada se guardó y se enviará sola cuando vuelva la red."
          duracionMs={DURACION_FICHA_MS}
        />
      );
    case "error":
      return <FichaAviso tono="rojo" titulo="No se pudo registrar" detalle={ficha.mensaje} duracionMs={DURACION_FICHA_MS} />;
  }
}

export default function PaginaCheckIn() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [pantalla, despachar] = useReducer(reducirPantalla, estadoInicial);
  const [reaccion, setReaccion] = useState<Reaccion | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const { cedula, limpiar, sinInput, propsInput } = useEntradaCedula({ alEnviar: enviar });
  const { frase, saliendo } = useFraseRotativa(FRASES_REPOSO);
  const hora = useHoraActual();
  const info = useInfoKiosco(apiKey);

  useEffect(() => {
    const clave = obtenerApiKey();
    if (!clave) {
      router.replace("/config");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee localStorage tras el montaje (SSR-safe, ver ADR de output: "export")
    setApiKey(clave);
  }, [router]);

  const actualizarPendientes = useCallback(() => {
    listarPendientes().then((lista) => setPendientes(lista.length));
  }, []);

  useEffect(() => {
    if (!apiKey) return;

    actualizarPendientes();
    reintentarPendientes(apiKey).then(actualizarPendientes);

    const alReconectar = () => {
      reintentarPendientes(apiKey).then(actualizarPendientes);
    };
    window.addEventListener("online", alReconectar);
    return () => window.removeEventListener("online", alReconectar);
  }, [apiKey, actualizarPendientes]);

  // La ficha real vuelve sola al reposo a los 7 s; una respuesta nueva la reemplaza antes y su id
  // distinto reinicia el conteo (el temporizador de la anterior se cancela al cambiar el id).
  const fichaId = pantalla.ficha?.id;
  useEffect(() => {
    if (fichaId === undefined) return;
    const temporizador = setTimeout(() => despachar({ tipo: "vencio", id: fichaId }), DURACION_FICHA_MS);
    return () => clearTimeout(temporizador);
  }, [fichaId]);

  async function mostrar(ficha: Ficha, tono: Tono) {
    // La foto se baja ANTES de voltear para que la ficha no aparezca a medio cargar.
    if (ficha.tipo === "resultado" && ficha.resultado.fotoUrl) {
      await precargarFoto(ficha.resultado.fotoUrl, ESPERA_FOTO_MS);
    }
    despachar({ tipo: "respuesta", ficha });
    setReaccion((previa) => ({ id: (previa?.id ?? 0) + 1, tono }));
  }

  async function enviar(cedula: string) {
    if (!apiKey || !cedula || pantalla.procesando) return;

    despachar({ tipo: "enviar" });

    // Primero se resuelve qué mostrar y recién después se muestra: un fallo al mostrar no debe
    // confundirse con una red caída (que encolaría la cédula por error).
    let salida: { ficha: Ficha; tono: Tono };
    try {
      const resultado = await registrarCheckIn(apiKey, cedula);
      const ahora = new Date();
      const { cara, diasParaVencer } = caraDeResultado(resultado, ahora);
      salida = {
        ficha: {
          tipo: "resultado",
          resultado,
          hora: ahora.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" }),
          cara,
          diasParaVencer,
        },
        tono: tonoDeCara(cara),
      };
    } catch (error) {
      if (error instanceof ErrorCheckIn) {
        salida = { ficha: { tipo: "error", mensaje: error.message }, tono: "rojo" };
      } else {
        await encolar(cedula);
        actualizarPendientes();
        salida = { ficha: { tipo: "pendiente" }, tono: "ambar" };
      }
    }

    await mostrar(salida.ficha, salida.tono);
    limpiar();
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center gap-[4vmin] p-[5vmin]"
      style={{ color: "var(--gx-ink)" }}
    >
      <FondoVideo reaccion={reaccion} />

      {pendientes > 0 && (
        <div
          className="fixed right-[5vmin] top-[5vmin] rounded px-3 py-1 text-xl"
          style={{ background: "var(--gx-bad)", color: "var(--gx-bad-ink)" }}
        >
          {pendientes} pendiente{pendientes === 1 ? "" : "s"} por sincronizar
        </div>
      )}

      <div className="flex w-full flex-col items-center gap-2">
        <h1 className="text-7xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}>
          Ingresa tu cédula
        </h1>

        {sinInput ? (
          // Dentro de apps/kiosk-host o de la APK la cédula llega por teclas del numpad: no hace falta foco.
          <div className={`${CLASES_CAMPO_CEDULA} min-h-[5.5rem]`} style={ESTILO_CAMPO_CEDULA}>
            {cedula}
          </div>
        ) : (
          <input {...propsInput} className={`${CLASES_CAMPO_CEDULA} bg-transparent outline-none`} style={ESTILO_CAMPO_CEDULA} />
        )}

        <p className="min-h-[2.5rem] text-3xl" style={{ color: "var(--gx-muted)" }}>
          {pantalla.procesando ? "Verificando…" : ""}
        </p>
      </div>

      <div className="flex w-full flex-1 items-center justify-center">
        <FichaGiratoria
          ficha={pantalla.ficha}
          renderReposo={() => (
            <FichaReposo
              frase={frase}
              saliendo={saliendo}
              hora={hora}
              tasa={info?.tasaBcv ?? null}
              sede={info?.sucursalNombre ?? null}
            />
          )}
          renderFicha={contenidoFicha}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verificar**

Run: `npm test --workspace apps/kiosk` → Expected: PASS (todos).
Run: `npx tsc --noEmit -p apps/kiosk` → Expected: sin errores.
Run: `npm run lint --workspace apps/kiosk` → Expected: 0 errores. Si `react-hooks/refs` o `set-state-in-effect` marcan una línea nueva, usar el mismo patrón de `eslint-disable-next-line ... -- motivo` que ya usa el repo en `page.tsx`/`useInfoKiosco`; no cambiar la lógica.
Run: `npm run build --workspace apps/kiosk` → Expected: build de export estático sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/kiosk/components/AccessCard.tsx apps/kiosk/components/FondoVideo.tsx apps/kiosk/app/page.tsx apps/kiosk/app/layout.tsx
git commit -m "integra el reposo, el flip, la ficha de 7 s y el video reactivo en la pantalla del kiosco"
git push origin main
```

---

### Task 10: Service worker — imágenes del reposo sin red

**Files:**
- Modify: `apps/kiosk/public/sw.js`

**Interfaces:** ninguna (config estática).

- [ ] **Step 1: Precachear las imágenes del reposo y subir la versión**

En `apps/kiosk/public/sw.js` cambiar:

```js
const CACHE = "kiosco-shell-v2";
const RECURSOS_SHELL = ["/", "/config", "/manifest.json", "/icon-192.png", "/icon-512.png"];
```

por:

```js
const CACHE = "kiosco-shell-v3";
const RECURSOS_SHELL = [
  "/",
  "/config",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/branding/placeholder-profile.jpg",
  "/branding/logo-adrenalina-gym.jpg",
  "/branding/backgound.jpg",
];
```

(El video no se precachea: pesa varios MB y el handler ya lo deja pasar al navegador. Si falta alguna de esas rutas, `cache.addAll` falla y el SW no se instala: comprobar que las tres existen en `apps/kiosk/public/branding/`.)

- [ ] **Step 2: Verificar que los archivos existen**

Run: `ls apps/kiosk/public/branding/placeholder-profile.jpg apps/kiosk/public/branding/logo-adrenalina-gym.jpg apps/kiosk/public/branding/backgound.jpg`
Expected: los tres listados sin error. Si `placeholder-profile.jpg` aparece como no versionado en `git status`, incluirlo en el `git add` del Step 3.

- [ ] **Step 3: Commit**

```bash
git add apps/kiosk/public/sw.js apps/kiosk/public/branding/placeholder-profile.jpg
git commit -m "precachea las imágenes del reposo en el service worker del kiosco"
git push origin main
```

---

### Task 11: Recodificar el video de fondo (lo ejecuta el usuario)

**Files:**
- Modify: `apps/kiosk/public/branding/backgound1.mp4` (binario)

**Nota:** en esta máquina no hay `ffmpeg`. Esta tarea la corre el usuario (o quien tenga ffmpeg); el resto del plan funciona con el video actual.

- [ ] **Step 1: Instalar ffmpeg (si falta)**

Run (PowerShell): `winget install Gyan.FFmpeg` y abrir una consola nueva.
Run: `ffmpeg -version` → Expected: imprime la versión.

- [ ] **Step 2: Recodificar a ~1,8 Mbps, sin audio, perfil Main**

Run (desde la raíz del repo):

```bash
ffmpeg -i apps/kiosk/public/branding/backgound1.mp4 -an -c:v libx264 -profile:v main -b:v 1800k -maxrate 2000k -bufsize 4000k -movflags +faststart apps/kiosk/public/branding/backgound1.nuevo.mp4
```

Expected: genera `backgound1.nuevo.mp4` de ~2 MB (el original pesa ~10 MB).

- [ ] **Step 3: Reemplazar y revisar a ojo**

```bash
mv apps/kiosk/public/branding/backgound1.nuevo.mp4 apps/kiosk/public/branding/backgound1.mp4
```

Abrir el video: debe verse igual de fluido y sin salto notable en el reinicio del bucle (a los 10 s). Si se nota la costura, avisar: hay que re-exportar con fundido.

- [ ] **Step 4: Commit**

```bash
git add apps/kiosk/public/branding/backgound1.mp4
git commit -m "recodifica el video de fondo del kiosco a 1,8 Mbps sin audio"
git push origin main
```

---

### Task 12: Verificación manual de punta a punta y handoff

**Files:**
- Modify: `handoff.md`

- [ ] **Step 1: Levantar todo**

Terminal A: `npm run dev --workspace apps/web-admin` (puerto 3000).
Terminal B: `$env:NEXT_PUBLIC_API_URL = "http://localhost:3000"; npm run dev --workspace apps/kiosk` (puerto 3001).
Abrir `http://localhost:3001/config`, pegar la API key de una sucursal real (por ejemplo la de `zip-gym`; cédulas de prueba 90000001–90000100) y entrar a `/`.

- [ ] **Step 2: Recorrer la lista (marcar cada punto)**

1. Reposo: se ve la ficha neutra (borde apagado, sin verde ni ✓) con la ilustración de la pareja en el círculo, hora, **Bs. de la tasa** y nombre de la sede; la frase cambia cada ~4,5 s con salida y entrada animadas y sin repetir hasta agotar las 10.
2. Teclear una cédula válida con el numpad + Enter: aparece "Verificando…", la ficha **gira en 3D (~0,7 s)** con foto, nombre corto, saludo "¡BIENVENID@, ADRENALINER!", Entrada/Vence/Entrenador y la barra de cuenta regresiva; el video acelera y vuelve a velocidad normal, con destello verde.
3. A los **7 s** gira de vuelta al reposo (no antes ni después).
4. Con una ficha visible, teclear y enviar otra cédula: el campo muestra los dígitos **sin cerrar la ficha**, y al responder la ficha gira **directo** a la nueva (sin pasar por reposo) y la cuenta regresiva se reinicia. Enviar dos cédulas casi seguidas: la ficha de la segunda no desaparece cuando se cumplen los 7 s de la primera.
5. Cédula de miembro **activo que vence en ≤ 5 días** (editar el vencimiento en el panel): cara verde con chip ámbar "Vence en N días". Miembro vencido: cara roja con el mensaje de siempre; en período de gracia: ámbar con los días; sucursal incorrecta: roja con la sede asignada.
6. Cédula inexistente: ficha roja "No se pudo registrar" con el mensaje del servidor, y vuelve sola.
7. Foto rota o lenta (cambiar temporalmente `fotoUrl` a una URL inválida en la base de prueba o cortar la red al cargar la imagen): la ficha gira igual en ~1,5 s con **iniciales**.
8. Cortar la red (DevTools del navegador → Offline) y enviar una cédula: ficha ámbar "Sin conexión"; el contador de pendientes aparece arriba a la derecha. Recargar con la red cortada: el reposo se ve completo y la tasa y la sede salen de lo guardado (si nunca hubo red, salen "—").
9. Teclado: el numpad escribe; en un navegador de escritorio (no Android) la fila numérica normal sigue funcionando por el `<input>` de siempre. En un dispositivo Android (o simulando el user agent), `Digit1` y `Enter` normal **no** escriben; `Numpad1`, `NumpadEnter`, `Backspace` y `Escape` sí.
10. Con `prefers-reduced-motion` activado en el sistema, el flip es casi instantáneo y no hay animación de frase ni destello.
11. Probar a 1920×1080 y a 1366×768: nada se corta en los bordes (overscan 5 %) y los textos se leen a distancia. Anotar si en el TV real hay que escalar el tamaño base (`html { font-size }` en `globals.css`); es un ajuste de una línea.

Anotar cualquier fallo y corregirlo antes de cerrar.

- [ ] **Step 3: Actualizar `handoff.md`**

Con los 5 apartados de CLAUDE.md: en "Estado actual" añadir que la Fase 1 del rediseño está implementada y qué falta (desplegar kiosco **y** web-admin, probar en TV real, Fases 2 y 3); en "Archivos y cambios" listar los archivos de este plan; en "Intentos fallidos" **añadir** (sin borrar nada) lo que no haya funcionado durante la ejecución; en "Próximos pasos" el despliegue, la prueba con el TV y numpad reales (Num Lock) y los planes de F2 y F3.

- [ ] **Step 4: Commit**

```bash
git add handoff.md
git commit -m "actualiza el handoff con la fase 1 del rediseño del kiosco"
git push origin main
```

---

## Self-Review (hecha al escribir el plan)

- **Cobertura del spec (§10 Fase 1):** reposo con ilustración, sede y tasa → Tasks 6, 7, 8; ficha real 7 s con cuenta regresiva → Tasks 4, 8, 9; flip 3D → Task 8; caras incl. `por_vencer` → Tasks 2, 9; video recodificado + reacción → Tasks 9, 11; frases neutras → Tasks 3, 7, 8; numpad por `keydown` → Task 5; tokens sin `color-mix()` → Tasks 2, 9. Offline de las imágenes del reposo → Task 10. F2 (saludo, cumpleaños, campaña) y F3 (APK) quedan explícitamente fuera.
- **Sin marcadores pendientes:** todos los pasos de código llevan el código completo.
- **Consistencia de tipos:** `Ficha`/`FichaActiva`/`EstadoPantalla` (Task 4) se usan igual en Tasks 8 y 9; `CaraFicha`/`Tono` (Task 2) en Tasks 4, 8, 9; `InfoKiosco` (Task 7) en Tasks 8 y 9; el hook devuelve `sinInput` (Task 5) y `page.tsx` lo usa así en las Tasks 5 y 9; `Reaccion` se exporta desde `FondoVideo` y se importa en `page.tsx`.
- **Riesgos que quedan para la prueba en el TV:** tamaño base de texto según el viewport real (dpr), `Num Lock` del numpad, y decodificación del video en el WebView del TV.
