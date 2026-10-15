// Genera los íconos de Android (y los de la app web) desde assets/escudo.png. Se corre a mano
// (`npm run iconos`) y se versiona el resultado; el CI no lo ejecuta.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "assets", "escudo.png");
const res = join(raiz, "android", "app", "src", "main", "res");
const web = join(raiz, "..", "..", "vitrina");
const FONDO = { r: 10, g: 13, b: 7, alpha: 1 }; // #0a0d07
const TRANSPARENTE = { r: 0, g: 0, b: 0, alpha: 0 };

async function lienzo(ancho, alto, escudoFraccion, fondo) {
  const maximo = Math.round(Math.min(ancho, alto) * escudoFraccion);
  const escudo = await sharp(origen).resize(maximo, maximo, { fit: "inside" }).toBuffer();
  return sharp({ create: { width: ancho, height: alto, channels: 4, background: fondo } })
    .composite([{ input: escudo, gravity: "center" }])
    .png();
}

const lanzador = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [densidad, lado] of Object.entries(lanzador)) {
  const carpeta = join(res, `mipmap-${densidad}`);
  mkdirSync(carpeta, { recursive: true });
  await (await lienzo(lado, lado, 0.86, FONDO)).toFile(join(carpeta, "ic_launcher.png"));
  await (await lienzo(lado, lado, 0.86, FONDO)).toFile(join(carpeta, "ic_launcher_round.png"));
  // Adaptativo: lienzo 108dp con el escudo dentro de la zona segura (~61 %).
  const adaptativo = Math.round((lado / 48) * 108);
  await (await lienzo(adaptativo, adaptativo, 0.56, TRANSPARENTE)).toFile(join(carpeta, "ic_launcher_foreground.png"));
}

mkdirSync(join(res, "drawable-xhdpi"), { recursive: true });
await (await lienzo(320, 180, 0.92, FONDO)).toFile(join(res, "drawable-xhdpi", "banner.png"));

writeFileSync(
  join(res, "values", "ic_launcher_background.xml"),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A0D07</color>\n</resources>\n'
);

// Pantallas de arranque (las que trae la plantilla): fondo oscuro con el escudo.
for (const carpeta of readdirSync(res).filter((c) => c.startsWith("drawable"))) {
  const archivo = join(res, carpeta, "splash.png");
  if (!existsSync(archivo) || !statSync(archivo).isFile()) continue;
  const vertical = carpeta.includes("port");
  await (await lienzo(vertical ? 1080 : 1920, vertical ? 1920 : 1080, 0.5, FONDO)).toFile(archivo);
}

// App web: ícono de la pestaña y logo de la pantalla de marca.
if (existsSync(web)) {
  mkdirSync(join(web, "app"), { recursive: true });
  mkdirSync(join(web, "public", "branding"), { recursive: true });
  await (await lienzo(512, 512, 0.9, FONDO)).toFile(join(web, "app", "icon.png"));
  await (await lienzo(180, 180, 0.9, FONDO)).toFile(join(web, "app", "apple-icon.png"));
  await sharp(origen).resize(900, 900, { fit: "inside" }).png().toFile(join(web, "public", "branding", "escudo.png"));
}
console.log("Íconos generados.");
