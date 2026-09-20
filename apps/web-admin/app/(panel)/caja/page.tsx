import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { obtenerResumenTurno } from "@gym-app/domain/use-cases/ObtenerResumenTurno";
import { obtenerReporteCaja } from "@gym-app/domain/use-cases/ObtenerReporteCaja";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { BotonImprimir } from "../BotonImprimir";

// El método ahora se guarda como snapshot legible ("Pago Móvil - Banesco")
// directo en Pago.metodo, ya no como código a traducir contra un catálogo
// estático — se mantiene esta función identidad para no tocar cada
// llamado existente.
function nombreMetodo(valor: string): string {
  return valor;
}
import { formatearBs } from "../tasaBcvFija";
import { inicioDelDia, finDelDia, inicioDeSemana, finDeSemana, inicioDeMes, finDeMes, formatearFechaISO } from "../fechas";
import { FormularioAbrirTurno } from "./FormularioAbrirTurno";
import { FormularioEgreso } from "./FormularioEgreso";
import { FormularioArqueo } from "./FormularioArqueo";
import { FormularioPago } from "../pagos/FormularioPago";
import { abrirTurnoAction, registrarEgresoAction, cerrarTurnoAction } from "./actions";
import { registrarPagoAction } from "../pagos/actions";

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
    const [resumen, miembros, planes, metodosPago] = await Promise.all([
      obtenerResumenTurno(
        {
          turnos: turnoRepo,
          pagos: new PrismaPagoRepository(prisma),
          egresos: new PrismaEgresoRepository(prisma),
        },
        { organizacionId: usuario.organizacionId, turnoId: turnoAbierto.id }
      ),
      listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId),
      listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
      listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
    ]);

    const miembrosActivos = miembros.filter((m) => m.activo);
    const planesActivos = planes.filter((p) => p.activo);

    return (
      <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
        <PageHeader>Turno activo</PageHeader>
        <Card className="text-sm">
          <div className="flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Abierto desde</span>
            <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
              {resumen.turno.abiertoEn.toLocaleString("es-VE")}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Fondo inicial</span>
            <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
              ${resumen.turno.fondoInicialUSD.toFixed(2)} / Bs. {formatearBs(resumen.turno.fondoInicialBs)}
            </span>
          </div>
        </Card>

        <Card className="text-sm">
          <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
            Resumen por método
          </h2>
          {resumen.lineas.map((linea) => (
            <div
              key={linea.metodo}
              className="flex justify-between border-b py-2"
              style={{ borderColor: "var(--gx-edge)" }}
            >
              <span style={{ color: "var(--gx-muted)" }}>{nombreMetodo(linea.metodo)}</span>
              <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                {linea.montoEsperado.toFixed(2)} esperado
              </span>
            </div>
          ))}
        </Card>

        <Card className="text-sm">
          <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
            Registrar pago
          </h2>
          <FormularioPago
            accion={registrarPagoAction}
            miembros={miembrosActivos}
            planes={planesActivos}
            metodosPago={metodosPago}
            origen="caja"
          />
        </Card>

        {resumen.pagos.length > 0 && (
          <Card className="text-sm">
            <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
              Pagos del turno
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left">
                <thead>
                  <tr className="border-b text-xs" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
                    <th className="py-2">Miembro</th>
                    <th className="py-2">Método</th>
                    <th className="py-2">Monto USD</th>
                    <th className="py-2">Tasa</th>
                    <th className="py-2">Monto Bs</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.pagos
                    .filter((pago) => !pago.anuladoEn)
                    .map((pago) => (
                      <tr key={pago.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                        <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                          {pago.miembroNombre ?? pago.miembroId}
                        </td>
                        <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                          {nombreMetodo(pago.metodo)}
                        </td>
                        <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                          ${pago.monto.toFixed(2)}
                        </td>
                        <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                          {pago.tasaCambio !== null ? pago.tasaCambio.toFixed(2) : "—"}
                        </td>
                        <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                          {pago.montoBs !== null ? `Bs. ${formatearBs(pago.montoBs)}` : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <FormularioEgreso accion={registrarEgresoAction} turnoId={resumen.turno.id} />

        {resumen.egresos.length > 0 && (
          <Card className="text-sm">
            <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
              Egresos del turno
            </h2>
            {resumen.egresos.map((egreso) => (
              <div
                key={egreso.id}
                className="flex justify-between border-b py-2"
                style={{ borderColor: "var(--gx-edge)" }}
              >
                <span style={{ color: "var(--gx-muted)" }}>{egreso.motivo}</span>
                <span style={{ color: "var(--gx-ink)" }}>
                  {egreso.monto.toFixed(2)} {egreso.moneda}
                </span>
              </div>
            ))}
          </Card>
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
    <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
      <div className="flex items-center justify-between print:hidden">
        <PageHeader>Cierre de Caja</PageHeader>
        <BotonImprimir />
      </div>

      <FormularioAbrirTurno
        accion={abrirTurnoAction}
        requiereSucursal={!sucursalId}
        sucursales={[]}
      />

      <form method="get" className="flex flex-wrap items-end gap-4 print:hidden">
        <Input name="fecha" label="Fecha" type="date" defaultValue={formatearFechaISO(fechaBase)} />
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Período
          <select
            name="periodo"
            defaultValue={periodo}
            className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            <option value="dia">Día</option>
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </select>
        </label>
        <Button type="submit">Ver</Button>
      </form>

      <div className="flex items-center gap-3 text-sm" style={{ color: "var(--gx-muted)" }}>
        <span>
          {formatearFechaISO(desde)} — {formatearFechaISO(hasta)}
        </span>
        <span className="ml-auto text-base font-semibold" style={{ color: "var(--gx-ink)" }}>
          Total: ${reporte.totalUSD.toFixed(2)}
        </span>
      </div>

      {reporte.turnos.map((fila) => (
        <Card key={fila.turno.id} className="text-sm">
          <div className="mb-2 flex justify-between font-medium" style={{ color: "var(--gx-ink)" }}>
            <span>Turno {fila.turno.abiertoEn.toLocaleString("es-VE")}</span>
            <span>Neto: ${fila.netoUSD.toFixed(2)}</span>
          </div>
          <div className="mb-2 flex justify-between" style={{ color: "var(--gx-muted)" }}>
            <span>Cobrado: ${fila.totalPagosUSD.toFixed(2)}</span>
            {fila.totalEgresosUSD > 0 && <span>Egresos (USD): -${fila.totalEgresosUSD.toFixed(2)}</span>}
          </div>
          {fila.pagos.filter((p) => !p.anuladoEn).length > 0 && (
            <div className="mb-2 flex flex-col gap-1 border-b pb-2" style={{ borderColor: "var(--gx-edge)" }}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                  <thead>
                    <tr style={{ color: "var(--gx-muted)" }}>
                      <th className="py-1">Miembro</th>
                      <th className="py-1">Método</th>
                      <th className="py-1">USD</th>
                      <th className="py-1">Tasa</th>
                      <th className="py-1">Bs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fila.pagos
                      .filter((p) => !p.anuladoEn)
                      .map((pago) => (
                        <tr key={pago.id}>
                          <td className="py-1" style={{ color: "var(--gx-ink)" }}>
                            {pago.miembroNombre ?? pago.miembroId}
                          </td>
                          <td className="py-1" style={{ color: "var(--gx-ink)" }}>
                            {nombreMetodo(pago.metodo)}
                          </td>
                          <td className="py-1" style={{ color: "var(--gx-ink)" }}>
                            ${pago.monto.toFixed(2)}
                          </td>
                          <td className="py-1" style={{ color: "var(--gx-ink)" }}>
                            {pago.tasaCambio !== null ? pago.tasaCambio.toFixed(2) : "—"}
                          </td>
                          <td className="py-1" style={{ color: "var(--gx-ink)" }}>
                            {pago.montoBs !== null ? `Bs. ${formatearBs(pago.montoBs)}` : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {fila.egresos.length > 0 && (
            <div className="mb-2 flex flex-col gap-1 border-b pb-2" style={{ borderColor: "var(--gx-edge)" }}>
              {fila.egresos.map((egreso) => (
                <div key={egreso.id} className="flex justify-between" style={{ color: "var(--gx-muted)" }}>
                  <span>{egreso.motivo}</span>
                  <span>
                    -{egreso.monto.toFixed(2)} {egreso.moneda}
                  </span>
                </div>
              ))}
            </div>
          )}
          {fila.arqueo.map((linea) => (
            <div key={linea.metodo} className="flex justify-between" style={{ color: "var(--gx-muted)" }}>
              <span>{nombreMetodo(linea.metodo)}</span>
              <span>
                {linea.montoContado.toFixed(2)} contado ({linea.diferencia === 0 ? "sin diferencia" : `dif. ${linea.diferencia.toFixed(2)}`})
              </span>
            </div>
          ))}
        </Card>
      ))}

      {reporte.ajustesFueraDeTurno.length > 0 && (
        <div
          className="rounded-2xl border p-5 text-sm"
          style={{ borderColor: "var(--gx-warn)", background: "color-mix(in srgb, var(--gx-warn) 12%, transparent)" }}
        >
          <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-warn)" }}>
            Ajustes fuera de turno
          </h2>
          {reporte.ajustesFueraDeTurno.map((pago) => (
            <div
              key={pago.id}
              className="flex justify-between border-b py-2"
              style={{ borderColor: "color-mix(in srgb, var(--gx-warn) 30%, transparent)" }}
            >
              <span style={{ color: "var(--gx-ink)" }}>
                {pago.miembroNombre ?? pago.miembroId} — {nombreMetodo(pago.metodo)}
              </span>
              <span className="flex gap-3" style={{ color: "var(--gx-ink)" }}>
                <span>${pago.monto.toFixed(2)}</span>
                <span>{pago.tasaCambio !== null ? `Tasa ${pago.tasaCambio.toFixed(2)}` : "—"}</span>
                <span>{pago.montoBs !== null ? `Bs. ${formatearBs(pago.montoBs)}` : "—"}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {reporte.turnos.length === 0 && reporte.ajustesFueraDeTurno.length === 0 && (
        <p style={{ color: "var(--gx-muted)" }}>Sin turnos en este período.</p>
      )}
    </div>
  );
}
