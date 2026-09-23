import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { obtenerSucursalesVisiblesParaMiembro } from "../obtenerSucursalesVisibles";
import { obtenerEntrenadoresPorSucursal } from "../obtenerEntrenadoresPorSucursal";
import { FormularioMiembro } from "../FormularioMiembro";
import { crearMiembroAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { obtenerTurnoAbiertoParaUsuario } from "../../caja/obtenerTurnoAbiertoParaUsuario";
import { AvisoCajaCerrada } from "../../caja/AvisoCajaCerrada";

export default async function PaginaNuevoMiembro() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuario.id);

  // Inscribir un miembro es una operación de caja (ver diseño acordado:
  // hay que abrir turno antes de inscribir o cobrar) — en vez del
  // formulario se muestra el aviso con acceso directo a Abrir turno. Si ya
  // hay una caja abierta pero es de OTRO usuario (típicamente un SOCIO
  // viendo la caja de otra sucursal), tampoco se deja operar — se avisa
  // quién la tiene abierta en vez de decir "abrí la caja" (ya está
  // abierta, solo que no por este usuario).
  if (!turnoAbierto?.esPropio) {
    return (
      <div className="max-w-4xl p-6 lg:p-8">
        <div className="mb-6">
          <PageHeader>Nuevo miembro</PageHeader>
        </div>
        <AvisoCajaCerrada
          mensaje={
            turnoAbierto
              ? `No puedes inscribir miembros: la caja está abierta por ${turnoAbierto.turno.usuarioNombre ?? "otro usuario"}.`
              : "Para inscribir un miembro primero tenés que abrir la caja."
          }
        />
      </div>
    );
  }

  const [planes, sucursales, metodosPago] = await Promise.all([
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    obtenerSucursalesVisiblesParaMiembro(usuario),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
  ]);
  const entrenadoresPorSucursal = await obtenerEntrenadoresPorSucursal(usuario.organizacionId, sucursales);
  const sucursalActiva = sucursales.find((s) => s.id === sucursalActivaId);

  return (
    <div className="max-w-7xl p-6 lg:px-8 lg:py-6">
      <div className="mb-4">
        <PageHeader>Nuevo miembro</PageHeader>
      </div>
      <FormularioMiembro
        accion={crearMiembroAction}
        entrenadoresPorSucursal={entrenadoresPorSucursal}
        planes={planes}
        sucursales={sucursales}
        sucursalActivaNombre={sucursalActiva?.nombre ?? "—"}
        sucursalIdDefault={sucursalActivaId}
        metodosPago={metodosPago}
        miembroId={null}
        ultimosCiclos={[]}
      />
    </div>
  );
}
