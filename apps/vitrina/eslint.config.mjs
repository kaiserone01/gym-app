import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // ADR-002: del dominio solo funciones puras; nunca infraestructura ni base de datos.
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@gym-app/infrastructure*", "@gym-app/db*"], message: "La vitrina solo importa funciones puras de @gym-app/domain (ADR-002)." }] },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
