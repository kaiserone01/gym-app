-- Agrega tasaCambio y montoUSD a Egreso, igual patrón que Pago
-- (tasaCambio/montoBs) pero en la dirección inversa: Egreso.monto ya está
-- en su moneda nativa (moneda), y montoUSD es la referencia. Necesario
-- para mostrar "(REF $X.XX)" en egresos en bolívares y para sumar egresos
-- de ambas monedas en USD (ver ObtenerReporteCaja). Egresos existentes
-- quedan con ambos campos en null -- no hay tasa histórica que inferir
-- retroactivamente para ellos.
ALTER TABLE "Egreso" ADD COLUMN "tasaCambio" DECIMAL(10,2);
ALTER TABLE "Egreso" ADD COLUMN "montoUSD" DECIMAL(14,2);
