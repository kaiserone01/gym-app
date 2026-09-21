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
import { formatearBs, formatearBsConRef } from "../tasaBcvFija";
import { inicioDelDia, finDelDia } from "../fechas";
import { FiltroFechasHistorico } from "./FiltroFechasHistorico";

// El método se guarda como snapshot legible ("Pago Móvil - Banesco")
// directo en Pago.metodo — no hay catálogo estático que traducir.
function nombreMetodo(valor: string): string {
  return valor;
}

// Igual criterio que ObtenerResumenTurno.enBs: un método está en Bs si
// así se registraron sus pagos/egresos reales (Pago.montoBs !== null,
// Egreso.moneda === "BS"), no por el string del método — Pago Móvil,
// Transferencia, Punto de Venta y Biopago también pueden ser en Bs (ver
// MetodoPago.moneda en Configuraciones), y antes solo "Efectivo (Bs)" se
// detectaba, mostrando el resto como si fueran USD.
function metodosEnBs(pagos: { metodo: string; montoBs: number | null }[], egresos: { metodo: string; moneda: string }[]): Set<string> {
  const metodos = new Set<string>();
  for (const p of pagos) if (p.montoBs !== null) metodos.add(p.metodo);
  for (const e of egresos) if (e.moneda === "BS") metodos.add(e.metodo);
  return metodos;
}

// OJO: nunca usar fecha.toISOString() para pasar diasConActividad al
// cliente — convierte a UTC primero, así que una fecha "sin hora" (medianoche
// local) puede terminar representando el día anterior en la zona del
// navegador (bug real encontrado en la verificación manual de este plan).
// Se pasa como YYYY-MM-DD (sin componente de zona) y FiltroFechasHistorico
// la reconstruye agregándole T00:00:00, igual que se hace un poco más abajo
// con desdeTexto/hastaTexto.
function formatearFechaISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export default async function PaginaHistoricoPagos({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

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
        diasConActividadISO={diasConActividad.map((d) => formatearFechaISO(d))}
      />

      <div className="flex items-center gap-3 text-sm" style={{ color: "var(--gx-muted)" }}>
        <span className="ml-auto text-base font-semibold" style={{ color: "var(--gx-ink)" }}>
          Total: ${reporte.totalUSD.toFixed(2)}
        </span>
      </div>

      {reporte.turnos.map((fila) => {
        const metodosBsDelTurno = metodosEnBs(fila.pagos, fila.egresos);

        return (
        <Card key={fila.turno.id} className="text-sm">
          <div className="mb-2 flex justify-between font-medium" style={{ color: "var(--gx-ink)" }}>
            <span>Turno {fila.turno.abiertoEn.toLocaleString("es-VE")}</span>
            <span>Neto: ${fila.netoUSD.toFixed(2)}</span>
          </div>
          <div className="mb-2 flex justify-between text-xs" style={{ color: "var(--gx-muted)" }}>
            <span>
              Apertura: {fila.turno.abiertoEn.toLocaleTimeString("es-VE")} · Cierre:{" "}
              {fila.turno.cerradoEn ? fila.turno.cerradoEn.toLocaleTimeString("es-VE") : "turno abierto"}
            </span>
            <span>{fila.turno.usuarioNombre ?? "—"}</span>
          </div>
          <div className="mb-2 flex justify-between" style={{ color: "var(--gx-muted)" }}>
            <span>Cobrado: ${fila.totalPagosUSD.toFixed(2)}</span>
            {fila.totalEgresosUSD > 0 && <span>Egresos (ref. USD): -${fila.totalEgresosUSD.toFixed(2)}</span>}
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
                    -{egreso.moneda === "BS" ? formatearBsConRef(egreso.monto, egreso.montoUSD) : `$${egreso.monto.toFixed(2)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {fila.arqueo.map((linea) => {
            // Un método sin pagos ni egresos en este turno (solo con fondo
            // inicial, ej. Efectivo (Bs) sin movimiento) no aparece en
            // metodosBsDelTurno — se cae al string como último recurso
            // para no perder la moneda en ese caso puntual.
            const enBs = metodosBsDelTurno.has(linea.metodo) || linea.metodo.endsWith("(Bs)");
            // El arqueo no guarda la tasa del cierre — a diferencia de
            // Pago/Egreso, no hay una referencia en USD confiable para
            // reconstruir acá (ver Egreso.tasaCambio/montoUSD, que sí la
            // capturan al momento de cada transacción). Solo se corrige
            // la moneda mostrada (antes no indicaba Bs vs USD).
            const montoContadoTexto = enBs ? `Bs. ${formatearBs(linea.montoContado)}` : `$${linea.montoContado.toFixed(2)}`;
            const diferenciaTexto = enBs ? `Bs. ${formatearBs(linea.diferencia)}` : `$${linea.diferencia.toFixed(2)}`;

            return (
              <div key={linea.metodo} className="flex justify-between" style={{ color: "var(--gx-muted)" }}>
                <span>{nombreMetodo(linea.metodo)}</span>
                <span>
                  {montoContadoTexto} contado ({linea.diferencia === 0 ? "sin diferencia" : `dif. ${diferenciaTexto}`})
                </span>
              </div>
            );
          })}
        </Card>
        );
      })}

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
