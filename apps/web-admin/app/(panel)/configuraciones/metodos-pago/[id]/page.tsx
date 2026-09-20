import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { FormularioMetodoPago } from "../FormularioMetodoPago";
import { actualizarMetodoPagoAction } from "../../actions";
import { ETIQUETA_TIPO_METODO_PAGO } from "../../metodosPagoUI";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaEditarMetodoPago({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const { id } = await params;

  const metodo = await new PrismaMetodoPagoRepository(prisma).buscarPorId(usuario.organizacionId, id);
  if (!metodo) notFound();

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <PageHeader>Editar {ETIQUETA_TIPO_METODO_PAGO[metodo.tipo]}</PageHeader>
      </div>
      <FormularioMetodoPago
        accion={actualizarMetodoPagoAction.bind(null, id)}
        valoresIniciales={{
          tipo: metodo.tipo,
          nombreBanco: metodo.nombreBanco,
          logoUrl: metodo.logoUrl,
          moneda: metodo.moneda,
          codigoBanco: metodo.codigoBanco,
          telefono: metodo.telefono,
          rif: metodo.rif,
          numeroCuenta: metodo.numeroCuenta,
          beneficiario: metodo.beneficiario,
          walletDireccion: metodo.walletDireccion,
          walletUsuario: metodo.walletUsuario,
        }}
      />
    </div>
  );
}
