import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { Button } from "@gym-app/ui/components/Button";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { ListaMiembros } from "./ListaMiembros";
import { BotonImprimir } from "../BotonImprimir";
import { obtenerTurnoAbiertoParaUsuario } from "../caja/obtenerTurnoAbiertoParaUsuario";
import { AvisoCajaCerrada } from "../caja/AvisoCajaCerrada";

export default async function PaginaMiembros() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const [miembros, planes, sucursales, turnoAbierto] = await Promise.all([
    listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
    obtenerTurnoAbiertoParaUsuario(usuario),
  ]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <PageHeader>Miembros</PageHeader>
        <div className="flex gap-2">
          <BotonImprimir />
          {/* Inscribir un miembro es una operación de caja — el alta
              queda atada a un turno para el cuadre (ver diseño acordado:
              hay que abrir caja antes de inscribir o cobrar). */}
          {turnoAbierto ? (
            <Link href="/miembros/nuevo">
              <Button>Nuevo miembro</Button>
            </Link>
          ) : (
            <Button disabled title="Abrí la caja para poder inscribir un miembro">
              Nuevo miembro
            </Button>
          )}
        </div>
      </div>

      {!turnoAbierto && (
        <div className="mb-6 print:hidden">
          <AvisoCajaCerrada />
        </div>
      )}

      <ListaMiembros miembros={miembros} planes={planes} sucursales={sucursales} />
    </div>
  );
}
