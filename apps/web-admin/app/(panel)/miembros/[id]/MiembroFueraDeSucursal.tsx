import Link from "next/link";
import { Card } from "@gym-app/ui/components/Card";
import { Button } from "@gym-app/ui/components/Button";

export function MiembroFueraDeSucursal({ mensaje }: { mensaje: string }) {
  return (
    <div className="max-w-lg p-6 lg:p-8">
      <Card className="flex flex-col items-start gap-4">
        <p style={{ color: "var(--gx-ink)" }}>{mensaje}</p>
        <Link href="/miembros">
          <Button variant="secundario">Volver a miembros</Button>
        </Link>
      </Card>
    </div>
  );
}
