export interface Tema {
  ground: string;
  surface: string;
  surface2: string;
  edge: string;
  ink: string;
  muted: string;
  mutedDim: string;
  accent: string;
  accentInk: string;
  bad: string;
  badInk: string;
}

// Verde muestreado del logo real de Adrenalina Xtreme Gym — ver
// docs/design/tema-adrenalina-xtreme.md para la metodología de muestreo.
// Tema fijo por ahora: la resolución dinámica por Organización
// (TemaOrganizacion) queda para un plan aparte.
export const temaAdrenalinaXtreme: Tema = {
  ground: "#0a0d07",
  surface: "#12160d",
  surface2: "#191f11",
  edge: "#26301a",
  ink: "#f3f6ec",
  muted: "#93a17d",
  mutedDim: "#545e42",
  accent: "#93e83a",
  accentInk: "#0c1400",
  bad: "#ff3b4e",
  badInk: "#200609",
};
