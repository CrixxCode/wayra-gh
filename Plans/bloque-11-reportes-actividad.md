# Bloque 11 — Reportes y actividad — Hallazgos de auditoría

Backend: 39/39 tests pasan (`apps.reports` + `accounts.test_audit`). Confirmado que los dos
bugs históricos del área ("actividad no registraba nada", "gráficos mentían") siguen
corregidos — los 5 reportes (`executive`, `revenue`, `occupancy`, `services`,
`income-consolidated`) usan consultas reales a BD, sin mock, y el frontend reconstruye los
gráficos de Chart.js desde esas respuestas reales.

## Falta de funcionalidad / inconsistencia — auditoría

1. **`apps.demo_requests` no está cubierto por el sistema de auditoría.**
   `AUDITED_APPS` en `accounts/audit.py:144-158` no lo incluye, pese a ser una app de negocio
   real: convertir una solicitud de demo en un hotel (crea `HotelSettings` + `User`) o marcarla
   `CONTACTED`/`DISCARDED` no deja ninguna fila en `/actividad`. Solo queda `converted_at`/
   `converted_user` en el propio modelo (no inmutable, no consultable desde auditoría, y ni
   siquiera existe para los otros dos estados).
2. **Un admin de plataforma ve todas las entidades de todos los hoteles mezcladas en
   `/actividad`, sin columna "hotel" para distinguirlas**, y el selector de hotel del header no
   tiene ningún efecto ahí — a diferencia de `/reportes`, que sí filtra correctamente por hotel
   activo.

## Bugs — rendimiento y datos

3. **`/actividad` puede devolver el queryset completo sin límite si no se envían parámetros de
   paginación.** `OptionalPageNumberPagination.paginate_queryset` retorna `None` sin esos
   parámetros, y en ese caso DRF serializa todo sin límite — en una tabla que crece sin parar
   (una fila por cada escritura ORM de 13 apps), una llamada sin filtros estrechos puede traer
   cientos de miles de filas. Solo `/export` tiene tope (20 000 filas); `list()` no.
4. **El frontend sí fija `page_size=200` pero nunca pagina más allá ni avisa que hay historial
   oculto.** No hay "cargar más" ni paginador visible; con un hotel de alto movimiento, solo se
   ven los 200 registros más recientes que cumplan el filtro — lo demás es inalcanzable salvo
   por el CSV (tope 20 000). El backend sí pagina correctamente, pero el frontend descarta el
   campo `count` de la respuesta.
5. **El botón "Actualizar" de Reportes no fuerza refresco: siempre sirve la caché de 20s.**
   `ResourceCache.get()` tiene un parámetro `forceRefresh` pensado exactamente para esto —
   `AuditService` sí lo usa, pero ninguno de los 4 métodos de `ReportsService` lo pasa. Si el
   usuario registra un pago y pulsa "Actualizar" dos veces en menos de 20s esperando ver el
   número reflejado, recibe los mismos datos cacheados.

## Falta de funcionalidad — exportación de reportes

6. **"Exportar PDF" de Reportes solo exporta 4 líneas de KPIs, sin gráficos ni tablas**, y si el
   navegador bloquea el popup, falla en silencio sin ningún mensaje de error al usuario
   (`if (!popup) return;`).
7. **No existe exportación a Excel/CSV de reportes**, a diferencia de Auditoría que sí la
   tiene.

## Inconsistencias / mejoras menores

8. **Resolución de hotel por `try/except FieldError` en cadena de candidatos** en
   `_filter_queryset_by_reservation_candidates` (usado en el desglose de métodos de pago): si
   cambia el nombre de alguna relación, puede degradar silenciosamente a `queryset.none()` sin
   excepción visible — el reporte mostraría 0 en métodos de pago sin ningún error. No es un bug
   activo hoy, es un patrón riesgoso para mantenimiento futuro.
9. Filtros `entity__iexact`/`username__iexact` no calzan eficientemente con los índices btree
   definidos en el modelo de auditoría — combinado con el punto 3, puede doler en producción
   con la tabla ya grande.
10. Colores de ejes/grid de Chart.js en Reportes están hardcodeados y no se adaptan a modo
    oscuro — pueden perder contraste sobre tarjetas oscuras.

## Huecos de cobertura

11. Todos los tests de `apps/reports/tests.py` mockean los builders de cada reporte — prueban
    el enrutamiento/serialización pero no la lógica de agregación real (ocupación, RevPAR,
    prorrateo de ingresos, overlaps de fechas). Es el hueco de cobertura más importante del
    módulo porque esa lógica es la más compleja y propensa a errores.

## Verificado SIN problema

- Los 2 bugs históricos del área siguen corregidos, sin regresión.
- Los 5 reportes usan datos 100% reales, sin mock.
- Reutilización correcta del mismo cálculo financiero auditado en el Bloque 9 (incluye el
  descuento de notas de crédito de forma consistente con finance).
- Multi-tenancy correcta y testeada en `/reportes` (un manager no puede pedir reportes de otro
  hotel; solo el admin de plataforma efectivo puede elegir cualquier hotel).
- Modelo de auditoría genuinamente inmutable (`ReadOnlyModelViewSet`, sin endpoints de
  edición/borrado); diseño de captura (ContextVar, snapshot, exclusión de campos sensibles)
  bien pensado.
- `/auditoria`: filtros completos (usuario, entidad, acción, texto libre, fechas), con detalle
  antes/después campo a campo — el bug histórico de este flujo sigue resuelto.
- Exportación CSV de auditoría funciona bien (tope 20 000, BOM para Excel).
- Sin botones muertos ni rutas rotas en ninguno de los dos módulos.

---

## Priorización sugerida

**Corregir pronto:** 1, 2, 3, 4, 5.
**Mejorable sin bloquear:** 6, 7, 8, 9, 10, 11.
