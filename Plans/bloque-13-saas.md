# Bloque 13 — SaaS (plataforma) — Hallazgos de auditoría

No existe una app `apps/saas` propia: `/saas-hoteles` consume directamente
`HotelSettingsViewSet` (diferenciado solo por `is_effective_global_admin`), y
`apps.demo_requests` es la app real detrás de `/saas-solicitudes-demo`. 18/18 tests de
demo_requests pasan. Sin el bug transversal de orden de mixins en este bloque.

## Bug — alto impacto operativo (confirmado backend + frontend)

1. **Un hotel "suspendido" desaparece por completo de `/saas-hoteles`, sin forma de verlo ni
   reactivarlo desde la UI.** `HotelSettingsViewSet` hereda el filtro por defecto de
   `LogicalDeleteViewSetMixin`, que oculta `is_active=False` en `list`/`retrieve` salvo que se
   pida `?include_inactive=true`. El frontend (`getHotelsDirectory()`/`getSnapshot()` en
   `saas-dashboard.ts`) nunca envía ese parámetro — a diferencia de las mismas llamadas para
   usuarios y facturas, que sí lo pasan (asimetría clara, no intencional). Resultado: el
   platform_admin suspende un hotel, el PATCH tiene éxito, pero en el siguiente refresh ese
   hotel ya no aparece en ninguna pestaña (ni "Todos" ni "Suspendido" — el filtro es puramente
   client-side sobre un array que el backend nunca entregó). **La función "activar/desactivar
   hotel" queda rota en la práctica: solo se puede suspender, nunca reactivar desde la UI.**

## Falta de funcionalidad / inconsistencia — seguridad

2. **Sin separación de permisos entre "toggle de plataforma" y "autoedición del hotel".**
   `is_active` es un campo de escritura normal en `HotelSettingsSerializer`, protegido por el
   mismo scope `hotel_settings.write` que ya tiene el admin de cada hotel sobre sí mismo. No
   hay acción dedicada ni override que bloquee ese campo para no-platform-admin. Hoy el
   formulario normal del hotel no lo envía en el payload, así que la UI no expone el riesgo,
   pero no hay ninguna barrera de servidor: un admin de hotel podría `PATCH
   /api/hotel-settings/<su_id>/ {"is_active": false}` directo vía API y autodesactivarse
   (`HotelActiveMiddleware` lo bloquearía después, así que el efecto es autobloqueo, no
   escalamiento — pero sigue siendo un agujero de autorización real).

## Inconsistencias UX (frontend)

3. **Crear un hotel nuevo desde el wizard SaaS no captura pisos/habitaciones**, a diferencia de
   convertir una solicitud de demo (que sí captura la estructura completa). El hotel recién
   creado aparece inmediatamente en "Riesgo/Observación" por "sin habitaciones configuradas",
   sin que el wizard lo advierta.
4. **El texto de confirmación al convertir una solicitud de demo dice "se creará el piso
   inicial"**, aunque `build_hotel_structure()` en realidad crea todos los pisos capturados en
   la solicitud (feature de 2026-09-14) — mensaje legado sin actualizar, subestima al admin lo
   que realmente se va a crear.
5. Links de "Hoteles que requieren atención" en el panel SaaS no abren el detalle del hotel
   específico — llevan a la lista completa y el admin debe volver a buscarlo.
6. El menú de acciones (⋮) en Hoteles SaaS y Solicitudes de demo no se cierra al hacer clic
   fuera de él (falta un listener de documento).
7. `modalSaving` puede quedar en `true` para siempre si falta `targetId` en modo edición
   (edge case poco probable, pero bloquearía el modal sin poder cerrarse).

## Mejoras menores

8. `activeReservations` se calcula en el panel SaaS pero nunca se muestra — fetch completo de
   `/api/reservations/` desperdiciado en cada carga.
9. `base_url` sin validar en `access_link`/`resend_access_email` de demo_requests — mismo
   patrón de phishing ya reportado en el Bloque 1, pero aquí mitigado porque ambas acciones
   exigen `IsPlatformAdmin` (vector de explotación mucho más limitado).
10. El código de verificación de email se marca `used_at` en una transacción separada de la
    creación de la solicitud — si la creación falla después por otra causa, el código ya se
    quemó y hay que pedir uno nuevo.

## Huecos de cobertura

11. Sin test de denegación de permisos para un usuario de hotel no platform_admin contra
    `/api/demo-requests/*`; sin test de doble conversión vía API (solo se infiere del código);
    y sin test de listado de `/api/hotel-settings/` con hoteles `is_active=False` — este último
    habría detectado el Hallazgo 1 antes de producción.

## Verificado SIN problema

- Conversión de solicitud a hotel: protegida contra doble conversión (`select_for_update` +
  idempotencia real), verifica unicidad de email/username, la contraseña temporal nunca viaja
  en la respuesta API ni en logs (solo por correo), con reintento disponible si el envío falla.
- Protección contra doble clic al convertir: verificada en ambos lados (frontend con guardia
  sincrónica + backend idempotente) — sin riesgo real.
- Verificación de correo: código hasheado, con expiración, cooldown, límite de intentos y
  consumo atómico.
- Sin fugas de multi-tenancy inversa: un usuario de hotel normal no puede listar/ver otras
  solicitudes de demo ni otros hoteles.
- Métricas del panel SaaS son reales, no mock.
- Correo directo desde Usuarios plataforma funciona y está protegido contra doble envío.
- Dark mode y responsive consistentes en los tres módulos de SaaS.

---

## Priorización sugerida

**Bloquean despliegue / corregir ya:** 1 (función de negocio anunciada y rota), 2.
**Corregir pronto:** 3, 4.
**Mejorable sin bloquear:** 5, 6, 7, 8, 9, 10, 11.
