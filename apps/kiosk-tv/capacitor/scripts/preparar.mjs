// Genera lo que Capacitor necesita a partir de variables de entorno (nada de esto se versiona):
//   capacitor.config.json  → app remota: abre urlInicio(KIOSCO_URL, KIOSCO_CLAVE)
//   www/index.html         → Capacitor exige un webDir aunque la app sea remota
//   www/offline.html       → página local si el primer arranque no tiene red; reintenta sola
// Variables: KIOSCO_URL (por defecto https://kiosco.zipnegocios.com) y KIOSCO_CLAVE (opcional).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { urlInicio } from "./url.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const inicio = urlInicio(process.env.KIOSCO_URL || "https://kiosco.zipnegocios.com", process.env.KIOSCO_CLAVE || "");

const pagina = (titulo, mensaje, demoraMs) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;background:#0a0d07;color:#f3f6ec;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">
<div><h1 style="font-size:48px;margin:0 0 24px 0">${titulo}</h1><p style="font-size:28px;margin:0">${mensaje}</p></div>
<script>setTimeout(function () { location.href = ${JSON.stringify(inicio)}; }, ${demoraMs});</script>
</body></html>
`;

mkdirSync(join(raiz, "www"), { recursive: true });
writeFileSync(join(raiz, "www", "index.html"), pagina("Kiosco", "Abriendo…", 0));
writeFileSync(join(raiz, "www", "offline.html"), pagina("Sin conexión", "Reintentando…", 10_000));

const configuracion = {
  appId: "com.adrenalina.kiosco",
  appName: "Kiosco AX",
  webDir: "www",
  server: { url: inicio, cleartext: false, errorPath: "offline.html" },
  android: { allowMixedContent: false },
};
writeFileSync(join(raiz, "capacitor.config.json"), `${JSON.stringify(configuracion, null, 2)}\n`);

console.log("Preparado. URL de inicio:", process.env.KIOSCO_CLAVE ? inicio.replace(/#clave=.*/, "#clave=***") : inicio);
