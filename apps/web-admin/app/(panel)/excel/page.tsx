import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMiembroReferenciaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { Input } from "@gym-app/ui/components/Input";
import { Button } from "@gym-app/ui/components/Button";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { FilaPadronEditable } from "./FilaPadronEditable";

const POR_PAGINA = 50;

type Parametros = {
  cedula?: string;
  nombre?: string;
  status?: string;
  plan?: string;
  desde?: string;
  hasta?: string;
  estado?: string;
  pagina?: string;
};

// Solo acepta aaaa-mm-dd; el límite superior abarca el día completo (UTC).
function normalizarFechaFiltro(texto?: string, finDelDia = false): Date | undefined {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return undefined;
  const fecha = new Date(`${texto}T${finDelDia ? "23:59:59.999" : "00:00:00"}Z`);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

function textoOUndefined(valor?: string): string | undefined {
  const limpio = valor?.trim();
  return limpio ? limpio : undefined;
}

const SELECT_CLASE = "min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]";
const SELECT_ESTILO = { background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" };

export default async function PaginaExcel({ searchParams }: { searchParams: Promise<Parametros> }) {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const repo = new PrismaMiembroReferenciaRepository(prisma);
  const autorizacion = new AuthorizationService(new PrismaPermisoRepository(prisma));
  if (
    !(await repo.existeParaSucursal(usuario.organizacionId, sucursalActivaId)) ||
    !(await autorizacion.tienePermiso(usuario.id, "MIEMBROS", "VER"))
  ) {
    redirect("/miembros");
  }
  const puedeEditar = await autorizacion.tienePermiso(usuario.id, "MIEMBROS", "EDITAR");

  const p = await searchParams;
  const estado = p.estado === "no_miembro" || p.estado === "miembro" ? p.estado : "todos";
  const numeroPagina = Math.floor(Number(p.pagina));
  const pagina = Number.isFinite(numeroPagina) ? Math.min(Math.max(1, numeroPagina), 100000) : 1;
  const { filas, total } = await repo.listar(usuario.organizacionId, sucursalActivaId, {
    cedula: textoOUndefined(p.cedula),
    nombre: textoOUndefined(p.nombre),
    status: textoOUndefined(p.status),
    plan: textoOUndefined(p.plan),
    venceDesde: normalizarFechaFiltro(p.desde),
    venceHasta: normalizarFechaFiltro(p.hasta, true),
    estadoEnSistema: estado,
    pagina,
    porPagina: POR_PAGINA,
  });

  const hrefPagina = (n: number) => {
    const query = new URLSearchParams();
    for (const [clave, valor] of Object.entries({ ...p, pagina: String(n) })) if (valor) query.set(clave, valor);
    return `/excel?${query.toString()}`;
  };
  const primera = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const ultima = Math.min(pagina * POR_PAGINA, total);

  return (
    <div className="flex flex-col gap-6 p-6 pb-24 lg:p-8 lg:pb-8">
      <div>
        <PageHeader>Excel</PageHeader>
        <p className="mt-1 text-sm" style={{ color: "var(--gx-muted)" }}>
          Datos espejo del archivo; las filas de quien aún no es miembro se pueden ajustar
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-4">
        <Input label="Cédula" name="cedula" type="text" defaultValue={p.cedula ?? ""} />
        <Input label="Nombre" name="nombre" type="text" defaultValue={p.nombre ?? ""} />
        <Input label="Status" name="status" type="text" defaultValue={p.status ?? ""} />
        <Input label="Plan" name="plan" type="text" defaultValue={p.plan ?? ""} />
        <Input label="Vence desde" name="desde" type="date" defaultValue={p.desde ?? ""} />
        <Input label="Vence hasta" name="hasta" type="date" defaultValue={p.hasta ?? ""} />
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Estado
          <select name="estado" defaultValue={estado} className={SELECT_CLASE} style={SELECT_ESTILO}>
            <option value="todos">Todos</option>
            <option value="no_miembro">No es miembro</option>
            <option value="miembro">Ya es miembro</option>
          </select>
        </label>
        <Button type="submit">Filtrar</Button>
        <Link
          href="/excel"
          className="flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold"
          style={{ background: "var(--gx-surface-2)", color: "var(--gx-ink)" }}
        >
          Limpiar
        </Link>
      </form>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b text-xs" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
                <th className="py-2 pr-3">N° fila</th>
                <th className="py-2 pr-3">Cédula</th>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">F. nacimiento</th>
                <th className="py-2 pr-3">Celular</th>
                <th className="py-2 pr-3">F. venc.</th>
                <th className="py-2 pr-3">Fecha pago</th>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <FilaPadronEditable
                  key={fila.id}
                  fila={{
                    cedula: fila.cedula,
                    numeroFila: fila.numeroFila,
                    nombre: fila.nombre,
                    status: fila.status,
                    fNacimiento: fila.fNacimiento,
                    celular: fila.celular,
                    fVenc: fila.fVenc,
                    fechaPago: fila.fechaPago,
                    plan: fila.plan,
                    camposEditados: fila.camposEditados,
                    miembroId: fila.miembroId,
                  }}
                  puedeEditar={puedeEditar}
                />
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
                    Ninguna fila coincide con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-4 text-sm" style={{ color: "var(--gx-muted)" }}>
        <span>
          {primera > total ? `Sin resultados en esta página (${total} en total)` : `Mostrando ${primera}–${ultima} de ${total}`}
        </span>
        <span className="flex gap-3">
          {pagina > 1 && (
            <Link href={hrefPagina(pagina - 1)} className="font-medium hover:underline" style={{ color: "var(--gx-accent)" }}>
              Anterior
            </Link>
          )}
          {ultima < total && (
            <Link href={hrefPagina(pagina + 1)} className="font-medium hover:underline" style={{ color: "var(--gx-accent)" }}>
              Siguiente
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}
