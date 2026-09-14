export interface PresetPlanMiembro {
  key: string;
  nombre: string;
  planTipo: "SIN_ENTRENADOR" | "CON_ENTRENADOR";
  precio: number;
}

// Precios fijos acordados con el gimnasio. No hay pantalla para editarlos
// todavía (eso sería el catálogo real de /planes) — cambiarlos requiere
// tocar este archivo y hacer un deploy.
export const PRESETS_PLAN_MIEMBRO: PresetPlanMiembro[] = [
  { key: "semanal", nombre: "Semanal", planTipo: "SIN_ENTRENADOR", precio: 8 },
  { key: "corporativo", nombre: "Corporativo", planTipo: "SIN_ENTRENADOR", precio: 22 },
  { key: "mensual_sin", nombre: "Mensual sin entrenador", planTipo: "SIN_ENTRENADOR", precio: 25 },
  { key: "mensual_con", nombre: "Mensual con entrenador", planTipo: "CON_ENTRENADOR", precio: 30 },
];
