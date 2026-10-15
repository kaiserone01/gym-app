// GET /api/kiosco/vitrina/eventos — flujo SSE: avisa a la TV de cada cambio hecho en el panel (`vitrina:cambio`)
// y manda un latido cada 25 s para que el proxy no cierre la conexión. La TV pide el manifiesto al recibir el aviso.
import { NextRequest, NextResponse } from "next/server";
import { CORS_HEADERS, opcionesKiosco, sucursalDeKiosco } from "@/lib/kiosco";
import { emisorVitrina } from "@/lib/vitrinaEventos";

export const dynamic = "force-dynamic";

const LATIDO_MS = 25_000;

export async function OPTIONS() {
  return opcionesKiosco();
}

export async function GET(req: NextRequest) {
  const sucursal = await sucursalDeKiosco(req);
  if (sucursal instanceof NextResponse) return sucursal;

  const codificador = new TextEncoder();
  let cerrar = () => {};

  const flujo = new ReadableStream<Uint8Array>({
    start(controlador) {
      let cerrado = false;
      const enviar = (texto: string) => {
        try {
          controlador.enqueue(codificador.encode(texto));
        } catch {
          cerrar();
        }
      };
      enviar(": conectado\n\n");
      const baja = emisorVitrina.suscribir(sucursal.id, (evento) => enviar(`event: ${evento}\ndata: ${Date.now()}\n\n`));
      const latido = setInterval(() => enviar(": latido\n\n"), LATIDO_MS);
      // Idempotente: cancel, abort y un enqueue fallido pueden llamarlo en cualquier orden.
      cerrar = () => {
        if (cerrado) return;
        cerrado = true;
        clearInterval(latido);
        baja();
        try {
          controlador.close();
        } catch {
          // ya estaba cerrado
        }
      };
      req.signal.addEventListener("abort", cerrar);
    },
    cancel() {
      cerrar();
    },
  });

  return new NextResponse(flujo, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
