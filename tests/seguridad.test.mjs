/**
 * Pruebas de la seguridad del panel y del registro de consentimientos.
 * Usan un Redis simulado en memoria: no tocan el de producción.
 *   npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { arrancarRedis } from "./_redis-simulado.mjs";

process.env.ADMIN_SECRETO = "secreto-de-prueba-0123456789";
process.env.ADMIN_USUARIOS = "ana@jurmia.es:ClaveAna2026:Ana Pérez, luis@jurmia.es:ClaveLuis2026:Luis Gómez";
process.env.CONSENT_SALT = "sal-de-prueba";

const S = await import("../api/_seguridad.js");
const admin = (await import("../api/admin.js")).default;
const seguridad = (await import("../api/seguridad.js")).default;

let r;
before(async () => { r = await arrancarRedis(); });
after(async () => { await r.parar(); });

/* ------------------------------------------------------------------ */
/* Ayudas: petición y respuesta como las de Vercel                     */
/* ------------------------------------------------------------------ */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15";

function peticion(cuerpo, { token, ip = "81.0.0.1", ua = UA, origen } = {}) {
  const headers = { "user-agent": ua, "x-real-ip": ip, host: "www.jurmiabogados.es" };
  if (token) headers.authorization = "Bearer " + token;
  if (origen) headers.origin = origen;
  return { method: "POST", headers, body: cuerpo, socket: { remoteAddress: ip } };
}

async function llamar(handler, cuerpo, opciones) {
  const out = { estado: 200, cuerpo: null, cabeceras: {} };
  const res = {
    setHeader: (k, v) => { out.cabeceras[k.toLowerCase()] = v; return res; },
    status: (n) => { out.estado = n; return res; },
    json: (d) => { out.cuerpo = d; return res; },
    send: (d) => { out.cuerpo = d; return res; }
  };
  await handler(peticion(cuerpo, opciones), res);
  return out;
}

const codigoAhora = (secreto, desfase = 0) =>
  S.codigoHOTP(secreto.replace(/\s/g, ""), Math.floor(Date.now() / 30000) + desfase);

/* ------------------------------------------------------------------ */
/* TOTP                                                                */
/* ------------------------------------------------------------------ */
test("TOTP: vectores de la RFC 6238 (SHA-1)", () => {
  const secreto = S.aBase32(Buffer.from("12345678901234567890"));
  assert.equal(secreto, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  const casos = [[59, "94287082"], [1111111109, "07081804"], [1234567890, "89005924"], [2000000000, "69279037"]];
  for (const [t, esperado] of casos) {
    assert.equal(S.codigoHOTP(secreto, Math.floor(t / 30), 8), esperado);
    assert.equal(S.codigoHOTP(secreto, Math.floor(t / 30), 6), esperado.slice(2));
  }
});

test("TOTP: admite 30 s de desfase y nunca un contador ya usado", () => {
  const secreto = S.nuevoSecreto2FA();
  assert.equal(S.deBase32(secreto).length, 20);
  const ahora = Date.now();
  const c = Math.floor(ahora / 30000);
  assert.equal(S.comprobarTOTP(secreto, S.codigoHOTP(secreto, c), -1, ahora), c);
  assert.equal(S.comprobarTOTP(secreto, S.codigoHOTP(secreto, c - 1), -1, ahora), c - 1);
  assert.equal(S.comprobarTOTP(secreto, S.codigoHOTP(secreto, c + 1), -1, ahora), c + 1);
  assert.equal(S.comprobarTOTP(secreto, S.codigoHOTP(secreto, c - 2), -1, ahora), -1);
  assert.equal(S.comprobarTOTP(secreto, S.codigoHOTP(secreto, c), c, ahora), -1);
  assert.equal(S.comprobarTOTP(secreto, "12a456", -1, ahora), -1);
  assert.match(S.uriOtpauth(secreto, "ana@jurmia.es"), /^otpauth:\/\/totp\/JURMIA%20Abogados%3Aana%40jurmia\.es\?secret=[A-Z2-7]+&issuer=JURMIA%20Abogados/);
});

test("Códigos de recuperación: 8, distintos y sin caracteres confusos", () => {
  const { codigos, huellas } = S.nuevosCodigosRecuperacion();
  assert.equal(codigos.length, 8);
  assert.equal(new Set(codigos).size, 8);
  assert.equal(new Set(huellas).size, 8);
  for (const c of codigos) assert.match(c, /^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
});

/* ------------------------------------------------------------------ */
/* Entrada sin y con verificación en dos pasos                         */
/* ------------------------------------------------------------------ */
test("Entrada, sesión en el servidor y salida", async () => {
  const mal = await llamar(admin, { accion: "entrar", correo: "ana@jurmia.es", clave: "otra" }, { ip: "10.0.0.1" });
  assert.equal(mal.estado, 401);
  assert.equal(mal.cuerpo.error, "Correo o contraseña incorrectos");
  const nadie = await llamar(admin, { accion: "entrar", correo: "nadie@jurmia.es", clave: "x" }, { ip: "10.0.0.1" });
  assert.equal(nadie.cuerpo.error, "Correo o contraseña incorrectos");

  const ok = await llamar(admin, { accion: "entrar", correo: "ANA@jurmia.es ", clave: "ClaveAna2026" });
  assert.equal(ok.estado, 200);
  assert.match(ok.cuerpo.token, /^[a-f0-9]{64}$/);
  assert.equal(ok.cuerpo.nombre, "Ana Pérez");
  assert.equal(ok.cuerpo.dosPasos, false);
  // En Redis solo está la huella del token, nunca el token
  assert.ok(!r.redis.claves().some((k) => k.includes(ok.cuerpo.token)));

  const yo = await llamar(admin, { accion: "yo" }, { token: ok.cuerpo.token });
  assert.equal(yo.estado, 200);
  assert.equal(yo.cuerpo.correo, "ana@jurmia.es");

  // Otro navegador con el mismo token no entra
  const robado = await llamar(admin, { accion: "yo" }, { token: ok.cuerpo.token, ua: "curl/8" });
  assert.equal(robado.estado, 401);

  // Los tokens firmados de la versión anterior ya no valen
  const viejo = await llamar(admin, { accion: "yo" }, { token: "eyJjb3JyZW8iOiJhbmEifQ.firma" });
  assert.equal(viejo.estado, 401);

  await llamar(admin, { accion: "salir" }, { token: ok.cuerpo.token });
  const tras = await llamar(admin, { accion: "yo" }, { token: ok.cuerpo.token });
  assert.equal(tras.estado, 401);
});

test("Caducidad por inactividad y por cambio de contraseña", async () => {
  const a = await llamar(admin, { accion: "entrar", correo: "luis@jurmia.es", clave: "ClaveLuis2026" });
  const huella = S.sha256(a.cuerpo.token);
  r.redis.envejecer("seg:ses:" + huella, S.INACTIVIDAD_SEG + 5);
  assert.equal((await llamar(admin, { accion: "yo" }, { token: a.cuerpo.token })).estado, 401);

  const b = await llamar(admin, { accion: "entrar", correo: "luis@jurmia.es", clave: "ClaveLuis2026" });
  assert.equal((await llamar(admin, { accion: "yo" }, { token: b.cuerpo.token })).estado, 200);
  const antes = process.env.ADMIN_USUARIOS;
  process.env.ADMIN_USUARIOS = antes.replace("ClaveLuis2026", "NuevaClave2027");
  assert.equal((await llamar(admin, { accion: "yo" }, { token: b.cuerpo.token })).estado, 401);
  process.env.ADMIN_USUARIOS = antes;
});

test("Límite de intentos: 8 fallos desde la misma conexión bloquean", async () => {
  const ip = "203.0.113.9";
  for (let i = 0; i < 8; i++) {
    const x = await llamar(admin, { accion: "entrar", correo: "luis@jurmia.es", clave: "mal" + i }, { ip });
    assert.equal(x.estado, 401);
  }
  const bloqueado = await llamar(admin, { accion: "entrar", correo: "luis@jurmia.es", clave: "ClaveLuis2026" }, { ip });
  assert.equal(bloqueado.estado, 429);
  assert.match(bloqueado.cuerpo.error, /Demasiados intentos/);
  // Desde otra conexión, la cuenta sigue funcionando
  const otra = await llamar(admin, { accion: "entrar", correo: "luis@jurmia.es", clave: "ClaveLuis2026" }, { ip: "198.51.100.4" });
  assert.equal(otra.estado, 200);
});

test("Verificación en dos pasos: activar, entrar, recuperación y desactivar", async () => {
  // Ana abre dos sesiones (dos ordenadores)
  const pc1 = (await llamar(admin, { accion: "entrar", correo: "ana@jurmia.es", clave: "ClaveAna2026" })).cuerpo.token;
  const pc2 = (await llamar(admin, { accion: "entrar", correo: "ana@jurmia.es", clave: "ClaveAna2026" })).cuerpo.token;

  const malClave = await llamar(seguridad, { accion: "2fa-iniciar", clave: "x" }, { token: pc1 });
  assert.equal(malClave.estado, 403);

  const ini = await llamar(seguridad, { accion: "2fa-iniciar", clave: "ClaveAna2026" }, { token: pc1 });
  assert.equal(ini.estado, 200);
  assert.match(ini.cuerpo.qr, /^<svg/);
  assert.match(ini.cuerpo.uri, /^otpauth:\/\/totp\//);
  const secreto = ini.cuerpo.secreto.replace(/\s/g, "");

  const malCodigo = await llamar(seguridad, { accion: "2fa-confirmar", codigo: "000000" }, { token: pc1 });
  assert.equal(malCodigo.estado, 400);
  const c0 = Math.floor(Date.now() / 30000);
  const conf = await llamar(seguridad, { accion: "2fa-confirmar", codigo: S.codigoHOTP(secreto, c0) }, { token: pc1 });
  assert.equal(conf.estado, 200);
  assert.equal(conf.cuerpo.codigos.length, 8);
  const recuperacion = conf.cuerpo.codigos;

  // La sesión desde la que se activa sigue; la otra se cierra
  assert.equal((await llamar(admin, { accion: "yo" }, { token: pc1 })).estado, 200);
  assert.equal((await llamar(admin, { accion: "yo" }, { token: pc2 })).estado, 401);

  // Ahora la contraseña sola no basta
  const p1 = await llamar(admin, { accion: "entrar", correo: "ana@jurmia.es", clave: "ClaveAna2026" });
  assert.equal(p1.cuerpo.dosPasos, true);
  assert.ok(!p1.cuerpo.token);
  assert.match(p1.cuerpo.reto, /^[a-f0-9]{48}$/);
  const fallo = await llamar(admin, { accion: "verificar", reto: p1.cuerpo.reto, codigo: "123456" });
  assert.equal(fallo.estado, 401);
  assert.equal(fallo.cuerpo.reiniciar, false);

  // El código de la app ya se usó al activar: no vale otra vez. El siguiente sí.
  const reusado = await llamar(admin, { accion: "verificar", reto: p1.cuerpo.reto, codigo: S.codigoHOTP(secreto, c0) });
  assert.equal(reusado.estado, 401);
  const p2 = await llamar(admin, { accion: "verificar", reto: p1.cuerpo.reto, codigo: S.codigoHOTP(secreto, c0 + 1) });
  assert.equal(p2.estado, 200);
  assert.match(p2.cuerpo.token, /^[a-f0-9]{64}$/);
  assert.equal(p2.cuerpo.dosPasos, true);
  // El reto se gasta al entrar
  assert.equal((await llamar(admin, { accion: "verificar", reto: p1.cuerpo.reto, codigo: S.codigoHOTP(secreto, c0 + 1) })).cuerpo.reiniciar, true);

  // Con un código de recuperación (una sola vez)
  const q = await llamar(admin, { accion: "entrar", correo: "ana@jurmia.es", clave: "ClaveAna2026" });
  const conRec = await llamar(admin, { accion: "verificar", reto: q.cuerpo.reto, codigo: recuperacion[0].toUpperCase() });
  assert.equal(conRec.estado, 200);
  assert.equal(conRec.cuerpo.codigosRestantes, 7);
  const q2 = await llamar(admin, { accion: "entrar", correo: "ana@jurmia.es", clave: "ClaveAna2026" });
  assert.equal((await llamar(admin, { accion: "verificar", reto: q2.cuerpo.reto, codigo: recuperacion[0] })).estado, 401);

  // Cinco códigos mal y hay que volver a empezar
  let ultimo;
  for (let i = 0; i < 4; i++) ultimo = await llamar(admin, { accion: "verificar", reto: q2.cuerpo.reto, codigo: "99999" + i }, { ip: "192.0.2." + (10 + i) });
  assert.equal(ultimo.cuerpo.reiniciar, true);

  // Estado en la página de Seguridad
  const est = await llamar(seguridad, { accion: "estado" }, { token: conRec.cuerpo.token });
  assert.equal(est.estado, 200);
  assert.equal(est.cuerpo.dosPasos.activo, true);
  assert.equal(est.cuerpo.dosPasos.codigosRestantes, 7);
  assert.equal(est.cuerpo.equipo.length, 2);
  assert.deepEqual(est.cuerpo.equipo.map((e) => [e.correo, e.dosPasos]), [["ana@jurmia.es", true], ["luis@jurmia.es", false]]);
  assert.ok(est.cuerpo.sesiones.length >= 2);
  assert.ok(est.cuerpo.accesos.some((a) => a.motivo === "Entrada con código de recuperación"));
  assert.ok(est.cuerpo.accesos.some((a) => a.motivo === "Verificación en dos pasos activada"));

  // Códigos nuevos: solo con el código de la app
  const renov = await llamar(seguridad, { accion: "2fa-regenerar", clave: "ClaveAna2026", codigo: recuperacion[1] }, { token: conRec.cuerpo.token });
  assert.equal(renov.estado, 403);
  // (se espera al siguiente periodo para tener un código sin usar)
  const otro = await llamar(seguridad, { accion: "2fa-regenerar", clave: "ClaveAna2026", codigo: codigoAhora(secreto, -1) }, { token: conRec.cuerpo.token });
  assert.equal(otro.estado, 403, "el contador anterior al último usado ya no vale");

  // Desactivar con contraseña y código de recuperación
  const des = await llamar(seguridad, { accion: "2fa-desactivar", clave: "ClaveAna2026", codigo: recuperacion[2] }, { token: conRec.cuerpo.token });
  assert.equal(des.estado, 200);
  const sin = await llamar(admin, { accion: "entrar", correo: "ana@jurmia.es", clave: "ClaveAna2026" });
  assert.equal(sin.cuerpo.dosPasos, false);
  assert.ok(sin.cuerpo.token);
});

test("Quitar la verificación a otra persona exige tener la propia", async () => {
  // Luis activa la suya
  const luis = (await llamar(admin, { accion: "entrar", correo: "luis@jurmia.es", clave: "ClaveLuis2026" }, { ip: "198.51.100.7" })).cuerpo.token;
  const ini = await llamar(seguridad, { accion: "2fa-iniciar", clave: "ClaveLuis2026" }, { token: luis, ip: "198.51.100.7" });
  const secLuis = ini.cuerpo.secreto.replace(/\s/g, "");
  assert.equal((await llamar(seguridad, { accion: "2fa-confirmar", codigo: codigoAhora(secLuis) }, { token: luis })).estado, 200);

  // Ana, sin 2FA, no puede quitársela
  const ana = (await llamar(admin, { accion: "entrar", correo: "ana@jurmia.es", clave: "ClaveAna2026" })).cuerpo.token;
  const sinPropia = await llamar(seguridad, { accion: "quitar-2fa", correo: "luis@jurmia.es", clave: "ClaveAna2026", codigo: "123456" }, { token: ana });
  assert.equal(sinPropia.estado, 403);

  // Ana activa la suya y entonces sí (con su contraseña y su código)
  const iniA = await llamar(seguridad, { accion: "2fa-iniciar", clave: "ClaveAna2026" }, { token: ana });
  const secAna = iniA.cuerpo.secreto.replace(/\s/g, "");
  const c1 = Math.floor(Date.now() / 30000);
  assert.equal((await llamar(seguridad, { accion: "2fa-confirmar", codigo: S.codigoHOTP(secAna, c1) }, { token: ana })).estado, 200);
  const quitar = await llamar(seguridad, { accion: "quitar-2fa", correo: "luis@jurmia.es", clave: "ClaveAna2026", codigo: S.codigoHOTP(secAna, c1 + 1) }, { token: ana });
  assert.equal(quitar.estado, 200);
  assert.ok(quitar.cuerpo.sesionesCerradas >= 1);
  assert.equal((await llamar(admin, { accion: "yo" }, { token: luis })).estado, 401);
  assert.equal(await S.leer2FA("luis@jurmia.es"), null);
});

test("Sesiones: ver y cerrar desde Seguridad", async () => {
  const luis = (await llamar(admin, { accion: "entrar", correo: "luis@jurmia.es", clave: "ClaveLuis2026" }, { ip: "198.51.100.8" })).cuerpo.token;
  const otra = (await llamar(admin, { accion: "entrar", correo: "luis@jurmia.es", clave: "ClaveLuis2026" }, { ip: "198.51.100.9", ua: "Mozilla/5.0 (iPhone)" })).cuerpo.token;
  const est = await llamar(seguridad, { accion: "estado" }, { token: luis, ip: "198.51.100.8" });
  const mia = est.cuerpo.estaSesion;
  const movil = est.cuerpo.sesiones.find((x) => x.correo === "luis@jurmia.es" && x.id !== mia && x.ip === "198.51.100.9");
  assert.ok(movil, "aparece la sesión del móvil");
  const c = await llamar(seguridad, { accion: "cerrar-sesion", id: movil.id }, { token: luis });
  assert.equal(c.estado, 200);
  assert.equal(c.cuerpo.propia, false);
  assert.equal((await llamar(admin, { accion: "yo" }, { token: otra, ua: "Mozilla/5.0 (iPhone)" })).estado, 401);
  assert.equal((await llamar(admin, { accion: "yo" }, { token: luis })).estado, 200);

  const todas = await llamar(seguridad, { accion: "cerrar-mias", incluida: true }, { token: luis });
  assert.equal(todas.estado, 200);
  assert.equal((await llamar(admin, { accion: "yo" }, { token: luis })).estado, 401);
});

/* ------------------------------------------------------------------ */
/* Registro de consentimientos                                         */
/* ------------------------------------------------------------------ */
test("Registro de consentimientos: anotar, buscar y exportar", async () => {
  const id = "3f2b6c1e-8a4d-4e7b-9c2a-1d5e6f7a8b9c";
  const texto = "Cookies en esta web Usamos cookies propias necesarias…";
  const base = { accion: "consentimiento", id, version: 1, texto, pagina: "/areas/laboral" };
  const desdeFuera = await llamar(seguridad, { ...base, via: "banner-aceptar", analitica: true, marketing: true }, { origen: "https://otra-web.com" });
  assert.equal(desdeFuera.estado, 403);
  const malId = await llamar(seguridad, { ...base, id: "<script>" }, { origen: "https://www.jurmiabogados.es" });
  assert.equal(malId.estado, 400);

  assert.equal((await llamar(seguridad, { ...base, via: "banner-aceptar", analitica: true, marketing: true }, { origen: "https://www.jurmiabogados.es" })).estado, 200);
  assert.equal((await llamar(seguridad, { ...base, via: "panel-guardar", analitica: true, marketing: false }, { ip: "81.0.0.2" })).estado, 200);
  assert.equal((await llamar(seguridad, { ...base, id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", via: "banner-rechazar", analitica: false, marketing: false }, {})).estado, 200);

  // La IP nunca se guarda en claro
  const filas = r.redis.ejecutar(["ZRANGE", "cookies:registro", "0", "-1"]);
  assert.equal(filas.length, 3);
  for (const f of filas) assert.ok(!f.includes("81.0.0."), "sin IP en claro");
  // El texto se guarda una sola vez
  assert.equal(r.redis.ejecutar(["HGETALL", "cookies:textos"]).length, 2);

  const ana = (await llamar(admin, { accion: "entrar", correo: "luis@jurmia.es", clave: "ClaveLuis2026" }, { ip: "198.51.100.20" })).cuerpo.token;
  const opc = { token: ana, ip: "198.51.100.20" };
  const est = await llamar(seguridad, { accion: "estado" }, opc);
  assert.equal(est.cuerpo.consentimientos.total, 3);
  assert.deepEqual(est.cuerpo.consentimientos.reparto, { todas: 1, ninguna: 1, parcial: 1 });

  const h = await llamar(seguridad, { accion: "consentimientos-buscar", id: id.toUpperCase() }, opc);
  assert.equal(h.estado, 200);
  assert.equal(h.cuerpo.registros.length, 2);
  assert.equal(h.cuerpo.registros[0].opcion, "panel-guardar");
  assert.equal(h.cuerpo.registros[0].textoMostrado, texto);
  assert.equal(h.cuerpo.registros[1].decision, "todas");

  const csv = await llamar(seguridad, { accion: "consentimientos-csv" }, opc);
  assert.equal(csv.estado, 200);
  assert.match(csv.cabeceras["content-type"], /text\/csv/);
  const lineas = csv.cuerpo.trim().split("\r\n");
  assert.equal(lineas.length, 4);
  assert.ok(csv.cuerpo.startsWith("\uFEFF"), "lleva BOM para que Excel lea bien los acentos");
  assert.match(lineas[0], /^fecha_utc;fecha_hora_madrid;identificador/);
  assert.match(lineas[1], /Aviso · Rechazar todas/);   // de la más reciente a la más antigua
  assert.match(lineas[2], /Configuración · Guardar preferencias/);

  const hoy = new Date().toISOString().slice(0, 10);
  const vacio = await llamar(seguridad, { accion: "consentimientos-csv", desde: "2020-01-01", hasta: "2020-12-31" }, opc);
  assert.equal(vacio.cuerpo.trim().split("\r\n").length, 1);
  const deHoy = await llamar(seguridad, { accion: "consentimientos-csv", desde: hoy, hasta: hoy }, opc);
  assert.equal(deHoy.cuerpo.trim().split("\r\n").length, 4);

  const t = await llamar(seguridad, { accion: "consentimientos-textos" }, opc);
  assert.match(t.cuerpo, /Usamos cookies propias necesarias/);

  // Sin sesión no se puede leer
  assert.equal((await llamar(seguridad, { accion: "consentimientos-csv" }, {})).estado, 401);

  // Lo que manda el navegador nunca llega a Excel como fórmula
  await llamar(seguridad, { ...base, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", pagina: "=HYPERLINK(\"http://x\")", via: "+raro", analitica: false, marketing: false }, { ip: "81.0.0.3" });
  const csv2 = (await llamar(seguridad, { accion: "consentimientos-csv" }, opc)).cuerpo;
  assert.match(csv2, /;"'=HYPERLINK\(""http:\/\/x""\)";/);
  assert.match(csv2, /;"'\+raro";/);
});

test("Una sesión cerrada no revive aunque llegue a la vez una petición suya", async () => {
  const t = (await llamar(admin, { accion: "entrar", correo: "luis@jurmia.es", clave: "ClaveLuis2026" }, { ip: "198.51.100.30" })).cuerpo.token;
  const huella = S.sha256(t);
  // Se fuerza que toque renovar la actividad
  const s = JSON.parse(r.redis.ejecutar(["GET", "seg:ses:" + huella]));
  s.actividad = new Date(Date.now() - 5 * 60000).toISOString();
  r.redis.ejecutar(["SET", "seg:ses:" + huella, JSON.stringify(s), "EX", "1800"]);
  // La petición lee la sesión… y justo entonces se cierra desde otro sitio
  const original = r.redis.ejecutar;
  let cerrada = false;
  r.redis.ejecutar = (partes) => {
    const out = original(partes);
    if (!cerrada && partes[0] === "GET" && partes[1] === "seg:ses:" + huella) { cerrada = true; original(["DEL", "seg:ses:" + huella]); }
    return out;
  };
  try {
    await llamar(admin, { accion: "yo" }, { token: t });
  } finally {
    r.redis.ejecutar = original;
  }
  assert.equal(r.redis.ejecutar(["GET", "seg:ses:" + huella]), null);
  assert.equal((await llamar(admin, { accion: "yo" }, { token: t })).estado, 401);
});
