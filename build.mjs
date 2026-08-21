/**
 * Generador del blog de JURMIA Abogados.
 *
 * Lee los artículos en Markdown de contenido/blog/ y escribe HTML estático en /blog,
 * además del feed RSS y el sitemap. Se ejecuta en cada despliegue de Vercel.
 *
 *   node build.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

const RAIZ = path.dirname(new URL(import.meta.url).pathname);
const DOMINIO = (process.env.SITIO_URL || "https://www.jurmiabogados.es").replace(/\/$/, "");
const ORIGEN = path.join(RAIZ, "contenido", "blog");
const DESTINO = path.join(RAIZ, "blog");
const POR_PAGINA = 8;

marked.setOptions({ gfm: true, breaks: false });

/** Añade un id a cada H2 y H3 para poder enlazarlos desde el índice. */
function conAnclas(html) {
  const usados = new Set();
  return html.replace(/<(h[23])>(.*?)<\/\1>/gi, (_, etiqueta, contenido) => {
    const texto = contenido.replace(/<[^>]+>/g, "");
    let id = "s-" + alSlug(texto);
    let n = 2;
    while (usados.has(id)) id = "s-" + alSlug(texto) + "-" + n++;
    usados.add(id);
    return `<${etiqueta} id="${id}">${contenido}</${etiqueta}>`;
  });
}

/* ------------------------------------------------------------------ */
/* Lectura de artículos                                                */
/* ------------------------------------------------------------------ */

function separarPortada(texto) {
  const limpio = texto.replace(/^\uFEFF/, "").trimStart();
  if (!limpio.startsWith("---")) return { datos: {}, cuerpo: limpio };
  const fin = limpio.indexOf("\n---", 3);
  if (fin === -1) return { datos: {}, cuerpo: limpio };
  const bruto = limpio.slice(3, fin);
  const cuerpo = limpio.slice(fin + 4).trimStart();
  const datos = {};
  for (const linea of bruto.split("\n")) {
    const corte = linea.indexOf(":");
    if (corte === -1 || !linea.trim() || linea.trimStart().startsWith("#")) continue;
    const clave = linea.slice(0, corte).trim();
    let valor = linea.slice(corte + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (valor === "true") valor = true;
    else if (valor === "false") valor = false;
    datos[clave] = valor;
  }
  return { datos, cuerpo };
}

const esc = (t = "") =>
  String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const acentos = (t) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const alSlug = (t) =>
  acentos(t).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

const fechaLarga = (iso) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });

/**
 * Convierte los avisos "!!! texto" en cajas destacadas antes de pasar por Markdown.
 */
function prepararCuerpo(md) {
  return md.replace(/^!!!\s+(.+)$/gm, (_, texto) => `<aside class="dato-clave">${texto}</aside>`);
}

/**
 * Extrae la sección "## Preguntas frecuentes" si existe.
 * Cada "### Pregunta" seguida de su respuesta se convierte en acordeón y en
 * datos estructurados FAQPage, que es lo que Google puede mostrar desplegado.
 */
function extraerFaq(md) {
  const inicio = md.search(/^##\s+Preguntas frecuentes\s*$/im);
  if (inicio === -1) return { cuerpo: md, faq: [] };

  const resto = md.slice(inicio);
  const finRelativo = resto.slice(3).search(/^##\s+(?!#)/m);
  const bloque = finRelativo === -1 ? resto : resto.slice(0, finRelativo + 3);
  const cuerpo = md.slice(0, inicio) + (finRelativo === -1 ? "" : resto.slice(finRelativo + 3));

  const faq = [];
  const partes = bloque.split(/^###\s+/m).slice(1);
  for (const parte of partes) {
    const salto = parte.indexOf("\n");
    const pregunta = (salto === -1 ? parte : parte.slice(0, salto)).trim();
    const respuesta = (salto === -1 ? "" : parte.slice(salto)).trim();
    if (pregunta && respuesta) faq.push({ pregunta, respuesta });
  }
  return { cuerpo, faq };
}

async function leerArticulos() {
  let archivos = [];
  try {
    archivos = (await fs.readdir(ORIGEN)).filter((f) => f.endsWith(".md"));
  } catch {
    await fs.mkdir(ORIGEN, { recursive: true });
  }

  const articulos = [];
  for (const archivo of archivos) {
    const texto = await fs.readFile(path.join(ORIGEN, archivo), "utf8");
    const { datos, cuerpo } = separarPortada(texto);
    if (datos.publicado === false) continue;
    if (!datos.titulo || !datos.fecha) {
      console.warn("Se omite " + archivo + ": faltan título o fecha");
      continue;
    }
    const slug = datos.slug || alSlug(archivo.replace(/\.md$/, ""));
    const palabras = cuerpo.split(/\s+/).filter(Boolean).length;
    const { cuerpo: sinFaq, faq } = extraerFaq(cuerpo);
    articulos.push({
      slug,
      titulo: datos.titulo,
      metaTitulo: datos.metaTitulo || datos.titulo + " | Blog jurídico de JURMIA Abogados",
      resumen: datos.resumen || "",
      metaDescripcion: (datos.metaDescripcion || datos.resumen || "").slice(0, 300),
      fecha: String(datos.fecha).slice(0, 10),
      actualizado: String(datos.actualizado || datos.fecha).slice(0, 10),
      autor: datos.autor || "JURMIA Abogados",
      area: datos.area || "General",
      imagen: datos.imagen || "",
      imagenAlt: datos.imagenAlt || datos.titulo,
      destacado: datos.destacado === true,
      minutos: Math.max(1, Math.round(palabras / 200)),
      html: conAnclas(marked.parse(prepararCuerpo(sinFaq))),
      faq: faq.map((f) => ({ pregunta: f.pregunta, html: marked.parse(f.respuesta) })),

      // --- ajustes tipográficos del artículo ---
      fuente: datos.fuente || "serif",
      tamano: datos.tamano || "normal",
      interlineado: datos.interlineado || "normal",
      espaciado: datos.espaciado || "normal",
      ancho: datos.ancho || "normal",
      indice: datos.indice === true,

      // --- ajustes de SEO ---
      palabraClave: datos.palabraClave || "",
      canonical: datos.canonical || "",
      noindex: datos.noindex === true,
      autorCargo: datos.autorCargo || "",
      tipo: datos.tipo || "BlogPosting",
    });
  }

  articulos.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return articulos;
}

/* ------------------------------------------------------------------ */
/* Plantilla común                                                     */
/* ------------------------------------------------------------------ */

const FUENTES = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,300..600&display=swap" rel="stylesheet">`;

const CABECERA = `<header class="cabecera fijada">
    <div class="envoltura cabecera-fila">
    <a class="marca" href="/" aria-label="JURMIA Abogados, inicio">
  <img
    src="/assets/img/jurmia-logo.png"
    alt="JURMIA Abogados"
    width="1290"
    height="446"
    style="height: 50px; width: auto; max-width: none; display: block;"
  >
</a>
    <button class="abrir-menu" id="abrir-menu" aria-expanded="false" aria-controls="navegacion">Menú</button>
    <nav class="navegacion" id="navegacion" aria-label="Principal">
      <a href="/areas/civil">Civil</a>
      <a href="/areas/penal">Penal</a>
      <a href="/areas/laboral">Laboral</a>
      <a href="/areas/tributario">Tributario</a>
      <a href="/blog">Blog</a>
      <a href="/#despachos">Despachos</a>
      <a class="boton" href="/#contacto">Plantear mi consulta</a>
    </nav>
  </div>
</header>`;

const PIE = `<footer class="pie">
  <div class="envoltura">
    <div class="pie-rejilla">
      <div>
        <img src="/assets/img/jurmia-logo-blanco.png" alt="JURMIA Abogados" width="1290" height="446" style="width:150px;height:auto">
        <p style="margin-top:1.25rem;max-width:34ch">Despacho de abogados en Madrid, Valencia y Castellón, con actuación en toda España.</p>
      </div>
      <div>
        <h4>Áreas</h4>
        <ul>
          <li><a href="/areas/civil">Derecho civil</a></li>
          <li><a href="/areas/penal">Derecho penal</a></li>
          <li><a href="/areas/laboral">Derecho laboral</a></li>
          <li><a href="/areas/tributario">Derecho tributario</a></li>
        </ul>
      </div>
      <div>
        <h4>Despachos</h4>
        <ul>
          <li><a href="/despachos/madrid">Abogados en Madrid</a></li>
          <li><a href="/despachos/valencia">Abogados en Valencia</a></li>
          <li><a href="/despachos/castellon">Abogados en Castellón</a></li>
        </ul>
      </div>
      <div>
        <h4>Información legal</h4>
        <ul>
          <li><a href="/blog">Blog jurídico</a></li>
          <li><a href="/aviso-legal">Aviso legal</a></li>
          <li><a href="/privacidad">Política de privacidad</a></li>
          <li><a href="/politica-cookies">Política de cookies</a></li>
          <li><a href="#" data-cookies="configurar">Configurar cookies</a></li>
        </ul>
      </div>
    </div>
    <div class="pie-legal">
      <span>© <span id="anio">2026</span> JURMIA Abogados. Todos los derechos reservados</span>
    </div>
  </div>
</footer>`;

function documento({ titulo, descripcion, url, cuerpo, jsonld = [], og = {}, extraHead = "", canonical = "", noindex = false }) {
  const imagen = og.imagen || DOMINIO + "/assets/img/jurmia-logo.png";
  const ld = jsonld
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${canonical || url}">
<meta name="robots" content="${noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1"}">
<meta property="og:type" content="${og.tipo || "website"}">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="JURMIA Abogados">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${imagen}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<meta name="twitter:image" content="${imagen}">
<link rel="alternate" type="application/rss+xml" title="Blog jurídico de JURMIA Abogados" href="${DOMINIO}/rss.xml">
<meta name="theme-color" content="#06365a">
<meta name="format-detection" content="telephone=yes">
<meta name="apple-mobile-web-app-title" content="JURMIA Abogados">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/assets/img/icono-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/img/icono-192.png">
${FUENTES}
<link rel="stylesheet" href="/assets/css/estilos.css">
${extraHead}
${ld}
</head>
<body>
<a class="salto-contenido" href="#contenido">Ir al contenido principal</a>
${CABECERA}
<main id="contenido">
${cuerpo}
</main>
${PIE}
<script src="/assets/js/main.js" defer></script>
<script src="/assets/js/cookies.js" defer></script>
</body>
</html>
`;
}

function migas(items) {
  return `  <nav class="miga" aria-label="Ruta de navegación" style="padding-top: 25px;">
    <div class="envoltura"><ol>${items
      .map(([t, u]) => (u ? `<li><a href="${u}">${esc(t)}</a></li>` : `<li>${esc(t)}</li>`))
      .join("")}</ol></div>
  </nav>`;
}

function ldMigas(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([t, u], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t,
      item: DOMINIO + (u || ""),
    })),
  };
}

function tarjeta(a) {
  return `<article class="tarjeta-articulo">
  <a href="/blog/${a.slug}">
    <span class="tarjeta-meta"><span class="etiqueta-area">${esc(a.area)}</span><time datetime="${a.fecha}">${fechaLarga(a.fecha)}</time></span>
    <h3>${esc(a.titulo)}</h3>
    <p>${esc(a.resumen)}</p>
    <span class="tarjeta-pie">${a.minutos} min de lectura</span>
  </a>
</article>`;
}

/* ------------------------------------------------------------------ */
/* Páginas del blog                                                    */
/* ------------------------------------------------------------------ */

async function escribir(rutaRelativa, contenido) {
  const destino = path.join(RAIZ, rutaRelativa);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, contenido, "utf8");
}

function listado({ articulos, titulo, h1, descripcion, url, ruta, pagina, paginas, migasItems, intro }) {
    const enlacePagina = (n) => (n === 1 ? ruta.replace(/\/$/, "") || "/" : `${ruta}pagina/${n}`);

  function numeros(actual, total) {
    const lista = [];
    for (let n = 1; n <= total; n++) {
      if (n === 1 || n === total || Math.abs(n - actual) <= 1) lista.push(n);
      else if (lista[lista.length - 1] !== "…") lista.push("…");
    }
    return lista;
  }

  const navPaginas =
    paginas > 1
      ? `<nav class="paginacion" aria-label="Paginación">
      ${pagina > 1 ? `<a href="${enlacePagina(pagina - 1)}" rel="prev" aria-label="Página anterior">←</a>` : ""}
      ${numeros(pagina, paginas)
        .map((n) =>
          n === "…"
            ? '<span class="salto" aria-hidden="true">…</span>'
            : n === pagina
              ? `<span class="pagina-actual" aria-current="page">${n}</span>`
              : `<a href="${enlacePagina(n)}" aria-label="Página ${n}">${n}</a>`
        )
        .join("\n      ")}
      ${pagina < paginas ? `<a href="${enlacePagina(pagina + 1)}" rel="next" aria-label="Página siguiente">→</a>` : ""}
      <span class="paginacion-estado">Página ${pagina} de ${paginas}</span>
    </nav>`
      : "";

  const cuerpo = `${migas(migasItems)}
  <section class="interior-portada">
    <div class="envoltura">
      <span class="rotulo">Blog jurídico</span>
      <h1>${esc(h1)}</h1>
      <p class="entradilla">${intro}</p>
    </div>
  </section>

  <section class="seccion seccion-listado">
    <div class="envoltura">
      <nav class="filtros-blog" aria-label="Temas del blog">
        <a href="/blog"${ruta === "/blog/" ? ' class="activo"' : ""}>Todos</a>
        <a href="/blog/tema/civil">Civil</a>
        <a href="/blog/tema/penal">Penal</a>
        <a href="/blog/tema/laboral">Laboral</a>
        <a href="/blog/tema/tributario">Tributario</a>
      </nav>
      <div class="rejilla-articulos">
${articulos.map(tarjeta).join("\n")}
      </div>
      ${articulos.length === 0 ? '<p class="entradilla">Todavía no hay artículos publicados en esta sección.</p>' : ""}
      ${navPaginas}
    </div>
  </section>

  <section class="franja-cta">
    <div class="envoltura">
      <h2>¿Su situación se parece a alguno de estos casos?</h2>
      <p>Los artículos son información general. Cada asunto tiene sus plazos y sus matices: cuéntenos el suyo y le damos una valoración concreta en 24 horas laborables.</p>
      <a class="boton boton-claro" href="/#contacto">Plantear mi consulta</a>
    </div>
  </section>`;

  const ldLista = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": DOMINIO + "/blog#blog",
    name: "Blog jurídico de JURMIA Abogados",
    url: DOMINIO + "/blog",
    inLanguage: "es-ES",
    publisher: { "@type": "Organization", name: "JURMIA Abogados", url: DOMINIO + "/" },
    blogPost: articulos.map((a) => ({
      "@type": "BlogPosting",
      headline: a.titulo,
      url: DOMINIO + "/blog/" + a.slug,
      datePublished: a.fecha,
    })),
  };

  return documento({
    titulo,
    descripcion,
    url,
    cuerpo,
    jsonld: [ldMigas(migasItems), ldLista],
  });
}

const TIPOGRAFIA = {
  fuente: { serif: "var(--texto)", sans: "var(--display)" },
  tamano: { compacto: "1rem", normal: "1.0625rem", grande: "1.1875rem" },
  interlineado: { compacto: "1.55", normal: "1.72", amplio: "1.9" },
  espaciado: { compacto: "0.9rem", normal: "1.35rem", amplio: "1.9rem" },
  ancho: { estrecho: "60ch", normal: "68ch", ancho: "78ch" },
};

function estiloArticulo(a) {
  const t = TIPOGRAFIA;
  return [
    `--art-fuente:${t.fuente[a.fuente] || t.fuente.serif}`,
    `--art-tamano:${t.tamano[a.tamano] || t.tamano.normal}`,
    `--art-interlineado:${t.interlineado[a.interlineado] || t.interlineado.normal}`,
    `--art-espaciado:${t.espaciado[a.espaciado] || t.espaciado.normal}`,
    `--art-ancho:${t.ancho[a.ancho] || t.ancho.normal}`,
  ].join(";");
}

/** Índice de contenidos a partir de los H2 del artículo. */
function indiceHtml(html) {
  const encabezados = [...html.matchAll(/<h2[^>]*id="([^"]*)"[^>]*>(.*?)<\/h2>/gi)];
  if (encabezados.length < 3) return "";
  return `<nav class="indice-articulo" aria-label="Contenido del artículo">
        <p class="indice-titulo">En este artículo</p>
        <ol>${encabezados
          .map(([, id, texto]) => `<li><a href="#${id}">${texto.replace(/<[^>]+>/g, "")}</a></li>`)
          .join("")}</ol>
      </nav>`;
}

function articuloHtml(a, relacionados) {
  const migasItems = [
    ["Inicio", "/"],
    ["Blog", "/blog"],
    [a.area, "/blog/tema/" + alSlug(a.area)],
    [a.titulo, null],
  ];
  const url = DOMINIO + "/blog/" + a.slug;
  const imagen = a.imagen ? (a.imagen.startsWith("http") ? a.imagen : DOMINIO + a.imagen) : "";

  const ldArticulo = {
    "@context": "https://schema.org",
    "@type": a.tipo || "BlogPosting",
    "@id": url + "#articulo",
    headline: a.titulo.slice(0, 110),
    description: a.metaDescripcion,
    inLanguage: "es-ES",
    datePublished: a.fecha,
    dateModified: a.actualizado,
    wordCount: a.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length,
    articleSection: a.area,
    author: {
      "@type": "Person",
      name: a.autor,
      url: DOMINIO + "/",
      ...(a.autorCargo ? { jobTitle: a.autorCargo } : {}),
      worksFor: { "@type": "Organization", name: "JURMIA Abogados", url: DOMINIO + "/" },
    },
    ...(a.palabraClave ? { keywords: a.palabraClave } : {}),
    publisher: {
      "@type": "Organization",
      name: "JURMIA Abogados",
      url: DOMINIO + "/",
      logo: { "@type": "ImageObject", url: DOMINIO + "/assets/img/jurmia-logo.png" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    isPartOf: { "@id": DOMINIO + "/blog#blog" },
    ...(imagen ? { image: [imagen] } : {}),
  };

  const ldFaq = a.faq.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: a.faq.map((f) => ({
          "@type": "Question",
          name: f.pregunta,
          acceptedAnswer: { "@type": "Answer", text: f.html.replace(/<[^>]+>/g, " ").trim() },
        })),
      }
    : null;

  const faqHtml = a.faq.length
    ? `<section class="preguntas-articulo">
        <h2>Preguntas frecuentes</h2>
        <div class="preguntas">
          ${a.faq
            .map(
              (f) => `<details>
            <summary>${esc(f.pregunta)}</summary>
            <div class="respuesta">${f.html}</div>
          </details>`
            )
            .join("\n          ")}
        </div>
      </section>`
    : "";

  const cuerpo = `${migas(migasItems)}
  <article class="articulo">
    <header class="articulo-cabecera">
      <div class="envoltura">
        <span class="etiqueta-area">${esc(a.area)}</span>
        <h1>${esc(a.titulo)}</h1>
        <p class="entradilla">${esc(a.resumen)}</p>
        <p class="articulo-datos">
          Por ${esc(a.autor)} ·
          <time datetime="${a.fecha}">${fechaLarga(a.fecha)}</time>${
            a.actualizado !== a.fecha
              ? ` · <span>Actualizado el <time datetime="${a.actualizado}">${fechaLarga(a.actualizado)}</time></span>`
              : ""
          } · ${a.minutos} min de lectura
        </p>
      </div>
    </header>

    ${
      a.imagen
        ? `<div class="envoltura"><img class="articulo-imagen" src="${esc(a.imagen)}" alt="${esc(a.imagenAlt)}" loading="eager"></div>`
        : ""
    }

    <div class="envoltura">
      <div class="articulo-cuerpo" style="${estiloArticulo(a)}">
${a.indice ? indiceHtml(a.html) : ""}
${a.html}
${faqHtml}
      </div>

      <aside class="articulo-aviso">
        <p><strong>Este artículo es información general y no sustituye al asesoramiento jurídico.</strong>
        La aplicación de la norma depende de las circunstancias concretas de cada asunto y de los plazos
        aplicables. Si su situación se parece a la descrita, consúltelo antes de actuar.</p>
      </aside>
    </div>
  </article>

  <section class="franja-cta">
    <div class="envoltura">
      <h2>¿Le afecta lo que acaba de leer?</h2>
      <p>Cuéntenos su caso y le decimos en 24 horas laborables si tiene recorrido, qué plazos corren y qué coste tendría.</p>
      <a class="boton boton-claro" href="/#contacto">Plantear mi consulta</a>
    </div>
  </section>

  ${
    relacionados.length
      ? `<section class="seccion">
    <div class="envoltura">
      <span class="rotulo">Seguir leyendo</span>
      <h2 class="titulo-seccion">Otros artículos de ${esc(a.area).toLowerCase()}.</h2>
      <div class="rejilla-articulos">
${relacionados.map(tarjeta).join("\n")}
      </div>
    </div>
  </section>`
      : ""
  }`;

  return documento({
    titulo: a.metaTitulo,
    descripcion: a.metaDescripcion,
    url,
    cuerpo,
    jsonld: [ldMigas(migasItems), ldArticulo, ...(ldFaq ? [ldFaq] : [])],
    canonical: a.canonical,
    noindex: a.noindex,
    og: { tipo: "article", imagen: imagen || undefined },
    extraHead: `<meta property="article:published_time" content="${a.fecha}">
<meta property="article:modified_time" content="${a.actualizado}">
<meta property="article:section" content="${esc(a.area)}">
<meta property="article:author" content="${esc(a.autor)}">`,
  });
}

/* ------------------------------------------------------------------ */
/* RSS y sitemap                                                       */
/* ------------------------------------------------------------------ */

function rss(articulos) {
  const items = articulos
    .slice(0, 30)
    .map(
      (a) => `    <item>
      <title>${esc(a.titulo)}</title>
      <link>${DOMINIO}/blog/${a.slug}</link>
      <guid isPermaLink="true">${DOMINIO}/blog/${a.slug}</guid>
      <description>${esc(a.resumen)}</description>
      <category>${esc(a.area)}</category>
      <pubDate>${new Date(a.fecha + "T09:00:00Z").toUTCString()}</pubDate>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog jurídico de JURMIA Abogados</title>
    <link>${DOMINIO}/blog</link>
    <atom:link href="${DOMINIO}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Novedades y análisis en derecho civil, penal, laboral y tributario.</description>
    <language>es-ES</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

function sitemap(articulos, temas) {
  const hoy = new Date().toISOString().slice(0, 10);
  const fijas = [
    ["/", "1.0", hoy],
    ["/areas/civil", "0.9", hoy],
    ["/areas/penal", "0.9", hoy],
    ["/areas/laboral", "0.9", hoy],
    ["/areas/tributario", "0.9", hoy],
    ["/despachos/madrid", "0.8", hoy],
    ["/despachos/valencia", "0.8", hoy],
    ["/despachos/castellon", "0.8", hoy],
    ["/blog", "0.8", articulos[0]?.actualizado || hoy],
    ["/aviso-legal", "0.2", hoy],
    ["/privacidad", "0.2", hoy],
    ["/politica-cookies", "0.2", hoy],
  ];
  const temaUrls = temas.map((t) => ["/blog/tema/" + alSlug(t), "0.5", hoy]);
  const posts = articulos.map((a) => ["/blog/" + a.slug, "0.7", a.actualizado]);

  const cuerpo = [...fijas, ...temaUrls, ...posts]
    .map(
      ([u, p, m]) =>
        `  <url><loc>${DOMINIO}${u}</loc><lastmod>${m}</lastmod><changefreq>monthly</changefreq><priority>${p}</priority></url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${cuerpo}
</urlset>
`;
}

/* ------------------------------------------------------------------ */
/* Ejecución                                                           */
/* ------------------------------------------------------------------ */

const articulos = await leerArticulos();
await fs.rm(DESTINO, { recursive: true, force: true });

const TEMAS = ["Civil", "Penal", "Laboral", "Tributario"];

// listado general, paginado
const paginas = Math.max(1, Math.ceil(articulos.length / POR_PAGINA));
for (let i = 1; i <= paginas; i++) {
  const trozo = articulos.slice((i - 1) * POR_PAGINA, i * POR_PAGINA);
  const esPrimera = i === 1;
  const html = listado({
    articulos: trozo,
    titulo: esPrimera
      ? "Blog jurídico | Noticias y análisis | JURMIA Abogados"
      : `Blog jurídico, página ${i} | JURMIA Abogados`,
    h1: "Blog jurídico",
    descripcion:
      "Novedades legislativas, sentencias y análisis práctico en derecho civil, penal, laboral y tributario, explicados por los abogados de JURMIA.",
    url: DOMINIO + (esPrimera ? "/blog" : `/blog/pagina/${i}`),
    ruta: "/blog/",
    pagina: i,
    paginas,
    migasItems: [["Inicio", "/"], ["Blog", null]],
    intro:
      "Novedades legislativas, sentencias relevantes y análisis práctico, escritos por los abogados del despacho a partir de asuntos reales.",
  });
  await escribir(esPrimera ? "blog/index.html" : `blog/pagina/${i}.html`, html);
}

// listados por tema
for (const tema of TEMAS) {
  const propios = articulos.filter((a) => acentos(a.area) === acentos(tema));
  const html = listado({
    articulos: propios,
    titulo: `Blog de derecho ${tema.toLowerCase()} | JURMIA Abogados`,
    h1: `Artículos de derecho ${tema.toLowerCase()}`,
    descripcion: `Novedades, sentencias y análisis práctico en derecho ${tema.toLowerCase()}, por los abogados de JURMIA.`,
    url: DOMINIO + "/blog/tema/" + alSlug(tema),
    ruta: "/blog/tema/" + alSlug(tema) + "/",
    pagina: 1,
    paginas: 1,
    migasItems: [["Inicio", "/"], ["Blog", "/blog"], [tema, null]],
    intro: `Todo lo que publicamos sobre derecho ${tema.toLowerCase()}. Si busca el detalle de nuestros servicios, está en la página de <a href="/areas/${alSlug(tema)}">derecho ${tema.toLowerCase()}</a>.`,
  });
  await escribir(`blog/tema/${alSlug(tema)}.html`, html);
}

// artículos
for (const a of articulos) {
  const relacionados = articulos
    .filter((o) => o.slug !== a.slug && acentos(o.area) === acentos(a.area))
    .slice(0, 3);
  await escribir(`blog/${a.slug}.html`, articuloHtml(a, relacionados));
}

await escribir("rss.xml", rss(articulos));
await escribir("sitemap.xml", sitemap(articulos, TEMAS));

console.log(`Blog generado: ${articulos.length} artículo(s), ${paginas} página(s) de listado.`);
