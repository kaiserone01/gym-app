"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { guardarApiKey, obtenerApiKey } from "@/lib/config";

export default function PaginaConfiguracion() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");

  // No se lee localStorage en el useState inicial: durante el export
  // estático, esta página se prerenderiza en Node (sin window) y React
  // hidrata con ese mismo valor inicial — hay que leer el valor real
  // después del montaje, en un efecto.
  useEffect(() => {
    const guardado = obtenerApiKey();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee localStorage tras el montaje (SSR-safe, ver ADR de output: "export")
    if (guardado) setApiKey(guardado);
  }, []);

  function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!apiKey.trim()) return;
    guardarApiKey(apiKey.trim());
    router.replace("/");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-white p-8">
      <h1 className="text-2xl font-semibold">Configuración del kiosco</h1>
      <p className="max-w-md text-center text-neutral-400">
        Pegá el API key de esta sucursal (lo genera el panel admin al crearla). Se guarda en este
        dispositivo — no hace falta repetirlo salvo que se rote el key.
      </p>
      <form onSubmit={guardar} className="flex flex-col gap-4 w-full max-w-md">
        <input
          value={apiKey}
          onChange={(evento) => setApiKey(evento.target.value)}
          placeholder="API key de la sucursal"
          className="bg-neutral-900 border border-neutral-700 rounded px-4 py-3 text-lg outline-none"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 rounded px-4 py-3 text-lg font-semibold"
        >
          Guardar y continuar
        </button>
      </form>
    </main>
  );
}
