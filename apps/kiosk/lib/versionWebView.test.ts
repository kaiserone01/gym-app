import { describe, expect, it } from "vitest";
import { CHROMIUM_MINIMO, versionChromium, webViewObsoleto } from "./versionWebView";

const WEBVIEW_91 =
  "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36";
const CHROME_120 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const EDGE_WEBVIEW2_130 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";

describe("versionChromium", () => {
  it("lee la versión mayor de Chrome/NNN", () => {
    expect(versionChromium(WEBVIEW_91)).toBe(91);
    expect(versionChromium(CHROME_120)).toBe(120);
    expect(versionChromium(EDGE_WEBVIEW2_130)).toBe(130);
  });

  it("devuelve null si el user agent no tiene Chrome/", () => {
    expect(versionChromium(FIREFOX)).toBeNull();
    expect(versionChromium("")).toBeNull();
  });
});

describe("webViewObsoleto", () => {
  it("es obsoleto por debajo del mínimo", () => {
    expect(CHROMIUM_MINIMO).toBe(111);
    expect(webViewObsoleto(WEBVIEW_91)).toBe(true);
    expect(webViewObsoleto("Chrome/110.0.0.0")).toBe(true);
  });

  it("no es obsoleto con el mínimo exacto o más", () => {
    expect(webViewObsoleto("Chrome/111.0.0.0")).toBe(false);
    expect(webViewObsoleto(CHROME_120)).toBe(false);
  });

  it("no avisa si no se puede saber la versión (otros motores)", () => {
    expect(webViewObsoleto(FIREFOX)).toBe(false);
    expect(webViewObsoleto("")).toBe(false);
  });

  it("acepta otro mínimo", () => {
    expect(webViewObsoleto(CHROME_120, 130)).toBe(true);
  });
});
