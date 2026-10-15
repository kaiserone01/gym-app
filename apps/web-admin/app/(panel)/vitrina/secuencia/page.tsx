import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { puedeEditarKiosko } from "@/lib/permisoKiosko";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { Card } from "@gym-app/ui/components/Card";
import { construirSecuencia, numeroDeDiapositiva } from "@gym-app/domain/services/secuenciaVitrina";
import { FilaVitrina } from "../FilaVitrina";

export default async function PaginaSecuencia() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  if (!puedeEditarKiosko(sesion.usuario.rol)) redirect("/miembros");

  const repositorio = new PrismaVitrinaRepository(prisma);
  const [items, ajustes] = await Promise.all([
    repositorio.listar(sesion.sucursalActivaId),
    repositorio.obtenerAjustes(sesion.sucursalActivaId),
  ]);
  const ahora = new Date();
  const numeros = numeroDeDiapositiva(construirSecuencia(items, ahora, ajustes.duracionSeg));

  return (
    <div className="flex max-w-4xl flex-col gap-3">
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        Orden en que se muestra todo en la TV. Los entrenadores que quedan seguidos comparten diapositiva (hasta 3 por franja);
        una promo o un producto entre dos entrenadores los separa. Los cambios llegan a la TV en segundos.
      </p>

      {items.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p style={{ color: "var(--gx-muted)" }}>
            Aún no hay nada en la vitrina. Crea un entrenador, una promo o un producto para empezar.
          </p>
          <Link
            href="/vitrina/entrenadores/nuevo"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-4 text-sm font-semibold hover:opacity-90"
            style={{ background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }}
          >
            Nuevo entrenador
          </Link>
        </Card>
      ) : (
        items.map((item, i) => (
          <FilaVitrina
            key={item.id}
            item={item}
            ahora={ahora}
            numeroDiapositiva={numeros.get(item.id)}
            mover={{ puedeSubir: i > 0, puedeBajar: i < items.length - 1 }}
          />
        ))
      )}
    </div>
  );
}
