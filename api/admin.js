/**
 * API del panel de administración del blog.
 *
 * Guarda los artículos como archivos Markdown en el repositorio de GitHub.
 * Cada guardado genera un commit, que dispara un despliegue en Vercel y
 * regenera el HTML estático del blog.
 *
 * Variables de entorno necesarias:
 *   ADMIN_USUARIOS  lista de usuarios autorizados, separados por comas:
 *                   correo:contraseña:Nombre Apellidos, correo2:contraseña2:Nombre2
 *   ADMIN_SECRETO   cadena larga y aleatoria para firmar la sesión
 *   GITHUB_TOKEN    token de GitHub con permiso de escritura sobre el repositorio
 *   GITHUB_REPO     "usuario/repositorio"
 *   GITHUB_RAMA     rama de despliegue (por defecto "main")
 */

import crypto from "node:crypto";

const CARPETA = "contenido/blog";
const DURACION_SESION = 12 * 60 * 60 * 1000; // 12 horas

/* ---------------------------------------------------------------- */
/* Sesión                                                            */
/* ---------------------------------------------------------------- */

function firmar(datos, secreto) {
  return crypto.createHmac("sha256", secreto).update(datos).digest("base64url");
}

function crearToken(usuario, secreto) {
  const datos = Buffer.from(
    JSON.stringify({
      correo: usuario.correo,
      nombre: usuario.nombre,
      caduca: Date.now() + DURACION_SESION,
    })
  ).toString("base64url");
  return datos + "." + firmar(datos, secreto);
}

function leerToken(token, secreto) {
  if (!token || !token.includes(".")) return null;
  const [datos, firma] = token.split(".");
  const esperada = firmar(datos, secreto);
  if (firma.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  try {
    const sesion = JSON.parse(Buffer.from(datos, "base64url").toString("utf8"));
    return sesion.caduca > Date.now() ? sesion : null;
  } catch {
    return null;
  }
}

function comparaClave(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Lee ADMIN_USUARIOS y devuelve la lista de usuarios autorizados.
 * Formato: "correo:clave:Nombre Apellidos, correo2:clave2:Nombre2"
 * La contraseña no puede contener comas ni dos puntos.
 */
function usuariosAutorizados() {
  return (process.env.ADMIN_USUARIOS || "")
    .split(/[,\n]/)
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      const partes = linea.split(":");
      if (partes.length < 2) return null;
      return {
        correo: partes[0].trim().toLowerCase(),
        clave: partes[1].trim(),
        nombre: (partes[2] || "").trim() || partes[0].trim(),
      };
    })
    .filter(Boolean);
}

/* ---------------------------------------------------------------- */
/* GitHub                                                            */
/* ---------------------------------------------------------------- */

async function github(ruta, opciones = {}) {
  const respuesta = await fetch("https://api.github.com" + ruta, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "jurmia-abogados-panel",
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const texto = await respuesta.text();
  let cuerpo = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  return { ok: respuesta.ok, estado: respuesta.status, cuerpo };
}

const repo = () => process.env.GITHUB_REPO;
const rama = () => process.env.GITHUB_RAMA || "main";

async function listarArchivos() {
  const r = await github(`/repos/${repo()}/contents/${CARPETA}?ref=${rama()}`);
  if (r.estado === 404) return [];
  if (!r.ok) throw new Error("No se pudo leer la carpeta de artículos");
  return (Array.isArray(r.cuerpo) ? r.cuerpo : []).filter((f) => f.name.endsWith(".md"));
}

async function leerArchivo(nombre) {
  const r = await github(`/repos/${repo()}/contents/${CARPETA}/${nombre}?ref=${rama()}`);
  if (!r.ok) return null;
  return {
    sha: r.cuerpo.sha,
    contenido: Buffer.from(r.cuerpo.content, "base64").toString("utf8"),
  };
}

async function guardarArchivo(ruta, contenido, mensaje, sha) {
  const r = await github(`/repos/${repo()}/contents/${ruta}`, {
    method: "PUT",
    body: JSON.stringify({
      message: mensaje,
      content: Buffer.from(contenido).toString("base64"),
      branch: rama(),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) throw new Error("GitHub rechazó el guardado: " + JSON.stringify(r.cuerpo).slice(0, 200));
  return r.cuerpo;
}

async function borrarArchivo(nombre, sha, mensaje) {
  const r = await github(`/repos/${repo()}/contents/${CARPETA}/${nombre}`, {
    method: "DELETE",
    body: JSON.stringify({ message: mensaje, sha, branch: rama() }),
  });
  if (!r.ok) throw new Error("No se pudo borrar el artículo");
}

/* ---------------------------------------------------------------- */
/* Markdown con portada                                              */
/* ---------------------------------------------------------------- */

const CAMPOS = [
  // identificación
  "titulo",
  "slug",
  "fecha",
  "actualizado",
  "autor",
  "autorCargo",
  "area",
  "resumen",
  // seo
  "metaTitulo",
  "metaDescripcion",
  "palabraClave",
  "canonical",
  "tipo",
  "noindex",
  // imagen
  "imagen",
  "imagenAlt",
  // tipografía del artículo
  "fuente",
  "tamano",
  "interlineado",
  "espaciado",
  "ancho",
  "indice",
  // estado
  "publicado",
  "destacado",
];

function componer(datos) {
  const lineas = CAMPOS.filter((c) => datos[c] !== undefined && datos[c] !== "").map((c) => {
    const v = datos[c];
    return typeof v === "boolean" ? `${c}: ${v}` : `${c}: "${String(v).replace(/"/g, "'")}"`;
  });
  return "---\n" + lineas.join("\n") + "\n---\n\n" + (datos.cuerpo || "").trim() + "\n";
}

function descomponer(texto) {
  const datos = { cuerpo: "" };
  const limpio = texto.replace(/^\uFEFF/, "").trimStart();
  if (!limpio.startsWith("---")) return { ...datos, cuerpo: limpio };
  const fin = limpio.indexOf("\n---", 3);
  if (fin === -1) return { ...datos, cuerpo: limpio };
  for (const linea of limpio.slice(3, fin).split("\n")) {
    const corte = linea.indexOf(":");
    if (corte === -1 || !linea.trim()) continue;
    const clave = linea.slice(0, corte).trim();
    let valor = linea.slice(corte + 1).trim().replace(/^["']|["']$/g, "");
    if (valor === "true") valor = true;
    else if (valor === "false") valor = false;
    datos[clave] = valor;
  }
  datos.cuerpo = limpio.slice(fin + 4).trimStart();
  return datos;
}

const alSlug = (t) =>
  String(t)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/* ---------------------------------------------------------------- */
/* Punto de entrada                                                  */
/* ---------------------------------------------------------------- */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const secreto = process.env.ADMIN_SECRETO;
  const usuarios = usuariosAutorizados();
  if (!secreto || usuarios.length === 0 || !process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
    return res.status(500).json({
      error:
        "El panel no está configurado. Faltan variables de entorno en Vercel (ADMIN_USUARIOS, ADMIN_SECRETO, GITHUB_TOKEN, GITHUB_REPO).",
    });
  }

  const datos = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const accion = datos.accion;

  // Entrada al panel
  if (accion === "entrar") {
    await new Promise((r) => setTimeout(r, 400)); // freno básico a la fuerza bruta
    const correo = String(datos.correo || "").trim().toLowerCase();
    const usuario = usuarios.find((u) => u.correo === correo);
    // Se comprueba la contraseña aunque el correo no exista, para no revelar
    // qué correos están dados de alta.
    const valida = comparaClave(datos.clave || "", usuario ? usuario.clave : "\u0000");
    if (!usuario || !valida) {
      return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    }
    return res.status(200).json({
      token: crearToken(usuario, secreto),
      nombre: usuario.nombre,
      correo: usuario.correo,
    });
  }

  // El resto de acciones exigen sesión
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const sesion = leerToken(token, secreto);
  if (!sesion) {
    return res.status(401).json({ error: "Sesión caducada. Vuelva a entrar." });
  }
  // Si el usuario ha sido dado de baja en ADMIN_USUARIOS, su sesión deja de valer.
  if (!usuarios.some((u) => u.correo === sesion.correo)) {
    return res.status(401).json({ error: "Este usuario ya no tiene acceso al panel." });
  }

  try {
    switch (accion) {
      case "listar": {
        const archivos = await listarArchivos();
        const articulos = [];
        for (const f of archivos) {
          const contenido = await leerArchivo(f.name);
          if (!contenido) continue;
          const d = descomponer(contenido.contenido);
          articulos.push({
            archivo: f.name,
            titulo: d.titulo || f.name,
            fecha: d.fecha || "",
            area: d.area || "",
            slug: d.slug || f.name.replace(/\.md$/, ""),
            publicado: d.publicado !== false,
          });
        }
        articulos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
        return res.status(200).json({ articulos });
      }

      case "abrir": {
        const contenido = await leerArchivo(datos.archivo);
        if (!contenido) return res.status(404).json({ error: "Artículo no encontrado" });
        return res.status(200).json({
          articulo: descomponer(contenido.contenido),
          sha: contenido.sha,
          archivo: datos.archivo,
        });
      }

      case "guardar": {
        const a = datos.articulo || {};
        if (!a.titulo || !a.fecha || !a.cuerpo) {
          return res.status(400).json({ error: "Faltan el título, la fecha o el cuerpo del artículo" });
        }
        if (!a.metaDescripcion && !a.resumen) {
          return res.status(400).json({ error: "Escriba al menos un resumen: se usa como meta description" });
        }
        a.slug = alSlug(a.slug || a.titulo);
        a.actualizado = new Date().toISOString().slice(0, 10);

        const nombre = datos.archivo || `${a.fecha}-${a.slug}.md`;
        let sha = datos.sha;
        if (!sha) {
          const existente = await leerArchivo(nombre);
          if (existente) sha = existente.sha;
        }
        const resultado = await guardarArchivo(
          `${CARPETA}/${nombre}`,
          componer(a),
          `${datos.archivo ? "Actualiza" : "Publica"} el artículo: ${a.titulo} (${sesion.nombre})`,
          sha
        );
        return res.status(200).json({ ok: true, archivo: nombre, sha: resultado.content?.sha });
      }

      case "borrar": {
        const contenido = await leerArchivo(datos.archivo);
        if (!contenido) return res.status(404).json({ error: "Artículo no encontrado" });
        await borrarArchivo(
          datos.archivo,
          contenido.sha,
          `Elimina el artículo ${datos.archivo} (${sesion.nombre})`
        );
        return res.status(200).json({ ok: true });
      }

      case "subirImagen": {
        const { nombre, base64 } = datos;
        if (!nombre || !base64) return res.status(400).json({ error: "Falta la imagen" });
        const limpio = alSlug(nombre.replace(/\.[^.]+$/, ""));
        const extension = (nombre.match(/\.[a-zA-Z0-9]+$/) || [".jpg"])[0].toLowerCase();
        if (![".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(extension)) {
          return res.status(400).json({ error: "Formato no admitido. Use JPG, PNG, WebP o AVIF." });
        }
        const bytes = Buffer.from(base64, "base64");
        if (bytes.length > 3 * 1024 * 1024) {
          return res.status(400).json({ error: "La imagen supera los 3 MB. Redúzcala antes de subirla." });
        }
        const ruta = `assets/img/blog/${limpio}${extension}`;
        const existente = await github(`/repos/${repo()}/contents/${ruta}?ref=${rama()}`);
        await guardarArchivo(
          ruta,
          bytes,
          `Sube la imagen ${limpio}${extension}`,
          existente.ok ? existente.cuerpo.sha : undefined
        );
        return res.status(200).json({ ok: true, ruta: "/" + ruta });
      }

      default:
        return res.status(400).json({ error: "Acción desconocida" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Error inesperado" });
  }
}
