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

`https://tudominio.es/admin` — contraseña única para el despacho. La sesión dura 12 horas.
El panel está bloqueado a buscadores con `noindex` y con `Disallow` en `robots.txt`.

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
| `ADMIN_CLAVE` | contraseña de acceso al panel |
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
- **Páginas de tema**: `/blog/tema/laboral`, `/penal`, `/civil`, `/tributario`, que refuerzan las
  páginas de área correspondientes.
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
