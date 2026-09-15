"use client";

import { Button } from "@gym-app/ui/components/Button";

export function BotonImprimir() {
  return (
    <Button type="button" variant="secundario" onClick={() => window.print()}>
      Imprimir
    </Button>
  );
}
