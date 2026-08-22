/**
 * Verificación de la sesión del panel.
 *
 * Reutiliza el mismo formato de token firmado que api/admin.js, de modo que
 * quien entra en el panel del blog entra también en el de reclamaciones sin
 * volver a identificarse.
 */

import crypto from "node:crypto";

function firmar(datos, secreto) {
  return crypto.createHmac("sha256", secreto).update(datos).digest("base64url");
}

/** Devuelve la sesión si el token es válido y no ha caducado, o null. */
export function leerToken(token, secreto) {
  if (!token || !secreto || !token.includes(".")) return null;
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

/**
 * Extrae y valida la sesión de la cabecera Authorization.
 * Devuelve { sesion } o { error, estado } listo para responder.
 */
export function exigirSesion(req) {
  const secreto = process.env.ADMIN_SECRETO;
  if (!secreto) {
    return { error: "El panel no está configurado: falta ADMIN_SECRETO.", estado: 500 };
  }
  const cabecera = req.headers.authorization || "";
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
  const sesion = leerToken(token, secreto);
  if (!sesion) return { error: "Sesión caducada. Vuelva a entrar.", estado: 401 };
  return { sesion };
}
