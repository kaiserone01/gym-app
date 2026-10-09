// Espejo de Adrenalina (gym-demo · "Sede Principal") en la organización de pruebas zip-gym (sede "ZIPGYM").
// Plan: docs/superpowers/plans/2026-10-09-clon-zipgym.md
//
// BORRA todo el contenido de zip-gym (miembros, caja, catálogo, usuarios salvo zipnegocios@gmail.com, tema) y lo
// vuelve a clonar desde la Sede Principal de gym-demo con ids nuevos. gym-demo es SOLO LECTURA: este script
// nunca escribe en él. Origen y destino son fijos (no hay flags para cambiarlos). Repetible.
//
// Uso:
//   npm run db:clonar-zipgym --workspace packages/db            (simulación: solo lee, no escribe nada)
//   npm run db:clonar-zipgym:confirm --workspace packages/db    (BORRA y ESCRIBE en zip-gym, una sola transacción)
//   npm run db:clonar-zipgym:verificar --workspace packages/db  (solo lectura: compara origen vs destino)
//
// ADVERTENCIAS: usa la DATABASE_URL del .env (producción). Haz un respaldo antes de --confirm. No se copian
// sesiones (hay que volver a iniciar sesión), RegistroAuditoria ni TasaCambio (global, compartida).
import { Prisma, PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { correoEspejo } from "./clonarZipGym/correoEspejo";
import { MapaIds } from "./clonarZipGym/mapaIds";

config({ path: path.resolve(__dirname, "../../.env") });

const SLUG_ORIGEN = "gym-demo";
const SEDE_ORIGEN = "Sede Principal";
const SLUG_DESTINO = "zip-gym";
const SEDE_DESTINO = "ZIPGYM";
const EMAIL_USUARIO_CONSERVADO = "zipnegocios@gmail.com";
const LOTE = 500;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), errorFormat: "minimal" });

type Tx = Prisma.TransactionClient;

function ofuscarUrl(url: string | undefined): string {
  if (!url) return "(sin DATABASE_URL)";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(url no parseable)";
  }
}

function lotes<T>(filas: T[], tamano = LOTE): T[][] {
  const resultado: T[][] = [];
  for (let i = 0; i < filas.length; i += tamano) resultado.push(filas.slice(i, i + tamano));
  return resultado;
}

// ── Guardas ────────────────────────────────────────────────────────────────────────────────────────────
async function resolverContexto() {
  const orgOrigen = await prisma.organizacion.findUnique({ where: { slug: SLUG_ORIGEN } });
  if (!orgOrigen) throw new Error(`No existe la organización origen "${SLUG_ORIGEN}".`);
  const orgDestino = await prisma.organizacion.findUnique({ where: { slug: SLUG_DESTINO } });
  if (!orgDestino) throw new Error(`No existe la organización destino "${SLUG_DESTINO}".`);
  if (orgDestino.slug !== "zip-gym") throw new Error("El destino debe ser exactamente la organización zip-gym.");
  if (orgOrigen.id === orgDestino.id) throw new Error("Origen y destino son la misma organización: abortado.");

  const sedeOrigen = await prisma.sucursal.findFirst({ where: { organizacionId: orgOrigen.id, nombre: SEDE_ORIGEN } });
  if (!sedeOrigen) throw new Error(`No existe la sede "${SEDE_ORIGEN}" en "${SLUG_ORIGEN}".`);
  const sedeDestino = await prisma.sucursal.findFirst({ where: { organizacionId: orgDestino.id, nombre: SEDE_DESTINO } });
  if (!sedeDestino) throw new Error(`No existe la sede "${SEDE_DESTINO}" en "${SLUG_DESTINO}".`);
  if (sedeOrigen.id === sedeDestino.id) throw new Error("La sede origen y la destino son la misma: abortado.");

  const usuarioConservado = await prisma.usuarioAdmin.findUnique({ where: { email: EMAIL_USUARIO_CONSERVADO }, select: { id: true, organizacionId: true } });
  if (!usuarioConservado || usuarioConservado.organizacionId !== orgDestino.id) {
    throw new Error(`El usuario ${EMAIL_USUARIO_CONSERVADO} no existe en "${SLUG_DESTINO}": abortado.`);
  }
  const sedesDestinoIds = (await prisma.sucursal.findMany({ where: { organizacionId: orgDestino.id }, select: { id: true } })).map((s) => s.id);
  const sedesOrigenIds = (await prisma.sucursal.findMany({ where: { organizacionId: orgOrigen.id }, select: { id: true } })).map((s) => s.id);

  return { orgOrigen, orgDestino, sedeOrigen, sedeDestino, usuarioConservadoId: usuarioConservado.id, sedesDestinoIds, sedesOrigenIds };
}
type Contexto = Awaited<ReturnType<typeof resolverContexto>>;

// ── Lectura del origen (solo lectura, fuera de la transacción) ─────────────────────────────────────────
async function leerOrigen(ctx: Contexto) {
  const o = ctx.orgOrigen.id;
  const sp = ctx.sedeOrigen.id;
  const usuarios = await prisma.usuarioAdmin.findMany({ where: { organizacionId: o }, orderBy: { createdAt: "asc" } });
  const miembros = await prisma.miembro.findMany({ where: { organizacionId: o }, orderBy: { createdAt: "asc" } });
  const turnos = await prisma.turno.findMany({ where: { sucursalId: sp }, orderBy: { abiertoEn: "asc" } });
  const turnoIds = turnos.map((t) => t.id);
  return {
    tema: await prisma.temaOrganizacion.findUnique({ where: { organizacionId: o } }),
    metodos: await prisma.metodoPago.findMany({ where: { organizacionId: o }, orderBy: { createdAt: "asc" } }),
    planes: await prisma.plan.findMany({ where: { organizacionId: o } }),
    reglas: await prisma.reglaAbonoPorFrecuencia.findMany({ where: { organizacionId: o } }),
    productos: await prisma.producto.findMany({ where: { organizacionId: o }, orderBy: { createdAt: "asc" } }),
    usuarios,
    permisos: await prisma.permisoUsuario.findMany({ where: { usuario: { organizacionId: o } } }),
    accesos: await prisma.usuarioSucursal.findMany({ where: { usuario: { organizacionId: o }, sucursalId: sp } }),
    miembros,
    suscripciones: await prisma.suscripcion.findMany({ where: { miembro: { organizacionId: o } } }),
    turnos,
    arqueos: await prisma.arqueoLinea.findMany({ where: { turnoId: { in: turnoIds } } }),
    egresos: await prisma.egreso.findMany({ where: { turnoId: { in: turnoIds } } }),
    pagos: await prisma.pago.findMany({ where: { sucursalId: sp }, orderBy: { fechaPago: "asc" } }),
    deudas: await prisma.deudaProducto.findMany({ where: { sucursalId: sp } }),
    auditorias: await prisma.cambioPlanAuditoria.findMany({ where: { organizacionId: o } }),
    checkIns: await prisma.checkIn.findMany({ where: { sucursalId: sp } }),
    referencias: await prisma.miembroReferencia.findMany({ where: { sucursalId: sp } }),
    padron: await prisma.padronHoja.findMany({ where: { sucursalId: sp } }),
  };
}
type DatosOrigen = Awaited<ReturnType<typeof leerOrigen>>;

// Aborta si algún registro del conjunto apunta (por FK) a algo que no se leyó: nunca se suelta una
// referencia hacia gym-demo en el destino.
function validarReferencias(ctx: Contexto, datos: DatosOrigen) {
  const o = ctx.orgOrigen.id;
  const sp = ctx.sedeOrigen.id;
  const conjunto = (filas: { id: string }[]) => new Set(filas.map((f) => f.id));
  const planes = conjunto(datos.planes);
  const metodos = conjunto(datos.metodos);
  const productos = conjunto(datos.productos);
  const usuarios = conjunto(datos.usuarios);
  const miembros = conjunto(datos.miembros);
  const turnos = conjunto(datos.turnos);
  const pagos = conjunto(datos.pagos);
  const sedesOrigen = new Set(ctx.sedesOrigenIds);
  const errores: string[] = [];
  const exigir = (ids: Set<string>, valor: string | null, que: string) => {
    if (valor !== null && !ids.has(valor)) errores.push(`${que} → ${valor} (fuera del conjunto leído)`);
  };
  const mismaOrg = (valor: string, que: string) => {
    if (valor !== o) errores.push(`${que} pertenece a otra organización (${valor})`);
  };

  for (const u of datos.usuarios) exigir(sedesOrigen, u.sucursalId, `usuario ${u.id}.sucursalId`);
  for (const m of datos.miembros) {
    if (m.sucursalId !== null && m.sucursalId !== sp) errores.push(`miembro ${m.id} está asignado a una sede distinta de "${SEDE_ORIGEN}" (${m.sucursalId})`);
    exigir(planes, m.planId, `miembro ${m.id}.planId`);
    exigir(usuarios, m.entrenadorId, `miembro ${m.id}.entrenadorId`);
  }
  for (const s of datos.suscripciones) exigir(planes, s.planId, `suscripción ${s.id}.planId`);
  for (const t of datos.turnos) {
    mismaOrg(t.organizacionId, `turno ${t.id}`);
    exigir(usuarios, t.usuarioId, `turno ${t.id}.usuarioId`);
  }
  for (const p of datos.pagos) {
    exigir(miembros, p.miembroId, `pago ${p.id}.miembroId`);
    exigir(turnos, p.turnoId, `pago ${p.id}.turnoId`);
    exigir(usuarios, p.registradoPorId, `pago ${p.id}.registradoPorId`);
    exigir(metodos, p.metodoPagoId, `pago ${p.id}.metodoPagoId`);
    exigir(productos, p.productoId, `pago ${p.id}.productoId`);
    exigir(usuarios, p.anuladoPorId, `pago ${p.id}.anuladoPorId`);
  }
  for (const d of datos.deudas) {
    mismaOrg(d.organizacionId, `deuda ${d.id}`);
    exigir(miembros, d.miembroId, `deuda ${d.id}.miembroId`);
    exigir(productos, d.productoId, `deuda ${d.id}.productoId`);
    exigir(usuarios, d.registradaPorId, `deuda ${d.id}.registradaPorId`);
    exigir(usuarios, d.cobradaPorId, `deuda ${d.id}.cobradaPorId`);
    exigir(usuarios, d.anuladaPorId, `deuda ${d.id}.anuladaPorId`);
  }
  for (const a of datos.auditorias) {
    exigir(miembros, a.miembroId, `auditoría ${a.id}.miembroId`);
    exigir(planes, a.planAnteriorId, `auditoría ${a.id}.planAnteriorId`);
    exigir(planes, a.planNuevoId, `auditoría ${a.id}.planNuevoId`);
    exigir(pagos, a.pagoId, `auditoría ${a.id}.pagoId`);
    exigir(usuarios, a.registradoPorId, `auditoría ${a.id}.registradoPorId`);
  }
  for (const c of datos.checkIns) exigir(miembros, c.miembroId, `check-in ${c.id}.miembroId`);
  for (const r of datos.referencias) mismaOrg(r.organizacionId, `padrón ${r.id}`);
  for (const h of datos.padron) mismaOrg(h.organizacionId, `hoja de padrón ${h.id}`);

  if (errores.length > 0) {
    throw new Error(`Referencias fuera del conjunto leído (${errores.length}); no se clona nada:\n  - ${errores.slice(0, 20).join("\n  - ")}`);
  }
}

// Movimiento de gym-demo fuera de la Sede Principal (no se clona; solo se avisa).
async function contarFueraDeSede(ctx: Contexto) {
  const o = ctx.orgOrigen.id;
  const fuera = { not: ctx.sedeOrigen.id };
  return {
    pagos: await prisma.pago.count({ where: { miembro: { organizacionId: o }, sucursalId: fuera } }),
    checkIns: await prisma.checkIn.count({ where: { miembro: { organizacionId: o }, sucursalId: fuera } }),
    turnos: await prisma.turno.count({ where: { organizacionId: o, sucursalId: fuera } }),
    deudas: await prisma.deudaProducto.count({ where: { organizacionId: o, sucursalId: fuera } }),
    padron: await prisma.miembroReferencia.count({ where: { organizacionId: o, sucursalId: fuera } }),
    hojasPadron: await prisma.padronHoja.count({ where: { organizacionId: o, sucursalId: fuera } }),
    accesosOtrasSedes: await prisma.usuarioSucursal.count({ where: { usuario: { organizacionId: o }, sucursalId: fuera } }),
  };
}

// ── Borrado en zip-gym: TODOS los filtros van atados al organizacionId destino ────────────────────────
async function prepararBorrado(ctx: Contexto) {
  const d = ctx.orgDestino.id;
  const usuariosAEliminar = await prisma.usuarioAdmin.findMany({
    where: { organizacionId: d, email: { not: EMAIL_USUARIO_CONSERVADO } },
    select: { id: true },
  });
  const ids = usuariosAEliminar.map((u) => u.id);
  if (ids.includes(ctx.usuarioConservadoId)) throw new Error("El usuario conservado quedó en la lista de borrado: abortado.");
  const deUsuariosAEliminar = { usuarioId: { in: ids }, usuario: { organizacionId: d } };
  const where = {
    checkIns: { OR: [{ sucursal: { organizacionId: d } }, { miembro: { organizacionId: d } }] },
    auditorias: { organizacionId: d },
    deudas: { organizacionId: d },
    pagos: { OR: [{ sucursal: { organizacionId: d } }, { miembro: { organizacionId: d } }] },
    egresos: { turno: { organizacionId: d } },
    arqueos: { turno: { organizacionId: d } },
    turnos: { organizacionId: d },
    suscripciones: { miembro: { organizacionId: d } },
    referencias: { organizacionId: d },
    padron: { organizacionId: d },
    miembros: { organizacionId: d },
    sesiones: deUsuariosAEliminar,
    registrosAuditoria: deUsuariosAEliminar,
    permisos: deUsuariosAEliminar,
    accesos: deUsuariosAEliminar,
    usuarios: { id: { in: ids }, organizacionId: d, email: { not: EMAIL_USUARIO_CONSERVADO } },
    reglas: { organizacionId: d },
    planes: { organizacionId: d },
    productos: { organizacionId: d },
    metodos: { organizacionId: d },
    tema: { organizacionId: d },
  } satisfies Record<string, unknown>;
  return { ids, where };
}
type Borrado = Awaited<ReturnType<typeof prepararBorrado>>;

async function contarBorrado(w: Borrado["where"]) {
  const db = prisma;
  return {
    checkIns: await db.checkIn.count({ where: w.checkIns }),
    auditoriasCambioPlan: await db.cambioPlanAuditoria.count({ where: w.auditorias }),
    deudas: await db.deudaProducto.count({ where: w.deudas }),
    pagos: await db.pago.count({ where: w.pagos }),
    egresos: await db.egreso.count({ where: w.egresos }),
    arqueos: await db.arqueoLinea.count({ where: w.arqueos }),
    turnos: await db.turno.count({ where: w.turnos }),
    suscripciones: await db.suscripcion.count({ where: w.suscripciones }),
    padron: await db.miembroReferencia.count({ where: w.referencias }),
    hojasPadron: await db.padronHoja.count({ where: w.padron }),
    miembros: await db.miembro.count({ where: w.miembros }),
    sesiones: await db.sesion.count({ where: w.sesiones }),
    registrosAuditoria: await db.registroAuditoria.count({ where: w.registrosAuditoria }),
    permisos: await db.permisoUsuario.count({ where: w.permisos }),
    accesosSede: await db.usuarioSucursal.count({ where: w.accesos }),
    usuarios: await db.usuarioAdmin.count({ where: w.usuarios }),
    reglasAbono: await db.reglaAbonoPorFrecuencia.count({ where: w.reglas }),
    planes: await db.plan.count({ where: w.planes }),
    productos: await db.producto.count({ where: w.productos }),
    metodosPago: await db.metodoPago.count({ where: w.metodos }),
    tema: await db.temaOrganizacion.count({ where: w.tema }),
  };
}

// Filas de otra organización atadas a datos de zip-gym: el borrado las arrastraría. Si existen, se aborta.
async function contarCruzadasHaciaDestino(ctx: Contexto) {
  const d = ctx.orgDestino.id;
  const fuera = { organizacionId: { not: d } };
  return (
    (await prisma.pago.count({ where: { miembro: { organizacionId: d }, sucursal: fuera } })) +
    (await prisma.checkIn.count({ where: { miembro: { organizacionId: d }, sucursal: fuera } }))
  );
}

async function borrarDestino(tx: Tx, w: Borrado["where"]) {
  await tx.checkIn.deleteMany({ where: w.checkIns });
  await tx.cambioPlanAuditoria.deleteMany({ where: w.auditorias });
  await tx.deudaProducto.deleteMany({ where: w.deudas });
  await tx.pago.deleteMany({ where: w.pagos });
  await tx.egreso.deleteMany({ where: w.egresos });
  await tx.arqueoLinea.deleteMany({ where: w.arqueos });
  await tx.turno.deleteMany({ where: w.turnos });
  await tx.suscripcion.deleteMany({ where: w.suscripciones });
  await tx.miembroReferencia.deleteMany({ where: w.referencias });
  await tx.padronHoja.deleteMany({ where: w.padron });
  await tx.miembro.deleteMany({ where: w.miembros });
  await tx.sesion.deleteMany({ where: w.sesiones });
  await tx.registroAuditoria.deleteMany({ where: w.registrosAuditoria });
  await tx.permisoUsuario.deleteMany({ where: w.permisos });
  await tx.usuarioSucursal.deleteMany({ where: w.accesos });
  await tx.usuarioAdmin.deleteMany({ where: w.usuarios });
  await tx.reglaAbonoPorFrecuencia.deleteMany({ where: w.reglas });
  await tx.plan.deleteMany({ where: w.planes });
  await tx.producto.deleteMany({ where: w.productos });
  await tx.metodoPago.deleteMany({ where: w.metodos });
  await tx.temaOrganizacion.deleteMany({ where: w.tema });
}

// Correo origen → destino. Se reservan los @zipgym.local que ya existen en la base y no se van a borrar.
async function mapearCorreos(datos: DatosOrigen, idsAEliminar: string[]) {
  const ocupados = await prisma.usuarioAdmin.findMany({
    where: { email: { endsWith: "@zipgym.local", mode: "insensitive" }, id: { notIn: idsAEliminar } },
    select: { email: true },
  });
  const usados = new Set(ocupados.map((u) => u.email.toLowerCase()));
  const correos = new Map<string, string>();
  for (const u of datos.usuarios) correos.set(u.id, correoEspejo(u.email, usados));
  if (new Set(correos.values()).size !== correos.size) throw new Error("El mapa de correos tiene duplicados: abortado.");
  return correos;
}

// ── Clonado (dentro de la transacción; solo escribe en zip-gym) ─────────────────────────────────────────
async function clonar(tx: Tx, ctx: Contexto, datos: DatosOrigen, correos: Map<string, string>) {
  const d = ctx.orgDestino.id;
  const zs = ctx.sedeDestino.id;
  const sede = (sucursalId: string | null) => (sucursalId === null ? null : zs); // ya validado: toda sede no nula → ZIPGYM

  const so = ctx.sedeOrigen;
  await tx.sucursal.update({
    where: { id: zs, organizacionId: d },
    data: {
      direccion: so.direccion,
      diasGracia: so.diasGracia,
      tasaCambioUSD: so.tasaCambioUSD,
      activo: so.activo,
      reposoFrases: so.reposoFrases,
      reposoImagenUrl: so.reposoImagenUrl,
      reposoOpacidad: so.reposoOpacidad,
    },
  });

  if (datos.tema) {
    const { organizacionId, ...resto } = datos.tema;
    await tx.temaOrganizacion.create({ data: { ...resto, organizacionId: d } });
  }

  const mMetodos = new MapaIds("métodos de pago");
  for (const { id, organizacionId, ...resto } of datos.metodos) {
    mMetodos.set(id, (await tx.metodoPago.create({ data: { ...resto, organizacionId: d }, select: { id: true } })).id);
  }

  const mPlanes = new MapaIds("planes");
  for (const { id, organizacionId, ...resto } of datos.planes) {
    mPlanes.set(id, (await tx.plan.create({ data: { ...resto, organizacionId: d }, select: { id: true } })).id);
  }

  if (datos.reglas.length > 0) {
    await tx.reglaAbonoPorFrecuencia.createMany({ data: datos.reglas.map(({ id, organizacionId, ...resto }) => ({ ...resto, organizacionId: d })) });
  }

  const mProductos = new MapaIds("productos");
  for (const { id, organizacionId, ...resto } of datos.productos) {
    mProductos.set(id, (await tx.producto.create({ data: { ...resto, organizacionId: d }, select: { id: true } })).id);
  }

  const mUsuarios = new MapaIds("usuarios");
  for (const { id, organizacionId, sucursalId, email, ...resto } of datos.usuarios) {
    const nuevoEmail = correos.get(id);
    if (!nuevoEmail) throw new Error(`Falta el correo espejo del usuario ${id}.`);
    const creado = await tx.usuarioAdmin.create({ data: { ...resto, organizacionId: d, sucursalId: sede(sucursalId), email: nuevoEmail }, select: { id: true } });
    mUsuarios.set(id, creado.id);
  }

  if (datos.permisos.length > 0) {
    await tx.permisoUsuario.createMany({ data: datos.permisos.map((p) => ({ usuarioId: mUsuarios.get(p.usuarioId), modulo: p.modulo, accion: p.accion })) });
  }
  if (datos.accesos.length > 0) {
    await tx.usuarioSucursal.createMany({ data: datos.accesos.map((a) => ({ usuarioId: mUsuarios.get(a.usuarioId), sucursalId: zs })) });
  }

  // Miembros por lotes: el id nuevo se recupera por la cédula (única por organización), no por el orden.
  const mMiembros = new MapaIds("miembros");
  const idPorCedula = new Map(datos.miembros.map((m) => [m.cedula, m.id]));
  if (idPorCedula.size !== datos.miembros.length) throw new Error("Hay cédulas repetidas en los miembros de origen: abortado.");
  for (const lote of lotes(datos.miembros)) {
    const creados = await tx.miembro.createManyAndReturn({
      data: lote.map(({ id, organizacionId, sucursalId, planId, entrenadorId, ...resto }) => ({
        ...resto,
        organizacionId: d,
        sucursalId: sede(sucursalId),
        planId: mPlanes.getONull(planId),
        entrenadorId: mUsuarios.getONull(entrenadorId),
      })),
      select: { id: true, cedula: true },
    });
    for (const c of creados) {
      const viejo = idPorCedula.get(c.cedula);
      if (!viejo) throw new Error(`Miembro creado con una cédula que no está en el origen.`);
      mMiembros.set(viejo, c.id);
    }
  }
  if (mMiembros.tamano !== datos.miembros.length) throw new Error(`Se clonaron ${mMiembros.tamano} miembros de ${datos.miembros.length}.`);

  for (const lote of lotes(datos.suscripciones)) {
    await tx.suscripcion.createMany({
      data: lote.map(({ id, miembroId, planId, ...resto }) => ({ ...resto, miembroId: mMiembros.get(miembroId), planId: mPlanes.get(planId) })),
    });
  }

  const mTurnos = new MapaIds("turnos");
  for (const { id, organizacionId, sucursalId, usuarioId, ...resto } of datos.turnos) {
    const creado = await tx.turno.create({ data: { ...resto, organizacionId: d, sucursalId: zs, usuarioId: mUsuarios.get(usuarioId) }, select: { id: true } });
    mTurnos.set(id, creado.id);
  }
  if (datos.arqueos.length > 0) {
    await tx.arqueoLinea.createMany({ data: datos.arqueos.map(({ id, turnoId, ...resto }) => ({ ...resto, turnoId: mTurnos.get(turnoId) })) });
  }
  if (datos.egresos.length > 0) {
    await tx.egreso.createMany({ data: datos.egresos.map(({ id, turnoId, ...resto }) => ({ ...resto, turnoId: mTurnos.get(turnoId) })) });
  }

  // grupoPagoId no es FK pero AnularPago → reabrirPorGrupo busca deudas por él SIN filtrar organización: si se
  // copiara tal cual, anular un cobro en la copia reabriría deudas de gym-demo. Se renueva (mismo viejo → mismo nuevo).
  const grupos = new Map<string, string>();
  const grupoNuevo = (viejo: string | null) => {
    if (viejo === null) return null;
    if (!grupos.has(viejo)) grupos.set(viejo, randomUUID());
    return grupos.get(viejo)!;
  };

  const mPagos = new MapaIds("pagos");
  for (const { id, miembroId, sucursalId, turnoId, registradoPorId, metodoPagoId, productoId, anuladoPorId, grupoPagoId, ...resto } of datos.pagos) {
    const creado = await tx.pago.create({
      data: {
        ...resto,
        grupoPagoId: grupoNuevo(grupoPagoId),
        miembroId: mMiembros.getONull(miembroId),
        sucursalId: zs,
        turnoId: mTurnos.getONull(turnoId),
        registradoPorId: mUsuarios.get(registradoPorId),
        metodoPagoId: mMetodos.getONull(metodoPagoId),
        productoId: mProductos.getONull(productoId),
        anuladoPorId: mUsuarios.getONull(anuladoPorId),
      },
      select: { id: true },
    });
    mPagos.set(id, creado.id);
  }

  if (datos.deudas.length > 0) {
    await tx.deudaProducto.createMany({
      data: datos.deudas.map(({ id, organizacionId, sucursalId, miembroId, productoId, registradaPorId, cobradaPorId, anuladaPorId, grupoPagoId, ...resto }) => ({
        ...resto,
        grupoPagoId: grupoNuevo(grupoPagoId),
        organizacionId: d,
        sucursalId: zs,
        miembroId: mMiembros.get(miembroId),
        productoId: mProductos.getONull(productoId),
        registradaPorId: mUsuarios.get(registradaPorId),
        cobradaPorId: mUsuarios.getONull(cobradaPorId),
        anuladaPorId: mUsuarios.getONull(anuladaPorId),
      })),
    });
  }

  if (datos.auditorias.length > 0) {
    await tx.cambioPlanAuditoria.createMany({
      data: datos.auditorias.map(({ id, organizacionId, miembroId, planAnteriorId, planNuevoId, pagoId, registradoPorId, ...resto }) => ({
        ...resto,
        organizacionId: d,
        miembroId: mMiembros.get(miembroId),
        planAnteriorId: mPlanes.get(planAnteriorId),
        planNuevoId: mPlanes.get(planNuevoId),
        pagoId: mPagos.getONull(pagoId),
        registradoPorId: mUsuarios.get(registradoPorId),
      })),
    });
  }

  for (const lote of lotes(datos.checkIns)) {
    await tx.checkIn.createMany({ data: lote.map(({ id, sucursalId, miembroId, ...resto }) => ({ ...resto, sucursalId: zs, miembroId: mMiembros.get(miembroId) })) });
  }

  for (const lote of lotes(datos.referencias)) {
    await tx.miembroReferencia.createMany({
      data: lote.map(({ id, organizacionId, sucursalId, estilos, ...resto }) => ({
        ...resto,
        organizacionId: d,
        sucursalId: zs,
        estilos: estilos === null ? Prisma.DbNull : (estilos as Prisma.InputJsonValue),
      })),
    });
  }

  for (const { id, organizacionId, sucursalId, encabezados, ...resto } of datos.padron) {
    await tx.padronHoja.create({ data: { ...resto, organizacionId: d, sucursalId: zs, encabezados: encabezados as Prisma.InputJsonValue } });
  }

  return {
    metodosPago: mMetodos.tamano,
    planes: mPlanes.tamano,
    productos: mProductos.tamano,
    usuarios: mUsuarios.tamano,
    miembros: mMiembros.tamano,
    turnos: mTurnos.tamano,
    pagos: mPagos.tamano,
  };
}

function conteosAClonar(datos: DatosOrigen) {
  return {
    tema: datos.tema ? 1 : 0,
    metodosPago: datos.metodos.length,
    planes: datos.planes.length,
    planesInactivos: datos.planes.filter((p) => !p.activo).length,
    reglasAbono: datos.reglas.length,
    productos: datos.productos.length,
    usuarios: datos.usuarios.length,
    permisos: datos.permisos.length,
    accesosSede: datos.accesos.length,
    miembros: datos.miembros.length,
    suscripciones: datos.suscripciones.length,
    turnos: datos.turnos.length,
    turnosAbiertos: datos.turnos.filter((t) => t.estado === "ABIERTO").length,
    arqueos: datos.arqueos.length,
    egresos: datos.egresos.length,
    pagos: datos.pagos.length,
    deudas: datos.deudas.length,
    auditoriasCambioPlan: datos.auditorias.length,
    checkIns: datos.checkIns.length,
    padron: datos.referencias.length,
    hojasPadron: datos.padron.length,
  };
}

// ── --verificar (solo lectura) ─────────────────────────────────────────────────────────────────────────
type Metricas = Record<string, string>;

async function metricas(orgId: string, sedeIds: string[], excluirUsuarioId: string | null): Promise<Metricas> {
  const enSedes = { in: sedeIds };
  const usuarioWhere = { organizacionId: orgId, ...(excluirUsuarioId ? { id: { not: excluirUsuarioId } } : {}) };
  const m: Metricas = {};
  const poner = (clave: string, valor: number | string | Prisma.Decimal | null) => {
    m[clave] = valor === null ? "0" : valor.toString();
  };

  poner("miembros", await prisma.miembro.count({ where: { organizacionId: orgId } }));
  poner("miembros activos", await prisma.miembro.count({ where: { organizacionId: orgId, activo: true } }));
  poner("miembros inactivos", await prisma.miembro.count({ where: { organizacionId: orgId, activo: false } }));
  poner("miembros por regularizar", await prisma.miembro.count({ where: { organizacionId: orgId, porRegularizar: true } }));
  for (const estado of ["ACTIVA", "VENCIDA", "CANCELADA", "PAUSADA"] as const) {
    poner(`suscripciones ${estado}`, await prisma.suscripcion.count({ where: { miembro: { organizacionId: orgId }, estado } }));
  }

  const pagoWhere = { sucursalId: enSedes };
  const sumaPagos = await prisma.pago.aggregate({ where: pagoWhere, _count: true, _sum: { monto: true, montoBs: true } });
  poner("pagos", sumaPagos._count);
  poner("pagos anulados", await prisma.pago.count({ where: { ...pagoWhere, anuladoEn: { not: null } } }));
  poner("pagos suma monto", sumaPagos._sum.monto);
  poner("pagos suma montoBs", sumaPagos._sum.montoBs);

  const deudas = await prisma.deudaProducto.findMany({ where: { organizacionId: orgId, sucursalId: enSedes }, select: { estado: true, cantidad: true, precioUnitarioUSD: true } });
  for (const estado of ["PENDIENTE", "COBRADA", "ANULADA"] as const) {
    const delEstado = deudas.filter((x) => x.estado === estado);
    poner(`deudas ${estado}`, delEstado.length);
    poner(`deudas ${estado} suma USD`, delEstado.reduce((s, x) => s.plus(x.precioUnitarioUSD.times(x.cantidad)), new Prisma.Decimal(0)));
  }

  const turnoWhere = { organizacionId: orgId, sucursalId: enSedes };
  for (const estado of ["ABIERTO", "CERRADO"] as const) poner(`turnos ${estado}`, await prisma.turno.count({ where: { ...turnoWhere, estado } }));
  const arqueos = await prisma.arqueoLinea.aggregate({ where: { turno: turnoWhere }, _count: true, _sum: { diferencia: true } });
  poner("arqueos", arqueos._count);
  poner("arqueos suma diferencia", arqueos._sum.diferencia);
  const egresos = await prisma.egreso.aggregate({ where: { turno: turnoWhere }, _count: true, _sum: { monto: true } });
  poner("egresos", egresos._count);
  poner("egresos suma monto", egresos._sum.monto);

  poner("check-ins", await prisma.checkIn.count({ where: { sucursalId: enSedes } }));
  poner("check-ins en sala", await prisma.checkIn.count({ where: { sucursalId: enSedes, salidaAt: null } }));
  poner("planes", await prisma.plan.count({ where: { organizacionId: orgId } }));
  poner("planes activos", await prisma.plan.count({ where: { organizacionId: orgId, activo: true } }));
  poner("reglas de abono", await prisma.reglaAbonoPorFrecuencia.count({ where: { organizacionId: orgId } }));
  poner("métodos de pago", await prisma.metodoPago.count({ where: { organizacionId: orgId } }));
  poner("productos", await prisma.producto.count({ where: { organizacionId: orgId } }));
  poner("tema", await prisma.temaOrganizacion.count({ where: { organizacionId: orgId } }));
  poner("auditorías cambio de plan", await prisma.cambioPlanAuditoria.count({ where: { organizacionId: orgId } }));
  for (const rol of ["SOCIO", "GERENTE", "RECEPCION", "ENTRENADOR"] as const) {
    poner(`usuarios ${rol}`, await prisma.usuarioAdmin.count({ where: { ...usuarioWhere, rol } }));
  }
  poner("permisos", await prisma.permisoUsuario.count({ where: { usuario: usuarioWhere } }));
  poner("accesos a sede", await prisma.usuarioSucursal.count({ where: { usuario: usuarioWhere, sucursalId: enSedes } }));
  poner("padrón (MiembroReferencia)", await prisma.miembroReferencia.count({ where: { organizacionId: orgId, sucursalId: enSedes } }));
  poner("hojas de padrón", await prisma.padronHoja.count({ where: { organizacionId: orgId, sucursalId: enSedes } }));
  return m;
}

// Filas de zip-gym que apuntan a algo fuera de zip-gym (p. ej. ids de gym-demo).
async function referenciasCruzadas(d: string) {
  const fuera = { organizacionId: { not: d } };
  const deFuera = { is: fuera };
  const r: Record<string, number> = {
    "usuarios.sucursal": await prisma.usuarioAdmin.count({ where: { organizacionId: d, sucursal: deFuera } }),
    "accesos.sucursal": await prisma.usuarioSucursal.count({ where: { usuario: { organizacionId: d }, sucursal: fuera } }),
    "miembros.plan/entrenador/sucursal": await prisma.miembro.count({ where: { organizacionId: d, OR: [{ plan: deFuera }, { entrenador: deFuera }, { sucursal: deFuera }] } }),
    "suscripciones.miembro↔plan": await prisma.suscripcion.count({
      where: { OR: [{ miembro: { organizacionId: d }, plan: fuera }, { plan: { organizacionId: d }, miembro: fuera }] },
    }),
    "turnos.sucursal/usuario": await prisma.turno.count({ where: { organizacionId: d, OR: [{ sucursal: fuera }, { usuario: fuera }] } }),
    "pagos (cualquier FK)": await prisma.pago.count({
      where: {
        AND: [
          { OR: [{ sucursal: { organizacionId: d } }, { miembro: { is: { organizacionId: d } } }] },
          { OR: [{ sucursal: fuera }, { miembro: deFuera }, { turno: deFuera }, { registradoPor: fuera }, { metodoPago: deFuera }, { producto: deFuera }, { anuladoPor: deFuera }] },
        ],
      },
    }),
    "deudas (cualquier FK)": await prisma.deudaProducto.count({
      where: { organizacionId: d, OR: [{ sucursal: fuera }, { miembro: fuera }, { producto: deFuera }, { registradaPor: fuera }, { cobradaPor: deFuera }, { anuladaPor: deFuera }] },
    }),
    "auditorías (cualquier FK)": await prisma.cambioPlanAuditoria.count({
      where: { organizacionId: d, OR: [{ miembro: fuera }, { planAnterior: fuera }, { planNuevo: fuera }, { registradoPor: fuera }, { pago: { is: { sucursal: fuera } } }] },
    }),
    "check-ins.sucursal↔miembro": await prisma.checkIn.count({
      where: { OR: [{ sucursal: { organizacionId: d }, miembro: fuera }, { miembro: { organizacionId: d }, sucursal: fuera }] },
    }),
    "padrón.sucursal": await prisma.miembroReferencia.count({ where: { organizacionId: d, sucursal: fuera } }),
    "hojas de padrón.sucursal": await prisma.padronHoja.count({ where: { organizacionId: d, sucursal: fuera } }),
  };
  return r;
}

async function verificar(ctx: Contexto) {
  const origen = await metricas(ctx.orgOrigen.id, [ctx.sedeOrigen.id], null);
  const destino = await metricas(ctx.orgDestino.id, ctx.sedesDestinoIds, ctx.usuarioConservadoId);

  const campos = ["direccion", "diasGracia", "tasaCambioUSD", "activo", "reposoFrases", "reposoImagenUrl", "reposoOpacidad"] as const;
  const configSede = (s: Contexto["sedeOrigen"]) => JSON.stringify(campos.map((c) => (s[c] === null ? null : String(s[c]))));
  origen["configuración de la sede"] = "(origen)";
  destino["configuración de la sede"] = configSede(ctx.sedeOrigen) === configSede(ctx.sedeDestino) ? "(origen)" : "(distinta)";

  let diferencias = 0;
  const filas = Object.keys(origen).map((clave) => {
    const igual = origen[clave] === destino[clave];
    if (!igual) diferencias++;
    return { métrica: clave, origen: origen[clave], destino: destino[clave], estado: igual ? "OK" : "DIFERENTE" };
  });
  console.log(`Origen: ${SLUG_ORIGEN} · ${SEDE_ORIGEN}   Destino: ${SLUG_DESTINO} · ${SEDE_DESTINO}`);
  console.log(`(En el destino se excluye el usuario conservado ${EMAIL_USUARIO_CONSERVADO} con sus permisos y accesos: es esperado.)`);
  console.table(filas);

  const cruzadas = await referenciasCruzadas(ctx.orgDestino.id);
  const totalCruzadas = Object.values(cruzadas).reduce((s, n) => s + n, 0);
  console.log("Referencias de zip-gym hacia fuera de zip-gym (deben ser 0):");
  console.table(Object.entries(cruzadas).map(([tabla, n]) => ({ tabla, filas: n, estado: n === 0 ? "OK" : "CRUZADA" })));

  if (diferencias > 0 || totalCruzadas > 0) {
    console.log(`❌ Verificación con problemas: ${diferencias} diferencia(s), ${totalCruzadas} referencia(s) cruzada(s).`);
    process.exitCode = 1;
  } else {
    console.log("✅ Verificación sin diferencias ni referencias cruzadas.");
  }
}

// ── Principal ──────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const desconocidos = args.filter((a) => a !== "--confirm" && a !== "--verificar");
  if (desconocidos.length > 0) throw new Error(`Argumentos no admitidos: ${desconocidos.join(" ")} (origen y destino son fijos).`);
  const confirmar = args.includes("--confirm");
  const soloVerificar = args.includes("--verificar");
  if (confirmar && soloVerificar) throw new Error("--confirm y --verificar no se pueden usar juntos.");

  const modo = confirmar ? "CONFIRM (BORRA Y ESCRIBE en zip-gym)" : soloVerificar ? "VERIFICAR (solo lectura)" : "SIMULACIÓN (no escribe nada)";
  console.log(`BD: ${ofuscarUrl(process.env.DATABASE_URL)} | modo: ${modo}`);

  const ctx = await resolverContexto();
  console.log(
    `Guardas OK: origen "${SLUG_ORIGEN}" · "${SEDE_ORIGEN}" → destino "${SLUG_DESTINO}" · "${SEDE_DESTINO}" (organizaciones y sedes distintas; ` +
      `usuario conservado ${EMAIL_USUARIO_CONSERVADO} presente en el destino).`,
  );

  if (soloVerificar) {
    await verificar(ctx);
    return;
  }

  if ((await contarCruzadasHaciaDestino(ctx)) > 0) {
    throw new Error("Hay pagos o check-ins de otra organización atados a miembros de zip-gym: el borrado los arrastraría. Abortado.");
  }

  const datos = await leerOrigen(ctx);
  validarReferencias(ctx, datos);
  const fueraDeSede = await contarFueraDeSede(ctx);
  const borrado = await prepararBorrado(ctx);
  const correos = await mapearCorreos(datos, borrado.ids);

  console.log(`\n(a) Se borraría en "${SLUG_DESTINO}":`, await contarBorrado(borrado.where));
  console.log(`\n(b) Se clonaría desde "${SLUG_ORIGEN}" · "${SEDE_ORIGEN}":`, conteosAClonar(datos));
  console.log("\n(c) Correos origen → destino:");
  console.table(datos.usuarios.map((u) => ({ rol: u.rol, origen: u.email, destino: correos.get(u.id) })));
  console.log("\n(d) Avisos:");
  const turnoAbierto = datos.turnos.find((t) => t.estado === "ABIERTO");
  if (turnoAbierto) {
    const dueno = datos.usuarios.find((u) => u.id === turnoAbierto.usuarioId);
    console.log(`  - El turno ABIERTO se clona con su usuario copiado (${dueno ? correos.get(dueno.id) : "?"}): para operar la caja hay que entrar como él.`);
  }
  console.log("  - Las sesiones no se copian: hay que volver a iniciar sesión en la copia.");
  console.log("  - TasaCambio es global y compartida (no se copia). RegistroAuditoria no se copia.");
  console.log("  - Las fotos y logos conservan las mismas URLs de R2 (el código nunca borra objetos de R2).");
  console.log("  - Los ids son nuevos en cada ejecución (los genera Prisma); las fechas se copian tal cual.");
  console.log("  - grupoPagoId de pagos y deudas se renueva (mismo grupo → mismo valor nuevo) para no cruzar cobros con gym-demo.");
  console.log(`  - Movimiento de "${SLUG_ORIGEN}" fuera de "${SEDE_ORIGEN}" (no se clona):`, fueraDeSede);
  console.log(`  - Accesos a sede que se descartan (otras sedes): ${fueraDeSede.accesosOtrasSedes}.`);

  if (!confirmar) {
    console.log("\nSimulación completa: no se escribió nada. Usa db:clonar-zipgym:confirm para borrar y clonar.");
    return;
  }

  console.log("\nEscribiendo en zip-gym (una sola transacción)…");
  const clonados = await prisma.$transaction(
    async (tx) => {
      await borrarDestino(tx, borrado.where);
      return clonar(tx, ctx, datos, correos);
    },
    { timeout: 600000, maxWait: 60000 },
  );
  console.log("✅ Clonado completo:", { ...conteosAClonar(datos), ...clonados });
  console.log("Corre `npm run db:clonar-zipgym:verificar` para validar.");
}

// Los mensajes de Prisma pueden incluir argumentos: se ocultan los hashes bcrypt por si acaso.
function sinSecretos(texto: string): string {
  return texto.replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, "[hash oculto]");
}

main()
  .catch((error) => {
    console.error("❌ Error:", sinSecretos(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
