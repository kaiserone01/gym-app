import { describe, expect, test } from "vitest";
import type { InfoMp4 } from "./mp4";
import { MAX_BYTES_VIDEO_VITRINA, validarVideo } from "./videoVitrina";

const info = (extra: Partial<InfoMp4> = {}): InfoMp4 => ({ codec: "avc1", anchoMostrado: 1080, altoMostrado: 1920, rotacion: 0, ...extra });
const MB = 1024 * 1024;

describe("validarVideo", () => {
  test("H.264 vertical dentro de los límites pasa", () => {
    expect(validarVideo(info(), 10 * MB, true)).toBeNull();
  });
  test("avc3 también es H.264", () => {
    expect(validarVideo(info({ codec: "avc3" }), 10 * MB, true)).toBeNull();
  });
  test("HEVC (iPhone) se rechaza y explica cómo convertirlo", () => {
    const error = validarVideo(info({ codec: "hvc1" }), 10 * MB, true);
    expect(error).toMatch(/H\.264/);
    expect(error).toMatch(/Más compatible/);
  });
  test("hev1 se trata igual que hvc1", () => {
    expect(validarVideo(info({ codec: "hev1" }), 10 * MB, true)).toMatch(/Más compatible/);
  });
  test("otro códec se rechaza sin la pista del iPhone", () => {
    const error = validarVideo(info({ codec: "vp09" }), 10 * MB, true);
    expect(error).toMatch(/H\.264/);
    expect(error).not.toMatch(/Más compatible/);
  });
  test("más de 100 MB se rechaza", () => {
    expect(validarVideo(info(), MAX_BYTES_VIDEO_VITRINA + 1, true)).toMatch(/100 MB/);
    expect(validarVideo(info(), MAX_BYTES_VIDEO_VITRINA, true)).toBeNull();
  });
  test("más de 1080x1920 se rechaza", () => {
    expect(validarVideo(info({ anchoMostrado: 2160, altoMostrado: 3840 }), 10 * MB, true)).toMatch(/1080x1920/);
  });
  test("el entrenador exige vertical; una promo puede ser horizontal", () => {
    const horizontal = info({ anchoMostrado: 1920, altoMostrado: 1080 });
    expect(validarVideo(horizontal, 10 * MB, true)).toMatch(/verticales/);
    expect(validarVideo(horizontal, 10 * MB, false)).toBeNull();
  });
});
