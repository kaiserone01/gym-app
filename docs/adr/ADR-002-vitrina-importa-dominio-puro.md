# ADR-002: la vitrina importa funciones puras de packages/domain

Estado: aceptado (2026-10-15). Complementa a ADR-001, que fija `apps/kiosk` como "cero lógica de negocio".

## Contexto
La vitrina de TV (`apps/vitrina`) corre sin depender de internet. Qué se muestra depende del reloj (`inicio`/`fin`
de cada ítem cambia las franjas de entrenadores) y de la tasa (si el Bs se oculta). Esa decisión se toma en la TV y
debe ser idéntica a la del panel y a la del manifiesto; duplicarla en la app sería una segunda fuente de verdad.

## Decisión
`apps/vitrina` importa de `packages/domain` solo funciones puras, por ruta (`@gym-app/domain/utils/...`,
`.../services/...`, `.../entities/...`): `construirSecuencia`, `estadoDeTasa`, `equivalenteBs`, `formatearBs`,
`instanteEfectivo`, `diaCalendarioCaracas`, `armarManifiesto`/`itemsDeManifiesto`/`urlsDeManifiesto`.
Nunca `@gym-app/infrastructure` ni `@gym-app/db`: lo hace cumplir la regla `no-restricted-imports` de su ESLint.
`@gym-app/domain` se agrega a `transpilePackages` de `apps/vitrina`.

## Consecuencias
- `apps/kiosk` no cambia y sigue sin importar el dominio.
- Un archivo de `packages/domain` que `apps/vitrina` importe no puede depender de Node, Prisma ni de la red.
