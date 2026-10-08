import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMiembroReferenciaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import type { FilaReferenciaConEstado } from "@gym-app/domain/entities/MiembroReferencia";
import { Input } from "@gym-app/ui/components/Input";
import { Button } from "@gym-app/ui/components/Button";
import { Card } from "@gym-app/ui/components/Card";
import { Badge } from "@gym-app/ui/components/Badge";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

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
  const pagina = Math.max(1, Math.floor(Number(p.pagina)) || 1);
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
                <FilaSoloLectura key={fila.id} fila={fila} puedeEditar={puedeEditar} />
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
          Mostrando {primera}–{ultima} de {total}
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

// La Tarea 8 la reemplaza por la fila editable; por eso recibe solo props serializables.
// `puedeEditar` aún no se usa: en solo lectura nadie edita.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function FilaSoloLectura({ fila, puedeEditar }: { fila: FilaReferenciaConEstado; puedeEditar: boolean }) {
  const celda = "py-2 pr-3";
  const valor = (texto: string | null) => texto || "—";
  return (
    <tr className="border-b align-top" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}>
      <td className={celda}>{fila.numeroFila}</td>
      <td className={celda}>{fila.cedula}</td>
      <td className={celda}>{fila.nombre}</td>
      <td className={celda}>{valor(fila.status)}</td>
      <td className={celda}>{valor(fila.fNacimiento)}</td>
      <td className={celda}>{valor(fila.celular)}</td>
      <td className={celda}>{valor(fila.fVenc)}</td>
      <td className={celda}>{valor(fila.fechaPago)}</td>
      <td className={celda}>{valor(fila.plan)}</td>
      <td className="py-2">
        <div className="flex flex-col items-start gap-1">
          {fila.miembroId ? (
            <>
              <Link href={`/miembros/${fila.miembroId}`} className="font-medium hover:underline" style={{ color: "var(--gx-accent)" }}>
                Ya es miembro
              </Link>
              <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
                Ajusta sus datos en la ficha del miembro
              </span>
            </>
          ) : (
            <span>No es miembro</span>
          )}
          {fila.camposEditados.length > 0 && <Badge tono="ambar">Editado: {fila.camposEditados.join(", ")}</Badge>}
        </div>
      </td>
    </tr>
  );
}
