"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@gym-app/ui/components/Input";
import { Button } from "@gym-app/ui/components/Button";
import { Card } from "@gym-app/ui/components/Card";
import { Badge } from "@gym-app/ui/components/Badge";
import { EstadoToggle } from "./EstadoToggle";
import { DiasDisponibles, diasHastaVencimiento } from "./vencimiento";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import type { Plan } from "@gym-app/domain/entities/Plan";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

const MINIMO_CARACTERES_BUSQUEDA = 3;

type ModoVista = "cards" | "lista";

type FiltroProximoCobro = "todos" | "vencidos" | "7" | "15" | "30";

const OPCIONES_PROXIMO_COBRO: { valor: FiltroProximoCobro; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "vencidos", etiqueta: "Vencidos" },
  { valor: "7", etiqueta: "Próximos 7 días" },
  { valor: "15", etiqueta: "Próximos 15 días" },
  { valor: "30", etiqueta: "Próximos 30 días" },
];

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function formatearFecha(fecha: Date): string {
  return new Date(fecha).toLocaleDateString("es-VE");
}

function Avatar({ fotoUrl, nombre, tamano }: { fotoUrl: string | null; nombre: string; tamano: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
      style={{
        width: tamano,
        height: tamano,
        fontSize: tamano / 3.5,
        background: "var(--gx-surface-2)",
        color: "var(--gx-muted)",
      }}
    >
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto de miembro servida desde R2, dominio externo
        <img src={fotoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        iniciales(nombre || "?")
      )}
    </div>
  );
}

interface FilaMiembro extends Miembro {
  plan: Plan | undefined;
  sucursalNombre: string;
}

export function ListaMiembros({
  miembros,
  planes,
  sucursales,
  accionesHeader,
}: {
  miembros: Miembro[];
  planes: Plan[];
  sucursales: SucursalResumen[];
  // Botón "Nuevo miembro" (o su versión deshabilitada) — vive en page.tsx
  // porque depende de si hay turno de caja abierto, pero se renderiza acá
  // arriba, junto al título y el toggle Cards/Lista (ver diseño acordado).
  accionesHeader?: React.ReactNode;
}) {
  const [modo, setModo] = useState<ModoVista>("cards");
  const [busqueda, setBusqueda] = useState("");
  const [inscritoDesde, setInscritoDesde] = useState("");
  const [venceHasta, setVenceHasta] = useState("");
  const [planFiltro, setPlanFiltro] = useState("");
  const [proximoCobroFiltro, setProximoCobroFiltro] = useState<FiltroProximoCobro>("todos");

  const planesPorId = useMemo(() => new Map(planes.map((plan) => [plan.id, plan])), [planes]);
  const sucursalesPorId = useMemo(() => new Map(sucursales.map((s) => [s.id, s.nombre])), [sucursales]);

  const filas: FilaMiembro[] = useMemo(
    () =>
      miembros.map((miembro) => ({
        ...miembro,
        plan: miembro.planId ? planesPorId.get(miembro.planId) : undefined,
        sucursalNombre: miembro.sucursalId === null ? "Ambas" : sucursalesPorId.get(miembro.sucursalId) ?? "—",
      })),
    [miembros, planesPorId, sucursalesPorId]
  );

  const filtradas = useMemo(() => {
    const busquedaAplicada = busqueda.trim().length >= MINIMO_CARACTERES_BUSQUEDA ? busqueda.trim().toLowerCase() : "";

    return filas.filter((miembro) => {
      if (busquedaAplicada && !`${miembro.nombre} ${miembro.cedula}`.toLowerCase().includes(busquedaAplicada)) {
        return false;
      }

      const inscripcion = miembro.fechaInscripcion ?? miembro.createdAt;
      if (inscritoDesde && inscripcion < new Date(`${inscritoDesde}T00:00:00`)) return false;

      if (venceHasta) {
        if (!miembro.fechaVencimiento || miembro.fechaVencimiento > new Date(`${venceHasta}T23:59:59`)) {
          return false;
        }
      }

      if (planFiltro && miembro.planId !== planFiltro) return false;

      if (proximoCobroFiltro !== "todos") {
        if (!miembro.fechaVencimiento) return false;
        const dias = diasHastaVencimiento(miembro.fechaVencimiento);
        if (proximoCobroFiltro === "vencidos") {
          if (dias >= 0) return false;
        } else {
          const limite = Number(proximoCobroFiltro);
          if (dias < 0 || dias > limite) return false;
        }
      }

      return true;
    });
  }, [filas, busqueda, inscritoDesde, venceHasta, planFiltro, proximoCobroFiltro]);

  function limpiarFiltros() {
    setBusqueda("");
    setInscritoDesde("");
    setVenceHasta("");
    setPlanFiltro("");
    setProximoCobroFiltro("todos");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <h1 className="text-2xl font-bold" style={{ color: "var(--gx-ink)" }}>
          Miembros
        </h1>
        <div className="flex items-center gap-3">
          <div className="hidden gap-1 rounded-lg border p-1 lg:flex" style={{ borderColor: "var(--gx-edge)" }}>
            <Button type="button" variant={modo === "cards" ? "primario" : "fantasma"} onClick={() => setModo("cards")}>
              Cards
            </Button>
            <Button type="button" variant={modo === "lista" ? "primario" : "fantasma"} onClick={() => setModo("lista")}>
              Lista
            </Button>
          </div>
          {accionesHeader}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-4 print:hidden">
        <Input
          label="Nombre o cédula"
          type="text"
          placeholder="Mínimo 3 caracteres..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <Input
          label="Inscritos desde"
          type="date"
          value={inscritoDesde}
          onChange={(e) => setInscritoDesde(e.target.value)}
        />
        <Input label="Vencidos hasta" type="date" value={venceHasta} onChange={(e) => setVenceHasta(e.target.value)} />

        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Plan
          <select
            value={planFiltro}
            onChange={(e) => setPlanFiltro(e.target.value)}
            className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            <option value="">Todos los planes</option>
            {planes.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Próximo cobro
          <select
            value={proximoCobroFiltro}
            onChange={(e) => setProximoCobroFiltro(e.target.value as FiltroProximoCobro)}
            className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            {OPCIONES_PROXIMO_COBRO.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <Button type="button" variant="secundario" onClick={limpiarFiltros}>
          Limpiar
        </Button>
      </div>

      {/* Forzado a Cards por debajo de lg, sin importar el toggle (ver diseño acordado). */}
      <div className="lg:hidden print:hidden">
        <VistaCards miembros={filtradas} />
      </div>
      <div className="hidden lg:block print:hidden">
        {modo === "cards" ? <VistaCards miembros={filtradas} /> : <VistaLista miembros={filtradas} />}
      </div>

      {/* Vista exclusiva de impresión: siempre la lista completa, sin fotos ni acciones, sin importar el modo elegido en pantalla. */}
      <div className="hidden print:block">
        <VistaImpresion miembros={filtradas} />
      </div>
    </div>
  );
}

function VistaImpresion({ miembros }: { miembros: FilaMiembro[] }) {
  const generadoEl = new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-black">Lista de miembros registrados</h1>
        <div className="text-right text-xs text-black">
          <div>Generado el {generadoEl}</div>
          <div>{miembros.length} {miembros.length === 1 ? "miembro" : "miembros"}</div>
        </div>
      </div>
      <table className="w-full border-collapse text-left text-sm text-black">
        <thead>
          <tr className="border-b-2 border-black text-xs uppercase tracking-wide">
            <th className="py-1 pr-2">Nombre</th>
            <th className="py-1 pr-2">Cédula</th>
            <th className="py-1 pr-2">Plan</th>
            <th className="py-1 pr-2">Sede</th>
            <th className="py-1 pr-2">Vencimiento</th>
            <th className="py-1">Estado</th>
          </tr>
        </thead>
        <tbody>
          {miembros.map((miembro) => (
            <tr key={miembro.id} className="border-b border-gray-400">
              <td className="py-1.5 pr-2 font-medium">{miembro.nombre}</td>
              <td className="py-1.5 pr-2">{miembro.cedula}</td>
              <td className="py-1.5 pr-2">{miembro.plan?.nombre ?? "Sin plan"}</td>
              <td className="py-1.5 pr-2">{miembro.sucursalNombre}</td>
              <td className="py-1.5 pr-2">{miembro.fechaVencimiento ? formatearFecha(miembro.fechaVencimiento) : "—"}</td>
              <td className="py-1.5 font-semibold">{miembro.activo ? "Activo" : "Inactivo"}</td>
            </tr>
          ))}

          {miembros.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center">
                Ningún miembro coincide con los filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VistaCards({ miembros }: { miembros: FilaMiembro[] }) {
  if (miembros.length === 0) {
    return (
      <Card>
        <p className="text-center" style={{ color: "var(--gx-muted)" }}>
          Ningún miembro coincide con los filtros.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {miembros.map((miembro) => (
        <Link key={miembro.id} href={`/miembros/${miembro.id}`}>
          <Card className="flex h-full flex-col gap-3 transition-transform active:scale-[0.98]">
            <div className="flex items-center gap-3">
              <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} tamano={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" style={{ color: "var(--gx-ink)" }}>
                  {miembro.nombre}
                </p>
                <p className="truncate text-sm" style={{ color: "var(--gx-muted)" }}>
                  {miembro.plan?.nombre ?? "Sin plan"}
                </p>
              </div>
              <EstadoToggle id={miembro.id} activo={miembro.activo} />
            </div>

            <div
              className="flex items-center justify-between gap-3 border-t pt-3 text-sm"
              style={{ borderColor: "var(--gx-edge)" }}
            >
              <span className="flex flex-wrap items-center gap-2">
                <DiasDisponibles fechaVencimiento={miembro.fechaVencimiento} />
                {miembro.ajustarFecha && <Badge tono="ambar">Ajustar fecha o pago</Badge>}
              </span>
              <span className="font-medium hover:underline" style={{ color: "var(--gx-accent)" }}>
                Editar
              </span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function VistaLista({ miembros }: { miembros: FilaMiembro[] }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b text-sm" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
              <th className="py-2"></th>
              <th className="py-2">Nombre</th>
              <th className="py-2">Cédula</th>
              <th className="py-2">Plan</th>
              <th className="py-2">Sede</th>
              <th className="py-2">Fecha de Vencimiento</th>
              <th className="py-2">Próximo cobro</th>
              <th className="py-2">Estado</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {miembros.map((miembro) => (
              <tr key={miembro.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                <td className="py-2">
                  <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} tamano={36} />
                </td>
                <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                  {miembro.nombre}
                </td>
                <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                  {miembro.cedula}
                </td>
                <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                  {miembro.plan?.nombre ?? "Sin plan"}
                </td>
                <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                  {miembro.sucursalNombre}
                </td>
                <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                  {miembro.fechaVencimiento ? formatearFecha(miembro.fechaVencimiento) : "—"}
                </td>
                <td className="py-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <DiasDisponibles fechaVencimiento={miembro.fechaVencimiento} />
                    {miembro.ajustarFecha && <Badge tono="ambar">Ajustar fecha o pago</Badge>}
                  </span>
                </td>
                <td className="py-2">
                  <EstadoToggle id={miembro.id} activo={miembro.activo} />
                </td>
                <td className="py-2">
                  <Link
                    href={`/miembros/${miembro.id}`}
                    className="text-sm font-medium hover:underline"
                    style={{ color: "var(--gx-accent)" }}
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}

            {miembros.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
                  Ningún miembro coincide con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
