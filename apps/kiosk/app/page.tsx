"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { obtenerApiKey } from "@/lib/config";
import { registrarCheckIn, ErrorCheckIn, type ResultadoCheckIn } from "@/lib/api";
import { encolar, listarPendientes } from "@/lib/colaPendientes";
import { reintentarPendientes } from "@/lib/reintentarPendientes";
import { AccessCard } from "@/components/AccessCard";
import { useEntradaCedula } from "@/lib/useEntradaCedula";

type Estado =
  | { tipo: "esperando" }
  | { tipo: "procesando" }
  | { tipo: "resultado"; resultado: ResultadoCheckIn; hora: string }
  | { tipo: "pendiente" }
  | { tipo: "error"; mensaje: string };

// Cuánto tiempo se queda la ficha de acceso en pantalla antes de desaparecer sola.
const DURACION_FICHA_MS = 30_000;

export default function PaginaCheckIn() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "esperando" });
  const { cedula, limpiar, nativo, propsInput } = useEntradaCedula({
    // Escribir la siguiente cédula limpia la ficha del check-in anterior
    // sin esperar a que se oculte sola (ver DURACION_FICHA_MS).
    alEscribir: () => {
      if (estado.tipo !== "esperando" && estado.tipo !== "procesando") {
        setEstado({ tipo: "esperando" });
      }
    },
    alEnviar: enviar,
  });
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

  // La ficha del check-in se oculta sola a los 30 s; un check-in nuevo (o escribir la siguiente
  // cédula) la reemplaza antes y reinicia el conteo.
  useEffect(() => {
    if (estado.tipo !== "resultado") return;
    const temporizador = setTimeout(() => setEstado({ tipo: "esperando" }), DURACION_FICHA_MS);
    return () => clearTimeout(temporizador);
  }, [estado]);

  async function enviar(cedula: string) {
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

    limpiar();
  }

  return (
    <main
      className="marca-agua-pagina marca-agua-completa min-h-screen flex flex-col items-center gap-6 p-8 pt-10"
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

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}>
          Ingresa tu cédula
        </h1>

        {nativo ? (
          // Dentro de apps/kiosk-host la cédula llega por mensajes nativos: no hace falta foco.
          <div
            className="w-full max-w-sm min-h-[3.25rem] text-center text-3xl tracking-widest border-b-2 py-2"
            style={{ borderColor: "var(--gx-accent)", color: "var(--gx-ink)" }}
          >
            {cedula}
          </div>
        ) : (
          <input
            {...propsInput}
            className="w-full max-w-sm text-center text-3xl tracking-widest bg-transparent border-b-2 py-2 outline-none"
            style={{ borderColor: "var(--gx-accent)", color: "var(--gx-ink)" }}
          />
        )}
      </div>

      <div className="flex w-full flex-1 items-center justify-center text-center">
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
