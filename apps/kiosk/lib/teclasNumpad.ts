// Mensajes de teclado que entiende el kiosco: los manda apps/kiosk-host (WebView2) y, en la APK
// de Android TV, los genera mensajeDeTecla a partir de `keydown`.
export type MensajeTeclado =
  | { type: "digit"; value: string }
  | { type: "enter" }
  | { type: "backspace" }
  | { type: "clear" };

// Solo teclas del numpad (event.code): la fila numérica normal se ignora a propósito para que un
// teclado común conectado al TV no pueda escribir cédulas.
export function mensajeDeTecla(evento: { code: string }): MensajeTeclado | null {
  const digito = /^Numpad(\d)$/.exec(evento.code);
  if (digito) return { type: "digit", value: digito[1] };
  switch (evento.code) {
    case "NumpadEnter":
      return { type: "enter" };
    case "Backspace":
      return { type: "backspace" };
    case "Escape":
      return { type: "clear" };
    default:
      return null;
  }
}
