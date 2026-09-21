"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Lottie } from "lottie-react";
import animacionOk from "../assets/lottie/ok.json";
import animacionError from "../assets/lottie/error.json";

type TipoFeedback = "exito" | "error";

interface FeedbackActivo {
  tipo: TipoFeedback;
  mensaje: string;
}

interface FeedbackContextValor {
  mostrarExito: (mensaje: string) => void;
  mostrarError: (mensaje: string) => void;
}

const FeedbackContext = createContext<FeedbackContextValor | null>(null);

export const DURACION_MS = 4000;

// Se monta una vez en el layout del panel — cualquier página/formulario
// cliente dispara mostrarExito/mostrarError vía useFeedback() sin tener
// que pasar props ni montar su propio overlay.
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [activo, setActivo] = useState<FeedbackActivo | null>(null);

  const mostrar = useCallback((tipo: TipoFeedback, mensaje: string) => {
    setActivo({ tipo, mensaje });
  }, []);

  const mostrarExito = useCallback((mensaje: string) => mostrar("exito", mensaje), [mostrar]);
  const mostrarError = useCallback((mensaje: string) => mostrar("error", mensaje), [mostrar]);

  useEffect(() => {
    if (!activo) return;
    const temporizador = setTimeout(() => setActivo(null), DURACION_MS);
    return () => clearTimeout(temporizador);
  }, [activo]);

  return (
    <FeedbackContext.Provider value={{ mostrarExito, mostrarError }}>
      {children}
      {activo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "color-mix(in srgb, black 55%, transparent)" }}
          role="status"
          aria-live="polite"
          onClick={() => setActivo(null)}
        >
          <div
            className="flex w-full max-w-xs flex-col items-center rounded-2xl border-2 p-6"
            style={{
              borderColor: activo.tipo === "exito" ? "var(--gx-good)" : "var(--gx-bad)",
              background: "var(--gx-surface)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-32 w-32">
              <Lottie
                src={activo.tipo === "exito" ? animacionOk : animacionError}
                className="h-full w-full"
                loop={false}
                autoplay
              />
            </div>
            <p
              className="mt-2 text-center text-sm font-medium"
              style={{ color: activo.tipo === "exito" ? "var(--gx-good)" : "var(--gx-bad)" }}
            >
              {activo.mensaje}
            </p>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValor {
  const contexto = useContext(FeedbackContext);
  if (!contexto) {
    throw new Error("useFeedback debe usarse dentro de un FeedbackProvider.");
  }
  return contexto;
}
