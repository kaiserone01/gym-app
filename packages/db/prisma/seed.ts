import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Organización + Sucursal de prueba
  const organizacion = await prisma.organizacion.create({
    data: { nombre: "Gym Demo", slug: "gym-demo" },
  });
  console.log("✅ Organización creada:", organizacion.nombre);

  const sucursal = await prisma.sucursal.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Sede Principal",
      diasGracia: 3,
      tasaCambioUSD: 40.5,
      // Se genera explícito en vez de confiar en @default(uuid()) del schema:
      // el motor de Prisma 7 (client-engine-runtime) no lo estaba aplicando
      // en las pruebas de esta sesión — más robusto generarlo en código de
      // todos modos, tratándose de un token de autenticación.
      apiKey: randomUUID(),
    },
  });
  console.log("✅ Sucursal creada:", sucursal.nombre);

  await prisma.temaOrganizacion.create({
    data: {
      organizacionId: organizacion.id,
      colorPrimario: "#1D4ED8",
      logoUrl: null,
    },
  });
  console.log("✅ TemaOrganizacion creado");

  // 2. Usuario admin (socio)
  const passwordHash = await bcrypt.hash("admin1234", 10);
  const admin = await prisma.usuarioAdmin.create({
    data: {
      organizacionId: organizacion.id,
      email: "admin@gymdemo.com",
      passwordHash,
      rol: "SOCIO",
    },
  });
  console.log("✅ Admin creado:", admin.email, "(password: admin1234)");

  // 3. Entrenador — UsuarioAdmin con rol ENTRENADOR (decisión acordada: el
  // entrenador seleccionable en Miembro es un usuario del panel, no una
  // entidad propia), asignado a la Sucursal vía UsuarioSucursal.
  const entrenadorPasswordHash = await bcrypt.hash("entrenador1234", 10);
  const entrenador = await prisma.usuarioAdmin.create({
    data: {
      organizacionId: organizacion.id,
      email: "carlos@gymdemo.com",
      passwordHash: entrenadorPasswordHash,
      rol: "ENTRENADOR",
      nombre: "Carlos Fitness",
      telefono: "0414-1234567",
    },
  });
  await prisma.usuarioSucursal.create({
    data: { usuarioId: entrenador.id, sucursalId: sucursal.id },
  });
  console.log("✅ Entrenador creado:", entrenador.nombre);

  // 4. Planes de prueba (mensual con y sin entrenador) y sus Suscripciones
  const planConEntrenador = await prisma.plan.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Mensual con entrenador",
      frecuencia: "MENSUAL",
      incluyeEntrenador: true,
      precioUSD: 30.0,
    },
  });
  const planSinEntrenador = await prisma.plan.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Mensual sin entrenador",
      frecuencia: "MENSUAL",
      incluyeEntrenador: false,
      precioUSD: 25.0,
    },
  });
  console.log("✅ Planes creados:", planConEntrenador.nombre, "y", planSinEntrenador.nombre);

  // 5. Miembros de prueba (mismos casos que antes: activo, vencido, sin entrenador)
  const hoy = new Date();
  const en20Dias = new Date(hoy);
  en20Dias.setDate(hoy.getDate() + 20);
  const hace10Dias = new Date(hoy);
  hace10Dias.setDate(hoy.getDate() - 10);

  const miembroActivo = await prisma.miembro.create({
    data: {
      organizacionId: organizacion.id,
      sucursalId: sucursal.id,
      nombre: "Rayza Aray",
      cedula: "19141319",
      celular: "0424-3332331",
      entrenadorId: entrenador.id,
      planId: planConEntrenador.id,
      precioPlan: 30.0,
      fechaUltimoPago: hoy,
      fechaVencimiento: en20Dias,
    },
  });
  await prisma.suscripcion.create({
    data: {
      miembroId: miembroActivo.id,
      planId: planConEntrenador.id,
      inicio: hoy,
      fin: en20Dias,
      estado: "ACTIVA",
    },
  });
  console.log("✅ Miembro activo creado:", miembroActivo.nombre);

  const miembroVencido = await prisma.miembro.create({
    data: {
      organizacionId: organizacion.id,
      sucursalId: sucursal.id,
      nombre: "Julio César Bastidas",
      cedula: "13264442",
      celular: "0424-5302270",
      planId: planSinEntrenador.id,
      precioPlan: 25.0,
      fechaUltimoPago: hace10Dias,
      fechaVencimiento: hace10Dias,
    },
  });
  console.log("✅ Miembro vencido creado:", miembroVencido.nombre);

  const miembroSinEntrenador = await prisma.miembro.create({
    data: {
      organizacionId: organizacion.id,
      sucursalId: sucursal.id,
      nombre: "Rodrigo Lara",
      cedula: "9275030",
      celular: "0424-9275030",
      planId: planSinEntrenador.id,
      precioPlan: 25.0,
      fechaUltimoPago: hoy,
      fechaVencimiento: en20Dias,
    },
  });
  await prisma.suscripcion.create({
    data: {
      miembroId: miembroSinEntrenador.id,
      planId: planSinEntrenador.id,
      inicio: hoy,
      fin: en20Dias,
      estado: "ACTIVA",
    },
  });
  console.log("✅ Miembro sin entrenador creado:", miembroSinEntrenador.nombre);

  console.log("\n🎉 Seed completado con éxito.");
  console.log(`   apiKey de prueba para el header X-Kiosk-Api-Key: ${sucursal.apiKey}`);
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
