"use client";

import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";

// Antes de cerrar el día, el detalle se ve siempre (es cuando más se
// necesita, para revisar antes de sellar el total). Una vez cerrado, se
// colapsa por defecto — el contenido sigue en el DOM (oculto con la
// clase "hidden", no desmontado) para que "Imprimir" lo muestre igual
// aunque no lo hayas desplegado en pantalla.
export function DetalleColapsable({
  abiertoPorDefecto,
  children,
}: {
  abiertoPorDefecto: boolean;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(abiertoPorDefecto);

  return (
    <>
      {!visible && (
        <Button type="button" variant="secundario" onClick={() => setVisible(true)} className="print:hidden">
          Ver registros
        </Button>
      )}
      <div className={visible ? "" : "hidden print:block"}>{children}</div>
    </>
  );
}
