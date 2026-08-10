# CLAUDE.md

**Lee [AGENTS.md](AGENTS.md) completo antes de hacer cualquier cambio en este repositorio.**

`AGENTS.md` es la bitácora única del proyecto Wayra (sistema de gestión hotelera). Contiene:

- Qué hace el sistema y qué módulos lo componen.
- La arquitectura y **el porqué de cada decisión** (autenticación por sesión, RBAC por recursos,
  multi-tenancy, borrado lógico, restricciones del despliegue en Railway).
- Las convenciones de código que hay que respetar.
- El registro histórico de todos los cambios.

## Reglas no negociables

1. **Leer `AGENTS.md` antes de tocar código.** Muchas cosas que parecen mal hechas son decisiones
   deliberadas explicadas ahí.
2. **Registrar todo cambio** en la sección "Registro de cambios" de `AGENTS.md`, con el formato de
   la sección "Cómo registrar un cambio". Un cambio de código sin entrada en la bitácora está
   incompleto.
3. **Si un cambio modifica una decisión de arquitectura**, actualizar también la sección
   "Arquitectura y decisiones clave" en el mismo commit, y consultarlo antes con el usuario.
4. **No commitear secretos ni artefactos locales** (`backend/.env`, `db.sqlite3`, `media/`,
   `staticfiles/`, `node_modules/`).
