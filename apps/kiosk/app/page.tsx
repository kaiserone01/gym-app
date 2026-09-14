"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { obtenerApiKey } from "@/lib/config";
import { registrarCheckIn, ErrorCheckIn, type ResultadoCheckIn } from "@/lib/api";
import { encolar, listarPendientes } from "@/lib/colaPendientes";
import { reintentarPendientes } from "@/lib/reintentarPendientes";
import { AccessCard } from "@/components/AccessCard";

type Estado =
  | { tipo: "esperando" }
  | { tipo: "procesando" }
  | { tipo: "resultado"; resultado: ResultadoCheckIn; hora: string }
  | { tipo: "pendiente" }
  | { tipo: "error"; mensaje: string };

export default function PaginaCheckIn() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [cedula, setCedula] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "esperando" });
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    const clave = obtenerApiKey();
    if (!clave) {
      router.replace("/config");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee localStorage tras el montaje (SSR-safe, ver ADR de output: "export")
    setApiKey(clave);
  }, [router]);

  const actualizarPendientes = useCallback(() => {
    listarPendientes().then((lista) => setPendientes(lista.length));
  }, []);

  useEffect(() => {
    if (!apiKey) return;

    actualizarPendientes();
    reintentarPendientes(apiKey).then(actualizarPendientes);

    const alReconectar = () => {
      reintentarPendientes(apiKey).then(actualizarPendientes);
    };
    window.addEventListener("online", alReconectar);
    return () => window.removeEventListener("online", alReconectar);
  }, [apiKey, actualizarPendientes]);

  // El kiosco tiene un teclado numérico físico, no pantalla táctil (ADR
  // v1 §2.5) — el input siempre debe estar enfocado para capturarlo sin
  // que el staff tenga que tocar nada.
  useEffect(() => {
    inputRef.current?.focus();
  });

  async function enviar() {
    if (!apiKey || !cedula || estado.tipo === "procesando") return;

    setEstado({ tipo: "procesando" });

    try {
      const resultado = await registrarCheckIn(apiKey, cedula);
      const hora = new Date().toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });
      setEstado({ tipo: "resultado", resultado, hora });
    } catch (error) {
      if (error instanceof ErrorCheckIn) {
        setEstado({ tipo: "error", mensaje: error.message });
      } else {
        await encolar(cedula);
        actualizarPendientes();
        setEstado({ tipo: "pendiente" });
      }
    }

    setCedula("");
    setTimeout(() => setEstado({ tipo: "esperando" }), 4000);
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-8 p-8"
      style={{ background: "var(--gx-ground)", color: "var(--gx-ink)" }}
    >
      {pendientes > 0 && (
        <div
          className="fixed top-4 right-4 rounded px-3 py-1 text-sm"
          style={{ background: "var(--gx-bad)", color: "var(--gx-bad-ink)" }}
        >
          {pendientes} pendiente{pendientes === 1 ? "" : "s"} por sincronizar
        </div>
      )}

      <h1 className="text-3xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}>
        Ingresa tu cédula
      </h1>

      <input
        ref={inputRef}
        value={cedula}
        onChange={(evento) => setCedula(evento.target.value.replace(/\D/g, ""))}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") enviar();
          if (evento.key === "Escape") setCedula("");
        }}
        onBlur={() => inputRef.current?.focus()}
        inputMode="numeric"
        autoFocus
        className="w-full max-w-xl text-center text-6xl tracking-widest bg-transparent border-b-4 py-4 outline-none"
        style={{ borderColor: "var(--gx-accent)", color: "var(--gx-ink)" }}
      />

      <div className="min-h-40 flex w-full items-center justify-center text-center">
        {estado.tipo === "procesando" && <p className="text-2xl" style={{ color: "var(--gx-muted)" }}>Verificando…</p>}

        {estado.tipo === "resultado" && <AccessCard resultado={estado.resultado} hora={estado.hora} />}

        {estado.tipo === "pendiente" && (
          <p className="text-2xl" style={{ color: "var(--gx-bad)" }}>
            Sin conexión — el check-in se guardó y se enviará solo cuando vuelva la red.
          </p>
        )}

        {estado.tipo === "error" && <p className="text-2xl" style={{ color: "var(--gx-bad)" }}>{estado.mensaje}</p>}
      </div>
    </main>
  );
}
