// GET /api/en-sala — personas con check-in abierto hoy en la sucursal activa de la sesión.
// Lo consulta cada pocos segundos el ProveedorEnSala del panel (ver (panel)/en-sala/ContextoEnSala.tsx).
import { NextRequest, NextResponse } from "next/server";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";
import { tienePermisoEnSala } from "@/lib/permisoEnSala";
import { consultarEnSala } from "@/lib/consultarEnSala";

export async function GET(req: NextRequest) {
  const sesion = await obtenerUsuarioDeSesion(req);
  if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(await tienePermisoEnSala(sesion.usuario, "VER"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const personas = await consultarEnSala(sesion.usuario.organizacionId, sesion.sucursalActivaId);
  return NextResponse.json({ personas }, { headers: { "Cache-Control": "no-store" } });
}
