-- AlterEnum
-- IF NOT EXISTS a propósito: si alguien ya corrió este ALTER TYPE a mano
-- contra la base (por ejemplo, para desbloquearse antes de que existiera
-- la automatización de migraciones en el Dockerfile), esta migración no
-- debe fallar al aplicarse después.
ALTER TYPE "FrecuenciaPago" ADD VALUE IF NOT EXISTS 'DIARIO';
