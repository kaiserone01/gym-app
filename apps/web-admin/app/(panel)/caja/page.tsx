import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaCierreCajaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCierreCajaRepository";
import { obtenerReporteCaja } from "@gym-app/domain/use-cases/ObtenerReporteCaja";
import { Button } from "@gym-app/ui/components/Button";
import { METODOS_PAGO } from "../metodosPago";
import { BotonImprimir } from "../BotonImprimir";
import { TASA_BCV_FIJA, formatearBs } from "../tasaBcvFija";
import { PRESETS_PLAN_MIEMBRO } from "../miembros/planesPreset";
import { DetalleColapsable } from "./DetalleColapsable";
import { cerrarCajaAction } from "./actions";
import type { FilaReporteCaja } from "@gym-app/domain/use-cases/ObtenerReporteCaja";

// OJO: nunca usar fecha.toISOString() acá — convierte a UTC primero, y de
// noche (pasadas las 8pm en Venezuela, UTC-4) eso salta al día siguiente.
// Se arma el string a mano con los componentes locales de la fecha.
function formatearFechaISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function inicioDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function finDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
}

function inicioDeSemana(fecha: Date): Date {
  const d = inicioDelDia(fecha);
  const dia = d.getDay(); // 0 = domingo
  const diff = dia === 0 ? 6 : dia - 1; // semana empieza lunes
  d.setDate(d.getDate() - diff);
  return d;
}

function finDeSemana(fecha: Date): Date {
  const d = inicioDeSemana(fecha);
  d.setDate(d.getDate() + 6);
  return finDelDia(d);
}

function inicioDeMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function finDeMes(fecha: Date): Date {
  return finDelDia(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0));
}

function nombreMetodo(valor: string): string {
  return METODOS_PAGO.find((m) => m.value === valor)?.label ?? valor;
}

// El plan que pagó cada fila no se guarda en el Pago — se infiere del
// precio del plan que el Miembro tiene hoy, comparándolo contra el
// catálogo fijo de presets. No matchea ⇒ el miembro tiene un precio
// "Personalizado" (o cambió de plan después de este pago).
function nombrePlan(precioPlan: number): string {
  return PRESETS_PLAN_MIEMBRO.find((preset) => preset.precio === precioPlan)?.nombre ?? "Personalizado";
}

interface GrupoPlan {
  cantidad: number;
  monto: number;
}

interface GrupoMetodo {
  metodo: string;
  cantidad: number;
  monto: number;
  porPlan: Map<string, GrupoPlan>;
}

function agruparPorMetodoYPlan(filas: FilaReporteCaja[]): GrupoMetodo[] {
  const grupos = new Map<string, GrupoMetodo>();

  for (const fila of filas) {
    let grupo = grupos.get(fila.metodo);
    if (!grupo) {
      grupo = { metodo: fila.metodo, cantidad: 0, monto: 0, porPlan: new Map() };
      grupos.set(fila.metodo, grupo);
    }
    grupo.cantidad += 1;
    grupo.monto += fila.monto;

    const plan = nombrePlan(fila.miembroPrecioPlan);
    const grupoPlan = grupo.porPlan.get(plan) ?? { cantidad: 0, monto: 0 };
    grupoPlan.cantidad += 1;
    grupoPlan.monto += fila.monto;
    grupo.porPlan.set(plan, grupoPlan);
  }

  return [...grupos.values()].sort((a, b) => b.monto - a.monto);
}

export default async function PaginaCaja({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; periodo?: string }>;
}) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const { fecha: fechaTexto, periodo = "dia" } = await searchParams;
  const fechaBase = fechaTexto ? new Date(`${fechaTexto}T00:00:00`) : new Date();

  const { desde, hasta } =
    periodo === "semana"
      ? { desde: inicioDeSemana(fechaBase), hasta: finDeSemana(fechaBase) }
      : periodo === "mes"
        ? { desde: inicioDeMes(fechaBase), hasta: finDeMes(fechaBase) }
        : { desde: inicioDelDia(fechaBase), hasta: finDelDia(fechaBase) };

  const reporte = await obtenerReporteCaja(
    { pagos: new PrismaPagoRepository(prisma) },
    { organizacionId: usuario.organizacionId, desde, hasta }
  );

  const cierreDelDia =
    periodo === "dia"
      ? await new PrismaCierreCajaRepository(prisma).buscarPorFecha(usuario.organizacionId, inicioDelDia(fechaBase))
      : null;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Cierre de Caja</h1>
        <BotonImprimir />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-4 print:hidden">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Fecha
          <input
            type="date"
            name="fecha"
            defaultValue={formatearFechaISO(fechaBase)}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Período
          <select name="periodo" defaultValue={periodo} className="rounded border border-neutral-300 px-3 py-2">
            <option value="dia">Día</option>
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </select>
        </label>
        <Button type="submit">Ver</Button>
      </form>

      <div className="mb-4 flex items-center gap-3 text-sm text-neutral-500">
        <span>
          {formatearFechaISO(desde)} — {formatearFechaISO(hasta)}
        </span>
        {cierreDelDia && <span className="font-medium text-green-700">✓ Día cerrado</span>}
        <span className="ml-auto text-base font-semibold text-neutral-900">
          Total: ${reporte.totalUSD.toFixed(2)}
        </span>
      </div>

      <DetalleColapsable abiertoPorDefecto={!cierreDelDia}>
        <table className="mb-6 w-full border-collapse text-left">
          <thead>
            <tr className="border-b text-sm text-neutral-500">
              <th className="py-2">Fecha</th>
              <th className="py-2">Miembro</th>
              <th className="py-2">Método</th>
              <th className="py-2">N° operación</th>
              <th className="py-2">Monto (USD)</th>
              <th className="py-2">Monto (Bs)</th>
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((fila) => (
              <tr key={fila.pagoId} className="border-b">
                <td className="py-2">{new Date(fila.fechaPago).toLocaleDateString("es-VE")}</td>
                <td className="py-2">{fila.miembroNombre}</td>
                <td className="py-2">{nombreMetodo(fila.metodo)}</td>
                <td className="py-2">{fila.numeroOperacion ?? "—"}</td>
                <td className="py-2">${fila.monto.toFixed(2)}</td>
                <td className="py-2">Bs. {formatearBs(fila.monto * TASA_BCV_FIJA)}</td>
              </tr>
            ))}

            {reporte.filas.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-500">
                  Sin pagos en este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-neutral-200 p-5 text-sm">
          {agruparPorMetodoYPlan(reporte.filas).map((grupo) => (
            <div key={grupo.metodo}>
              <div className="flex justify-between">
                <span className="font-medium text-neutral-900">
                  {nombreMetodo(grupo.metodo)}{" "}
                  <span className="font-normal text-neutral-500">
                    ({grupo.cantidad} {grupo.cantidad === 1 ? "operación" : "operaciones"})
                  </span>
                </span>
                <span className="font-medium text-neutral-900">${grupo.monto.toFixed(2)}</span>
              </div>
              <div className="ml-4 mt-1 flex flex-col gap-0.5">
                {[...grupo.porPlan.entries()].map(([plan, datos]) => (
                  <div key={plan} className="flex justify-between text-neutral-500">
                    <span>
                      {datos.cantidad} {plan}
                    </span>
                    <span>${datos.monto.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {reporte.filas.length === 0 && <p className="text-neutral-500">Sin pagos en este período.</p>}

          <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 text-base">
            <span className="font-semibold text-neutral-700">Total</span>
            <span className="font-bold text-neutral-900">${reporte.totalUSD.toFixed(2)}</span>
          </div>
        </div>
      </DetalleColapsable>

      {periodo === "dia" && !cierreDelDia && (
        <form action={cerrarCajaAction} className="print:hidden">
          <input type="hidden" name="fecha" value={formatearFechaISO(fechaBase)} />
          <Button type="submit">Cerrar caja de este día</Button>
        </form>
      )}
    </div>
  );
}
