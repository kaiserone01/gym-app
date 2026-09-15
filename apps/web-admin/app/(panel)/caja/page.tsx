import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaCierreCajaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCierreCajaRepository";
import { obtenerReporteCaja } from "@gym-app/domain/use-cases/ObtenerReporteCaja";
import { Button } from "@gym-app/ui/components/Button";
import { METODOS_PAGO } from "../metodosPago";
import { BotonImprimir } from "../BotonImprimir";
import { cerrarCajaAction } from "./actions";

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

      <p className="mb-4 text-sm text-neutral-500">
        {formatearFechaISO(desde)} — {formatearFechaISO(hasta)}
        {cierreDelDia && <span className="ml-2 font-medium text-green-700">✓ Día cerrado</span>}
      </p>

      <table className="mb-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Fecha</th>
            <th className="py-2">Miembro</th>
            <th className="py-2">Tipo</th>
            <th className="py-2">Método</th>
            <th className="py-2">N° operación</th>
            <th className="py-2">Monto (USD)</th>
          </tr>
        </thead>
        <tbody>
          {reporte.filas.map((fila) => (
            <tr key={fila.pagoId} className="border-b">
              <td className="py-2">{new Date(fila.fechaPago).toLocaleDateString("es-VE")}</td>
              <td className="py-2">{fila.miembroNombre}</td>
              <td className="py-2">{fila.esAlta ? "Alta" : "Renovación"}</td>
              <td className="py-2">{nombreMetodo(fila.metodo)}</td>
              <td className="py-2">{fila.numeroOperacion ?? "—"}</td>
              <td className="py-2">${fila.monto.toFixed(2)}</td>
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

      <div className="mb-6 flex flex-col gap-1 rounded-xl border border-neutral-200 p-5 text-sm">
        {Object.entries(reporte.desglosePorMetodo).map(([metodo, monto]) => (
          <div key={metodo} className="flex justify-between">
            <span className="text-neutral-500">{nombreMetodo(metodo)}</span>
            <span className="font-medium text-neutral-900">${monto.toFixed(2)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 text-base">
          <span className="font-semibold text-neutral-700">Total</span>
          <span className="font-bold text-neutral-900">${reporte.totalUSD.toFixed(2)}</span>
        </div>
      </div>

      {periodo === "dia" && !cierreDelDia && (
        <form action={cerrarCajaAction} className="print:hidden">
          <input type="hidden" name="fecha" value={formatearFechaISO(fechaBase)} />
          <Button type="submit">Cerrar caja de este día</Button>
        </form>
      )}
    </div>
  );
}
