# WORKING RULES & WORKFLOW GUIDELINES

## 1. CODE REUSE & LEAN IMPLEMENTATION (NON-NEGOTIABLE)
- **Check Before Creating:** Before writing any new utility, helper, component, or logic, inspect the existing codebase to ensure identical or similar functionality does not already exist. Reuse or refactor existing code whenever possible.
- **Zero Redundancy:** Do NOT duplicate functions, types, schemas, or styles.
- **Minimal Changes:** Write only the strictly necessary code to achieve the stated goal. Avoid speculative generalizations, unnecessary abstractions, premature optimizations, or boilerplate bloat.

## 2. MCP TOOLS USAGE RESTRICTIONS
- **Avoid Chrome DevTools MCP:** Do NOT launch, invoke, or connect to the Chrome DevTools MCP server unless explicitly requested by the user. Prioritize terminal inspection, static analysis, linting, logs, and unit tests.

## 3. CRITICAL GIT COMMIT RULES (NON-NEGOTIABLE)
- **NO SIGNATURES:** You are STRICTLY PROHIBITED from signing commits. NEVER append "Co-Authored-By", "Claude-Session", or any other AI-related metadata/trailers to the commit message.
- **SPANISH ONLY:** All commit messages must be written exclusively in Spanish (Español). Never use English or any other language for commit messages.
- **SUMMARY ONLY:** Provide ONLY a single-line commit summary (subject). NEVER include a commit description body or any blank lines below the summary.

## 4. SESSION CLOSING & HANDOFF PROTOCOL
Before closing or finishing a work session, generate or update a file named `handoff.md` in the root of the project. Keep it strictly factual, concise, and structured into exactly these 5 sections:

1. **Objetivo:** Qué estamos construyendo (1 o 2 líneas).
2. **Estado actual:** Qué funciona ya y qué queda pendiente.
3. **Archivos y cambios:** Qué archivos se modificaron o crearon en esta sesión y qué se hizo en cada uno.
4. **Intentos fallidos:** Enfoques, librerías o soluciones que se intentaron y NO funcionaron (NUNCA elimines entradas previas de esta sección; solo agrega nuevos aprendizajes para evitar loops).
5. **Próximos pasos:** Lista ordenada de las acciones exactas que debe tomar la siguiente sesión.
