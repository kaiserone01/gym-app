import type { Tema } from "./tokens";

const VARIABLE_CSS: Record<keyof Tema, string> = {
  ground: "--gx-ground",
  surface: "--gx-surface",
  surface2: "--gx-surface-2",
  surfaceElevada: "--gx-surface-elevada",
  edge: "--gx-edge",
  ink: "--gx-ink",
  muted: "--gx-muted",
  mutedDim: "--gx-muted-dim",
  accent: "--gx-accent",
  accentInk: "--gx-accent-ink",
  good: "--gx-good",
  goodInk: "--gx-good-ink",
  warn: "--gx-warn",
  warnInk: "--gx-warn-ink",
  bad: "--gx-bad",
  badInk: "--gx-bad-ink",
  scrim: "--gx-scrim",
};

// Inyecta el tema como variables CSS en :root. :root es global mientras
// este componente esté montado — en apps/web-admin se monta SOLO en
// /login (ver docs/design/tema-adrenalina-xtreme.md), nunca en el layout
// raíz, para no filtrar estos colores al panel /miembros.
export function ThemeStyleTag({ tema }: { tema: Tema }) {
  const declaraciones = (Object.keys(tema) as (keyof Tema)[])
    .map((clave) => `  ${VARIABLE_CSS[clave]}: ${tema[clave]};`)
    .join("\n");

  return <style>{`:root {\n${declaraciones}\n}`}</style>;
}
