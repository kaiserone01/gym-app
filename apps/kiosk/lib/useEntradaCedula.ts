import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from "react";
import { mensajeDeTecla, type MensajeTeclado } from "./teclasNumpad";

type EscuchaMensaje = (evento: { data: unknown }) => void;

interface WebView2 {
  addEventListener(tipo: "message", escucha: EscuchaMensaje): void;
  removeEventListener(tipo: "message", escucha: EscuchaMensaje): void;
}

function obtenerWebView(): WebView2 | undefined {
  return (window as unknown as { chrome?: { webview?: WebView2 } }).chrome?.webview;
}

const TIEMPO_INACTIVIDAD_MS = 7_000;

const sinSuscripcion = () => () => {};
const hayHostNativo = () => obtenerWebView() !== undefined;
const esAndroid = () => /Android/i.test(navigator.userAgent);
const sinHostEnServidor = () => false;

interface Opciones {
  // Cada vez que se escribe o borra (opcional).
  alEscribir?: () => void;
  alEnviar: (cedula: string) => Promise<void>;
}

// Fuente de la cédula, por orden: host de Windows (mensajes nativos de WebView2), APK de Android TV
// (keydown global solo de numpad, sin <input> para que no salga el teclado en pantalla) y, en un
// navegador normal (dev), el <input> con eventos DOM de siempre.
export function useEntradaCedula({ alEscribir, alEnviar }: Opciones) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cedula, setCedula] = useState("");
  // Espejo síncrono: "dígito + Enter" seguidos deben ver el valor actual sin esperar al render.
  const cedulaRef = useRef("");
  const opciones = useRef({ alEscribir, alEnviar });
  const nativo = useSyncExternalStore(sinSuscripcion, hayHostNativo, sinHostEnServidor);
  const android = useSyncExternalStore(sinSuscripcion, esAndroid, sinHostEnServidor);
  const sinInput = nativo || android;
  // Mientras se envía una cédula se ignora todo: evita el doble envío y dígitos que se perderían.
  const enviandoRef = useRef(false);

  useEffect(() => {
    opciones.current = { alEscribir, alEnviar };
  });

  const asignar = useCallback((valor: string) => {
    cedulaRef.current = valor;
    setCedula(valor);
  }, []);

  const manejar = useCallback(
    (mensaje: MensajeTeclado) => {
      if (enviandoRef.current) return;
      const { alEscribir, alEnviar } = opciones.current;

      switch (mensaje.type) {
        case "digit":
          if (!/^\d$/.test(mensaje.value)) return;
          alEscribir?.();
          asignar(cedulaRef.current + mensaje.value);
          return;
        case "backspace":
          alEscribir?.();
          asignar(cedulaRef.current.slice(0, -1));
          return;
        case "clear":
          alEscribir?.();
          asignar("");
          return;
        case "enter":
          enviandoRef.current = true;
          alEnviar(cedulaRef.current).finally(() => {
            enviandoRef.current = false;
          });
      }
    },
    [asignar]
  );

  useEffect(() => {
    const webview = obtenerWebView();
    if (!nativo || !webview) return;

    const alRecibir: EscuchaMensaje = ({ data }) => {
      if (typeof data !== "object" || data === null) return;
      manejar(data as MensajeTeclado);
    };

    webview.addEventListener("message", alRecibir);
    return () => webview.removeEventListener("message", alRecibir);
  }, [nativo, manejar]);

  useEffect(() => {
    if (nativo || !android) return;

    const alTeclear = (evento: globalThis.KeyboardEvent) => {
      const mensaje = mensajeDeTecla(evento);
      if (!mensaje) return;
      evento.preventDefault();
      // Mantener una tecla pulsada no debe repetir dígitos ni, peor, el Enter.
      if (evento.repeat) return;
      manejar(mensaje);
    };

    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [nativo, android, manejar]);

  // Una cédula a medias que nadie termina de teclear no debe quedar a la vista del siguiente socio.
  useEffect(() => {
    if (!cedula) return;
    const temporizador = setTimeout(() => asignar(""), TIEMPO_INACTIVIDAD_MS);
    return () => clearTimeout(temporizador);
  }, [cedula, asignar]);

  // Sin host ni Android, el kiosco tiene un teclado numérico físico y no pantalla táctil (ADR v1 §2.5):
  // el input siempre debe estar enfocado para capturarlo sin que el staff toque nada.
  useEffect(() => {
    if (!sinInput) inputRef.current?.focus();
  });

  const propsInput = {
    ref: inputRef,
    value: cedula,
    onChange: (evento: ChangeEvent<HTMLInputElement>) => {
      opciones.current.alEscribir?.();
      asignar(evento.target.value.replace(/\D/g, ""));
    },
    onKeyDown: (evento: KeyboardEvent<HTMLInputElement>) => {
      if (evento.key === "Enter") manejar({ type: "enter" });
      if (evento.key === "Escape") asignar("");
    },
    onBlur: () => inputRef.current?.focus(),
    inputMode: "numeric" as const,
    autoFocus: true,
  };

  return { cedula, limpiar: () => asignar(""), sinInput, propsInput };
}
