import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { obtenerReporteCaja } from "@gym-app/domain/use-cases/ObtenerReporteCaja";
import { obtenerDiasConActividad } from "@gym-app/domain/use-cases/ObtenerDiasConActividad";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { formatearBs } from "../tasaBcvFija";
import { inicioDelDia, finDelDia } from "../fechas";
import { FiltroFechasHistorico } from "./FiltroFechasHistorico";

// El método se guarda como snapshot legible ("Pago Móvil - Banesco")
// directo en Pago.metodo — no hay catálogo estático que traducir.
function nombreMetodo(valor: string): string {
  return valor;
}

export default async function PaginaHistoricoPagos({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const { desde: desdeTexto, hasta: hastaTexto } = await searchParams;
  const hoy = new Date();
  const desde = desdeTexto ? inicioDelDia(new Date(`${desdeTexto}T00:00:00`)) : inicioDelDia(hoy);
  const hasta = hastaTexto ? finDelDia(new Date(`${hastaTexto}T00:00:00`)) : finDelDia(hoy);

  const turnoRepo = new PrismaTurnoRepository(prisma);

  const [reporte, diasConActividad] = await Promise.all([
    obtenerReporteCaja(
      {
        turnos: turnoRepo,
        pagos: new PrismaPagoRepository(prisma),
        egresos: new PrismaEgresoRepository(prisma),
        arqueo: new PrismaArqueoRepository(prisma),
      },
      { organizacionId: usuario.organizacionId, desde, hasta }
    ),
    obtenerDiasConActividad({ turnos: turnoRepo }, usuario.organizacionId),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
      <PageHeader>Histórico de Pagos</PageHeader>

      <FiltroFechasHistorico
        desde={desde}
        hasta={hasta}
        diasConActividadISO={diasConActividad.map((d) => d.toISOString())}
      />

      <div className="flex items-center gap-3 text-sm" style={{ color: "var(--gx-muted)" }}>
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
