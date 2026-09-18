import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { obtenerResumenTurno } from "@gym-app/domain/use-cases/ObtenerResumenTurno";
import { obtenerReporteCaja } from "@gym-app/domain/use-cases/ObtenerReporteCaja";
import { Button } from "@gym-app/ui/components/Button";
import { METODOS_PAGO } from "../metodosPago";
import { BotonImprimir } from "../BotonImprimir";
import { formatearBs } from "../tasaBcvFija";
import { inicioDelDia, finDelDia, inicioDeSemana, finDeSemana, inicioDeMes, finDeMes, formatearFechaISO } from "../fechas";
import { FormularioAbrirTurno } from "./FormularioAbrirTurno";
import { FormularioEgreso } from "./FormularioEgreso";
import { FormularioArqueo } from "./FormularioArqueo";
import { abrirTurnoAction, registrarEgresoAction, cerrarTurnoAction } from "./actions";

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

  const sucursalId = usuario.sucursalId;
  const turnoRepo = new PrismaTurnoRepository(prisma);
  const turnoAbierto = sucursalId ? await turnoRepo.buscarAbiertoPorSucursal(sucursalId) : null;

  if (turnoAbierto) {
    const resumen = await obtenerResumenTurno(
      {
        turnos: turnoRepo,
        pagos: new PrismaPagoRepository(prisma),
        egresos: new PrismaEgresoRepository(prisma),
      },
      { organizacionId: usuario.organizacionId, turnoId: turnoAbierto.id }
    );

    return (
      <div className="flex flex-col gap-6 p-8">
        <h1 className="text-2xl font-semibold">Turno activo</h1>
        <div className="rounded-xl border border-neutral-200 p-5 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Abierto desde</span>
            <span className="font-medium text-neutral-900">
              {resumen.turno.abiertoEn.toLocaleString("es-VE")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Fondo inicial</span>
            <span className="font-medium text-neutral-900">
              ${resumen.turno.fondoInicialUSD.toFixed(2)} / Bs. {formatearBs(resumen.turno.fondoInicialBs)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 p-5 text-sm">
          <h2 className="mb-3 font-semibold text-neutral-900">Resumen por método</h2>
          {resumen.lineas.map((linea) => (
            <div key={linea.metodo} className="flex justify-between border-b border-neutral-100 py-2">
              <span>{nombreMetodo(linea.metodo)}</span>
              <span className="font-medium text-neutral-900">{linea.montoEsperado.toFixed(2)} esperado</span>
            </div>
          ))}
        </div>

        <FormularioEgreso accion={registrarEgresoAction} turnoId={resumen.turno.id} />

        {resumen.egresos.length > 0 && (
          <div className="rounded-xl border border-neutral-200 p-5 text-sm">
            <h2 className="mb-3 font-semibold text-neutral-900">Egresos del turno</h2>
            {resumen.egresos.map((egreso) => (
              <div key={egreso.id} className="flex justify-between border-b border-neutral-100 py-2">
                <span>{egreso.motivo}</span>
                <span>{egreso.monto.toFixed(2)} {egreso.moneda}</span>
              </div>
            ))}
          </div>
        )}

        <FormularioArqueo accion={cerrarTurnoAction} turnoId={resumen.turno.id} lineas={resumen.lineas} />
      </div>
    );
  }

  const { fecha: fechaTexto, periodo = "dia" } = await searchParams;
  const fechaBase = fechaTexto ? new Date(`${fechaTexto}T00:00:00`) : new Date();

  const { desde, hasta } =
    periodo === "semana"
      ? { desde: inicioDeSemana(fechaBase), hasta: finDeSemana(fechaBase) }
      : periodo === "mes"
        ? { desde: inicioDeMes(fechaBase), hasta: finDeMes(fechaBase) }
        : { desde: inicioDelDia(fechaBase), hasta: finDelDia(fechaBase) };

  const reporte = await obtenerReporteCaja(
    {
      turnos: turnoRepo,
      pagos: new PrismaPagoRepository(prisma),
      egresos: new PrismaEgresoRepository(prisma),
      arqueo: new PrismaArqueoRepository(prisma),
    },
    { organizacionId: usuario.organizacionId, desde, hasta }
  );

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Cierre de Caja</h1>
        <BotonImprimir />
      </div>

      <FormularioAbrirTurno
        accion={abrirTurnoAction}
        requiereSucursal={!sucursalId}
        sucursales={[]}
      />

      <form method="get" className="flex flex-wrap items-end gap-4 print:hidden">
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

      <div className="flex items-center gap-3 text-sm text-neutral-500">
        <span>
          {formatearFechaISO(desde)} — {formatearFechaISO(hasta)}
        </span>
        <span className="ml-auto text-base font-semibold text-neutral-900">
          Total: ${reporte.totalUSD.toFixed(2)}
        </span>
      </div>

      {reporte.turnos.map((fila) => (
        <div key={fila.turno.id} className="rounded-xl border border-neutral-200 p-5 text-sm">
          <div className="mb-2 flex justify-between font-medium text-neutral-900">
            <span>Turno {fila.turno.abiertoEn.toLocaleString("es-VE")}</span>
            <span>Neto: ${fila.netoUSD.toFixed(2)}</span>
          </div>
          <div className="mb-2 flex justify-between text-neutral-500">
            <span>Cobrado: ${fila.totalPagosUSD.toFixed(2)}</span>
            {fila.totalEgresosUSD > 0 && <span>Egresos (USD): -${fila.totalEgresosUSD.toFixed(2)}</span>}
          </div>
          {fila.egresos.length > 0 && (
            <div className="mb-2 flex flex-col gap-1 border-b border-neutral-100 pb-2">
              {fila.egresos.map((egreso) => (
                <div key={egreso.id} className="flex justify-between text-neutral-500">
                  <span>{egreso.motivo}</span>
                  <span>-{egreso.monto.toFixed(2)} {egreso.moneda}</span>
                </div>
              ))}
            </div>
          )}
          {fila.arqueo.map((linea) => (
            <div key={linea.metodo} className="flex justify-between text-neutral-500">
              <span>{nombreMetodo(linea.metodo)}</span>
              <span>
                {linea.montoContado.toFixed(2)} contado ({linea.diferencia === 0 ? "sin diferencia" : `dif. ${linea.diferencia.toFixed(2)}`})
              </span>
            </div>
          ))}
        </div>
      ))}

      {reporte.ajustesFueraDeTurno.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm">
          <h2 className="mb-3 font-semibold text-amber-900">Ajustes fuera de turno</h2>
          {reporte.ajustesFueraDeTurno.map((pago) => (
            <div key={pago.id} className="flex justify-between border-b border-amber-100 py-2">
              <span>{pago.miembroNombre ?? pago.miembroId} — {nombreMetodo(pago.metodo)}</span>
              <span>${pago.monto.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {reporte.turnos.length === 0 && reporte.ajustesFueraDeTurno.length === 0 && (
        <p className="text-neutral-500">Sin turnos en este período.</p>
      )}
    </div>
  );
}
