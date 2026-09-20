-- Renombra el valor de enum DUENO a SOCIO en RolUsuario.
-- ALTER TYPE ... RENAME VALUE conserva las filas existentes: no requiere UPDATE manual.
ALTER TYPE "RolUsuario" RENAME VALUE 'DUENO' TO 'SOCIO';
