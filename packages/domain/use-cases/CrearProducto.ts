import { IProductoRepository } from "../ports/IProductoRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { Producto, DatosNuevoProducto } from "../entities/Producto";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para crear productos.");
  }
}

export class ProductoInvalidoError extends Error {
  constructor() {
    super("El producto necesita un nombre y un costo mayor a $0.");
  }
}

export async function crearProducto(
  deps: { productos: IProductoRepository; autorizacion: IAuthorizationService },
  input: DatosNuevoProducto & { usuarioIdSolicitante: string }
): Promise<Producto> {
  if (!(await deps.autorizacion.tienePermiso(input.usuarioIdSolicitante, "PLANES", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  const { usuarioIdSolicitante: _omitido, ...datos } = input;
  if (!datos.nombre.trim() || !(datos.costoUSD > 0)) {
    throw new ProductoInvalidoError();
  }

  return deps.productos.crear({ ...datos, nombre: datos.nombre.trim() });
}
