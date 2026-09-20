import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaEntrenadorRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaEntrenadorRepository";
import { listarEntrenadores } from "@gym-app/domain/use-cases/ListarEntrenadores";
import { FormularioMiembro } from "../FormularioMiembro";
import { crearMiembroAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaNuevoMiembro() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const entrenadores = await listarEntrenadores(
    { entrenadores: new PrismaEntrenadorRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Nuevo miembro</PageHeader>
      </div>
      <FormularioMiembro accion={crearMiembroAction} entrenadores={entrenadores} />
    </div>
  );
}
