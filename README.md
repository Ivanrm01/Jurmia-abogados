# JURMIA Abogados — sitio web

> El repositorio conserva el nombre `JURMIA-abogados` por motivos históricos.
> El nombre comercial y el dominio son JURMIA Abogados / jurmiabogados.es.

Sitio estático (HTML, CSS y JavaScript, sin dependencias) preparado para desplegarse en Vercel
desde un repositorio de GitHub. Incluye una función serverless para recibir las consultas del
formulario por correo.

```
index.html              Página principal
aviso-legal.html        Aviso legal (LSSI-CE)
privacidad.html         Política de privacidad (RGPD / LOPDGDD)
politica-cookies.html   Política de cookies
api/contacto.js         Función serverless que envía el formulario por correo
assets/css/estilos.css  Estilos
assets/js/main.js       Menú, animaciones y envío del formulario
assets/img/jurmia-logo.png Logotipo recortado y con fondo transparente
vercel.json             Cabeceras de seguridad y caché
robots.txt, sitemap.xml SEO
```

---

> **Ley de Segunda Oportunidad.** La web incluye un módulo completo de captación y gestión de expedientes de exoneración de deudas: test en `/ley-segunda-oportunidad`, panel en `/admin/segunda-oportunidad` y escritos judiciales. Instrucciones y variables de entorno en [README-segunda-oportunidad.md](README-segunda-oportunidad.md).

## 1. Antes de publicar: datos pendientes

En la web aparecen en cursiva y subrayados con puntos los datos que faltan. Busque la palabra
`pendiente` en los archivos y sustituya el texto:

- [ ] **Direcciones** de los despachos de Madrid, Valencia y Castellón (`index.html`)
- [ ] **Teléfonos** de cada despacho, teléfono general y teléfono de guardia penal (`index.html`)
- [ ] **Correo electrónico** real (ahora `info@jurmiabogados.es` en varios sitios)
- [ ] **Colegio de la Abogacía y números de colegiado** (`index.html` y `aviso-legal.html`)
- [ ] **Razón social, NIF y domicilio fiscal** (`aviso-legal.html` y `privacidad.html`)
- [ ] **Dominio real**: sustituya `https://www.jurmiabogados.es/` en `index.html`, `robots.txt` y `sitemap.xml`

Los textos legales son una base sólida, pero conviene que un compañero del despacho los revise
antes de publicar, sobre todo la tabla de tratamientos de la política de privacidad.

---

## 2. Subir a GitHub

Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Primera versión de la web de JURMIA Abogados"
git branch -M main
git remote add origin https://github.com/USUARIO/jurmia-abogados.git
git push -u origin main
```

Cree antes el repositorio vacío en github.com (sin README ni .gitignore, ya están incluidos).

---

## 3. Desplegar en Vercel

1. Entre en [vercel.com](https://vercel.com) con la cuenta de GitHub.
2. **Add New → Project** y seleccione el repositorio `jurmia-abogados`.
3. Framework Preset: **Other**. No hay comando de build ni carpeta de salida que indicar.
4. **Deploy**.

Cada `git push` a `main` vuelve a desplegar el sitio automáticamente.

### Dominio propio

En **Settings → Domains**, añada `jurmiabogados.es` y `www.jurmiabogados.es`. Vercel indicará los
registros DNS (un registro A y un CNAME) que hay que crear en el proveedor donde esté el dominio.
El certificado HTTPS se emite solo.

---

## 4. Que el formulario llegue al correo

El formulario envía los datos a `/api/contacto`, que los reenvía por correo usando
[Resend](https://resend.com) (plan gratuito: 3.000 correos al mes, suficiente).

1. Cree una cuenta en Resend y verifique el dominio del despacho.
2. Genere una API key.
3. En Vercel, **Settings → Environment Variables**, añada:

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | la clave de Resend |
| `CORREO_DESTINO` | dirección donde quiere recibir las consultas |
| `CORREO_ORIGEN` | remitente verificado, p. ej. `web@jurmiabogados.es` |

4. Vuelva a desplegar (**Deployments → Redeploy**) para que se apliquen.

Mientras no estén configuradas, el formulario muestra un aviso con el correo y el teléfono del
despacho, así que la web sigue siendo utilizable.

---

## 5. Ver el sitio en local

```bash
python3 -m http.server 8000
```

y abra `http://localhost:8000`. La función `/api/contacto` solo funciona con `vercel dev`
(`npm i -g vercel`).

---

## 6. Notas de mantenimiento

- **Analítica**: si instala Google Analytics, Meta Pixel o similar, necesitará un banner de
  consentimiento de cookies y habrá que actualizar `politica-cookies.html`.
- **Áreas**: cada área es un bloque `<article class="area">` en `index.html`. Si más adelante
  interesa posicionar por ciudad («abogado penalista Valencia»), lo natural es convertir cada área
  en una página propia reutilizando la misma hoja de estilos.
- **Colores**: definidos como variables al principio de `assets/css/estilos.css`, tomados
  directamente del logotipo (`#06365a` y `#c3ced2`).

---

## 7. SEO: qué está hecho y qué depende de vosotros

### Ya está en el código

**Arquitectura.** Una página por área y una por despacho, que es lo que permite competir por
búsquedas distintas. Cada una con su `title`, su `meta description`, un solo `H1` y URL limpia:

```
/areas/civil          /despachos/madrid
/areas/penal          /despachos/valencia
/areas/laboral        /despachos/castellon
/areas/tributario
```

**Contenido.** Entre 900 y 1.400 palabras por página de área, con plazos y artículos concretos
(los 20 días hábiles del despido, el mes para recurrir una liquidación, el umbral de 120.000 € del
delito fiscal). Google premia el detalle verificable, y además es lo que convierte visitas en
llamadas.

**Datos estructurados.** `Attorney` + `LegalService` con horarios, áreas y sedes en la portada;
`Service` en cada área; `Attorney` local en cada despacho; `FAQPage` en las preguntas frecuentes
(pueden aparecer desplegadas en los resultados) y `BreadcrumbList` en todas las interiores.

**Enlazado interno.** Portada → áreas → despachos → áreas, con migas de pan y bloques de enlaces
relacionados. Es lo que reparte autoridad entre páginas.

**Técnico.** Sin JavaScript para renderizar el contenido (HTML plano, se indexa entero), tipografías
con `display=swap`, imágenes con dimensiones declaradas, caché de un año en `assets`, `sitemap.xml`,
`robots.txt`, canónicas y Open Graph.

### Lo que hay que hacer fuera del código

Esto pesa más que todo lo anterior en búsquedas locales:

1. **Google Business Profile, una ficha por despacho.** Es el factor número uno para «abogado + ciudad».
   Cada ficha necesita dirección real verificable, teléfono local, horario, categoría «Abogado» y
   fotos del despacho. Sin esto, el mapa no os mostrará.
2. **Reseñas.** Pedidlas sistemáticamente al cerrar un asunto. Es el segundo factor local y el que
   más diferencia marca frente a despachos con la misma antigüedad.
3. **Google Search Console.** Dad de alta el dominio y enviad `sitemap.xml` el día del lanzamiento.
   Es donde veréis qué búsquedas os traen visitas.
4. **NAP coherente.** El mismo nombre, dirección y teléfono, escritos igual, en la web, en las fichas
   de Google y en directorios jurídicos y en el del Colegio.
5. **Enlaces.** Colegio de la Abogacía, asociaciones sectoriales, prensa local, colaboraciones. Pocos
   y buenos valen más que muchos comprados.
6. **Contenido nuevo con regularidad.** Un artículo al mes sobre asuntos reales del despacho
   (anonimizados) posiciona mejor que cualquier ajuste técnico.

### Recomendación sobre páginas «área + ciudad»

Puede parecer buena idea crear doce páginas del tipo «abogado laboralista en Valencia». Funciona
solo si cada una tiene contenido genuinamente distinto: juzgados de esa ciudad, criterios de esa
Audiencia, casos propios. Doce páginas casi idénticas se acaban filtrando como contenido duplicado y
restan en lugar de sumar. La estructura actual ya deja preparado el terreno; añadidlas de una en una
y solo cuando haya material real que contar.

### Antes del lanzamiento

- [ ] Sustituir `https://www.jurmiabogados.es` por el dominio definitivo en todos los archivos
      (`grep -rl jurmiabogados.es .`)
- [ ] Rellenar direcciones y teléfonos: también aparecen en los datos estructurados de
      `/despachos/*.html` como `PENDIENTE`
- [ ] Completar `sameAs` en el JSON-LD de `index.html` con LinkedIn y la ficha de Google
- [ ] Verificar el marcado en [search.google.com/test/rich-results](https://search.google.com/test/rich-results)
- [ ] Pasar [PageSpeed Insights](https://pagespeed.web.dev) sobre el dominio ya desplegado

---

## 8. Blog con panel de administración

### Cómo funciona

```
Panel /admin  →  commit en GitHub  →  Vercel despliega  →  HTML estático en /blog
```

El panel no guarda en una base de datos: escribe archivos Markdown en `contenido/blog/` del
repositorio. Cada guardado genera un commit, Vercel lo detecta y `build.mjs` regenera el blog. El
artículo aparece publicado en un minuto aproximadamente.

Esto tiene tres ventajas sobre un CMS tradicional: las páginas son HTML puro (lo mejor posible para
Google y para la velocidad), no hay base de datos que mantener ni que pagar, y cada cambio queda con
su historial y se puede revertir desde GitHub.

### Entrar al panel

`https://tudominio.es/admin` — cada persona entra con su correo, su contraseña y, si la ha
activado, el código de su app de autenticación. La sesión se cierra tras 30 minutos sin actividad y,
como máximo, a las 12 horas (detalle en la sección 10). El panel está bloqueado a buscadores con
`noindex` y con `Disallow` en `robots.txt`.

### El panel incluye

- Listado de artículos publicados y borradores.
- Editor en Markdown con previsualización.
- Campos separados de titular y de meta title / meta description, para poder optimizar el texto de
  Google sin cambiar el titular que ve el lector.
- Subida de imagen destacada (va a `assets/img/blog/`) con campo obligatorio de texto alternativo.
- **Vista previa de Google**: cómo se verá el resultado en el buscador, con recorte real.
- **Revisión SEO en vivo**: longitud de title y description, longitud de URL, número de palabras,
  presencia de subtítulos H2, enlaces internos a páginas de área, imagen con alt, cita de normas o
  sentencias y firma del autor.
- Casilla de borrador: se guarda sin publicarse.

### Variables de entorno que hay que añadir en Vercel

| Variable | Valor |
|---|---|
| `ADMIN_USUARIOS` | cuentas del panel: `correo:contraseña:Nombre Apellidos, correo2:contraseña2:Nombre2` |
| `ADMIN_SECRETO` | cadena larga y aleatoria (`openssl rand -base64 32`) |
| `GITHUB_TOKEN` | *fine-grained token* con permiso **Contents: Read and write** sobre este repositorio |
| `GITHUB_REPO` | `usuario/jurmia-abogados` |
| `GITHUB_RAMA` | `main` |

El token se crea en GitHub → Settings → Developer settings → Personal access tokens → Fine-grained
tokens. Dadle acceso solo a este repositorio y solo al permiso Contents.

### Configuración del despliegue

`vercel.json` ya trae `"buildCommand": "node build.mjs"`. Si Vercel se queja del directorio de
salida, dejad el campo **Output Directory** vacío en Settings → Build and Deployment.

Para trabajar en local:

```bash
npm install
npm run dev        # genera el blog y levanta el sitio en localhost:8000
```

### SEO del blog: lo que genera automáticamente

- **Una URL limpia por artículo**: `/blog/plazo-para-impugnar-un-despido`.
- **Páginas de tema**: `/blog/tema/laboral`, `/penal`, `/civil`, `/tributario`,
  `/ley-segunda-oportunidad` y `/vuelos`, que refuerzan las páginas de área o de servicio
  correspondientes. Los temas se definen en la lista `TEMAS` de `build.mjs`; para añadir uno, se
  añade ahí y como opción del selector «Área» de `admin/index.html`.
- **Paginación** cada 9 artículos, con URLs propias.
- `BlogPosting` completo por artículo: titular, descripción, fecha de publicación **y de
  actualización**, autor, editor con logotipo, sección, número de palabras e imagen.
- `BreadcrumbList` y `Blog` en los listados.
- Open Graph y Twitter Card con imagen, para que se vea bien al compartir en LinkedIn y WhatsApp.
- **Feed RSS** en `/rss.xml`, enlazado desde todas las páginas.
- **Sitemap regenerado en cada despliegue** con `lastmod` real de cada artículo.
- Artículos relacionados de la misma área al final de cada pieza (enlazado interno automático).
- Aviso de que el contenido es información general, que además de ser correcto deontológicamente
  ayuda con los criterios de calidad de Google para contenido jurídico.

### Cómo escribir para que funcione

1. **Un artículo, una pregunta.** «¿Cuánto tiempo tengo para impugnar un despido?» posiciona; «Novedades
   laborales» no. El titular debe contener la búsqueda real de la gente.
2. **De 900 a 1.500 palabras** con subtítulos `##` cada 200–300 palabras.
3. **Datos concretos**: artículos, plazos, importes, sentencias con su fecha. Es lo que distingue un
   artículo de despacho de un texto genérico, y lo que Google premia en temas jurídicos (YMYL).
4. **Enlazad siempre** a la página del área correspondiente y al formulario de contacto.
5. **Firmad los artículos** con el nombre del abogado, no con «el despacho». La autoría identificable
   pesa en los criterios de experiencia y fiabilidad.
6. **Actualizad los artículos antiguos** cuando cambie la norma: el panel actualiza solo la fecha de
   modificación, y Google lo tiene en cuenta.
7. **Un artículo al mes bien hecho** rinde más que cuatro apresurados.

Quedan dos artículos de ejemplo en `contenido/blog/` (uno laboral y otro tributario) que sirven de
plantilla de tono y extensión. Podéis editarlos o borrarlos desde el panel.

---

## 9. Móvil

Más de la mitad de las visitas a una web de despacho llegan desde el teléfono, y casi siempre desde
una búsqueda urgente: alguien acaba de recibir una carta de despido o una citación. El sitio está
construido para ese caso.

### Barra fija de contacto

En pantallas de menos de 720 px aparece una barra fija en la parte inferior con tres acciones:
**Llamar**, **WhatsApp** y **Consulta**. Es el elemento que más convierte en móvil, porque elimina
el recorrido hasta el formulario.

Los tres datos se cambian en una sola línea, al principio de `assets/js/main.js`:

```js
var TELEFONO = "+34000000000";                  // con prefijo y sin espacios
var WHATSAPP = "34000000000";                   // igual, pero sin el +
var TEXTO_WHATSAPP = "Hola, me gustaría plantear una consulta jurídica.";
```

La barra respeta el área segura de los iPhone con notch y no aparece en el panel de administración.

### Comprobado en

320 px (iPhone SE), 360 px (Android medio), 390 px, 430 px (iPhone Pro Max) y 768 px (tablet).
Sin desbordamiento horizontal en ninguna página.

### Qué se ha ajustado

- **Ningún texto por debajo de 12 px** en móvil: las etiquetas en tipografía monoespaciada suben de
  10–11 px a 12 px.
- **Zonas táctiles de 44 px o más** en todo lo que sea navegación: menú, migas de pan, pie, filtros
  del blog, paginación y botones. Los enlaces dentro de un párrafo mantienen su tamaño natural.
- **Campos de formulario a 16 px**, que es lo que evita que iOS haga zoom automático al escribir.
- **Teclados adecuados**: `inputmode` de teléfono y de correo, autocompletado de nombre, correo y
  teléfono, y desactivada la autocorrección donde estorba.
- **Menú desplegable** que se cierra al tocar fuera o al elegir una opción, sin el botón de consulta
  duplicado (ya está en la barra fija).
- **La columnata de la portada** ocupa menos alto para que el contenido llegue antes.
- **Tablas de la política de privacidad** con desplazamiento horizontal propio, sin romper la página.
- **Filtros del blog** en carrusel horizontal en lugar de apilarse en cuatro líneas.
- **El panel de administración** también funciona desde el teléfono: campos apilados, botones de
  guardar fijos al pie y área de escritura amplia. Se puede publicar un artículo desde el móvil.

### Instalable y compartible

- `manifest.webmanifest` e iconos de 180, 192 y 512 px generados desde el logotipo: si alguien añade
  la web a la pantalla de inicio, aparece con el icono del despacho.
- `theme-color` en azul corporativo, que tiñe la barra del navegador en Android.
- Open Graph y Twitter Card en todas las páginas, para que los enlaces se vean bien al compartirlos
  por WhatsApp, que es como circula la mayoría de las recomendaciones entre particulares.

### Velocidad

No hay framework, ni librerías, ni imágenes pesadas: cada página son unos pocos kilobytes de HTML y
una hoja de estilos compartida que se cachea. El único recurso externo son las tipografías de Google,
cargadas con `display=swap` para que el texto se lea desde el primer momento. Es la configuración que
mejor puntúa en Core Web Vitals, que además es un factor de posicionamiento en móvil.

---

## 10. Seguridad del panel y registro de consentimientos de cookies

Página del panel: **`/admin/seguridad`** (icono 🛡️ del raíl lateral, en todas las secciones).

### Puesta en marcha (una sola vez)

1. **Redis**: el mismo de los expedientes (`KV_REST_API_URL` y `KV_REST_API_TOKEN`). Las sesiones,
   la verificación en dos pasos, el registro de accesos y el de consentimientos se guardan ahí, con
   claves propias (`seg:…` y `cookies:…`). No hay que crear nada: aparecen solas.
2. **Vercel → Settings → Environment Variables**, comprobar o añadir:

   | Variable | Para qué |
   |---|---|
   | `ADMIN_USUARIOS` | Las dos cuentas: `ana@jurmiabogados.es:Contraseña1:Ana Pérez, luis@jurmiabogados.es:Contraseña2:Luis Gómez` (la contraseña no puede llevar comas ni dos puntos) |
   | `ADMIN_SECRETO` | Ya existe. Cadena larga y aleatoria |
   | `CONSENT_SALT` | **Nueva.** Cadena larga y aleatoria (40 caracteres o más, `openssl rand -base64 40`). **No la cambie nunca** una vez puesta: con ella se calculan las huellas del registro de cookies |
   | `ADMIN_INACTIVIDAD_MIN` | Opcional. Minutos sin actividad que cierran la sesión (por defecto 30; de 5 a 240) |

3. Subir el código a GitHub. Al publicarse, **todo el equipo tendrá que volver a entrar una vez**
   (las sesiones antiguas eran de otro tipo y dejan de valer).
4. Cada persona entra en **Seguridad** y activa su verificación en dos pasos con su propio móvil.

> El proyecto pasa a tener 10 funciones en `/api` (se añade `api/seguridad.js`). El plan gratuito de
> Vercel admite 12 por despliegue.

### Qué protege el panel, sin hacer nada

- **Correo + contraseña** de cada persona (`ADMIN_USUARIOS`). Si fallan, el mensaje no dice cuál de
  los dos era, y la respuesta tarda lo mismo exista o no el correo.
- **Límite de intentos:** 8 fallos desde la misma conexión la bloquean 15 minutos; 20 fallos contra
  la misma cuenta, desde cualquier sitio, la bloquean 1 hora. Los códigos de la app cuentan igual.
- **Sesión en el servidor:** el navegador guarda un token aleatorio; en Redis solo está su huella
  SHA-256, así que quien leyera la base de datos no podría entrar con ella. Además, la sesión queda
  atada al navegador desde el que se abrió.
- **Caducidad:** a los 30 minutos sin actividad y, en cualquier caso, a las 12 horas. Mientras se
  trabaja (teclear, tocar, desplazarse) se renueva sola.
- **Sin perder trabajo:** si la sesión caduca con algo a medio escribir (un escrito, un artículo),
  el panel no se recarga: pide de nuevo la contraseña y el código encima de la pantalla y continúa
  donde estaba.
- **Cambiar la contraseña** de alguien en `ADMIN_USUARIOS` (y volver a desplegar) cierra sus
  sesiones abiertas. Quitar a alguien de la lista le corta el acceso en su siguiente clic.
- **Registro de accesos:** en Seguridad se ven los últimos intentos de entrada de todo el equipo,
  correctos y fallidos, con fecha, cuenta, IP y dispositivo, y los cambios de seguridad. Se guardan
  las 2.000 últimas entradas (como máximo, de los últimos 12 meses).
- **Sesiones abiertas:** también en Seguridad, con dispositivo, IP, hora de entrada y última
  actividad. Cualquiera del equipo puede cerrar una sesión que no reconozca.

### Verificación en dos pasos (cada persona, en su cuenta)

1. Instale en el móvil Google Authenticator, Microsoft Authenticator (o Authy, 1Password…).
2. En el panel, vaya a **Seguridad**, escriba su contraseña y pulse **Activar**.
3. Escanee el código QR (o escriba la clave a mano) y escriba el código de 6 cifras que aparece.
4. **Guarde los 8 códigos de recuperación** (*Descargar como .txt*) fuera del ordenador. Cada uno
   sirve una sola vez para entrar si pierde el móvil.

En la app aparecerá como **JURMIA Abogados (su correo)**: cada persona tiene la suya y los códigos de
una no sirven para la otra. Al activarla se cierran las demás sesiones de esa cuenta. Mientras alguien
no la tenga activada, el panel le muestra un aviso arriba para que lo haga.

**Si alguien pierde el móvil:**
- Con sus códigos de recuperación: en el acceso pulse *Usar un código de recuperación*; luego, en
  Seguridad, desactive la verificación y vuelva a activarla con el móvil nuevo.
- Sin los códigos: la otra persona del despacho entra en **Seguridad → Equipo** y pulsa
  **Quitar 2 pasos** en su cuenta, confirmando con *su* contraseña y *su* código (para eso tiene que
  tener activada la suya). Se cierran las sesiones de la cuenta afectada.
- Si nadie puede entrar: Upstash → su base de datos → *Data Browser* → borre la clave
  `seg:2fa:correo@delacuenta` y entre solo con la contraseña.

**Si sospecha algo raro:** Seguridad → *Cerrar sesión en todos mis dispositivos*, cambie la
contraseña en `ADMIN_USUARIOS` y vuelva a desplegar.

### Registro de consentimientos de cookies

El artículo 7.1 del RGPD obliga a poder **demostrar** que se obtuvo el consentimiento, y lo que
guarda el navegador no sirve como prueba: si el visitante lo borra, la prueba desaparece. Por eso cada
decisión del aviso de cookies (aceptar, rechazar o guardar la selección) se anota en el servidor con
la fecha, las categorías, el botón pulsado, la página, el texto literal mostrado y huellas
irreversibles de la IP y del navegador. Ni nombre, ni correo, ni la IP en claro. Se conserva 5 años
(24 meses de vigencia del consentimiento + 3 de prescripción) y lo anterior se borra solo. La política
de cookies y la de privacidad ya lo explican.

**Para sacarlo si lo piden** (Seguridad → *Registro de consentimientos de cookies*):
- **Descargar CSV** entre dos fechas (para Excel, separado por `;`). Cada fila lleva el
  identificador del texto mostrado; los textos literales van en un segundo CSV.
- **Buscar un visitante** por su identificador: el visitante lo ve en *Configurar cookies*, al pie de
  la web. Sale todo su historial, con el texto exacto que tenía delante en cada decisión, y se puede
  descargar en JSON.

### Archivos

```
api/_seguridad.js          sesiones, verificación en dos pasos (TOTP), límite de intentos y registro de accesos
api/_consentimientos.js    registro de consentimientos de cookies
api/_sesion.js             exigirSesion() para todas las APIs del panel (ahora asíncrona)
api/admin.js               entrada al panel (entrar, verificar, yo, salir) y blog
api/seguridad.js           API de la página de Seguridad y recepción de los consentimientos
admin/seguridad.html       página de Seguridad del panel
assets/js/panel-acceso.js  acceso en dos pasos y reautenticación, común a todos los paneles
assets/js/cookies.js       aviso de cookies (ahora envía cada decisión al registro)
tests/seguridad.test.mjs   pruebas (npm test), con un Redis simulado en tests/_redis-simulado.mjs
```

