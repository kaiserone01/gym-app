-- Unifica el concepto de "entrenador": Miembro.entrenadorId deja de
-- apuntar al modelo Entrenador (independiente, con sucursalId fijo) y pasa
-- a apuntar a UsuarioAdmin (filtrado por rol = ENTRENADOR en el dominio).
-- Se agrega también telefono y fotoUrl a UsuarioAdmin (foto de perfil para
-- cualquier rol administrativo, no solo entrenadores).

-- 1. Nuevas columnas en UsuarioAdmin.
ALTER TABLE "UsuarioAdmin" ADD COLUMN "telefono" TEXT;
ALTER TABLE "UsuarioAdmin" ADD COLUMN "fotoUrl" TEXT;

-- 2. Desvincular Miembro.entrenadorId de la fila vieja de Entrenador — no
-- se reasigna por nombre (decisión acordada): quedan sin entrenador hasta
-- que el script de asignación aleatoria (o el panel) les asigne uno nuevo.
UPDATE "Miembro" SET "entrenadorId" = NULL WHERE "entrenadorId" IS NOT NULL;

-- 3. Drop de la FK vieja (Miembro -> Entrenador) y de la tabla Entrenador.
ALTER TABLE "Miembro" DROP CONSTRAINT "Miembro_entrenadorId_fkey";
DROP TABLE "Entrenador";

-- 4. Nueva FK: Miembro.entrenadorId -> UsuarioAdmin.id.
ALTER TABLE "Miembro" ADD CONSTRAINT "Miembro_entrenadorId_fkey"
  FOREIGN KEY ("entrenadorId") REFERENCES "UsuarioAdmin"("id");
