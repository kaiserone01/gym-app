"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFeedback } from "./FeedbackOverlay";

// Las Server Actions redirigen tras un guardado exitoso (no queda montado
// el componente que llamó a la acción para leer un "estado de éxito"), así
// que el mensaje viaja como query param ?ok=<mensaje> en el redirect. Este
// componente vive una sola vez en el layout del panel, detecta ese param
// al montar/navegar, dispara el overlay y limpia la URL para que un
// refresh no repita el mensaje.
export function FeedbackDesdeUrl() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { mostrarExito } = useFeedback();

  useEffect(() => {
    const mensaje = searchParams.get("ok");
    if (!mensaje) return;

    mostrarExito(mensaje);

    const params = new URLSearchParams(searchParams);
    params.delete("ok");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar al cambio de "ok" en la URL, no a mostrarExito/router/pathname
  }, [searchParams]);

  return null;
}
