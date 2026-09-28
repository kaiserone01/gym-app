import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaReglaAbonoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaReglaAbonoRepository";
import { listarReglasAbono } from "@gym-app/domain/use-cases/ListarReglasAbono";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { FormularioReglaAbono } from "./FormularioReglaAbono";
import { actualizarReglaAbonoAction } from "./actions";

// Duración TÍPICA de cada frecuencia, solo para esta pantalla de
// configuración (no es una fuente de cálculo de negocio — cada Plan real
// tiene su propio diasCiclo, que es la única fuente de verdad para
// cobros/vencimientos). Se usa acá únicamente para mostrar el equivalente
// en % mientras se configura el mínimo de una frecuencia, cuando todavía
// no hay un Plan concreto de por medio. PERSONALIZADO no tiene una regla
// por frecuencia (cada plan personalizado define su propio mínimo en
// /planes), así que no aparece en esta lista.
type FrecuenciaConReglaFija = Exclude<FrecuenciaPago, "PERSONALIZADO">;

const FRECUENCIAS: FrecuenciaConReglaFija[] = ["DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL", "SEMESTRAL", "ANUAL"];
const DIAS_TIPICOS_POR_FRECUENCIA: Record<FrecuenciaConReglaFija, number> = {
  DIARIO: 1,
  SEMANAL: 7,
  QUINCENAL: 15,
  MENSUAL: 30,
  SEMESTRAL: 180,
  ANUAL: 365,
};

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
            diasCiclo={DIAS_TIPICOS_POR_FRECUENCIA[frecuencia]}
            valoresIniciales={regla ? { activo: regla.activo, tipo: regla.tipo, valor: regla.valor } : null}
            accion={actualizarReglaAbonoAction.bind(null, frecuencia)}
          />
        );
      })}
    </div>
  );
}
