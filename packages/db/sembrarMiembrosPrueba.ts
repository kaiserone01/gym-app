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
  planTipo: "SIN_ENTRENADOR" | "CON_ENTRENADOR";
  precio: number;
}

const PRESETS: PresetPlan[] = [
  { nombre: "Semanal", planTipo: "SIN_ENTRENADOR", precio: 8 },
  { nombre: "Corporativo", planTipo: "SIN_ENTRENADOR", precio: 22 },
  { nombre: "Mensual sin entrenador", planTipo: "SIN_ENTRENADOR", precio: 25 },
  { nombre: "Mensual con entrenador", planTipo: "CON_ENTRENADOR", precio: 30 },
];

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

async function obtenerOCrearPlan(organizacionId: string, nombre: string, precioUSD: number) {
  const existente = await prisma.plan.findFirst({ where: { organizacionId, nombre } });
  if (existente) return existente;

  return prisma.plan.create({
    data: { organizacionId, nombre, tipoAcceso: "TODA_LA_ORGANIZACION", precioUSD, activo: true },
  });
}

async function main() {
  const organizacion = await prisma.organizacion.findFirst();
  if (!organizacion) {
    throw new Error("No hay ninguna Organizacion en la base — corré el seed real primero.");
  }

  const entrenador = await prisma.entrenador.findFirst({
    where: { sucursal: { organizacionId: organizacion.id }, activo: true },
  });

  const cedulasUsadas = new Set<string>();
  let creados = 0;

  for (const preset of PRESETS) {
    const plan = await obtenerOCrearPlan(organizacion.id, preset.nombre, preset.precio);

    for (let i = 0; i < 10; i++) {
      const nombre = `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`;
      const cedula = cedulaAleatoria(cedulasUsadas);
      const fechaPago = fechaHaceNDias(Math.floor(Math.random() * 20));
      const fechaVencimiento = new Date(fechaPago);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
      const metodo = elegir(METODOS);
      const numeroOperacion = metodo === "pago_movil" ? String(1000 + Math.floor(Math.random() * 9000)) : null;

      const miembro = await prisma.miembro.create({
        data: {
          organizacionId: organizacion.id,
          nombre,
          cedula,
          celular: `0424${Math.floor(1000000 + Math.random() * 8999999)}`,
          fechaInscripcion: fechaPago,
          entrenadorId: preset.planTipo === "CON_ENTRENADOR" ? (entrenador?.id ?? null) : null,
          planTipo: preset.planTipo,
          precioPlan: preset.precio,
          fechaUltimoPago: fechaPago,
          fechaVencimiento,
          activo: true,
        },
      });

      await prisma.pago.create({
        data: {
          miembroId: miembro.id,
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
