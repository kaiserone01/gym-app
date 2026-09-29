import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { R2StorageService } from "@gym-app/infrastructure/storage/R2StorageService";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CARPETA_DATOS = path.resolve(__dirname, "productos-prueba");

interface ProductoPrueba {
  slug: string;
  nombre: string;
  descripcion: string;
  costoUSD: number;
  imagen: string;
}

function storageR2(): R2StorageService {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error("Faltan variables de entorno de R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL).");
  }
  return new R2StorageService({ accountId, accessKeyId, secretAccessKey, bucket, publicUrl });
}

// Siembra productos de gimnasio de ejemplo (con foto en R2) en una organización.
// Por defecto es un ensayo (no escribe nada); con --confirm crea los productos.
// Idempotente: omite los productos cuyo nombre ya existe en la organización.
// Las fotos y su atribución están en productos-prueba/ (ver productos.json).
//   npm run db:sembrar-productos-prueba --workspace packages/db -- --org=gym-demo
//   npm run db:sembrar-productos-prueba:confirm --workspace packages/db -- --org=gym-demo
async function main() {
  const confirmar = process.argv.includes("--confirm");
  const slugOrg = process.argv.find((a) => a.startsWith("--org="))?.slice("--org=".length) ?? "gym-demo";

  const organizacion = await prisma.organizacion.findUnique({ where: { slug: slugOrg } });
  if (!organizacion) throw new Error(`No existe la organización con slug "${slugOrg}".`);

  const productos: ProductoPrueba[] = JSON.parse(fs.readFileSync(path.join(CARPETA_DATOS, "productos.json"), "utf8"));
  const existentes = await prisma.producto.findMany({ where: { organizacionId: organizacion.id }, select: { nombre: true } });
  const nombresExistentes = new Set(existentes.map((p) => p.nombre.trim().toLowerCase()));

  const storage = confirmar ? storageR2() : null;
  let creados = 0;
  let omitidos = 0;

  for (const producto of productos) {
    if (nombresExistentes.has(producto.nombre.trim().toLowerCase())) {
      omitidos++;
      console.log(`= omitido (ya existe): ${producto.nombre}`);
      continue;
    }

    if (!storage) {
      console.log(`+ crearía: ${producto.nombre} — $${producto.costoUSD} — ${producto.imagen}`);
      creados++;
      continue;
    }

    const contenido = fs.readFileSync(path.join(CARPETA_DATOS, producto.imagen));
    const fotoUrl = await storage.subir("productos", `${producto.slug}.webp`, contenido, "image/webp");
    await prisma.producto.create({
      data: {
        organizacionId: organizacion.id,
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        costoUSD: producto.costoUSD,
        fotoUrl,
      },
    });
    creados++;
    console.log(`+ creado: ${producto.nombre}`);
  }

  console.log(
    `${confirmar ? "Creados" : "Se crearían"}: ${creados}, omitidos: ${omitidos}, organización: ${organizacion.nombre}.` +
      (confirmar ? "" : " (ensayo; usa --confirm para escribir)")
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
