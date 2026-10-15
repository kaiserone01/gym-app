import { crearEmisor } from "@gym-app/domain/utils/emisorEventos";

// Un solo emisor por proceso: las Server Actions y las rutas SSE comparten globalThis aunque Next las empaquete
// por separado. Suficiente con un solo contenedor de web-admin.
const global = globalThis as unknown as { __emisorVitrina?: ReturnType<typeof crearEmisor> };
export const emisorVitrina = (global.__emisorVitrina ??= crearEmisor());

// Avisa a las TVs conectadas de esa sede. Llamarlo SIEMPRE después de que la escritura hizo commit.
export function notificarCambioVitrina(sucursalId: string): void {
  emisorVitrina.emitir(sucursalId, "vitrina:cambio");
}
