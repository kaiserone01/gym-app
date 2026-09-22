export interface Sesion {
  id: string;
  token: string;
  usuarioId: string;
  // Puede ser null en sesiones que ya existían antes de que el login
  // empezara a exigir elegir sucursal — ValidarSesion las trata como
  // inválidas y fuerza un nuevo login (ver ValidarSesion.ts).
  // ISesionRepository.crear() sigue exigiendo un valor real para toda
  // sesión nueva.
  sucursalActivaId: string | null;
  expiraEn: Date;
}
