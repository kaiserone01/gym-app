import { DeudaProducto, DatosNuevaDeuda } from "../entities/DeudaProducto";

export interface IDeudaProductoRepository {
  crear(datos: DatosNuevaDeuda): Promise<DeudaProducto>;
  // Las deudas se cobran y anulan en la sucursal donde se fiaron: así el
  // dinero entra al arqueo de esa misma sede. Con miembroNombre resuelto,
  // más antiguas primero.
  listarPendientesPorOrganizacion(organizacionId: string, sucursalId: string): Promise<DeudaProducto[]>;
  listarPendientesPorMiembro(organizacionId: string, miembroId: string, sucursalId: string): Promise<DeudaProducto[]>;
  // Solo afecta filas que siguen PENDIENTE; devuelve cuántas actualizó
  // (menos que ids.length = otra caja cobró a la vez).
  marcarCobradas(ids: string[], cobradaPorId: string, cobradaEn: Date, grupoPagoId: string): Promise<number>;
  // Solo si sigue PENDIENTE; devuelve 0 o 1.
  anular(organizacionId: string, id: string, sucursalId: string, anuladaPorId: string, anuladaEn: Date): Promise<number>;
}
