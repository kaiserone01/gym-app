import { test } from "node:test";
import assert from "node:assert/strict";
import { construirConfiguracion } from "./configuracion.mjs";

test("sin VITRINA_API_URL ni VITRINA_DEV_URL falla", () => {
  assert.throws(() => construirConfiguracion({}), /VITRINA_API_URL/);
});

test("rechaza una URL de la API que no sea https", () => {
  assert.throws(() => construirConfiguracion({ VITRINA_API_URL: "http://admin.test" }), /https:\/\//);
  assert.throws(() => construirConfiguracion({ VITRINA_API_URL: "admin.test" }), /https:\/\//);
});

test("con VITRINA_DEV_URL se permite http en la URL de la API", () => {
  const { vitrina } = construirConfiguracion({ VITRINA_API_URL: "http://192.168.1.10:3000", VITRINA_DEV_URL: "http://192.168.1.10:3002" });
  assert.equal(vitrina.apiUrl, "http://192.168.1.10:3000");
});

test("acepta https://example.invalid (modo prueba)", () => {
  const { vitrina } = construirConfiguracion({ VITRINA_API_URL: "https://example.invalid" });
  assert.equal(vitrina.apiUrl, "https://example.invalid");
});

test("quita las barras finales de la URL de la API y guarda la clave", () => {
  const { vitrina } = construirConfiguracion({ VITRINA_API_URL: "https://admin.test///", VITRINA_CLAVE: "abc" });
  assert.deepEqual(vitrina, { apiUrl: "https://admin.test", clave: "abc" });
});

test("sin clave la deja vacía", () => {
  const { vitrina } = construirConfiguracion({ VITRINA_API_URL: "https://admin.test" });
  assert.equal(vitrina.clave, "");
});

test("por defecto no hay server.url (la app va empaquetada) y no se depura", () => {
  const { capacitor } = construirConfiguracion({ VITRINA_API_URL: "https://admin.test" });
  assert.equal(capacitor.appId, "com.adrenalina.vitrina");
  assert.equal(capacitor.webDir, "www");
  assert.equal(capacitor.server, undefined);
  assert.equal(capacitor.loggingBehavior, "none");
  assert.equal(capacitor.android.webContentsDebuggingEnabled, false);
  assert.equal(capacitor.android.allowMixedContent, false);
});

test("no activa CapacitorHttp", () => {
  const { capacitor } = construirConfiguracion({ VITRINA_API_URL: "https://admin.test" });
  assert.equal(capacitor.plugins, undefined);
});

test("VITRINA_DEV_URL añade server.url solo para desarrollo", () => {
  const { capacitor } = construirConfiguracion({ VITRINA_DEV_URL: "http://192.168.1.10:3002" });
  assert.deepEqual(capacitor.server, { url: "http://192.168.1.10:3002", cleartext: true });
});
