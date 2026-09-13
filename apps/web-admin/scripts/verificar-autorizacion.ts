// Script manual (no hay framework de tests en el repo todavía) para verificar
// AuthorizationService + CrearUsuarioAdmin contra datos reales: corre
// `npx tsx scripts/verificar-autorizacion.ts` desde apps/web-admin.
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import { PrismaUsuarioAdminRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioAdminRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { crearUsuarioAdmin, NoAutorizadoError } from "@gym-app/domain/use-cases/CrearUsuarioAdmin";

async function main() {
  const organizacion = await prisma.organizacion.findUnique({ where: { slug: "gym-demo" } });
  if (!organizacion) {
    throw new Error("No se encontró la organización 'gym-demo' — corre `npx prisma db seed` primero.");
  }

  const usuarios = new PrismaUsuarioAdminRepository(prisma);
  const autorizacion = new AuthorizationService();
  const passwordHash = await bcrypt.hash("recepcion1234", 10);

  // Caso 1: DUENO crea un RECEPCION — debe funcionar.
  try {
    const creado = await crearUsuarioAdmin(
      { usuarios, autorizacion },
      {
        solicitante: { rol: "DUENO" },
        organizacionId: organizacion.id,
        sucursalId: null,
        email: `recepcion-${Date.now()}@gymdemo.com`,
        passwordHash,
        rol: "RECEPCION",
      }
    );
    console.log("✅ DUENO creó un usuario RECEPCION:", creado.email);
  } catch (e) {
    console.error("❌ Falló el caso 1 (DUENO → RECEPCION), debía funcionar:", e);
    process.exitCode = 1;
  }

  // Caso 2: GERENTE intenta crear un RECEPCION — debe rechazarse.
  try {
    await crearUsuarioAdmin(
      { usuarios, autorizacion },
      {
        solicitante: { rol: "GERENTE" },
        organizacionId: organizacion.id,
        sucursalId: null,
        email: `no-deberia-crearse-${Date.now()}@gymdemo.com`,
        passwordHash,
        rol: "RECEPCION",
      }
    );
    console.error("❌ Falló el caso 2 (GERENTE → RECEPCION): se creó el usuario, debía rechazarse.");
    process.exitCode = 1;
  } catch (e) {
    if (e instanceof NoAutorizadoError) {
      console.log("✅ GERENTE fue rechazado correctamente al intentar crear RECEPCION:", e.message);
    } else {
      console.error("❌ Falló el caso 2 con un error inesperado:", e);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((e) => {
    console.error("❌ Error en la verificación:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
