// Prepara lo que Capacitor necesita (nada de esto se versiona):
//   www/                    → copia del export estático de apps/vitrina (o de apps/vitrina-tv/prueba)
//   www/vitrina-config.json → { apiUrl, clave }
//   capacitor.config.json
// Variables: VITRINA_API_URL, VITRINA_CLAVE (opcional), VITRINA_WEB_DIR (por defecto ../../vitrina/out,
// relativa a esta carpeta) y VITRINA_DEV_URL (solo desarrollo).
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { construirConfiguracion } from "./configuracion.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const { capacitor, vitrina } = construirConfiguracion(process.env);
const webDir = resolve(raiz, process.env.VITRINA_WEB_DIR || "../../vitrina/out");

rmSync(join(raiz, "www"), { recursive: true, force: true });
mkdirSync(join(raiz, "www"), { recursive: true });

if (existsSync(webDir)) {
  cpSync(webDir, join(raiz, "www"), { recursive: true });
} else if (capacitor.server) {
  writeFileSync(join(raiz, "www", "index.html"), "<!doctype html><title>Vitrina</title>");
} else {
  throw new Error(`No existe la carpeta de la app web: ${webDir}. Compila apps/vitrina primero.`);
}

writeFileSync(join(raiz, "www", "vitrina-config.json"), `${JSON.stringify(vitrina)}\n`);
writeFileSync(join(raiz, "capacitor.config.json"), `${JSON.stringify(capacitor, null, 2)}\n`);

console.log("Preparado. API:", vitrina.apiUrl || "(desarrollo)", "| clave:", vitrina.clave ? "***" : "(sin clave)");
