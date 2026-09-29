import { Producto, DatosNuevoProducto, CambiosProducto } from "../entities/Producto";

export interface IProductoRepository {
  listarPorOrganizacion(organizacionId: string): Promise<Producto[]>;
  buscarPorId(organizacionId: string, id: string): Promise<Producto | null>;
  crear(datos: DatosNuevoProducto): Promise<Producto>;
  actualizar(organizacionId: string, id: string, cambios: CambiosProducto): Promise<Producto | null>;
  // Cuenta las filas Pago (líneas de venta) que referencian este producto.
  contarVentas(id: string): Promise<number>;
  eliminar(id: string): Promise<void>;
}
