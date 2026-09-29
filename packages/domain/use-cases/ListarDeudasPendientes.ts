import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";
import { DeudaProducto, totalDeudas } from "../entities/DeudaProducto";

export interface GrupoDeudasMiembro {
  miembroId: string;
  miembroNombre: string;
  totalUSD: number;
  deudas: DeudaProducto[];
}

export async function listarDeudasPendientes(
  deps: { deudas: IDeudaProductoRepository },
  organizacionId: string
): Promise<GrupoDeudasMiembro[]> {
  const pendientes = await deps.deudas.listarPendientesPorOrganizacion(organizacionId);

  const porMiembro = new Map<string, GrupoDeudasMiembro>();
  for (const deuda of pendientes) {
    const grupo = porMiembro.get(deuda.miembroId) ?? {
      miembroId: deuda.miembroId,
      miembroNombre: deuda.miembroNombre ?? deuda.miembroId,
      totalUSD: 0,
      deudas: [],
    };
    grupo.deudas.push(deuda);
    porMiembro.set(deuda.miembroId, grupo);
  }

  return [...porMiembro.values()]
    .map((grupo) => ({ ...grupo, totalUSD: totalDeudas(grupo.deudas) }))
    .sort((a, b) => a.miembroNombre.localeCompare(b.miembroNombre, "es"));
}
