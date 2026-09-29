import { IProductoRepository } from "../ports/IProductoRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { ProductoNoEncontradoError } from "./ActualizarProducto";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para eliminar productos.");
  }
}

// Con ventas registradas se desactiva (baja lógica) para conservar el
// historial; sin ventas se borra físicamente. Devuelve qué pasó.
export async function eliminarProducto(
  deps: { productos: IProductoRepository; autorizacion: IAuthorizationService },
  input: { organizacionId: string; id: string; usuarioIdSolicitante: string }
): Promise<"ELIMINADO" | "DESACTIVADO"> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "PLANES", "ELIMINAR"))) {
    throw new RolNoAutorizadoError();
  }

  const existente = await deps.productos.buscarPorId(input.organizacionId, input.id);
  if (!existente) {
    throw new ProductoNoEncontradoError();
  }

  if ((await deps.productos.contarVentas(input.id)) > 0) {
    await deps.productos.actualizar(input.organizacionId, input.id, { activo: false });
    return "DESACTIVADO";
  }

  await deps.productos.eliminar(input.id);
  return "ELIMINADO";
}
