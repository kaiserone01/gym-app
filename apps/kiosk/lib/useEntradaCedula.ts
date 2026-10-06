import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from "react";

// Mensajes de apps/kiosk-host (teclado numérico vinculado, vía CoreWebView2.PostWebMessageAsJson).
type MensajeTeclado =
  | { type: "digit"; value: string }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "clear" };

type EscuchaMensaje = (evento: { data: unknown }) => void;

interface WebView2 {
  addEventListener(tipo: "message", escucha: EscuchaMensaje): void;
  removeEventListener(tipo: "message", escucha: EscuchaMensaje): void;
}

function obtenerWebView(): WebView2 | undefined {
  return (window as unknown as { chrome?: { webview?: WebView2 } }).chrome?.webview;
}

const TIEMPO_INACTIVIDAD_MS = 10_000;

const sinSuscripcion =() => () => {};
const hayHostNativo = () => obtenerWebView() !== undefined;
const sinHostEnServidor = () => false;

interface Opciones {
  // Cada vez que se escribe o borra (page.tsx limpia la ficha del check-in anterior).
  alEscribir: () => void;
  alEnviar: (cedula: string) => Promise<void>;
}

// Fuente de la cédula: dentro de apps/kiosk-host llega por mensajes nativos, sin depender del foco de
// Windows; en un navegador normal (dev) se usa el <input> con eventos DOM de siempre.
export function useEntradaCedula({ alEscribir, alEnviar }: Opciones) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cedula, setCedula] = useState("");
  // Espejo síncrono: "dígito + Enter" seguidos deben ver el valor actual sin esperar al render.
  const cedulaRef = useRef("");
  const opciones = useRef({ alEscribir, alEnviar });
  const nativo = useSyncExternalStore(sinSuscripcion, hayHostNativo, sinHostEnServidor);

  useEffect(() => {
    opciones.current = { alEscribir, alEnviar };
  });

  const asignar = useCallback((valor: string) => {
    cedulaRef.current = valor;
    setCedula(valor);
  }, []);

  useEffect(() => {
    const webview = obtenerWebView();
    if (!nativo || !webview) return;

    // Mientras se envía una cédula se ignora todo: evita el doble envío y dígitos que se perderían.
    let enviando = false;
    const alRecibir: EscuchaMensaje = ({ data }) => {
      if (enviando || typeof data !== "object" || data === null) return;
      const mensaje = data as MensajeTeclado;
      const { alEscribir, alEnviar } = opciones.current;

      switch (mensaje.type) {
        case "digit":
          if (!/^\d$/.test(mensaje.value)) return;
          alEscribir();
          asignar(cedulaRef.current + mensaje.value);
          return;
        case "backspace":
          alEscribir();
          asignar(cedulaRef.current.slice(0, -1));
          return;
        case "clear":
          alEscribir();
          asignar("");
          return;
        case "enter":
          enviando = true;
          alEnviar(cedulaRef.current).finally(() => {
            enviando = false;
          });
      }
    };

    webview.addEventListener("message", alRecibir);
    return () => webview.removeEventListener("message", alRecibir);
  }, [nativo, asignar]);

  // Una cédula a medias que nadie termina de teclear no debe quedar a la vista del siguiente socio.
  useEffect(() => {
    if (!cedula) return;
    const temporizador = setTimeout(() => asignar(""), TIEMPO_INACTIVIDAD_MS);
    return () => clearTimeout(temporizador);
  }, [cedula, asignar]);

  // Sin host, el kiosco tiene un teclado numérico físico y no pantalla táctil (ADR v1 §2.5): el input
  // siempre debe estar enfocado para capturarlo sin que el staff toque nada.
  useEffect(() => {
    if (!nativo) inputRef.current?.focus();
  });

  const propsInput = {
    ref: inputRef,
    value: cedula,
    onChange: (evento: ChangeEvent<HTMLInputElement>) => {
      opciones.current.alEscribir();
      asignar(evento.target.value.replace(/\D/g, ""));
    },
    onKeyDown: (evento: KeyboardEvent<HTMLInputElement>) => {
      if (evento.key === "Enter") void opciones.current.alEnviar(cedulaRef.current);
      if (evento.key === "Escape") asignar("");
    },
    onBlur: () => inputRef.current?.focus(),
    inputMode: "numeric" as const,
    autoFocus: true,
  };

  return { cedula, limpiar: () => asignar(""), nativo, propsInput };
}
