import { useEffect, useState } from "react";

const formatoHora = () => new Date().toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });

// "" hasta montar: el export estático se prerenderiza en Node y la hora real no debe quedar
// horneada en el HTML.
export function useHoraActual(): string {
  const [hora, setHora] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reloj: se lee tras el montaje (SSR-safe)
    setHora(formatoHora());
    const temporizador = setInterval(() => setHora(formatoHora()), 15_000);
    return () => clearInterval(temporizador);
  }, []);

  return hora;
}
