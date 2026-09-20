import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { obtenerResumenTurno } from "@gym-app/domain/use-cases/ObtenerResumenTurno";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { obtenerSucursalesVisiblesParaTurno } from "./obtenerSucursalesVisiblesParaTurno";

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

export default async function PaginaCaja() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const turnoRepo = new PrismaTurnoRepository(prisma);

  // Gerente/Recepción tienen sucursalId fijo: basta buscar ahí. Un SOCIO no
  // tiene sucursalId fijo (ve varias sucursales) — si abrió un turno en
  // alguna de ellas hay que encontrarlo igual, si no la página se queda
  // trabada mostrando "Abrir turno" aunque el turno ya esté abierto (bug
  // reportado: "se abrió, pero desde caja no desplegó las funcionalidades").
  const turnoAbierto = usuario.sucursalId
    ? await turnoRepo.buscarAbiertoPorSucursal(usuario.sucursalId)
    : await turnoRepo.buscarAbiertoEntreSucursales(
        (await obtenerSucursalesVisiblesParaTurno(usuario)).map((s) => s.id)
      );

  // La sucursal "real" del turno encontrado — para un SOCIO puede diferir
  // de usuario.sucursalId (que es null), así que el resto de la página usa
  // esta en vez de usuario.sucursalId directamente.
  const sucursalId = turnoAbierto ? turnoAbierto.sucursalId : usuario.sucursalId;

  if (turnoAbierto) {
    const [resumen, miembros, planes, metodosPago, todasLasSucursales] = await Promise.all([
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
      listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
    ]);

    const miembrosActivos = miembros.filter((m) => m.activo);
    const planesActivos = planes.filter((p) => p.activo);
    // El pago en Caja siempre queda en la sede del turno abierto — no
    // tiene sentido ofrecer otra sede en medio de un arqueo (ver diseño
    // acordado). Se le pasa una sola opción para que SelectorMetodoPago
    // no muestre el selector.
    const sucursalDelTurno = todasLasSucursales.filter((s) => s.id === sucursalId);

    return (
      <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
        <PageHeader>Turno activo</PageHeader>

        {/* Bento grid en desktop: Registrar pago (la acción más frecuente)
            ocupa 2/3 del ancho; turno + resumen por método comparten la
            columna lateral. Pagos/egresos del turno y arqueo van a todo el
            ancho debajo. En mobile todo se apila en una sola columna. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:auto-rows-min">
          <Card className="text-sm lg:col-span-2 lg:row-span-2">
            <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
              Registrar pago
            </h2>
            <FormularioPago
              accion={registrarPagoAction}
              miembros={miembrosActivos}
              miembrosConPlan={miembrosActivos}
              planes={planesActivos}
              metodosPago={metodosPago}
              sucursalesVisibles={sucursalDelTurno}
              sucursalesOrganizacion={sucursalDelTurno}
              sucursalIdDefault={sucursalId}
              origen="caja"
            />
          </Card>

          <Card className="text-sm">
            <div className="flex justify-between">
              <span style={{ color: "var(--gx-muted)" }}>Abierto desde</span>
              <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                {resumen.turno.abiertoEn.toLocaleString("es-VE")}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span style={{ color: "var(--gx-muted)" }}>Fondo inicial en efectivo</span>
              <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                ${resumen.turno.fondoInicialEfectivoUSD.toFixed(2)} / Bs.{" "}
                {formatearBs(resumen.turno.fondoInicialEfectivoBs)}
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

          <div className="lg:col-span-2">
            <FormularioEgreso accion={registrarEgresoAction} turnoId={resumen.turno.id} />
          </div>

          {resumen.pagos.length > 0 && (
            <Card className="text-sm lg:col-span-3">
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

          {resumen.egresos.length > 0 && (
            <Card className="text-sm lg:col-span-3">
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

          <div className="lg:col-span-3">
            <FormularioArqueo accion={cerrarTurnoAction} turnoId={resumen.turno.id} lineas={resumen.lineas} />
          </div>
        </div>
      </div>
    );
  }

  const sucursalesVisibles = await obtenerSucursalesVisiblesParaTurno(usuario);

  // Si el operador ya tiene una sucursal fija (la mayoría de Gerente/
  // Recepción) se usa esa sin preguntar. Si no (típicamente un SOCIO), y
  // solo hay una sucursal visible, se toma esa por defecto tampoco. Solo
  // se pregunta cuando hay más de una opción real — antes de esta tarea
  // el formulario siempre recibía sucursales=[] acá, por eso el SOCIO no
  // podía elegir (ver Task 2).
  const requiereSucursal = !sucursalId && sucursalesVisibles.length > 1;
  const sucursalesParaFormulario = requiereSucursal
    ? sucursalesVisibles.map((s) => ({ id: s.id, nombre: s.nombre }))
    : [];

  return (
    <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
      <PageHeader>Abrir turno</PageHeader>

      <FormularioAbrirTurno
        accion={abrirTurnoAction}
        requiereSucursal={requiereSucursal}
        sucursales={sucursalesParaFormulario}
      />
    </div>
  );
}
