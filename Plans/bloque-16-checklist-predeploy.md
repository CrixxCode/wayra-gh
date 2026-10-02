# Bloque 16 — Checklist predeploy — Resultado de la ejecución real

Ejecutado el 2026-10-02. El script `scripts/predeploy-check.ps1` no se pudo correr tal cual
(ver hallazgo #1); se corrieron manualmente los mismos pasos que automatiza.

## Resultado de cada paso

| Paso | Resultado |
|---|---|
| `git status` limpio | ❌ Un archivo modificado sin commitear (`.gitignore`, de esta sesión) |
| Backend: `manage.py test` | ✅ 396 tests, OK (1 skipped) |
| Backend: `manage.py spectacular --validate` | ✅ 0 errores (77 warnings, no bloquean) |
| Frontend: `npm run lint` (`tsc --noEmit`) | ✅ sin errores |
| Frontend: `npm run test:ci` | ⚠️ 540/543 OK, **3 fallos** — ver hallazgo #2 |
| Frontend: `npm run build:ci` | ✅ build completo (con 2 warnings de presupuesto de bundle) |

## Hallazgos

1. **El script `predeploy-check.ps1` apunta a un venv que no existe.** Usa
   `..\env\Scripts\python.exe` (relativo a `backend/`, es decir `<repo>/env/`), pero el
   entorno virtual real del proyecto vive en `backend/.venv/`. El script fallaría para
   cualquiera que lo corra tal cual, salvo que tenga además un `env/` en la raíz del repo.
   **bug del script de automatización — bloquea el checklist automatizado tal como está
   documentado.**
2. **3 tests del frontend fallan hoy, pero por un test frágil, no por un bug de producto.**
   `list-expenses.spec.ts` (sección "el orden", líneas 269-312) construye fechas con
   `daysAgo(2)`, `daysAgo(3)`, `daysAgo(5)` asumiendo que caen dentro del "mes en curso" (el
   filtro por defecto del componente, según el propio comentario del archivo: "el borde exacto
   del filtro por defecto"). Corrido el 2 de octubre, `daysAgo(2)` y superiores caen en
   septiembre — fuera del mes en curso — así que el componente filtra correctamente esas
   fechas (comportamiento correcto) pero el test esperaba verlas incluidas. Es el mismo tipo de
   fragilidad que ya se corrigió una vez en la bitácora para otra prueba ("que no dependa de
   correr cerca de medianoche"), pero no se blindó aquí contra el borde de mes. **Corre
   distinto según qué día del mes se ejecute el CI — puede dar falsos rojos los primeros días
   de cada mes.** No es un hallazgo de producto; es deuda de calidad de tests.
3. **Presupuesto de bundle excedido (advertencia, no bloquea).** El bundle inicial supera el
   presupuesto configurado por 31.39 kB (2.03 MB vs. 2.00 MB), y
   `allied-booking.css` supera su presupuesto por 7.99 kB. Angular solo advierte, no falla el
   build, pero vale la pena revisar antes de que crezca más.
4. **Working tree no limpio al momento de correr el checklist** — un cambio sin commitear
   (`.gitignore`, de esta misma sesión de auditoría). No es un hallazgo del código, solo
   constancia de que el script fallaría en este estado exacto.

## Verificado SIN problema

- Backend: toda la suite de tests pasa (396 tests, 1 skip esperado).
- Validación de esquema OpenAPI sin errores.
- Lint de TypeScript sin errores.
- Build de producción se completa correctamente.

---

## Priorización sugerida

**Corregir antes de depender del checklist automatizado:** 1 (arreglar la ruta del venv en el
script), 2 (blindar los tests de fecha contra el borde de mes, mismo patrón que el fix
histórico).
**Mejorable sin bloquear:** 3.
