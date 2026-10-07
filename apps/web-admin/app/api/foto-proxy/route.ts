// GET /api/foto-proxy?url=... — sirve una foto del bucket R2 desde el mismo origen
// para poder recortarla en el navegador (el bucket no envía cabeceras CORS).
// Solo acepta URLs que pertenezcan a R2_PUBLIC_URL y usuarios con sesión.
import { NextRequest, NextResponse } from "next/server";
import { obtenerUsuarioDeSesion } from "@/lib/sesion";

export async function GET(req: NextRequest) {
  if (!(await obtenerUsuarioDeSesion(req))) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const base = process.env.R2_PUBLIC_URL;
  const url = req.nextUrl.searchParams.get("url");
  if (!base || !url || !url.startsWith(`${base}/`)) {
    return NextResponse.json({ error: "URL no permitida." }, { status: 400 });
  }

  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    return NextResponse.json({ error: "No se pudo obtener la foto." }, { status: 502 });
  }
  return new NextResponse(respuesta.body, {
    headers: { "Content-Type": respuesta.headers.get("Content-Type") ?? "application/octet-stream" },
  });
}
