import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaReglaAbonoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaReglaAbonoRepository";
import { listarReglasAbono } from "@gym-app/domain/use-cases/ListarReglasAbono";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { FormularioReglaAbono } from "./FormularioReglaAbono";
import { actualizarReglaAbonoAction } from "./actions";

const FRECUENCIAS: FrecuenciaPago[] = ["DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL"];

export default async function PaginaReglasAbono() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const reglas = await listarReglasAbono(
    { reglasAbono: new PrismaReglaAbonoRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        Define el monto mínimo de abono y el plazo de acceso que otorga, por
        frecuencia de plan. Un plan individual puede definir su propio
        mínimo en <code>/planes</code>, que sobreescribe esta regla.
      </p>
      {FRECUENCIAS.map((frecuencia) => {
        const regla = reglas.find((r) => r.frecuencia === frecuencia);
        return (
          <FormularioReglaAbono
            key={frecuencia}
            frecuencia={frecuencia}
            valoresIniciales={regla ? { activo: regla.activo, tipo: regla.tipo, valor: regla.valor } : null}
            accion={actualizarReglaAbonoAction.bind(null, frecuencia)}
          />
        );
      })}
    </div>
  );
}
