import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { FormularioCambiarPassword } from "./FormularioCambiarPassword";

export default async function PaginaCambiarPassword() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold" style={{ color: "var(--gx-ink)" }}>
        Cambiar contraseña
      </h1>
      <FormularioCambiarPassword />
    </div>
  );
}
