# Espejo de Adrenalina (Sede Principal) en ZIPGYM — Plan de implementación

> Plan aprobado el 2026-10-09.


## Contexto
Hace falta una instalación de pruebas con **los mismos datos y el mismo estado** que Adrenalina Xtreme · Sede Principal hoy, para recrear comportamientos y planificar ajustes finos sin tocar producción. La organización de pruebas ya existe (`zip-gym`, una sede llamada `ZIPGYM`) pero tiene datos ficticios (de `sembrarOrganizacionZipGym.ts`). Se construye un comando **repetible** que borra el contenido de `zip-gym` y lo vuelve a clonar desde `gym-demo` (Sede Principal), para poder volver a "cero" tras cada experimento.

## Hallazgos (consultas de solo lectura a la BD)
- `gym-demo` tiene 2 sedes (Sede Principal y Sede Tipuro), pero **todo el movimiento está en la Sede Principal**: 246 miembros (+247 suscripciones), 20 pagos, 1 deuda pendiente, 2 turnos (1 abierto, 1 cerrado), 5 líneas de arqueo, 103 check-ins, 1376 filas del padrón Excel (la hoja `PadronHoja` aún no se importó: 0). Catálogo: 11 planes (4 inactivos "legacy"), 10 métodos de pago, 22 productos, 1 tema; 9 usuarios (3 socios, 6 entrenadores) con 78 permisos y 12 accesos a sede; 36 sesiones. Sin egresos, auditorías ni reglas de abono.
- `zip-gym`: sede `ZIPGYM`; 3 usuarios (socio Gustavo Amarista `zipnegocios@gmail.com` + 2 entrenadores), 5 planes, 4 métodos, 50 productos, 100 miembros, 105 suscripciones, 17 pagos, 10 deudas, 1 turno, 1 egreso, 42 check-ins, 1 tema.
- Restricciones únicas que obligan a transformar datos: `UsuarioAdmin.email` único en TODA la base; `Sucursal.apiKey` único; `Sesion.token` único; `Miembro` único por `(organizacion, cédula)` (no choca entre organizaciones). `TasaCambio` es global (907 filas) y se comparte.
- Las fotos son URLs de R2; el código **nunca borra objetos de R2** (verificado con búsqueda), así que compartir las mismas URLs es seguro.
- Ya existe `limpiarOrganizacionParaMigracion.ts` con el orden de borrado FK-seguro de movimientos; el nuevo script lo amplía al catálogo y los usuarios.

## Decisiones tomadas (usuario)
1. **Reemplazar todo** el contenido actual de `zip-gym` (miembros, caja, planes, métodos, productos, entrenadores, tema). Se conservan la organización `zip-gym`, la sede `ZIPGYM` (nombre y clave de kiosco `apiKey`) y el usuario `zipnegocios@gmail.com` (con sus permisos y acceso).
2. **Usuarios:** copiar los 9 de Adrenalina con correo `<parte-local>@zipgym.local` (ej. `jorge@zipgym.local`) y **la misma contraseña** (mismo `passwordHash`). Los entrenadores internos (`entrenador-<uuid>@sinacceso.interno`) reciben un uuid nuevo. Se copian sus permisos y su acceso a la sede (el acceso a Sede Tipuro se descarta: todo va a `ZIPGYM`).
3. **Repetible:** comando con simulación por defecto y `--confirm`; destino fijo.

## Diseño

### Script `packages/db/clonarSedePrincipalAZipGym.ts` (plano en `packages/db`, mismo boilerplate dotenv + `PrismaPg` de los demás scripts; npm: `db:clonar-zipgym`, `db:clonar-zipgym:confirm`, `db:clonar-zipgym:verificar`)
- **Guardas:** origen fijo `gym-demo` / sede `Sede Principal`; destino fijo `zip-gym` / sede `ZIPGYM`; aborta si no existen, si origen = destino o si el slug destino no es exactamente `zip-gym`. Todo borrado va filtrado por el `organizacionId` destino. Sin flags para cambiar origen/destino.
- **Simulación (por defecto):** imprime host/BD, qué se borraría en `zip-gym` (conteos), qué se clonaría desde la Sede Principal (conteos por tabla), el mapa de correos origen → destino y avisos. No escribe nada.
- **`--confirm`:** una sola transacción interactiva (`timeout` alto) con borrado + clonado: si algo falla, `zip-gym` queda intacto.
  1. **Borrado en `zip-gym`** (orden FK-seguro): check-ins, auditorías de cambio de plan, deudas, pagos, egresos, arqueos, turnos, suscripciones, `MiembroReferencia`, `PadronHoja`, miembros; luego sesiones/permisos/accesos de los usuarios a eliminar, los usuarios **excepto `zipnegocios@gmail.com`**, reglas de abono, planes, productos, métodos de pago y tema.
  2. **Clonado con mapa de ids viejo→nuevo** (ids nuevos, el resto de campos idéntico, incluidos `createdAt`, estados, montos y fechas; relaciones remapeadas): configuración de la sede `ZIPGYM` (dirección, `diasGracia`, `tasaCambioUSD`, `activo`, frases/imagen/opacidad de reposo; **sin** tocar nombre ni `apiKey`) → tema → métodos de pago → planes → reglas de abono → productos → usuarios (correo transformado, `passwordHash` igual, `sucursalId` → `ZIPGYM`) → permisos → accesos a sede → miembros (`entrenadorId`, `planId`, `sucursalId` remapeados) → suscripciones → turnos → líneas de arqueo → egresos → pagos (miembro, sede, turno, `registradoPor`, método, producto, `anuladoPor`) → deudas → auditorías de cambio de plan → check-ins → `MiembroReferencia` (1376) → `PadronHoja` (si existe). Las columnas Json (`estilos`, `encabezados`) se pasan con `Prisma.DbNull` cuando son nulas.
  3. **No se copian:** sesiones (hay que volver a iniciar sesión), `RegistroAuditoria`, `TasaCambio` (global y compartida) y Sede Tipuro.
- **`--verificar` (solo lectura, repetible):** compara origen (Sede Principal) vs destino: conteos por tabla, sumas de montos de pagos y de deudas, nº de miembros por estado de `porRegularizar`/activo, nº de suscripciones por estado, usuarios por rol; y comprueba que **ninguna fila de `zip-gym` referencia ids de `gym-demo`** (integridad del mapeo).
- **Piezas puras con tests (Vitest en `packages/db`):** `correoEspejo(email)` (`jorge@gym.com` → `jorge@zipgym.local`; `@sinacceso.interno` → uuid nuevo; casos de mayúsculas como `Jelias@gymdemo.com`; colisiones: si dos orígenes darían el mismo correo, se desambigua con sufijo numérico), y el helper `mapearId(mapa, viejo)` que falla con mensaje claro si falta el id (evita clonar relaciones rotas).
- **Efectos que conviene saber:** el turno ABIERTO se clona con su usuario copiado (para operar la caja en la copia hay que entrar como ese usuario, p. ej. `jorge@zipgym.local`, con su contraseña de producción); las fechas se copian tal cual, por lo que los vencimientos "se mueven" respecto de hoy con el tiempo (re-ejecutar el clon refresca el estado); los ids cambian en cada ejecución.

## Archivos
Crear: `packages/db/clonarSedePrincipalAZipGym.ts`, `packages/db/clonarZipGym/correoEspejo.ts` (+ `.test.ts`) y `mapaIds.ts` (+ test). Modificar: `packages/db/package.json` (3 scripts), `CLAUDE.md` (comandos de `packages/db`), `handoff.md`. Reutilizar: orden de borrado de `limpiarOrganizacionParaMigracion.ts`, boilerplate de `sembrarOrganizacionZipGym.ts`.

## Orden de ejecución (subagentes, TDD en lo puro)
1. Helpers puros + tests (`correoEspejo`, `mapaIds`).
2. Script: simulación, borrado + clonado en transacción, `--verificar`; scripts npm.
3. Documentación (`CLAUDE.md`, `handoff.md`).
4. **Con tu visto bueno explícito**: correr la simulación (solo lectura) y revisar; luego `--confirm` (escribe en producción, solo dentro de `zip-gym`) y `--verificar`.

## Verificación
- `npm test --workspace packages/db`; `npx tsc` del web-admin no se afecta (script plano en `packages/db`, sin tsconfig: se valida corriéndolo con `tsx`).
- Simulación: conteos del clon = conteos de la Sede Principal de `gym-demo` (246 miembros, 247 suscripciones, 20 pagos, 103 check-ins, 1376 padrón, 11 planes, 10 métodos, 22 productos, 9 usuarios…) y mapa de correos sin duplicados.
- Tras `--confirm`: `--verificar` sin diferencias y sin referencias cruzadas; comprobar a mano en el panel (entrando como `zipnegocios@gmail.com` y como `jorge@zipgym.local`) la lista de miembros, `/excel`, `/en-sala`, `/planes` y `/caja`. Segunda ejecución del `--confirm`: mismo resultado (repetible).
- Seguridad: confirmar que `gym-demo` no cambió (conteos antes/después iguales) y respaldo previo en Easypanel recomendado aunque el borrado solo afecta `zip-gym`.
