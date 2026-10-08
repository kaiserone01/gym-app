import assert from "node:assert/strict";
import { test } from "node:test";
import { urlInicio } from "./url.mjs";

test("sin clave abre la raíz del kiosco", () => {
  assert.equal(urlInicio("https://kiosco.zipnegocios.com"), "https://kiosco.zipnegocios.com/");
  assert.equal(urlInicio("https://kiosco.zipnegocios.com", ""), "https://kiosco.zipnegocios.com/");
});

test("con clave abre la raíz con la clave en el fragmento", () => {
  assert.equal(urlInicio("https://kiosco.zipnegocios.com", "abc123"), "https://kiosco.zipnegocios.com/#clave=abc123");
});

test("normaliza las barras finales de la base", () => {
  assert.equal(urlInicio("https://kiosco.zipnegocios.com///", "k"), "https://kiosco.zipnegocios.com/#clave=k");
  assert.equal(urlInicio("https://kiosco.zipnegocios.com/"), "https://kiosco.zipnegocios.com/");
});

test("codifica los caracteres especiales de la clave", () => {
  assert.equal(urlInicio("https://x.test", "a+b/c=d&e#f g"), "https://x.test/#clave=a%2Bb%2Fc%3Dd%26e%23f%20g");
});
