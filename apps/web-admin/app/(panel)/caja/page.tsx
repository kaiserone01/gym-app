import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaEgresoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEgresoRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { obtenerResumenTurno, METODO_EFECTIVO_BS } from "@gym-app/domain/use-cases/ObtenerResumenTurno";
import { obtenerTasaActual, SinTasaDisponibleError } from "@gym-app/domain/use-cases/ObtenerTasaActual";
import { obtenerUltimoCierrePorSucursal } from "@gym-app/domain/use-cases/ObtenerUltimoCierrePorSucursal";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { PrismaArqueoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaArqueoRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { obtenerSucursalesVisiblesParaTurno } from "./obtenerSucursalesVisiblesParaTurno";
import { obtenerTurnoAbiertoParaUsuario } from "./obtenerTurnoAbiertoParaUsuario";
import { AvisoCajaAjena } from "./AvisoCajaAjena";

// El método ahora se guarda como snapshot legible ("Pago Móvil - Banesco")
// directo en Pago.metodo, ya no como código a traducir contra un catálogo
// estático — se mantiene esta función identidad para no tocar cada
// llamado existente.
function nombreMetodo(valor: string): string {
  return valor;
}

// Ref en USD del montoEsperado de una línea en Bs: el fondo inicial en
// efectivo no tiene tasa propia capturada (se fijó al abrir el turno, no
// es una transacción) así que su porción se convierte con la tasa BCV
// vigente AHORA — y solo aplica a la línea de efectivo en Bs, ningún otro
// método (Punto de Venta, Pago Móvil, etc.) tiene fondo inicial propio.
// Pagos y egresos ya traen su propia referencia capturada a SU tasa (ver
// ObtenerResumenTurno.totalPagosUSD/totalEgresosUSD). Devuelve null si la
// línea es en USD o si no hay tasa vigente disponible.
function calcularRefUSD(
  linea: { metodo: string; enBs: boolean; totalPagosUSD: number; totalEgresosUSD: number },
  fondoInicialEfectivoBs: number,
  tasaActual: number | null
): number | null {
  if (!linea.enBs || tasaActual === null) return null;
  const fondoBs = linea.metodo === METODO_EFECTIVO_BS ? fondoInicialEfectivoBs : 0;
  const fondoRefUSD = fondoBs / tasaActual;
  return fondoRefUSD + linea.totalPagosUSD - linea.totalEgresosUSD;
}
import { formatearBs, formatearBsConRef } from "../tasaBcvFija";
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
  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(usuario);

  // La sucursal "real" del turno encontrado — para un SOCIO puede diferir
  // de usuario.sucursalId (que es null), así que el resto de la página usa
  // esta en vez de usuario.sucursalId directamente.
  const sucursalId = turnoAbierto ? turnoAbierto.turno.sucursalId : usuario.sucursalId;

  if (turnoAbierto) {
    const esPropio = turnoAbierto.esPropio;
    const [resumen, miembros, planes, metodosPago, todasLasSucursales, tasaCambio] = await Promise.all([
      obtenerResumenTurno(
        {
          turnos: turnoRepo,
          pagos: new PrismaPagoRepository(prisma),
          egresos: new PrismaEgresoRepository(prisma),
        },
        { organizacionId: usuario.organizacionId, turnoId: turnoAbierto.turno.id }
      ),
      listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId),
      listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
      listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
      listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
      // Solo para mostrar la referencia en USD de la porción "fondo
      // inicial" de la línea en Bs (ver más abajo) — si no hay tasa
      // guardada todavía, simplemente se omite ese REF.
      obtenerTasaActual({ tasas: new PrismaTasaCambioRepository(prisma) }).catch((error) => {
        if (error instanceof SinTasaDisponibleError) return null;
        throw error;
      }),
    ]);
    const tasaActual = tasaCambio?.valor ?? null;

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
          {esPropio ? (
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
          ) : (
            <div className="lg:col-span-2 lg:row-span-2">
              <AvisoCajaAjena usuarioNombre={resumen.turno.usuarioNombre ?? "otro usuario"} abiertoEn={resumen.turno.abiertoEn} />
            </div>
          )}

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
                ${resumen.turno.fondoInicialEfectivoUSD.toFixed(2)} /{" "}
                {formatearBsConRef(
                  resumen.turno.fondoInicialEfectivoBs,
                  tasaActual !== null ? resumen.turno.fondoInicialEfectivoBs / tasaActual : null
                )}
              </span>
            </div>
          </Card>

          <Card className="text-sm">
            <h2 className="mb-3 font-semibold" style={{ color: "var(--gx-ink)" }}>
              Resumen por método
            </h2>
            {resumen.lineas.map((linea) => {
              const refUSD = calcularRefUSD(linea, resumen.turno.fondoInicialEfectivoBs, tasaActual);

              return (
                <div
                  key={linea.metodo}
                  className="flex justify-between border-b py-2"
                  style={{ borderColor: "var(--gx-edge)" }}
                >
                  <span style={{ color: "var(--gx-muted)" }}>{nombreMetodo(linea.metodo)}</span>
                  <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                    {linea.enBs ? formatearBsConRef(linea.montoEsperado, refUSD) : `$${linea.montoEsperado.toFixed(2)}`}{" "}
                    esperado
                  </span>
                </div>
              );
            })}
          </Card>

          {esPropio && (
            <div className="lg:col-span-2">
              <FormularioEgreso accion={registrarEgresoAction} turnoId={resumen.turno.id} />
            </div>
          )}

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
                    {egreso.moneda === "BS"
                      ? formatearBsConRef(egreso.monto, egreso.montoUSD)
                      : `$${egreso.monto.toFixed(2)}`}
                  </span>
                </div>
              ))}
            </Card>
          )}

          {esPropio && (
            <div className="lg:col-span-3">
              <FormularioArqueo
                accion={cerrarTurnoAction}
                turnoId={resumen.turno.id}
                lineas={resumen.lineas.map((linea) => ({
                  metodo: linea.metodo,
                  enBs: linea.enBs,
                  montoEsperado: linea.montoEsperado,
                  refUSD: calcularRefUSD(linea, resumen.turno.fondoInicialEfectivoBs, tasaActual),
                }))}
              />
            </div>
          )}
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

  // La sucursal donde se abrirá el turno, si ya se sabe sin preguntar
  // (fija, o la única visible) — se usa para traer de una vez el último
  // cierre de esa sede. Si hay que elegir sucursal (requiereSucursal), no
  // se sabe todavía: FormularioAbrirTurno lo consulta él mismo al cambiar
  // el <select> (ver /api/caja/ultimo-cierre).
  const sucursalIdConocida = sucursalId ?? (sucursalesVisibles.length === 1 ? sucursalesVisibles[0].id : null);
  const ultimoCierre = sucursalIdConocida
    ? await obtenerUltimoCierrePorSucursal(
        { turnos: turnoRepo, arqueo: new PrismaArqueoRepository(prisma) },
        { sucursalId: sucursalIdConocida }
      )
    : null;

  return (
    <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
      <PageHeader>Abrir turno</PageHeader>

      <FormularioAbrirTurno
        accion={abrirTurnoAction}
        requiereSucursal={requiereSucursal}
        sucursales={sucursalesParaFormulario}
        ultimoCierre={ultimoCierre ? { ...ultimoCierre, cerradoEn: ultimoCierre.cerradoEn.toISOString() } : null}
      />
    </div>
  );
}
