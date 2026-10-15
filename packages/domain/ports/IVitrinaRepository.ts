import type { AjustesVitrina, CambiosVitrinaItem, DatosVitrinaItem, TransicionVitrina, VitrinaItem } from "../entities/Vitrina";

// Todas las operaciones de escritura incrementan Sucursal.vitrinaVersion dentro de su transacción y resuelven
// solo después del commit: quien emite el aviso a la TV (vitrina:cambio) puede hacerlo apenas resuelven.
export interface IVitrinaRepository {
  /** Ítems de la sede, ordenados por `orden`. */
  listar(sucursalId: string): Promise<VitrinaItem[]>;
  buscar(sucursalId: string, id: string): Promise<VitrinaItem | null>;
  /** ¿Algún ítem (de cualquier sede, salvo `exceptoItemId`) usa esa URL como medio o póster? Evita borrar archivos ajenos. */
  urlEnUso(url: string, exceptoItemId?: string): Promise<boolean>;
  /** Crea el ítem al final de la secuencia y siempre inactivo. */
  crear(sucursalId: string, datos: DatosVitrinaItem): Promise<VitrinaItem>;
  actualizar(sucursalId: string, id: string, cambios: CambiosVitrinaItem): Promise<VitrinaItem | null>;
  /** Devuelve el ítem borrado (para poder eliminar sus archivos) o null si no existía. */
  eliminar(sucursalId: string, id: string): Promise<VitrinaItem | null>;
  /** Intercambia el ítem con su vecino. false si ya está en el extremo o no existe. */
  mover(sucursalId: string, id: string, direccion: "SUBIR" | "BAJAR"): Promise<boolean>;
  obtenerAjustes(sucursalId: string): Promise<AjustesVitrina>;
  guardarAjustes(sucursalId: string, ajustes: { duracionSeg: number; transicion: TransicionVitrina }): Promise<AjustesVitrina>;
}
