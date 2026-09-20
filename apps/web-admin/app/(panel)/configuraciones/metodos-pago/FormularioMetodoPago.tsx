"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { EstadoFormularioMetodoPago } from "../actions";
import type { TipoMetodoPago, MonedaMetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { ETIQUETA_TIPO_METODO_PAGO, TIPOS_MULTI_INSTANCIA } from "../metodosPagoUI";

export interface ValoresFormularioMetodoPago {
  tipo: TipoMetodoPago;
  nombreBanco: string | null;
  logoUrl: string | null;
  qrUrl: string | null;
  moneda: MonedaMetodoPago;
  codigoBanco: string | null;
  telefono: string | null;
  rif: string | null;
  numeroCuenta: string | null;
  beneficiario: string | null;
  walletDireccion: string | null;
  walletUsuario: string | null;
}

const TIPOS: TipoMetodoPago[] = ["EFECTIVO", "PAGO_MOVIL", "TRANSFERENCIA", "PUNTO_VENTA", "BIOPAGO", "CRIPTO"];

export function FormularioMetodoPago({
  accion,
  valoresIniciales,
}: {
  accion: (estado: EstadoFormularioMetodoPago, formData: FormData) => Promise<EstadoFormularioMetodoPago>;
  valoresIniciales?: ValoresFormularioMetodoPago;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const esEdicion = !!valoresIniciales;
  const { mostrarError } = useFeedback();

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  const [tipo, setTipo] = useState<TipoMetodoPago>(valoresIniciales?.tipo ?? "PAGO_MOVIL");
  const [moneda, setMoneda] = useState<MonedaMetodoPago>(valoresIniciales?.moneda ?? "BS");
  const [logoPreview, setLogoPreview] = useState<string | null>(valoresIniciales?.logoUrl ?? null);
  const [qrPreview, setQrPreview] = useState<string | null>(valoresIniciales?.qrUrl ?? null);

  const admiteBanco = TIPOS_MULTI_INSTANCIA.includes(tipo);
  const esPagoMovil = tipo === "PAGO_MOVIL";
  const esTransferencia = tipo === "TRANSFERENCIA";
  const esCripto = tipo === "CRIPTO";
  // Punto de Venta no requiere RIF/Cédula ni ningún otro dato de contacto
  // en la modal de "Ver datos para el pago" (ver diseño acordado).
  const esBancario = esPagoMovil || esTransferencia || tipo === "BIOPAGO";

  function manejarCambioLogo(archivo: File | undefined) {
    if (!archivo) return;
    setLogoPreview(URL.createObjectURL(archivo));
  }

  function manejarCambioQr(archivo: File | undefined) {
    if (!archivo) return;
    setQrPreview(URL.createObjectURL(archivo));
  }

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
        >
          {estado.error}
        </p>
      )}

      <input type="hidden" name="logoUrl" value={valoresIniciales?.logoUrl ?? ""} />
      <input type="hidden" name="qrUrl" value={valoresIniciales?.qrUrl ?? ""} />

      {!esEdicion && (
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Tipo
          <select
            name="tipo"
            required
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoMetodoPago)}
            className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_METODO_PAGO[t]}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Moneda
        <select
          name="moneda"
          required
          value={moneda}
          onChange={(e) => setMoneda(e.target.value as MonedaMetodoPago)}
          className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
          style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
        >
          <option value="USD">USD (dólares)</option>
          <option value="BS">Bs (bolívares, requiere tasa BCV)</option>
        </select>
      </label>

      {admiteBanco && (
        <Input
          name="nombreBanco"
          label={esCripto ? "Exchange / Cripto" : "Banco"}
          required
          defaultValue={valoresIniciales?.nombreBanco ?? ""}
        />
      )}

      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{ background: "var(--gx-surface-2)" }}
        >
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo elegido en el cliente
            <img src={logoPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
              Sin logo
            </span>
          )}
        </div>
        <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
          Logo
          <input
            type="file"
            name="logo"
            accept="image/*"
            onChange={(e) => manejarCambioLogo(e.target.files?.[0])}
            className="text-sm file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            style={{ color: "var(--gx-muted)" }}
          />
        </label>
      </div>

      {esPagoMovil && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Input name="codigoBanco" label="Código de banco" defaultValue={valoresIniciales?.codigoBanco ?? ""} />
            <Input name="telefono" label="Teléfono" defaultValue={valoresIniciales?.telefono ?? ""} />
          </div>

          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg"
              style={{ background: "var(--gx-surface-2)" }}
            >
              {qrPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo elegido en el cliente
                <img src={qrPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
                  Sin QR
                </span>
              )}
            </div>
            <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
              QR (opcional)
              <input
                type="file"
                name="qr"
                accept="image/*"
                onChange={(e) => manejarCambioQr(e.target.files?.[0])}
                className="text-sm file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                style={{ color: "var(--gx-muted)" }}
              />
            </label>
          </div>
        </>
      )}

      {esBancario && <Input name="rif" label="RIF / Cédula" defaultValue={valoresIniciales?.rif ?? ""} />}

      {esTransferencia && (
        <>
          <Input name="beneficiario" label="Nombre del beneficiario" defaultValue={valoresIniciales?.beneficiario ?? ""} />
          <Input name="numeroCuenta" label="Número de cuenta" defaultValue={valoresIniciales?.numeroCuenta ?? ""} />
        </>
      )}

      {esCripto && (
        <>
          <Input name="walletDireccion" label="Dirección de wallet / ID" defaultValue={valoresIniciales?.walletDireccion ?? ""} />
          <Input name="walletUsuario" label="Usuario (ej. Binance Pay ID)" defaultValue={valoresIniciales?.walletUsuario ?? ""} />
        </>
      )}

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
