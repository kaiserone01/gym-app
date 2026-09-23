"use client";

import { createContext, useContext } from "react";

// FormularioMiembro (Datos personales) y FormularioCambiarPlan viven en
// árboles separados de React (este último se renderiza dentro del prop
// panelLateral) pero comparten la misma pantalla — este contexto es la
// forma en que "Cambiar de plan" sabe, antes de redirigir a /miembros, si
// hay cambios de Datos personales sin guardar que se perderían.
const ContextoCambiosSinGuardar = createContext(false);

export const ProveedorCambiosSinGuardar = ContextoCambiosSinGuardar.Provider;

export function useHayCambiosSinGuardar(): boolean {
  return useContext(ContextoCambiosSinGuardar);
}
