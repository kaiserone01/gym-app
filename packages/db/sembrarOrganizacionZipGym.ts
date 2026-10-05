// Crea la organización de prueba "zip-gym" con datos ficticios: un socio, una sede, 5 planes, 4 métodos de
// pago, 2 entrenadores, 100 miembros (con su suscripción) y 50 productos. Aborta si el slug ya existe.
//
// Uso: npm run db:sembrar-zip-gym --workspace packages/db
// Contraseña del socio: variable ZIP_GYM_PASSWORD; si no está definida se genera una al azar y se imprime una vez.
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

config({ path: path.resolve(__dirname, "../../.env") });

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const SLUG = "zip-gym";
const EMAIL_SOCIO = "zipnegocios@gmail.com";
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Aleatoriedad reproducible: la misma siembra produce siempre los mismos datos.
function crearRng(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = crearRng(20261005);
const entero = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const elegir = <T>(lista: T[]): T => lista[Math.floor(rng() * lista.length)];

const NOMBRES = ["Valentina", "Santiago", "Camila", "Mateo", "Isabella", "Sebastián", "Luciana", "Diego", "Mariana", "Andrés", "Sofía", "Gabriel", "Daniela", "Samuel", "Paula", "Emilio", "Andrea", "Nicolás", "Carolina", "Joaquín", "Fernanda", "Alejandro", "Gabriela", "Rafael", "Natalia", "Tomás", "Verónica", "Ignacio", "Adriana", "Esteban"];
const APELLIDOS = ["Rivas", "Montoya", "Salazar", "Pineda", "Ferrer", "Quintero", "Barrios", "Ledezma", "Carrasco", "Bermúdez", "Aponte", "Zambrano", "Maldonado", "Escalona", "Figueroa", "Peña", "Sandoval", "Contreras", "Arteaga", "Villegas", "Olivares", "Camacho", "Brito", "Medina", "Lugo"];

const PLANES = [
  { nombre: "Semanal", frecuencia: "SEMANAL", diasCiclo: 7, precioUSD: 8, incluyeEntrenador: false },
  { nombre: "Mensual sin entrenador", frecuencia: "MENSUAL", diasCiclo: 30, precioUSD: 25, incluyeEntrenador: false },
  { nombre: "Mensual con entrenador", frecuencia: "MENSUAL", diasCiclo: 30, precioUSD: 30, incluyeEntrenador: true },
  { nombre: "Corporativo", frecuencia: "MENSUAL", diasCiclo: 30, precioUSD: 22, incluyeEntrenador: false },
  { nombre: "Trimestral", frecuencia: "PERSONALIZADO", diasCiclo: 90, precioUSD: 65, incluyeEntrenador: false },
] as const;

const PRODUCTOS_POR_CATEGORIA: Record<string, Array<[string, number]>> = {
  Bebidas: [["Agua mineral 500ml", 0.8], ["Agua mineral 1L", 1.2], ["Gatorade limón", 2.2], ["Gatorade uva", 2.2], ["Powerade azul", 2], ["Jugo de naranja natural", 2.5], ["Té frío durazno", 1.8], ["Batido de proteína listo", 4.5], ["Bebida energética", 2.8], ["Agua de coco", 2.4]],
  Suplementos: [["Proteína whey 2lb", 38], ["Proteína whey 5lb", 85], ["Creatina monohidratada 300g", 28], ["BCAA 200g", 24], ["Pre-entreno frutos rojos", 32], ["Multivitamínico 60 cáps", 15], ["Omega 3 90 cáps", 18], ["Glutamina 300g", 26], ["Quemador de grasa 60 cáps", 30], ["Colágeno en polvo 250g", 22]],
  Snacks: [["Barra de proteína chocolate", 2.5], ["Barra de proteína vainilla", 2.5], ["Barra de avena y miel", 1.5], ["Mix de frutos secos 100g", 3], ["Mantequilla de maní 340g", 6.5], ["Galletas de avena", 1.2], ["Chips de plátano", 1.1], ["Granola sin azúcar 250g", 4], ["Gelatina fit", 1], ["Pasas con almendras 80g", 2.2]],
  Accesorios: [["Guantes de entrenamiento", 12], ["Banda elástica ligera", 6], ["Banda elástica fuerte", 9], ["Cuerda para saltar", 7], ["Toalla deportiva", 5], ["Cinturón de levantamiento", 24], ["Shaker 700ml", 5.5], ["Straps de agarre", 8], ["Rodilleras par", 15], ["Candado para casillero", 4]],
  Ropa: [["Franela deportiva hombre", 14], ["Franela deportiva mujer", 14], ["Short deportivo", 12], ["Licra deportiva", 18], ["Gorra Zip Gym", 9], ["Medias deportivas par", 4], ["Banda para el cabello", 2], ["Mochila deportiva", 28], ["Botella térmica 1L", 16], ["Chaqueta cortaviento", 30]],
};

async function main() {
  if (await prisma.organizacion.findUnique({ where: { slug: SLUG } })) {
    throw new Error(`La organización "${SLUG}" ya existe: nada que hacer.`);
  }
  if (await prisma.usuarioAdmin.findUnique({ where: { email: EMAIL_SOCIO } })) {
    throw new Error(`Ya existe un usuario con el email ${EMAIL_SOCIO} (el email es único en toda la base).`);
  }

  const passwordPlano = process.env.ZIP_GYM_PASSWORD ?? `Zip-${randomBytes(5).toString("hex")}`;
  const passwordHash = await bcrypt.hash(passwordPlano, 10);

  const organizacion = await prisma.organizacion.create({ data: { nombre: "Zip Gym", slug: SLUG } });
  const orgId = organizacion.id;
  await prisma.temaOrganizacion.create({ data: { organizacionId: orgId, colorPrimario: "#1D4ED8", logoUrl: null } });
  const sucursal = await prisma.sucursal.create({
    data: { organizacionId: orgId, nombre: "Sede Principal", diasGracia: 3, apiKey: randomUUID() },
  });

  // Socio con todos los permisos y acceso a la sede.
  const modulos = ["MIEMBROS", "PAGOS", "PLANES", "CAJA", "USUARIOS", "SUCURSALES"] as const;
  const acciones = ["VER", "CREAR", "EDITAR", "ELIMINAR"] as const;
  const socio = await prisma.usuarioAdmin.create({
    data: { organizacionId: orgId, sucursalId: sucursal.id, nombre: "Gustavo Amarista", email: EMAIL_SOCIO, passwordHash, rol: "SOCIO" },
  });
  await prisma.permisoUsuario.createMany({
    data: modulos.flatMap((modulo) => acciones.map((accion) => ({ usuarioId: socio.id, modulo, accion }))),
  });
  await prisma.usuarioSucursal.create({ data: { usuarioId: socio.id, sucursalId: sucursal.id } });

  // Entrenadores sin acceso al panel (mismo patrón que el alta simplificada de la app).
  const entrenadores = [];
  for (const nombre of ["Carlos Medina", "Laura Escalona"]) {
    const entrenador = await prisma.usuarioAdmin.create({
      data: {
        organizacionId: orgId,
        sucursalId: sucursal.id,
        nombre,
        email: `entrenador-${randomUUID()}@sinacceso.interno`,
        passwordHash: await bcrypt.hash(randomBytes(16).toString("hex"), 10),
        rol: "ENTRENADOR",
      },
    });
    await prisma.usuarioSucursal.create({ data: { usuarioId: entrenador.id, sucursalId: sucursal.id } });
    entrenadores.push(entrenador);
  }

  const planes = [];
  for (const plan of PLANES) planes.push(await prisma.plan.create({ data: { organizacionId: orgId, ...plan } }));

  // Métodos de pago mínimos para poder cobrar en Caja.
  await prisma.metodoPago.createMany({
    data: [
      { organizacionId: orgId, tipo: "EFECTIVO", moneda: "USD", orden: 1 },
      { organizacionId: orgId, tipo: "EFECTIVO", moneda: "BS", orden: 2 },
      { organizacionId: orgId, tipo: "PAGO_MOVIL", nombreBanco: "Banesco", moneda: "BS", orden: 3 },
      { organizacionId: orgId, tipo: "TRANSFERENCIA", nombreBanco: "Banesco", moneda: "BS", orden: 4 },
    ],
  });

  // 50 productos.
  const productos = Object.entries(PRODUCTOS_POR_CATEGORIA).flatMap(([categoria, lista]) =>
    lista.map(([nombre, costoUSD]) => ({ organizacionId: orgId, nombre, descripcion: categoria, costoUSD })),
  );
  await prisma.producto.createMany({ data: productos });

  // 100 miembros con nombres y cédulas ficticias, repartidos entre los planes, con vencimientos variados
  // (de -35 a +30 días desde hoy) y su suscripción coherente con esa fecha.
  const hoy = new Date();
  const nombresUsados = new Set<string>();
  let creados = 0;
  for (let i = 0; i < 100; i++) {
    let nombre = "";
    do {
      nombre = `${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`;
    } while (nombresUsados.has(nombre));
    nombresUsados.add(nombre);

    const plan = planes[i % planes.length];
    const vencimiento = new Date(hoy.getTime() + entero(-35, 30) * MS_POR_DIA);
    const inicio = new Date(vencimiento.getTime() - plan.diasCiclo * MS_POR_DIA);
    const miembro = await prisma.miembro.create({
      data: {
        organizacionId: orgId,
        sucursalId: sucursal.id,
        nombre,
        cedula: String(90000001 + i), // rango ficticio, único por organización
        celular: `04${elegir(["12", "14", "16", "24", "26"])}-${entero(1000000, 9999999)}`,
        fechaInscripcion: new Date(inicio.getTime() - entero(0, 120) * MS_POR_DIA),
        planId: plan.id,
        precioPlan: plan.precioUSD,
        entrenadorId: plan.incluyeEntrenador ? elegir(entrenadores).id : null,
        fechaUltimoPago: inicio,
        fechaVencimiento: vencimiento,
        activo: true,
      },
    });
    await prisma.suscripcion.create({
      data: { miembroId: miembro.id, planId: plan.id, inicio, fin: vencimiento, estado: vencimiento >= hoy ? "ACTIVA" : "VENCIDA" },
    });
    creados++;
  }

  console.log(`✅ Organización "${organizacion.nombre}" (${SLUG}) creada.`);
  console.log(`   Socio: Gustavo Amarista <${EMAIL_SOCIO}> — contraseña: ${passwordPlano}`);
  console.log(`   Sede: ${sucursal.nombre} | planes: ${planes.length} | entrenadores: ${entrenadores.length} | métodos de pago: 4`);
  console.log(`   Miembros: ${creados} | productos: ${productos.length}`);
}

main()
  .catch((error) => {
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
