-- Renombra Turno.fondoInicialUSD/Bs a fondoInicialEfectivoUSD/Bs para
-- comunicar explícitamente que ese fondo es solo efectivo físico en caja,
-- no bancos ni puntos de venta (ya era así en la lógica de negocio, ver
-- ObtenerResumenTurno — este cambio solo aclara el nombre). RENAME COLUMN
-- preserva los datos existentes.
ALTER TABLE "Turno" RENAME COLUMN "fondoInicialUSD" TO "fondoInicialEfectivoUSD";
ALTER TABLE "Turno" RENAME COLUMN "fondoInicialBs" TO "fondoInicialEfectivoBs";
