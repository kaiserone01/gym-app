export type EstadoTurno = "ABIERTO" | "CERRADO";

export interface Turno {
  id: string;
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  // Denormalizado desde UsuarioAdmin.nombre — quién abrió/trabajó el
  // turno, para mostrar en Histórico de Pagos sin un join aparte en la
  // UI (mismo patrón que Pago.registradoPorNombre). Solo presente cuando
  // el repositorio lo resuelve explícitamente (ver
  // PrismaTurnoRepository.listarPorOrganizacionYRango).
  usuarioNombre?: string;
  // Solo efectivo físico en caja al abrir el turno — no incluye bancos ni
  // puntos de venta (ver ObtenerResumenTurno).
  fondoInicialEfectivoUSD: number;
  fondoInicialEfectivoBs: number;
  abiertoEn: Date;
  cerradoEn: Date | null;
  estado: EstadoTurno;
}

export interface DatosNuevoTurno {
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  fondoInicialEfectivoUSD: number;
  fondoInicialEfectivoBs: number;
}
