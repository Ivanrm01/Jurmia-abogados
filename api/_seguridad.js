/**
 * SEGURIDAD DEL PANEL /admin · JURMIA Abogados
 * ---------------------------------------------------------------------------
 * Todo el acceso al panel pasa por aquí:
 *
 *  · Cada persona entra con su correo y su contraseña (ADMIN_USUARIOS).
 *  · Verificación en dos pasos opcional para cada cuenta, con su propia app
 *    (Google Authenticator, Microsoft Authenticator, Authy, 1Password…) y
 *    códigos de recuperación de un solo uso.
 *  · Sesiones guardadas en el servidor (Redis): se pueden ver y cerrar desde
 *    el panel, caducan tras 30 minutos sin actividad y, como máximo, a las
 *    12 horas. En el navegador queda un token aleatorio; en Redis, solo su
 *    huella SHA-256: quien leyera la base de datos no podría entrar con ella.
 *  · Límite de intentos por conexión y por cuenta, con bloqueo temporal.
 *  · Registro de los últimos accesos (correctos y fallidos) y de los cambios
 *    de seguridad.
 *  · Si se cambia la contraseña de alguien en ADMIN_USUARIOS, sus sesiones
 *    abiertas dejan de valer en la siguiente petición.
 *
 * Usa el mismo Redis que los expedientes (véase _almacen.js), con claves
 * propias que empiezan por «seg:»:
 *
 *   seg:ses:<huella>           JSON   sesión (caduca sola por inactividad)
 *   seg:sesiones:<correo>      ZSET   huellas de las sesiones de esa cuenta
 *   seg:reto:<huella>          JSON   paso intermedio del login con 2FA (5 min)
 *   seg:reto-n:<huella>        número códigos fallados en ese paso
 *   seg:2fa:<correo>           JSON   clave de la app y fecha de activación
 *   seg:2fa-rec:<correo>       SET    huellas de los códigos de recuperación
 *   seg:2fa-ultimo:<correo>    número último código de la app aceptado
 *   seg:2fa-usado:<correo>:…   marca  impide reutilizar un código (5 min)
 *   seg:2fa-pend:<huella>      texto  clave del QR mientras se activa (10 min)
 *   seg:accesos                LIST   registro de accesos (los 2.000 últimos)
 *   seg:fallos-ip:<ip>         número fallos desde esa conexión (15 min)
 *   seg:fallos-cuenta:<correo> número fallos contra esa cuenta (1 hora)
 *   seg:bloqueo-anotado:<ip>   marca  el bloqueo ya está en el registro
 *
 * Si alguien pierde el móvil y los códigos, otra persona del despacho puede
 * quitarle la verificación desde /admin/seguridad. Si nadie puede entrar:
 * Upstash → Data Browser → borre la clave «seg:2fa:<correo>».
 */

import crypto from "node:crypto";
import { comando, almacenDisponible } from "./_almacen.js";

/* ===========================================================================
   CONFIGURACIÓN
   =========================================================================== */

const entre = (n, min, max, porDefecto) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(max, Math.max(min, Math.round(v))) : porDefecto;
};

// Minutos sin actividad que cierran la sesión (ADMIN_INACTIVIDAD_MIN, de 5 a 240)
export const INACTIVIDAD_SEG = entre(process.env.ADMIN_INACTIVIDAD_MIN, 5, 240, 30) * 60;
export const DURACION_MAX_SEG = 12 * 60 * 60;     // nunca más de 12 horas seguidas

const LIM_IP = { max: 8, ventana: 15 * 60 };       // 8 fallos desde la misma conexión en 15 min
const LIM_CUENTA = { max: 20, ventana: 60 * 60 };  // 20 fallos contra la misma cuenta en 1 hora
const MAX_INTENTOS_CODIGO = 5;                      // códigos 2FA por inicio de sesión
const RETO_SEG = 5 * 60;                            // tiempo para escribir el código
export const QR_SEG = 10 * 60;                      // tiempo para escanear el QR al activar
const MAX_ACCESOS = 2000;                           // entradas que guarda el registro
const DIAS_ACCESOS = 365;                           // y como mucho de los últimos 12 meses

export const EMISOR_2FA = "JURMIA Abogados";

const K = {
  ses: "seg:ses:",
  sesiones: "seg:sesiones:",
  reto: "seg:reto:",
  retoN: "seg:reto-n:",
  dosPasos: "seg:2fa:",
  rec: "seg:2fa-rec:",
  ultimo: "seg:2fa-ultimo:",
  usado: "seg:2fa-usado:",
  pendiente: "seg:2fa-pend:",
  accesos: "seg:accesos",
  falloIp: "seg:fallos-ip:",
  falloCuenta: "seg:fallos-cuenta:",
  bloqueoAnotado: "seg:bloqueo-anotado:"
};

/** Mensaje cuando Redis falla. Sin la palabra «sesión» a propósito: los paneles
 *  antiguos borran el token al verla, y aquí el problema no es el token. */
export const AVISO_ALMACEN =
  "El almacén de seguridad (Redis) no responde. Pruebe de nuevo en unos minutos.";

/**
 * Cuentas del panel. Formato de ADMIN_USUARIOS:
 *   correo:contraseña:Nombre Apellidos, correo2:contraseña2:Nombre2
 * La contraseña no puede contener comas ni dos puntos.
 */
export function usuarios() {
  return (process.env.ADMIN_USUARIOS || "")
    .split(/[,\n]/)
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      const partes = linea.split(":");
      if (partes.length < 2) return null;
      const correo = partes[0].trim().toLowerCase();
      const clave = partes[1].trim();
      if (!correo || !clave) return null;
      return { correo, clave, nombre: (partes[2] || "").trim() || partes[0].trim() };
    })
    .filter(Boolean);
}

export const normalizarCorreo = (c) => String(c || "").trim().toLowerCase().slice(0, 120);
export const buscarUsuario = (correo) => usuarios().find((u) => u.correo === normalizarCorreo(correo)) || null;

/** null si todo está listo, o el motivo por el que el panel no puede funcionar. */
export function faltaConfiguracion() {
  const faltan = [];
  if (!process.env.ADMIN_SECRETO) faltan.push("ADMIN_SECRETO");
  if (!usuarios().length) faltan.push("ADMIN_USUARIOS");
  if (!almacenDisponible()) faltan.push("KV_REST_API_URL y KV_REST_API_TOKEN");
  return faltan.length
    ? "El panel no está configurado. Faltan variables de entorno en Vercel: " + faltan.join(", ") + "."
    : null;
}

/* ===========================================================================
   AYUDAS
   =========================================================================== */

export const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
export const tokenAleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const hmac = (clave, valor) => crypto.createHmac("sha256", String(clave)).update(String(valor)).digest("hex");

/** Comparación en tiempo constante para textos de cualquier longitud. */
export function igualSeguro(a, b) {
  const clave = crypto.randomBytes(32);
  const ha = crypto.createHmac("sha256", clave).update(String(a)).digest();
  const hb = crypto.createHmac("sha256", clave).update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const parsear = (bruto) => {
  if (!bruto) return null;
  if (typeof bruto === "object") return bruto;
  try { return JSON.parse(bruto); } catch { return null; }
};

export function ipDe(req) {
  const h = req.headers || {};
  const real = String(h["x-real-ip"] || "").trim();
  if (real) return real.slice(0, 60);
  const cadena = String(h["x-forwarded-for"] || "");
  return (cadena.split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || "local").slice(0, 60);
}

export const navegadorDe = (req) => String((req.headers || {})["user-agent"] || "").slice(0, 300);
const huellaNavegador = (req) => sha256(navegadorDe(req)).slice(0, 24);

/** Huella de la contraseña actual: si cambia en Vercel, las sesiones abiertas caducan. */
const huellaClave = (u) => hmac(process.env.ADMIN_SECRETO || "", "clave|" + u.correo + "|" + u.clave).slice(0, 24);

export function tokenDe(req) {
  const cabecera = String((req.headers || {}).authorization || "");
  return cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
}

export function cuerpoDe(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") {
    try { return JSON.parse(b || "{}") || {}; } catch { return {}; }
  }
  if (Buffer.isBuffer(b)) {
    try { return JSON.parse(b.toString("utf8") || "{}") || {}; } catch { return {}; }
  }
  return b;
}

/* ===========================================================================
   CONTRASEÑAS
   =========================================================================== */

/**
 * Comprueba correo y contraseña. Tarda lo mismo exista o no la cuenta, para no
 * revelar qué correos están dados de alta.
 */
export function comprobarCredenciales(correo, clave) {
  const u = buscarUsuario(correo);
  const ok = igualSeguro(String(clave || ""), u ? u.clave : "\u0000" + tokenAleatorio(8));
  return ok && u ? u : null;
}

export const claveCorrecta = (u, clave) => !!u && igualSeguro(String(clave || ""), u.clave);

/* ===========================================================================
   LÍMITE DE INTENTOS
   =========================================================================== */

async function minutosRestantes(clave, lim) {
  const n = Number(await comando(["GET", clave])) || 0;
  if (n < lim.max) return 0;
  const ttl = Number(await comando(["TTL", clave]));
  return Math.max(1, Math.ceil((ttl > 0 ? ttl : lim.ventana) / 60));
}

/** Minutos que faltan si la conexión o la cuenta están bloqueadas; 0 si se puede intentar. */
export async function bloqueoActivo(ip, correo) {
  const u = buscarUsuario(correo);
  const [porIP, porCuenta] = await Promise.all([
    minutosRestantes(K.falloIp + ip, LIM_IP),
    u ? minutosRestantes(K.falloCuenta + u.correo, LIM_CUENTA) : 0
  ]);
  return Math.max(porIP, porCuenta);
}

async function sumar(clave, ventana) {
  const n = Number(await comando(["INCR", clave]));
  if (n === 1) await comando(["EXPIRE", clave, String(ventana)]);
}

/**
 * Fallo que cuenta para el bloqueo. La pequeña espera aleatoria frena los
 * ataques automáticos y no molesta a una persona.
 */
export async function anotarFallo(req, { motivo, correo }) {
  const ip = ipDe(req);
  const u = buscarUsuario(correo);
  try {
    await sumar(K.falloIp + ip, LIM_IP.ventana);
    if (u) await sumar(K.falloCuenta + u.correo, LIM_CUENTA.ventana);
  } catch (e) {
    console.warn("Seguridad: no se pudo anotar el fallo", e.message);
  }
  await anotarAcceso(req, { tipo: "fallo", motivo, correo });
  await dormir(400 + Math.floor(Math.random() * 500));
}

async function limpiarFallos(ip, correo) {
  await comando(["DEL", K.falloIp + ip, K.falloCuenta + normalizarCorreo(correo)]).catch(() => {});
}

/* ===========================================================================
   REGISTRO DE ACCESOS
   tipo: entrada (correcta) · fallo (cuenta para el bloqueo) · bloqueo · evento
   =========================================================================== */

export async function anotarAcceso(req, { tipo = "evento", motivo, correo }) {
  const fila = {
    fecha: new Date().toISOString(),
    tipo,
    ok: tipo === "entrada" || tipo === "evento",
    motivo: String(motivo || "").slice(0, 160),
    correo: normalizarCorreo(correo),
    ip: ipDe(req),
    navegador: navegadorDe(req).slice(0, 250)
  };
  try {
    await comando(["LPUSH", K.accesos, JSON.stringify(fila)]);
    await comando(["LTRIM", K.accesos, "0", String(MAX_ACCESOS - 1)]);
  } catch (e) {
    // El registro nunca debe impedir entrar
    console.warn("Seguridad: no se pudo anotar el acceso", e.message);
  }
}

export async function ultimosAccesos(n = 60) {
  const limite = Date.now() - DIAS_ACCESOS * 864e5;
  const filas = await comando(["LRANGE", K.accesos, "0", String(Math.max(0, n - 1))]);
  return (filas || []).map(parsear).filter((f) => f && Date.parse(f.fecha) >= limite);
}

/* ===========================================================================
   SESIONES
   =========================================================================== */

const formatoToken = (t) => /^[a-f0-9]{64}$/.test(String(t || ""));

/** Abre una sesión y devuelve el token que se guarda en el navegador. */
export async function crearSesion(req, usuario, via = "clave") {
  const token = tokenAleatorio(32);
  const huella = sha256(token);
  const ahora = new Date();
  const sesion = {
    correo: usuario.correo,
    nombre: usuario.nombre,
    creada: ahora.toISOString(),
    actividad: ahora.toISOString(),
    ip: ipDe(req),
    navegador: navegadorDe(req).slice(0, 250),
    navHuella: huellaNavegador(req),
    claveHuella: huellaClave(usuario),
    via
  };
  await comando(["SET", K.ses + huella, JSON.stringify(sesion), "EX", String(INACTIVIDAD_SEG)]);
  await comando(["ZADD", K.sesiones + usuario.correo, String(ahora.getTime()), huella]);
  await comando(["EXPIRE", K.sesiones + usuario.correo, String(DURACION_MAX_SEG + 3600)]);
  return { token, huella, sesion, caduca: ahora.getTime() + DURACION_MAX_SEG * 1000 };
}

async function borrarSesion(huella, correo) {
  await comando(["DEL", K.ses + huella, K.pendiente + huella]);
  if (correo) await comando(["ZREM", K.sesiones + normalizarCorreo(correo), huella]);
}

/** ¿Sigue valiendo esta sesión? Devuelve el usuario o null. */
function validar(s, req) {
  if (!s) return null;
  const u = buscarUsuario(s.correo);
  const ahora = Date.now();
  const valida =
    u &&
    igualSeguro(s.claveHuella || "", huellaClave(u)) &&
    ahora - Date.parse(s.creada) < DURACION_MAX_SEG * 1000 &&
    ahora - Date.parse(s.actividad) < INACTIVIDAD_SEG * 1000 &&
    (!req || s.navHuella === huellaNavegador(req));
  return valida ? u : null;
}

/**
 * Lee la sesión de la petición (cabecera Authorization: Bearer <token>).
 * Devuelve { sesion } o { error, estado } listo para responder.
 * La actividad renueva los minutos de inactividad (como mucho, una escritura por minuto).
 */
export async function exigirSesion(req) {
  const falta = faltaConfiguracion();
  if (falta) return { error: falta, estado: 500 };

  const token = tokenDe(req);
  if (!formatoToken(token)) return { error: "Sesión caducada. Vuelva a entrar.", estado: 401, sesion: null };
  const huella = sha256(token);

  try {
    const s = parsear(await comando(["GET", K.ses + huella]));
    const u = validar(s, req);
    if (!u) {
      if (s) await borrarSesion(huella, s.correo);
      return { error: "Sesión caducada. Vuelva a entrar.", estado: 401, sesion: null };
    }
    const ahora = Date.now();
    if (ahora - Date.parse(s.actividad) > 60 * 1000) {
      s.actividad = new Date(ahora).toISOString();
      // XX: solo si sigue existiendo. Si se acaba de cerrar desde otro sitio, no se resucita.
      await comando(["SET", K.ses + huella, JSON.stringify(s), "XX", "EX", String(INACTIVIDAD_SEG)]);
    }
    return {
      sesion: {
        ...s,
        nombre: u.nombre,
        huella,
        usuario: u,
        caduca: Date.parse(s.creada) + DURACION_MAX_SEG * 1000
      }
    };
  } catch (e) {
    console.error("Seguridad: no se pudo comprobar la sesión", e.message);
    return { error: AVISO_ALMACEN, estado: 503 };
  }
}

export async function cerrarSesion(req) {
  const token = tokenDe(req);
  if (!formatoToken(token)) return;
  const huella = sha256(token);
  const s = parsear(await comando(["GET", K.ses + huella]));
  await borrarSesion(huella, s && s.correo);
  if (s) await anotarAcceso(req, { motivo: "Sesión cerrada", correo: s.correo });
}

/** Cierra las sesiones de una cuenta en todos los dispositivos (salvo, si se indica, una). */
export async function cerrarSesionesDe(correo, { excepto } = {}) {
  const c = normalizarCorreo(correo);
  const huellas = (await comando(["ZRANGE", K.sesiones + c, "0", "-1"])) || [];
  let n = 0;
  for (const h of huellas) {
    if (h === excepto) continue;
    await borrarSesion(h, c);
    n++;
  }
  return n;
}

/** Sesiones abiertas de todo el equipo, de la más reciente a la más antigua. */
export async function sesionesAbiertas() {
  const lista = [];
  for (const u of usuarios()) {
    const huellas = (await comando(["ZRANGE", K.sesiones + u.correo, "0", "-1"])) || [];
    if (!huellas.length) continue;
    const brutos = (await comando(["MGET", ...huellas.map((h) => K.ses + h)])) || [];
    for (let i = 0; i < huellas.length; i++) {
      const s = parsear(brutos[i]);
      if (!s || !validar(s, null)) {
        // Caducada: se limpia el índice
        await comando(["ZREM", K.sesiones + u.correo, huellas[i]]).catch(() => {});
        continue;
      }
      lista.push({
        id: huellas[i].slice(0, 32),
        correo: u.correo,
        nombre: u.nombre,
        creada: s.creada,
        actividad: s.actividad,
        ip: s.ip,
        navegador: s.navegador,
        via: s.via || "clave"
      });
    }
  }
  return lista.sort((a, b) => (a.actividad < b.actividad ? 1 : -1));
}

/** Cierra una sesión concreta por su identificador público. Devuelve su correo o null. */
export async function cerrarSesionPorId(id) {
  const prefijo = String(id || "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(prefijo)) return null;
  for (const u of usuarios()) {
    const huellas = (await comando(["ZRANGE", K.sesiones + u.correo, "0", "-1"])) || [];
    const h = huellas.find((x) => x.startsWith(prefijo));
    if (h) {
      await borrarSesion(h, u.correo);
      return u.correo;
    }
  }
  return null;
}

/* ===========================================================================
   VERIFICACIÓN EN DOS PASOS (TOTP, RFC 6238)
   Compatible con Google Authenticator, Microsoft Authenticator, Authy, 1Password…
   =========================================================================== */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function aBase32(buf) {
  let bits = 0, valor = 0, out = "";
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(valor << (5 - bits)) & 31];
  return out;
}

export function deBase32(txt) {
  const limpio = String(txt).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, valor = 0;
  const out = [];
  for (const c of limpio) {
    valor = (valor << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function codigoHOTP(secretoBase32, contador, digitos = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const h = crypto.createHmac("sha1", deBase32(secretoBase32)).update(msg).digest();
  const d = h[h.length - 1] & 0xf;
  const num = ((h[d] & 0x7f) << 24) | (h[d + 1] << 16) | (h[d + 2] << 8) | h[d + 3];
  return String(num % 10 ** digitos).padStart(digitos, "0");
}

export const nuevoSecreto2FA = () => aBase32(crypto.randomBytes(20));

/**
 * Acepta el código actual y el de 30 s antes o después (relojes desajustados).
 * Devuelve el contador usado, o -1. Nunca acepta un contador ya usado.
 */
export function comprobarTOTP(secreto, codigo, ultimoUsado = -1, ahora = Date.now()) {
  const c = String(codigo || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return -1;
  const actual = Math.floor(ahora / 1000 / 30);
  for (const desfase of [0, -1, 1]) {
    const contador = actual + desfase;
    if (contador <= ultimoUsado) continue;
    if (igualSeguro(codigoHOTP(secreto, contador), c)) return contador;
  }
  return -1;
}

export function uriOtpauth(secreto, correo) {
  const etiqueta = encodeURIComponent(EMISOR_2FA + ":" + correo);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent(EMISOR_2FA)}` +
    "&algorithm=SHA1&digits=6&period=30";
}

/* ---------- Códigos de recuperación (por si se pierde el móvil) ---------- */

const ALFABETO_REC = "abcdefghjkmnpqrstuvwxyz23456789"; // sin 0/o ni 1/l/i
const normalizarRecuperacion = (c) => String(c || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const huellaRecuperacion = (sal, codigo) => sha256(sal + "|" + normalizarRecuperacion(codigo));

export function nuevosCodigosRecuperacion(n = 8) {
  const sal = tokenAleatorio(16);
  const codigos = [];
  for (let i = 0; i < n; i++) {
    let c = "";
    for (let j = 0; j < 10; j++) c += ALFABETO_REC[crypto.randomInt(ALFABETO_REC.length)];
    codigos.push(c.slice(0, 5) + "-" + c.slice(5));
  }
  return { codigos, sal, huellas: codigos.map((c) => huellaRecuperacion(sal, c)) };
}

/** Configuración 2FA de una cuenta: { secreto, desde, recSal } o null si no la tiene. */
export async function leer2FA(correo) {
  const c = parsear(await comando(["GET", K.dosPasos + normalizarCorreo(correo)]));
  return c && c.secreto ? c : null;
}

export async function codigosRestantes(correo) {
  return Number(await comando(["SCARD", K.rec + normalizarCorreo(correo)])) || 0;
}

async function guardarCodigos(correo, sal, huellas) {
  const c = normalizarCorreo(correo);
  await comando(["DEL", K.rec + c]);
  if (huellas.length) await comando(["SADD", K.rec + c, ...huellas]);
  const cfg = await leer2FA(c);
  if (cfg) {
    cfg.recSal = sal;
    cfg.recDesde = new Date().toISOString();
    await comando(["SET", K.dosPasos + c, JSON.stringify(cfg)]);
  }
}

/** Activa la verificación con la clave ya confirmada. Devuelve los códigos de recuperación. */
export async function activar2FA(correo, secreto, contador) {
  const c = normalizarCorreo(correo);
  const { codigos, sal, huellas } = nuevosCodigosRecuperacion();
  const ahora = new Date().toISOString();
  await comando(["SET", K.dosPasos + c, JSON.stringify({ secreto, desde: ahora, recSal: sal, recDesde: ahora })]);
  await comando(["SET", K.ultimo + c, String(contador)]);
  await comando(["DEL", K.rec + c]);
  await comando(["SADD", K.rec + c, ...huellas]);
  return codigos;
}

export async function regenerarCodigos(correo) {
  const { codigos, sal, huellas } = nuevosCodigosRecuperacion();
  await guardarCodigos(correo, sal, huellas);
  return codigos;
}

export async function quitar2FA(correo) {
  const c = normalizarCorreo(correo);
  await comando(["DEL", K.dosPasos + c, K.rec + c, K.ultimo + c]);
}

/**
 * Comprueba un código de la app o de recuperación de una cuenta.
 * Un código nunca sirve dos veces: el de la app queda marcado y el de
 * recuperación se borra del conjunto de forma atómica.
 */
export async function verificarSegundoPaso(correo, codigo, { soloApp = false } = {}) {
  const c = normalizarCorreo(correo);
  const cfg = await leer2FA(c);
  if (!cfg) return { ok: false };

  const ultimoTxt = await comando(["GET", K.ultimo + c]);
  const ultimo = ultimoTxt == null ? -1 : Number(ultimoTxt);
  const contador = comprobarTOTP(cfg.secreto, codigo, Number.isFinite(ultimo) ? ultimo : -1);
  if (contador >= 0) {
    // La marca lleva una huella de la clave: si se desactiva y se vuelve a
    // activar enseguida, los códigos de la clave nueva no chocan con los de la antigua.
    const marca = K.usado + c + ":" + sha256(cfg.secreto).slice(0, 8) + ":" + contador;
    const nuevo = await comando(["SET", marca, "1", "NX", "EX", "300"]);
    if (nuevo !== "OK") return { ok: false };
    await comando(["SET", K.ultimo + c, String(contador)]);
    return { ok: true, via: "app" };
  }

  if (!soloApp && cfg.recSal && normalizarRecuperacion(codigo).length === 10) {
    const quitado = Number(await comando(["SREM", K.rec + c, huellaRecuperacion(cfg.recSal, codigo)]));
    if (quitado === 1) return { ok: true, via: "recuperacion", restantes: await codigosRestantes(c) };
  }
  return { ok: false };
}

/* ---------- Clave del QR mientras se activa la verificación ---------- */

export async function guardarPendiente(huellaSesion, secreto) {
  await comando(["SET", K.pendiente + huellaSesion, secreto, "EX", String(QR_SEG)]);
}
export async function leerPendiente(huellaSesion) {
  const v = await comando(["GET", K.pendiente + huellaSesion]);
  return typeof v === "string" && v ? v : null;
}
export async function borrarPendiente(huellaSesion) {
  await comando(["DEL", K.pendiente + huellaSesion]);
}

/* ---------- Paso intermedio del login cuando hay 2FA ---------- */

async function crearReto(usuario) {
  const reto = tokenAleatorio(24);
  await comando(["SET", K.reto + sha256(reto), JSON.stringify({ correo: usuario.correo }), "EX", String(RETO_SEG)]);
  return reto;
}

async function leerReto(reto) {
  if (!/^[a-f0-9]{48}$/.test(String(reto || ""))) return null;
  const huella = sha256(reto);
  const r = parsear(await comando(["GET", K.reto + huella]));
  if (!r) return null;
  const usuario = buscarUsuario(r.correo);
  if (!usuario) {
    await borrarReto(huella);
    return null;
  }
  return { huella, usuario };
}

async function borrarReto(huella) {
  await comando(["DEL", K.reto + huella, K.retoN + huella]);
}

/** Devuelve false cuando se agotan los intentos (hay que volver a empezar). */
async function falloReto(huella) {
  const n = Number(await comando(["INCR", K.retoN + huella]));
  if (n === 1) await comando(["EXPIRE", K.retoN + huella, String(RETO_SEG)]);
  if (n >= MAX_INTENTOS_CODIGO) {
    await borrarReto(huella);
    return false;
  }
  return true;
}

/* ===========================================================================
   ENTRADA AL PANEL
   Cada función devuelve { estado, cuerpo } para responder tal cual.
   =========================================================================== */

async function abrir(req, usuario, via, extra = {}) {
  const { token, caduca } = await crearSesion(req, usuario, via);
  await limpiarFallos(ipDe(req), usuario.correo);
  const motivos = {
    clave: "Entrada correcta",
    "2fa": "Entrada correcta (2 pasos)",
    recuperacion: "Entrada con código de recuperación"
  };
  await anotarAcceso(req, { tipo: "entrada", motivo: motivos[via] || "Entrada correcta", correo: usuario.correo });
  const dosPasos = via !== "clave" || !!(await leer2FA(usuario.correo));
  return {
    estado: 200,
    cuerpo: {
      token,
      nombre: usuario.nombre,
      correo: usuario.correo,
      dosPasos,
      caduca,
      inactividad: INACTIVIDAD_SEG,
      ...extra
    }
  };
}

/** Paso 1: correo y contraseña. Si la cuenta tiene 2FA, devuelve un «reto». */
export async function entrar(req, datos) {
  const falta = faltaConfiguracion();
  if (falta) return { estado: 500, cuerpo: { error: falta } };

  const correo = normalizarCorreo(datos.correo);
  const clave = String(datos.clave || "").slice(0, 200);
  if (!correo || !clave) return { estado: 400, cuerpo: { error: "Escriba su correo y su contraseña." } };

  try {
    const ip = ipDe(req);
    const minutos = await bloqueoActivo(ip, correo);
    if (minutos) {
      // Se anota una vez por bloqueo, no en cada intento: un robot no puede llenar el registro
      const primera = await comando(["SET", K.bloqueoAnotado + ip, "1", "NX", "EX", String(minutos * 60)]);
      if (primera === "OK") await anotarAcceso(req, { tipo: "bloqueo", motivo: "Bloqueado por demasiados intentos", correo });
      return {
        estado: 429,
        cuerpo: { error: `Demasiados intentos fallidos. Por seguridad, espere ${minutos} min antes de volver a probar.` }
      };
    }

    const usuario = comprobarCredenciales(correo, clave);
    if (!usuario) {
      await anotarFallo(req, { motivo: "Correo o contraseña incorrectos", correo });
      return { estado: 401, cuerpo: { error: "Correo o contraseña incorrectos" } };
    }

    if (await leer2FA(usuario.correo)) {
      return { estado: 200, cuerpo: { dosPasos: true, reto: await crearReto(usuario) } };
    }
    return await abrir(req, usuario, "clave");
  } catch (e) {
    console.error("Seguridad: fallo al entrar", e);
    return { estado: 503, cuerpo: { error: AVISO_ALMACEN } };
  }
}

/** Paso 2: código de la app del móvil o código de recuperación. */
export async function verificar(req, datos) {
  const falta = faltaConfiguracion();
  if (falta) return { estado: 500, cuerpo: { error: falta } };

  try {
    const r = await leerReto(datos.reto);
    if (!r) {
      return {
        estado: 401,
        cuerpo: { error: "Ha pasado demasiado tiempo. Vuelva a escribir su correo y su contraseña.", reiniciar: true }
      };
    }
    const usuario = r.usuario;

    const minutos = await bloqueoActivo(ipDe(req), usuario.correo);
    if (minutos) {
      await borrarReto(r.huella);
      return { estado: 429, cuerpo: { error: `Demasiados intentos fallidos. Espere ${minutos} min.`, reiniciar: true } };
    }

    const v = await verificarSegundoPaso(usuario.correo, String(datos.codigo || "").slice(0, 20));
    if (!v.ok) {
      await anotarFallo(req, { motivo: "Código de verificación incorrecto", correo: usuario.correo });
      const sigue = await falloReto(r.huella);
      return {
        estado: 401,
        cuerpo: {
          error: sigue ? "El código no es correcto." : "Demasiados códigos incorrectos. Vuelva a empezar.",
          reiniciar: !sigue
        }
      };
    }

    await borrarReto(r.huella);
    return await abrir(req, usuario, v.via === "recuperacion" ? "recuperacion" : "2fa",
      v.via === "recuperacion" ? { codigosRestantes: v.restantes } : {});
  } catch (e) {
    console.error("Seguridad: fallo al verificar", e);
    return { estado: 503, cuerpo: { error: AVISO_ALMACEN } };
  }
}

/** Estado de la sesión para el panel (al cargar y para mantenerla viva). */
export async function yo(sesion) {
  return {
    correo: sesion.correo,
    nombre: sesion.nombre,
    dosPasos: !!(await leer2FA(sesion.correo)),
    caduca: sesion.caduca,
    inactividad: INACTIVIDAD_SEG
  };
}
