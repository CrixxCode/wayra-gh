# Bloque 14 — Flujos públicos (landing, hoteles aliados, reserva, check-in online)

Backend: 27/27 tests pasan (`WebReservationPublicApiTests` + `OnlineCheckInPublicApiTests`). El
fix histórico de `select_for_update(of=("self",))` sigue vigente y además **se aplicó también
aquí** (ver nota positiva #5) — mejor que el flujo interno en ese aspecto puntual. La ventana de
48h y la validación de huéspedes del check-in online están bien cubiertas por tests.

## Bugs de seguridad — datos personales (backend, sin autenticación)

1. **Una reserva pública puede sobrescribir el perfil de un cliente real ajeno, sin
   verificación de identidad.** `_get_or_create_web_client` actualiza en sitio
   `first_name`/`last_name`/`email`/`phone`/`country` de un `Client` existente si la reserva
   reutiliza su email o documento, sin OTP ni confirmación de propiedad. Cualquiera en internet
   que conozca o adivine el email o documento de un huésped real puede: (a) renombrar su perfil
   con una reserva falsa, o (b) usar el documento correcto con un email distinto para
   **secuestrar el email de contacto** asociado a ese documento — comunicaciones futuras del
   hotel llegarían al atacante. **bug alto.**
2. **El endpoint de envío de check-in online permite enumerar códigos de reserva válidos**,
   violando la intención de la Decisión 5.24 (código no enumerable). `lookup` sí usa un mensaje
   genérico único; `submit_online_check_in` no: código inexistente devuelve una clave/mensaje
   distinto de "documento del titular no coincide" — basta enviar `guests` inventados y variar
   el código para distinguir cuáles existen. No cubierto por tests (solo verifican
   `status_code==400`, nunca el contenido). **bug medio-alto.**

## Inconsistencia — gate de "configuración completa" no se reutiliza

3. **`_resolve_hotel` del flujo de reserva pública solo exige `is_active=True`, sin reutilizar
   `is_hotel_setup_complete()`** (la regla que el directorio público sí aplica para decidir qué
   hoteles son "reservables": dirección, horarios, contacto, habitaciones configuradas). Un
   hotel activo pero oculto del directorio por configuración incompleta puede recibir reservas
   públicas igual si alguien conoce o adivina el `hotel_slug` (termina en un ID numérico
   pequeño, probable por fuerza bruta). Rompe el gate de negocio ya documentado.

## Mejoras / a confirmar con producto

4. **`lookup_online_check_in` expone PII completa de todos los acompañantes** (documento,
   fecha de nacimiento, nacionalidad, email, teléfono, contacto de emergencia, notas) a quien
   solo demuestre conocer el documento del titular — diseño razonable para que el titular vea
   el avance del grupo, pero amplía la superficie si el documento es relativamente adivinable.
   Vale confirmar que es una decisión consciente.
5. **DoS leve**: la selección de habitación en reserva pública bloquea con `FOR UPDATE` todo el
   inventario disponible de ese tipo en el hotel hasta el commit — mitigado solo por el
   throttle de 5/min por IP, trivialmente evadible con proxies/botnets a baja velocidad
   sostenida. Sin CAPTCHA ni OTP antes de crear una reserva "pendiente".
6. El throttling (`ScopedRateThrottle` 5-8/min por IP en reserva y check-in) es razonable como
   primera capa, pero el directorio de hoteles aliados no define throttle propio (hereda el
   `AnonRateThrottle` global de 30/min) — no crítico pero documentarlo.

## Bugs — frontend

7. **Si la navegación a la pantalla de confirmación falla tras crear la reserva, el usuario no
   se entera de que ya existe.** `allied-booking-request.ts` no maneja el rechazo de la
   promesa de `router.navigate(...)` tras un `createWebReservation` exitoso — a diferencia del
   paso anterior (`allied-booking-rates.ts`), que sí blinda explícitamente este caso. En
   conexión débil (típico en móvil al pagar/reservar), el usuario ve el mismo formulario sin
   error y probablemente reintenta, creando una **reserva duplicada** server-side.
8. **Campos "Habitaciones"/"Huéspedes" del buscador sin validación visible y `aria-describedby`
   roto.** Si el valor queda fuera de rango, el formulario se invalida en silencio y el botón
   "Buscar" no hace nada — la UI cae en un mensaje genérico de "falta destino/fechas" aunque
   esos campos estén correctos, señalando el problema equivocado al usuario.
9. **La carga de documento de identidad en el check-in online es puramente decorativa.** El
   input de archivo no tiene `formControlName` ni handler; el archivo nunca se envía al backend
   ni se incluye en el payload — el huésped cree haber adjuntado su cédula y el hotel nunca la
   recibe, sin ningún aviso.
10. **La pantalla de confirmación de reserva no valida nada contra el backend.** Solo repinta
    los query params que ella misma generó al redirigir — no llama a la API con el
    `reservationId` de la ruta. No hay fuga de datos reales (no consulta nada), pero la pantalla
    es spoofeable con cualquier dato vía URL (vector de phishing con el dominio legítimo), y si
    se comparte solo la URL base sin query string se pierde hotel/fechas.

## Verificado SIN problema

- Fix histórico de `FOR UPDATE` sobre join nullable sigue vigente y se extiende correctamente
  al flujo público.
- Ventana de 48h del check-in online validada en servidor, no solo en frontend.
- Validación de huéspedes incompletos/duplicados en check-in online, cubierta por tests.
- Directorio público filtra correctamente `is_active=True` + configuración completa.
- Protección contra condiciones de carrera al buscar/cambiar de tarifa en `/reservar`
  (requestId incremental).
- Manejo de errores de backend en creación de reserva y check-in (mensaje + reintento).
- Flujo completo de verificación de email en demo request, incluido reenvío y detección de
  cambio de correo.
- Header/footer públicos reutilizados de forma consistente en las 8 vistas revisadas.
- No se repite aquí el patrón de `base_url` sin whitelist del Bloque 1 (no aplica a estos
  flujos).

---

## Priorización sugerida

**Bloquean despliegue / corregir ya:** 1, 2 (datos personales y enumeración), 3.
**Corregir pronto:** 7, 9, 10.
**Mejorable sin bloquear:** 4, 5, 6, 8.
