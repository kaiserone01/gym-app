import { describe, expect, it } from "vitest";
import { MAX_BYTES_IMAGEN, extensionDeImagen } from "./imagenSubida";

describe("extensionDeImagen", () => {
  it("acepta jpeg, png y webp y devuelve la extensión según el tipo", () => {
    expect(extensionDeImagen("image/jpeg", 1000)).toBe("jpg");
    expect(extensionDeImagen("image/png", 1000)).toBe("png");
    expect(extensionDeImagen("image/webp", 1000)).toBe("webp");
  });

  it("rechaza tipos que no son imagen permitida (html, svg, vacío)", () => {
    expect(extensionDeImagen("text/html", 1000)).toBeNull();
    expect(extensionDeImagen("image/svg+xml", 1000)).toBeNull();
    expect(extensionDeImagen("", 1000)).toBeNull();
  });

  it("rechaza archivos vacíos o por encima del tope", () => {
    expect(extensionDeImagen("image/png", 0)).toBeNull();
    expect(extensionDeImagen("image/png", MAX_BYTES_IMAGEN + 1)).toBeNull();
    expect(extensionDeImagen("image/png", MAX_BYTES_IMAGEN)).toBe("png");
  });
});
