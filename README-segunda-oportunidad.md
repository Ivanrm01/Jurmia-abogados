# Módulo de Ley de Segunda Oportunidad

Captación de clientes y gestión de expedientes de exoneración del pasivo insatisfecho, integrado en la web y en el panel de JURMIA igual que vuelos y revolving: misma sesión, mismo almacén Redis y mismo correo de IONOS.

> Los nombres de letrados, clientes y acreedores que aparecen en pruebas y ejemplos son **ficticios**. Los datos reales del despacho se configuran con variables de entorno.

## 1. Qué incluye

**Web pública**

La oferta de segunda oportunidad es enorme y casi toda dice lo mismo («cancele sus deudas», «sin compromiso»). Lo que distingue a esta página es que **da algo útil antes de pedir los datos**:

1. **Calculadora «¿Cuánto podría cancelar?»** en la portada (bancos, Hacienda y Seguridad Social) y una versión completa en `/ley-segunda-oportunidad/calculadora` (recargos, otras administraciones, hipoteca y valor de la vivienda, alimentos y embargo mensual). Aplica la regla del art. 489.1.5.º TRLC tal como la interpreta el Tribunal Supremo en 2026: 5.000 € enteros y la mitad del resto, hasta 10.000 € **por cada administración**; recargos e intereses, enteros. El cálculo se hace en el navegador y no se envía hasta que la persona pide que la llamen. Si hay embargo, muestra lo que le cuesta esperar seis meses.
2. **Informe al momento** al acabar el test: el cálculo, un semáforo por tipo de deuda, la vía que encaja, la hoja de ruta paso a paso y los documentos. El test se salta las preguntas que ya contestó la calculadora.
3. **Vía urgente** («Tengo un embargo o un juicio»): formulario de tres campos sin test para embargos, demandas, subastas o desahucios. Entra marcado como urgente en el panel, en el correo al despacho y en el resumen diario.
4. **El informe por correo**: el cliente recibe su informe (cálculo, semáforo, pasos y documentos) y el despacho, todos los datos para la primera llamada.
5. **Confianza**: «Por qué JURMIA» (abogado desde el primer día, precio cerrado, cálculo con las sentencias de 2026, conservar la vivienda cuando es posible) y «Antes de contratar: seis preguntas» que conviene hacer a cualquier despacho.

Páginas:

- `/ley-segunda-oportunidad`: portada con la calculadora, la vía urgente, el test de viabilidad (una pregunta por pantalla), el informe y el formulario.
- `/ley-segunda-oportunidad/calculadora`: calculadora completa, con la explicación del cálculo y sus datos estructurados (WebApplication, FAQ y migas).
- Siete páginas por problema, con el test incrustado: tarjetas revolving, microcréditos, Hacienda y Seguridad Social, embargo de nómina (con la vía urgente), autónomos, avalistas y conservar la vivienda. Están en `/ley-segunda-oportunidad/…`, con datos estructurados (FAQ y migas) y en el `sitemap.xml`.
- Artículo del blog «Deudas con Hacienda y la Seguridad Social: cuánto se puede cancelar» (`contenido/blog/2026-10-31-…`), que enlaza a la calculadora.
- Enlace «Deudas» en el menú de todas las páginas y una franja en la portada.
- En las páginas de segunda oportunidad, el botón «Consulta» de la barra fija del móvil lleva al test.
- Se guarda el origen de cada visita (UTM, `gclid`, `fbclid`, buscador y página de entrada) para saber qué canal trae clientes.

**Panel** (`/admin/segunda-oportunidad`, icono ⚖️ en el raíl lateral)

- **Resumen**: contactos sin llamar (los urgentes, primero y contados en el indicador), seguimientos del día, plazos que vencen, documentación atascada, cuotas vencidas, embudo por fase y conversión por canal.
- **Contactos** (captación) y **Expedientes** (clientes), con filtros, búsqueda y borrado definitivo en lote. Los urgentes sin llamar salen arriba con la marca ⚡ y, si usó la calculadora, se ve lo que declaró como cancelable.
- **Ficha** de cada expediente:
  - registro de llamadas; si no contesta, se programa el siguiente intento a 1, 2 y 4 días hábiles;
  - aviso de vía urgente y tabla de lo que declaró en la calculadora;
  - test (también se puede rellenar a mano si el cliente llama);
  - documentación personalizada y envío al cliente de lo que falta;
  - honorarios con plan de cuotas;
  - datos procesales y fechas de notificación;
  - acreedores con cálculo del pasivo exonerable, e inventario de bienes;
  - escritos e historial.
- **Plazos y escritos**: todos los plazos abiertos, lo que falta por redactar y los borradores en curso.
- **Editor de escritos**:
  - vista de documento y texto editable;
  - huecos pendientes resaltados, que impiden marcar el escrito como revisado;
  - notas de riesgo para el letrado;
  - estado (borrador, revisado o presentado, con justificante de LexNET);
  - descarga en Word (A4, Times 12, interlineado 1,5, páginas numeradas).

**Escritos disponibles** (según la vía y la fase de cada expediente):

1. Solicitud de concurso voluntario, con la memoria, el inventario y la relación de acreedores (art. 7 TRLC).
2. Plan de pagos (arts. 495 a 498 TRLC).
3. Exoneración en concurso sin masa (arts. 37 ter y 501.1 TRLC).
4. Exoneración tras la liquidación (art. 501.2 TRLC).
5. Contestación a la oposición (arts. 502 y 536.3 TRLC).
6. Cumplimiento de requerimiento.
7. Suspensión de cada ejecución en curso (art. 143 TRLC).
8. Exoneración definitiva tras el plan (art. 500 TRLC).

**Avisos automáticos**

| Cuándo | A quién | Qué |
| --- | --- | --- |
| Llega un contacto | Despacho | Correo con el resultado, el cálculo, las respuestas, el teléfono y el enlace a la ficha. Los urgentes llevan «[URGENTE]» en el asunto y los prioritarios, «[PRIORITARIO]» |
| Llega un contacto con correo | Cliente | «Su informe de Segunda Oportunidad»: resultado, cálculo, semáforo de deudas, pasos del procedimiento y primeros documentos |
| Cada día laborable a primera hora | Despacho | Resumen de plazos procesales, contactos sin llamar, seguimientos, documentación atascada y cuotas vencidas (solo si hay algo) |
| Cada día laborable, si `LSO_RECORDATORIOS=si` | Cliente | Recordatorio semanal de la documentación pendiente (máximo cuatro) |
| Al cambiar la fase en el panel, si se marca | Cliente | Aviso del avance del expediente |
| Desde la ficha, a mano | Cliente | Lista de documentos que faltan, con cómo conseguir cada uno |

Si alguien repite el test con el mismo teléfono en 30 días mientras sigue en captación, se actualiza su ficha en lugar de duplicarla. Si ya es cliente, solo se anota en su historial.

## 2. Archivos

```
ley-segunda-oportunidad.html            página principal
ley-segunda-oportunidad/*.html          7 páginas por problema y la calculadora
admin/segunda-oportunidad.html          panel
assets/js/lso-motor.js                  test, documentos, fases, exoneración y plazos (web, panel y servidor)
assets/js/lso-escritos.js               catálogo y plantillas de los escritos (panel y servidor)
assets/js/segunda-oportunidad.js        calculadora, test, informe y vía urgente de la web pública
assets/js/panel-lso.js                  panel
assets/css/segunda-oportunidad.css      estilos de las páginas públicas
assets/img/og-segunda-oportunidad.jpg   imagen para redes sociales
api/segunda-oportunidad.js              recibe los contactos de la web
api/expedientes-lso.js                  API del panel
api/lso-avisos.js                       aviso diario (Vercel Cron)
api/_lso.js, _almacen-lso.js, _correos-lso.js, _diario-lso.js, _word-lso.js
tests/segunda-oportunidad.test.mjs      pruebas (npm test)
contenido/blog/2026-10-31-deudas-hacienda-seguridad-social-segunda-oportunidad.md
```

Si edita a mano las páginas públicas, mantenga el mismo marcado (`#calculo-rapido`, `#calculadora-lso`, `[data-urgente]`, `#test`), porque el JavaScript los busca por esos identificadores.

Cambios en archivos que ya existían:

- `_almacen.js` exporta `comando()`.
- `_correo.js` acepta un destinatario distinto del despacho (`para`), que se usa para escribir al cliente. Sin ese parámetro funciona exactamente igual que antes.
- `main.js` permite cambiar el destino del botón «Consulta» de la barra móvil con `data-consulta` en `<body>`.
- `estilos.css`: entre 721 y 1.100 px el menú pasa a desplegable, y entre 1.101 y 1.320 px se estrechan sus huecos. Con nueve secciones ya no cabía en una línea y la página desbordaba en tabletas. Esto también pasaba antes con ocho.
- Además:
  - el menú de todas las páginas y la cabecera del blog (`build.mjs`);
  - el `sitemap`;
  - la política de privacidad (dos finalidades nuevas y el aviso de que el test no decide por sí solo);
  - el raíl lateral de los otros paneles;
  - `vercel.json` (cron);
  - `package.json` (dependencia `docx` y `npm test`).

## 3. Variables de entorno

Las que ya usa la web siguen siendo imprescindibles: `ADMIN_USUARIOS`, `ADMIN_SECRETO`, `KV_REST_API_URL` y `KV_REST_API_TOKEN` (o las de Upstash), `SMTP_USUARIO`, `SMTP_CLAVE` y `CORREO_DESTINO`.

Para los escritos se reutilizan las de revolving: `DESPACHO_LETRADO`, `DESPACHO_COLEGIADO`, `DESPACHO_COLEGIO`, `DESPACHO_PROCURADOR`. En cada expediente se pueden cambiar desde la pestaña «Expediente judicial».

Nuevas, todas opcionales:

| Variable | Para qué | Ejemplo |
| --- | --- | --- |
| `CRON_SECRET` | Protege el aviso diario. **Sin ella el aviso no se envía.** Vercel la manda sola en cada llamada del cron | una cadena larga aleatoria |
| `DESPACHO_FESTIVOS` | Festivos autonómicos y locales del partido judicial para el cómputo de plazos. `MM-DD` si se repiten cada año | `03-19,10-09,2026-04-06` |
| `LSO_RESPONSABLES` | Reparte los contactos nuevos por turnos | `Nombre Uno, Nombre Dos` |
| `LSO_TARIFAS` | Honorarios de referencia por vía, solo para la previsión del panel | `sin_masa:2400,liquidacion:3000,plan_pagos:3600,microempresa:3900,complejidad:900` |
| `LSO_RECORDATORIOS` | `si` para recordar a los clientes la documentación pendiente | `si` |
| `DESPACHO_TELEFONO`, `DESPACHO_WHATSAPP` | Los que aparecen en los correos al cliente (por defecto, los de `main.js`) | `+34 667 824 641` |

El aviso diario se programa en `vercel.json` a las 6:00 UTC de lunes a viernes, que son las 7:00 o las 8:00 en Madrid según la época del año. El plan gratuito de Vercel permite un cron al día.

## 4. Antes de usar los escritos

- Son **borradores**. El letrado los revisa siempre antes de presentarlos. Lo que falta queda entre `[[corchetes dobles]]`, resaltado en amarillo en el panel y en el Word.
- Las citas de la STS 264/2026, de 18 de febrero (ECLI:ES:TS:2026:440), sobre el crédito público se tomaron de fuentes secundarias. Las plantillas piden expresamente cotejar su literalidad con CENDOJ.
- La sede que se propone es la Sección de lo Mercantil del Tribunal de Instancia de la capital de provincia (arts. 44 y 45 TRLC y LO 1/2025). Hay que comprobarla en cada caso.
- Plazos:
  - se excluyen sábados, domingos, festivos nacionales (incluido el Viernes Santo), agosto y del 24 de diciembre al 6 de enero;
  - las notificaciones por LexNET se tienen por hechas al día siguiente de la recepción (art. 151.2 LEC);
  - el plazo de gracia llega hasta las 15:00 del día hábil siguiente (art. 135.1 LEC);
  - los festivos locales hay que añadirlos en `DESPACHO_FESTIVOS`.

## 5. Protección de datos

- Los expedientes se guardan en Redis, no en el repositorio. «Eliminar definitivamente» los borra de verdad, con sus escritos (derecho de supresión).
- El formulario exige aceptar la política de privacidad. El consentimiento comercial va aparte y no viene marcado. Se guarda la fecha, la IP y la versión del texto aceptado.
- El test da una orientación automática, pero el resultado lo revisa siempre un abogado. Así lo dice también la política de privacidad, para cumplir el art. 22 del RGPD.
- Conviene revisar con el proveedor de Redis y con IONOS los contratos de encargado del tratamiento.

## 6. Probar y mantener

```bash
npm install
npm test            # pruebas del motor: test, plazos, crédito público y escritos
```

Para probar las funciones en local con su API, lo más sencillo es `vercel dev` con las variables de entorno de desarrollo.

Vercel sirve `/assets` con caché de un año. Las páginas de este módulo cargan sus archivos con `?v=20261031`. **Si se modifica uno de esos JS o CSS, hay que cambiar ese número** en las páginas que lo cargan, o los navegadores seguirán usando la versión anterior.

## 7. Lo que no se ha traído de la versión independiente

La primera versión se hizo como aplicación aparte, sobre Supabase. Al integrarla en JURMIA se ha simplificado para no añadir otro proveedor:

- **WhatsApp automático** (bienvenida, recordatorios). Los avisos salen por correo. Desde la ficha hay un enlace directo a WhatsApp para escribir a mano. Se puede añadir más adelante con la API de WhatsApp Business.
- **Portal del cliente con subida de documentos**. El cliente envía los documentos por correo y el estado de cada uno se marca en el panel.
- **Agenda de consultas en línea**. La consulta se fija desde la ficha, tras la llamada.
- **Editor de automatizaciones**. Las reglas de aviso están en el código (`_diario-lso.js` y `expedientes-lso.js`) y se ajustan con las variables de entorno.
