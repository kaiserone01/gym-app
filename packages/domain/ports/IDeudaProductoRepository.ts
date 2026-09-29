import { DeudaProducto, DatosNuevaDeuda } from "../entities/DeudaProducto";

export interface IDeudaProductoRepository {
  crear(datos: DatosNuevaDeuda): Promise<DeudaProducto>;
  // Con miembroNombre resuelto, más antiguas primero.
  listarPendientesPorOrganizacion(organizacionId: string): Promise<DeudaProducto[]>;
  listarPendientesPorMiembro(organizacionId: string, miembroId: string): Promise<DeudaProducto[]>;
  // Solo afecta filas que siguen PENDIENTE; devuelve cuántas actualizó
  // (menos que ids.length = otra caja cobró a la vez).
  marcarCobradas(ids: string[], cobradaPorId: string, cobradaEn: Date, grupoPagoId: string): Promise<number>;
  // Solo si sigue PENDIENTE; devuelve 0 o 1.
  anular(organizacionId: string, id: string, anuladaPorId: string, anuladaEn: Date): Promise<number>;
}
