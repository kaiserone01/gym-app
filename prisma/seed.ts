import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
    // 1. Crear el Gym de prueba
    const gym = await prisma.gym.create({
        data: {
            nombre: "Gym Demo",
            diasGracia: 3, // 3 días de gracia después del vencimiento
            tasaCambioUSD: 40.5,
        },
    });
    console.log("✅ Gym creado:", gym.nombre);

    // 2. Crear el usuario admin (dueño)
    const passwordHash = await bcrypt.hash("admin1234", 10);
    const admin = await prisma.usuarioAdmin.create({
        data: {
            gymId: gym.id,
            email: "admin@gymdemo.com",
            passwordHash,
            rol: "dueño",
        },
    });
    console.log("✅ Admin creado:", admin.email, "(password: admin1234)");

    // 3. Crear un entrenador
    const entrenador = await prisma.entrenador.create({
        data: {
            gymId: gym.id,
            nombre: "Carlos Fitness",
            telefono: "0414-1234567",
        },
    });
    console.log("✅ Entrenador creado:", entrenador.nombre);

    // 4. Miembro ACTIVO (pagó hace poco, vence en el futuro)
    const hoy = new Date();
    const en20Dias = new Date(hoy);
    en20Dias.setDate(hoy.getDate() + 20);

    const miembroActivo = await prisma.miembro.create({
        data: {
            gymId: gym.id,
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
    console.log("✅ Miembro activo creado:", miembroActivo.nombre);

    // 5. Miembro VENCIDO (venció hace más de los días de gracia)
    const hace10Dias = new Date(hoy);
    hace10Dias.setDate(hoy.getDate() - 10);

    const miembroVencido = await prisma.miembro.create({
        data: {
            gymId: gym.id,
            nombre: "Julio César Bastidas",
            cedula: "13264442",
            celular: "0424-5302270",
            planTipo: "SIN_ENTRENADOR",
            precioPlan: 25.0,
            fechaUltimoPago: hace10Dias,
            fechaVencimiento: hace10Dias, // ya vencido
        },
    });
    console.log("✅ Miembro vencido creado:", miembroVencido.nombre);

    // 6. Miembro SIN entrenador, activo
    const miembroSinEntrenador = await prisma.miembro.create({
        data: {
            gymId: gym.id,
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
}

main()
    .catch((e) => {
        console.error("❌ Error en el seed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });


