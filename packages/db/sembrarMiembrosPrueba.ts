// Genera datos de prueba: 40 miembros (10 por cada uno de los 4 planes
// fijos, sin contar "Personalizado"), con pagos repartidos en los
// últimos 20 días — para poder probar /caja en vista Semana y Mes con
// algo más que un par de filas.
//
// No pasa por los Server Actions del panel — inserta directo con Prisma,
// pero replica lo mismo que haría la app real al dar de alta un miembro
// (crea/reutiliza el Plan, la Suscripcion, y fechaUltimoPago/Vencimiento).
//
// Uso: npm run db:sembrar-prueba --workspace packages/db
// Para deshacerlo: npm run db:limpiar-miembros --workspace packages/db
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const NOMBRES = [
  "Luis", "María", "Carlos", "Ana", "José", "Carmen", "Pedro", "Rosa",
  "Miguel", "Laura", "Jorge", "Isabel", "Rafael", "Gabriela", "Andrés",
  "Daniela", "Francisco", "Valentina", "Diego", "Camila",
];
const APELLIDOS = [
  "González", "Rodríguez", "Pérez", "Martínez", "Hernández", "López",
  "Díaz", "Sánchez", "Ramírez", "Torres", "Flores", "Rivas", "Castro",
  "Mendoza", "Suárez", "Gómez", "Vargas", "Ortiz", "Marín", "Rojas",
];
const METODOS = ["efectivo_usd", "efectivo_bs", "transferencia", "zelle", "binance_usdt", "pago_movil"];

interface PresetPlan {
  nombre: string;
  frecuencia: "SEMANAL" | "QUINCENAL" | "MENSUAL";
  incluyeEntrenador: boolean;
  precio: number;
}

const PRESETS: PresetPlan[] = [
  { nombre: "Semanal", frecuencia: "SEMANAL", incluyeEntrenador: false, precio: 8 },
  { nombre: "Corporativo", frecuencia: "MENSUAL", incluyeEntrenador: false, precio: 22 },
  { nombre: "Mensual sin entrenador", frecuencia: "MENSUAL", incluyeEntrenador: false, precio: 25 },
  { nombre: "Mensual con entrenador", frecuencia: "MENSUAL", incluyeEntrenador: true, precio: 30 },
];

const DURACION_DIAS: Record<PresetPlan["frecuencia"], number> = { SEMANAL: 7, QUINCENAL: 15, MENSUAL: 30 };

function elegir<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

function cedulaAleatoria(usadas: Set<string>): string {
  let cedula: string;
  do {
    cedula = String(90000000 + Math.floor(Math.random() * 9999999));
  } while (usadas.has(cedula));
  usadas.add(cedula);
  return cedula;
}

function fechaHaceNDias(n: number): Date {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - n);
  fecha.setHours(12, 0, 0, 0);
  return fecha;
}

async function obtenerOCrearPlan(organizacionId: string, preset: PresetPlan) {
  const existente = await prisma.plan.findFirst({ where: { organizacionId, nombre: preset.nombre } });
  if (existente) return existente;

  return prisma.plan.create({
    data: {
      organizacionId,
      nombre: preset.nombre,
      frecuencia: preset.frecuencia,
      incluyeEntrenador: preset.incluyeEntrenador,
      precioUSD: preset.precio,
      activo: true,
    },
  });
}

async function main() {
  const organizacion = await prisma.organizacion.findFirst();
  if (!organizacion) {
    throw new Error("No hay ninguna Organizacion en la base — corré el seed real primero.");
  }

  const sucursal = await prisma.sucursal.findFirst({ where: { organizacionId: organizacion.id } });
  if (!sucursal) {
    throw new Error("No hay ninguna Sucursal en la base — corré el seed real primero.");
  }

  const entrenador = await prisma.entrenador.findFirst({
    where: { sucursal: { organizacionId: organizacion.id }, activo: true },
  });

  const admin = await prisma.usuarioAdmin.findFirst({ where: { organizacionId: organizacion.id } });
  if (!admin) {
    throw new Error("No hay ningún UsuarioAdmin en la base — corré el seed real primero.");
  }

  const cedulasUsadas = new Set<string>();
  let creados = 0;

  for (const preset of PRESETS) {
    const plan = await obtenerOCrearPlan(organizacion.id, preset);

    for (let i = 0; i < 10; i++) {
      const nombre = `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`;
      const cedula = cedulaAleatoria(cedulasUsadas);
      const fechaPago = fechaHaceNDias(Math.floor(Math.random() * 20));
      const fechaVencimiento = new Date(fechaPago);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + DURACION_DIAS[preset.frecuencia]);
      const metodo = elegir(METODOS);
      const numeroOperacion = metodo === "pago_movil" ? String(1000 + Math.floor(Math.random() * 9000)) : null;

      const miembro = await prisma.miembro.create({
        data: {
          organizacionId: organizacion.id,
          sucursalId: sucursal.id,
          nombre,
          cedula,
          celular: `0424${Math.floor(1000000 + Math.random() * 8999999)}`,
          fechaInscripcion: fechaPago,
          entrenadorId: preset.incluyeEntrenador ? (entrenador?.id ?? null) : null,
          planId: plan.id,
          precioPlan: preset.precio,
          fechaUltimoPago: fechaPago,
          fechaVencimiento,
          activo: true,
        },
      });

      await prisma.pago.create({
        data: {
          miembroId: miembro.id,
          sucursalId: sucursal.id,
          registradoPorId: admin.id,
          monto: preset.precio,
          metodo,
          numeroOperacion,
          fechaPago,
        },
      });

      await prisma.suscripcion.create({
        data: {
          miembroId: miembro.id,
          planId: plan.id,
          inicio: fechaPago,
          fin: fechaVencimiento,
          estado: "ACTIVA",
        },
      });

      creados++;
    }

    console.log(`✅ 10 miembros creados con el plan "${preset.nombre}"`);
  }

  console.log(`🎉 Listo — ${creados} miembros de prueba creados en total.`);
}

main()
  .catch((error) => {
    console.error("❌ Error al sembrar datos de prueba:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
