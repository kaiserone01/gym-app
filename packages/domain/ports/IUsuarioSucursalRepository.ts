export interface IUsuarioSucursalRepository {
  listarSucursalIdsPorUsuario(usuarioId: string): Promise<string[]>;
  reemplazarTodas(usuarioId: string, sucursalIds: string[]): Promise<void>;
}
