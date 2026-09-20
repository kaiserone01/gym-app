export interface Tema {
  ground: string;
  surface: string;
  surface2: string;
  surfaceElevada: string;
  edge: string;
  ink: string;
  muted: string;
  mutedDim: string;
  accent: string;
  accentInk: string;
  good: string;
  goodInk: string;
  warn: string;
  warnInk: string;
  bad: string;
  badInk: string;
  scrim: string;
}

// Verde muestreado del logo real de Adrenalina Xtreme Gym — ver
// docs/design/tema-adrenalina-xtreme.md para la metodología de muestreo.
// Tema fijo por ahora: la resolución dinámica por Organización
// (TemaOrganizacion) queda para un plan aparte.
export const temaAdrenalinaXtreme: Tema = {
  ground: "#0a0d07",
  surface: "#12160d",
  surface2: "#191f11",
  surfaceElevada: "#1f2616",
  edge: "#26301a",
  ink: "#f3f6ec",
  muted: "#93a17d",
  mutedDim: "#545e42",
  accent: "#93e83a",
  accentInk: "#0c1400",
  good: "#93e83a",
  goodInk: "#0c1400",
  warn: "#f5a623",
  warnInk: "#241400",
  bad: "#ff3b4e",
  badInk: "#200609",
  scrim: "rgba(5, 7, 3, 0.6)",
};
