"use client";

import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { ListaEnSala } from "./ListaEnSala";
import { HistorialSala } from "./HistorialSala";

// El SOCIO alterna entre "Ahora" y "Historial"; el resto solo ve "Ahora".
export function PanelEnSala({ esSocio, sucursalNombre }: { esSocio: boolean; sucursalNombre: string }) {
  const [vista, setVista] = useState<"ahora" | "historial">("ahora");

  return (
    <>
      {esSocio && (
        <div className="mb-4 flex gap-2 print:hidden">
          <Button type="button" variant={vista === "ahora" ? "primario" : "secundario"} onClick={() => setVista("ahora")}>
            Ahora
          </Button>
          <Button type="button" variant={vista === "historial" ? "primario" : "secundario"} onClick={() => setVista("historial")}>
            Historial
          </Button>
        </div>
      )}
      {vista === "ahora" ? <ListaEnSala /> : <HistorialSala sucursalNombre={sucursalNombre} />}
    </>
  );
}
