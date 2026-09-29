import { ICheckInRepository } from "../ports/ICheckInRepository";
import { ISuscripcionRepository } from "../ports/ISuscripcionRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { EstadoCheckIn } from "../entities/CheckIn";
import { inicioDelDiaCaracas } from "../utils/fechaCaracas";
import { validarAccesoSucursal } from "./ValidarAccesoSucursalPorPlan";

export interface ListarEnSalaDeps {
  checkIns: ICheckInRepository;
  suscripciones: ISuscripcionRepository;
  sucursales: ISucursalRepository;
}

export interface PersonaEnSala {
  checkInId: string;
  miembroId: string;
  nombre: string;
  fotoUrl: string | null;
  planNombre: string | null;
  fechaHora: Date;
  fechaVencimiento: Date | null;
  // Estado recalculado ahora (no el snapshot del check-in): si el miembro paga
  // estando en sala, la alerta se apaga sola.
  estado: EstadoCheckIn;
  requiereCobro: boolean;
}

export function requiereCobro(estado: EstadoCheckIn): boolean {
  return estado === "vencido" || estado === "en_gracia" || estado === "abono_vencido";
}

export async function listarEnSala(
  deps: ListarEnSalaDeps,
  input: { organizacionId: string; sucursalId: string; ahora?: Date }
): Promise<PersonaEnSala[]> {
  const ahora = input.ahora ?? new Date();
  const abiertos = await deps.checkIns.listarEnSala(input.sucursalId, inicioDelDiaCaracas(ahora));
  if (abiertos.length === 0) return [];

  const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, input.sucursalId);
  const diasGracia = sucursal?.diasGracia ?? 0;

  // Un miembro puede tener varios check-ins abiertos hoy: se muestra solo el más reciente.
  const vistos = new Set<string>();
  const unicos = abiertos.filter((c) => !vistos.has(c.miembroId) && vistos.add(c.miembroId));

  const personas = await Promise.all(
    unicos.map(async (c): Promise<PersonaEnSala> => {
      const suscripcion = await deps.suscripciones.buscarActivaVigentePorMiembro(c.miembroId, ahora);
      const estado = await validarAccesoSucursal(
        { suscripciones: deps.suscripciones },
        c.miembroId,
        c.miembro.sucursalId,
        input.sucursalId,
        c.miembro.fechaVencimiento,
        diasGracia,
        suscripcion?.fechaLimiteAbono ?? null,
        ahora
      );
      return {
        checkInId: c.id,
        miembroId: c.miembroId,
        nombre: c.miembro.nombre,
        fotoUrl: c.miembro.fotoUrl,
        planNombre: c.miembro.planNombre,
        fechaHora: c.fechaHora,
        fechaVencimiento: c.miembro.fechaVencimiento,
        estado,
        requiereCobro: requiereCobro(estado),
      };
    })
  );

  // Los que hay que cobrar primero; dentro de cada grupo, el más reciente arriba.
  return personas.sort((a, b) => Number(b.requiereCobro) - Number(a.requiereCobro));
}
