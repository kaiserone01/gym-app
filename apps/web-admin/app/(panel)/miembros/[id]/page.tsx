import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { obtenerMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { FormularioMiembro } from "../FormularioMiembro";
import { actualizarMiembroAction, darDeBajaAction } from "../actions";
import { Button } from "@gym-app/ui/components/Button";

export default async function PaginaEditarMiembro({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const { id } = await params;

  const miembro = await obtenerMiembro(
    { miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, id }
  ).catch((error) => {
    if (error instanceof MiembroNoEncontradoError) return null;
    throw error;
  });

  if (!miembro) notFound();

  return (
    <div className="max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-semibold">Editar miembro</h1>

      <FormularioMiembro
        accion={actualizarMiembroAction.bind(null, id)}
        valoresIniciales={{
          nombre: miembro.nombre,
          cedula: miembro.cedula,
          celular: miembro.celular ?? "",
          planTipo: miembro.planTipo,
          precioPlan: miembro.precioPlan,
        }}
      />

      {miembro.activo && (
        <form action={darDeBajaAction.bind(null, id)} className="mt-6">
          <Button variant="peligro" type="submit">
            Dar de baja
          </Button>
        </form>
      )}
    </div>
  );
}
