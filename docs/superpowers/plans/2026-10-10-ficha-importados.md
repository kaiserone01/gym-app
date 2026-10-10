# Ficha de miembro para importados — Plan de implementación

> Plan aprobado el 2026-10-10.


## Contexto
Con el padrón del Excel y la activación bajo demanda, la ficha (`/miembros/{id}`, `FormularioMiembro.tsx`) quedó pensada para miembros "normales" y estorba en la regularización: pide "Fecha de inscripción" (no se conoce para los importados y, al guardar, se rellena sola con una fecha falsa), muestra un género que ya no se quiere, repite la sede, y solo deja ajustar el vencimiento mientras el aviso "Por regularizar" esté activo. Se aplican cinco ajustes del usuario (capturas del 2026-10-10).

## Hallazgos (consultas de solo lectura a la BD)
- gym-demo: 249 miembros; 203 con `fechaInscripcion` vacía (todos "Por regularizar"), 46 con fecha (39 ya regularizados, 7 aún por regularizar). **La fecha de inscripción NO sirve para reconocer a un importado**: guardar la ficha la rellena (14 + 7 + 7 de los 46 están en el padrón sin pagos: activados y guardados; 4 son nuevos de verdad, fuera del padrón y con pago el mismo día). Por eso hace falta un marcador persistente.
- El género solo lo usan la ficha (select), `actions.ts`, el saludo del kiosco (`apps/kiosk/lib/saludo.ts`, `frases.ts`) y la respuesta de `/api/checkin`; 19 miembros tienen valor. La columna `Miembro.genero` y el enum `Genero` pueden quedarse en la BD (sin migración destructiva).
- Hoy `actualizarMiembro` solo permite ajustar el vencimiento con `porRegularizar` (`AjusteFechaNoDisponibleError`), sincroniza la Suscripción con `ajustarCicloMasReciente` (inicio = fin − diasCiclo) y, al cambiar de plan, prorratea el vencimiento (`prorratearVencimiento`). `CambiosMiembro` no tiene `fechaUltimoPago`.

## Decisiones (usuario)
1. **Marcador persistente `Miembro.vieneDelExcel`** (columna nueva, aditiva) con relleno inicial: `true` si `fechaInscripcion IS NULL` **o** `porRegularizar = true` **o** la cédula está en `MiembroReferencia` de su organización. Se pone `true` al activar desde el padrón. Los miembros creados con "Nuevo miembro" quedan `false` y "tienen comportamiento normal".
2. **Cambiar el plan de un miembro del Excel no toca las fechas** (ni prorratea): las fechas solo cambian si se editan.
3. **Alta de miembro nuevo:** "Fecha de inscripción" se muestra **fija con la fecha de hoy**, sin poder cambiarla.

## Cambios por punto
1. **Quitar "Sede asignada"** (fila, leyenda y texto de ayuda): la sede sigue en el formulario como `<input type="hidden" name="sucursalId">` (metadato). Se conserva el checkbox "Disponible en ambas sedes" solo cuando el plan es multisede (es funcional).
2. **Quitar el género** de punta a punta: select, estado y comparación de cambios en la ficha; `parsearGenero`/`genero` en `crearMiembroAction` y `actualizarMiembroAction`; `GENEROS`/`Genero`/`parsearGenero` y el campo en `Miembro`, `DatosNuevoMiembro`, `CambiosMiembro`; el mapeo en `PrismaMemberRepository`; `RegistrarCheckIn` y `/api/checkin` dejan de enviarlo; el kiosco saluda **igual a todos** con la frase neutra (`FRASE_BIENVENIDA_NEUTRA`; el cumpleaños sigue mandando) y se eliminan `FRASE_BIENVENIDO`/`FRASE_BIENVENIDA`; se actualizan los tests. Compatible hacia atrás: un kiosco viejo sin `genero` ya saluda en neutro. La columna `genero` queda sin uso en la BD.
3. **Fecha de inscripción:** solo para miembros nuevos. En el alta: campo de solo lectura con hoy (la acción usa hoy). En la ficha: miembros con `vieneDelExcel = false` la ven fija e informativa; los `vieneDelExcel = true` **no la ven** (se sustituye por "Fecha de pago"). Dejan de exigirse `fechaInscripcion` en `actualizarMiembroAction` y de enviarse al guardar (ya no se pisa).
4. **Fecha de pago y de vencimiento editables al 100%** para `vieneDelExcel`, **siempre** (también ya regularizados), sin depender del plan:
   - "Fecha de pago" reemplaza a "Fecha de inscripción" en la tarjeta de Datos personales (valor = `Miembro.fechaUltimoPago`); "Fecha de vencimiento" queda en la tarjeta del plan (hoy solo aparece con el aviso); ambas usan `InputFecha`; se envían solo si cambian.
   - `CambiosMiembro` suma `fechaUltimoPago?: Date | null`. `actualizarMiembro`: permite ajustar fechas si `antes.vieneDelExcel || antes.porRegularizar` (si no, `AjusteFechaNoDisponibleError` con mensaje actualizado); valida que la fecha de pago no sea posterior al vencimiento; al guardar cualquiera de las dos apaga `porRegularizar`; mantiene en sync la Suscripción más reciente con ciclo **[fecha de pago, vencimiento]** (inicio = fecha de pago si existe y es anterior al fin, si no fin − diasCiclo); un cambio de plan en un `vieneDelExcel` **no prorratea** (solo cambia plan/precio y el plan de la suscripción activa).
   - "Cambiar plan" gratis queda disponible siempre para `vieneDelExcel` (la regularización lo necesita).
5. **Ocultar** "Última fecha de renovación" y "Este ciclo ya está pagado — para subir o bajar de plan usá…" para `vieneDelExcel` (esas fechas ya se ven y editan arriba). El banner "Por regularizar" actualiza su texto ("ajusta la fecha de pago y de vencimiento…").

## Datos y migración (producción: nunca `prisma migrate dev/deploy`)
Migración `2026101X…_miembro_viene_del_excel` (SQL de `prisma migrate diff --script` + un `UPDATE` de relleno escrito a mano): `ALTER TABLE "Miembro" ADD COLUMN "vieneDelExcel" BOOLEAN NOT NULL DEFAULT false;` y `UPDATE "Miembro" SET "vieneDelExcel" = true WHERE "fechaInscripcion" IS NULL OR "porRegularizar" = true OR EXISTS (SELECT 1 FROM "MiembroReferencia" r WHERE r."organizacionId" = "Miembro"."organizacionId" AND r."cedula" = "Miembro"."cedula");`. La aplica el contenedor al desplegar (también a zip-gym). Esperado en gym-demo: ≈4 miembros con `false` (los nuevos de verdad) y el resto `true`. El script de clonado copia la columna sin cambios; tras desplegar conviene volver a correr el clon.

## Archivos
Modificar: `packages/db/prisma/schema.prisma` (+ migración), `packages/domain/entities/Miembro.ts` (+ test), `use-cases/ActualizarMiembro.ts` (+ test), `ActivarMiembroDesdePadron.ts` (+ test), `RegistrarCheckIn.ts` (+ test), `packages/infrastructure/persistence/prisma/PrismaMemberRepository.ts`, `apps/web-admin/app/(panel)/miembros/{FormularioMiembro.tsx,actions.ts,[id]/page.tsx}`, `apps/web-admin/app/api/checkin/route.ts`, `apps/kiosk/{lib/saludo.ts,lib/saludo.test.ts,lib/frases.ts,lib/api.ts,app/page.tsx}`, `CLAUDE.md`/`handoff.md`; ajustar fixtures con `genero` en `RegistrarPagoRetroactivo.test.ts`, `CobrarAbonoPendiente.test.ts`, `ActualizarMiembro.test.ts`. Reutilizar: `InputFecha`, `ajustarCicloMasReciente`, `AjusteFechaNoDisponibleError`.

## Orden de ejecución (subagentes, TDD en lo puro)
1. Dominio + datos: columna `vieneDelExcel` (schema, migración con relleno, entidad, activación, repo) y reglas nuevas de `actualizarMiembro` (fechas, `fechaUltimoPago`, sin prorrateo para `vieneDelExcel`, sincronía de la suscripción) con tests.
2. Género: eliminación de punta a punta + kiosco neutro, con tests.
3. Ficha y acciones: puntos 1, 3, 4 y 5 en `FormularioMiembro`/`actions`/`page`.
4. Documentación y notas de despliegue.

## Verificación
- `npm test --workspace packages/domain` y `packages/db`; `npx tsc --noEmit -p apps/web-admin/tsconfig.json`; tests del kiosco (`apps/kiosk`, 40 tests previos); `eslint` solo de los archivos tocados (lint global con errores previos); UTF-8 estricto.
- Migración: validar con `prisma validate` y `migrate diff`; tras el despliegue comprobar con una consulta de solo lectura que `vieneDelExcel = false` ≈ 4 en gym-demo y que ningún miembro nuevo creado después queda en `true`.
- Manual (sin navegador automatizado; lo prueba el usuario): ficha de un miembro del Excel (Fecha de pago arriba, Vencimiento a la derecha, sin sede, sin género, sin inscripción, sin el mensaje de renovación; guardar ambas fechas y ver que siguen editables; cambiar de plan sin que se muevan las fechas); ficha de un miembro nuevo (inscripción fija, comportamiento normal); alta de miembro; saludo del kiosco igual para todos.
