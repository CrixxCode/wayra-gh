# Bloque 7 — Servicios / Paquetes / Promociones (catálogo comercial)

Verificado: la decisión de arquitectura 5.18 ("una vista con pestañas, no tres rutas") **sí
coincide con la implementación real** — `/catalogo-comercial` con 3 pestañas; las rutas viejas
redirigen. No es un hallazgo.

Backend: solo 6 tests en total entre los tres módulos (`apps.services`, `apps.packages`,
`apps.promotions`), todos de aislamiento multi-tenant. Multi-tenancy confirmada correcta.

## Falta de funcionalidad — crítico

1. **Las promociones no tienen ningún efecto en la facturación real.** No existe FK
   `promotion` en `Charge`, ni lógica de descuento en `ChargeSerializer.validate()`; ningún
   archivo fuera de `apps/promotions` importa `Promotion` (confirmado por grep global). Se
   puede crear, publicar y "vigentar" una promoción con % de descuento que **nunca descuenta
   nada en la factura real**. Para el negocio es el gap más visible del bloque: "edité la
   promoción al 20% y el huésped pagó precio completo". **falta de funcionalidad crítica.**

## Bugs — integridad referencial del borrado lógico

2. **Borrar un `Service` referenciado por un `Package` activo no se bloquea ni avisa.**
   `PackageService.service` tiene `on_delete=PROTECT`, pero el borrado lógico
   (`SoftDeleteMarker`) nunca ejecuta un DELETE real, así que el `PROTECT` jamás se dispara. El
   paquete queda con un servicio "fantasma": la fila no se borra, pero el servicio ya no existe
   en el catálogo activo ni se puede reutilizar, y nada en la UI de paquetes avisa de esto.
   **bug.**
3. **La acción `target_catalog` de promociones no respeta el borrado lógico.** Consulta
   `Service.objects.filter(is_active=True)`/`Package.objects.filter(is_active=True)`
   directamente del manager, sin pasar por `get_queryset()` del mixin — no excluye registros
   con `SoftDeleteMarker`. Un servicio/paquete borrado lógicamente (con `is_active=True`, que es
   el estado por defecto al "eliminar") sigue apareciendo como opción seleccionable al crear una
   promoción, aunque ya no aparezca en las listas normales. **bug — inconsistencia entre
   pantallas del mismo catálogo.**

## Bugs — consistencia de datos de paquetes

4. **Se puede crear un paquete con cero servicios.** `selectedServiceIds` vacío no bloquea la
   creación ni en frontend ni en backend — un "paquete" vacío queda vendible en el catálogo sin
   contenido real, sin aviso.
5. **Creación de paquete sin transacción: puede quedar huérfano/parcial.** `create-package.ts`
   crea el paquete y luego encadena las líneas de servicio por separado (`forkJoin`) sin
   rollback. Si una línea falla a mitad de camino, el paquete queda persistido sin todos sus
   servicios, con solo un mensaje de error genérico — el operador no sabe que ya se creó un
   paquete incompleto.
6. **`Package.base_price` es independiente de la suma real de sus servicios**, sin cálculo
   sugerido ni recálculo cuando cambia el precio de un `Service` referenciado. Si se sube el
   precio de un servicio que está en 5 paquetes activos, los 5 quedan vendiendo por debajo de
   costo indefinidamente, sin alerta.

## Falta de funcionalidad — riesgo futuro

7. **Sin regla de exclusión/combinación entre promociones.** Dos promociones distintas pueden
   apuntar al mismo servicio/paquete con fechas superpuestas y ambas estar "vigentes" a la vez,
   sin control de prioridad. Hoy es inocuo porque nada aplica el descuento (#1), pero es deuda
   que hay que resolver **antes** de conectar promociones a facturación, no después.

## Huecos de cobertura

8. Los 6 tests existentes solo cubren aislamiento multi-tenant. Sin ningún test de: precio
   negativo, rango de fechas inicio<fin, tope de 100% en descuento porcentual, duplicado de
   nombre/código por hotel, paquete sin servicios, `restore()`, scopes de escritura, ni la
   action `target_catalog`. Toda la lógica de `clean()`/`validate()` de los tres modelos está
   sin cobertura — facilitó que los hallazgos 2-7 pasaran inadvertidos.

## Verificado SIN problema

- Arquitectura de pestañas vs. rutas: coincide con la decisión documentada.
- Multi-tenancy correcta en los tres ViewSets.
- CRUD de UI completo en los tres módulos (crear/editar/eliminar/restaurar), con estados de
  carga/error — sin botones muertos.

---

## Priorización sugerida

**Bloquean despliegue / corregir ya:** 1 (si el negocio espera que las promociones funcionen),
2, 3.
**Corregir pronto:** 4, 5, 6.
**Resolver antes de conectar promociones a facturación:** 7.
**Mejorable sin bloquear:** 8.
