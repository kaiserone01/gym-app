import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

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

  // 2. Usuario admin (dueño)
  const passwordHash = await bcrypt.hash("admin1234", 10);
  const admin = await prisma.usuarioAdmin.create({
    data: {
      organizacionId: organizacion.id,
      email: "admin@gymdemo.com",
      passwordHash,
      rol: "DUENO",
    },
  });
  console.log("✅ Admin creado:", admin.email, "(password: admin1234)");

  // 3. Entrenador (pertenece a la Sucursal, decisión aprobada)
  const entrenador = await prisma.entrenador.create({
    data: {
      sucursalId: sucursal.id,
      nombre: "Carlos Fitness",
      telefono: "0414-1234567",
    },
  });
  console.log("✅ Entrenador creado:", entrenador.nombre);

  // 4. Plan "Sede Única" con acceso a esta sucursal, y una Suscripcion activa
  const planSedeUnica = await prisma.plan.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Sede Única",
      tipoAcceso: "SEDE_UNICA",
      precioUSD: 25.0,
      sucursalesAcceso: {
        create: { sucursalId: sucursal.id },
      },
    },
  });
  console.log("✅ Plan creado:", planSedeUnica.nombre);

  // 5. Miembros de prueba (mismos casos que antes: activo, vencido, sin entrenador)
  const hoy = new Date();
  const en20Dias = new Date(hoy);
  en20Dias.setDate(hoy.getDate() + 20);
  const hace10Dias = new Date(hoy);
  hace10Dias.setDate(hoy.getDate() - 10);

  const miembroActivo = await prisma.miembro.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Rayza Aray",
      cedula: "19141319",
      celular: "0424-3332331",
      entrenadorId: entrenador.id,
      planTipo: "CON_ENTRENADOR",
      precioPlan: 30.0,
      fechaUltimoPago: hoy,
      fechaVencimiento: en20Dias,
    },
  });
  await prisma.suscripcion.create({
    data: {
      miembroId: miembroActivo.id,
      planId: planSedeUnica.id,
      inicio: hoy,
      fin: en20Dias,
      estado: "ACTIVA",
    },
  });
  console.log("✅ Miembro activo creado:", miembroActivo.nombre);

  const miembroVencido = await prisma.miembro.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Julio César Bastidas",
      cedula: "13264442",
      celular: "0424-5302270",
      planTipo: "SIN_ENTRENADOR",
      precioPlan: 25.0,
      fechaUltimoPago: hace10Dias,
      fechaVencimiento: hace10Dias,
    },
  });
  console.log("✅ Miembro vencido creado:", miembroVencido.nombre);

  const miembroSinEntrenador = await prisma.miembro.create({
    data: {
      organizacionId: organizacion.id,
      nombre: "Rodrigo Lara",
      cedula: "9275030",
      celular: "0424-9275030",
      planTipo: "SIN_ENTRENADOR",
      precioPlan: 25.0,
      fechaUltimoPago: hoy,
      fechaVencimiento: en20Dias,
    },
  });
  console.log("✅ Miembro sin entrenador creado:", miembroSinEntrenador.nombre);

  console.log("\n🎉 Seed completado con éxito.");
  console.log(`   sucursalId de prueba para /api/checkin: ${sucursal.id}`);
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
