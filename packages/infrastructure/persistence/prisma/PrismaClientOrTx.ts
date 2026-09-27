import type { PrismaClient, Prisma } from "@gym-app/db/generated/prisma/client";

// Tipo aceptado por los repos que participan en transacciones (ver
// CambiarPlanConPago: guardado atómico de Miembro/Suscripcion/Pago/
// CambioPlanAuditoria en un solo prisma.$transaction). Prisma.TransactionClient
// es el mismo PrismaClient sin los métodos de nivel de conexión
// ($connect/$disconnect/$on/$use/$extends), que ningún repo usa — así un
// repo construido con el cliente global o con el `tx` de una transacción
// son intercambiables sin duplicar la clase.
export type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;
