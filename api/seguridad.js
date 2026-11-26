/**
 * API de SEGURIDAD DEL PANEL y del REGISTRO DE CONSENTIMIENTOS · JURMIA Abogados
 * ---------------------------------------------------------------------------
 * Sin sesión (lo llama el aviso de cookies de la web pública):
 *   { accion: "consentimiento", id, version, analitica, marketing, via, texto, pagina }
 *
 * Con sesión (página /admin/seguridad). Las acciones sobre la verificación en
 * dos pasos afectan siempre a la cuenta de quien las hace, salvo «quitar-2fa»:
 *   estado                                → 2FA, equipo, sesiones abiertas,
 *                                           últimos accesos y resumen del registro
 *   2fa-iniciar     { clave }             → código QR para la app
 *   2fa-confirmar   { codigo }            → activa la verificación y da los códigos de recuperación
 *   2fa-desactivar  { clave, codigo }     → la desactiva
 *   2fa-regenerar   { clave, codigo }     → códigos de recuperación nuevos (anula los anteriores)
 *   quitar-2fa      { correo, clave, codigo } → se la quita a OTRA persona que ha perdido el móvil
 *   cerrar-sesion   { id }                → cierra una sesión concreta (de cualquiera del equipo)
 *   cerrar-mias     { incluida }          → cierra mis sesiones en los demás dispositivos (o en todos)
 *   consentimientos-buscar { id }         → historial de un visitante
 *   consentimientos-csv    { desde, hasta } → CSV para Excel
 *   consentimientos-textos                → CSV con los textos literales mostrados
 *
 * Una contraseña o un código incorrectos responden 403, no 401: el 401 queda
 * reservado a «la sesión ha caducado», que es lo que hace que el panel pida
 * de nuevo la contraseña (assets/js/panel-acceso.js).
 */

import QRCode from "qrcode";
import {
  exigirSesion, cuerpoDe, ipDe, usuarios, buscarUsuario, claveCorrecta,
  bloqueoActivo, anotarAcceso, anotarFallo, ultimosAccesos,
  sesionesAbiertas, cerrarSesionesDe, cerrarSesionPorId,
  leer2FA, codigosRestantes, nuevoSecreto2FA, comprobarTOTP, uriOtpauth,
  activar2FA, quitar2FA, regenerarCodigos, verificarSegundoPaso,
  guardarPendiente, leerPendiente, borrarPendiente,
  INACTIVIDAD_SEG, DURACION_MAX_SEG, QR_SEG, AVISO_ALMACEN
} from "./_seguridad.js";
import {
  anotarConsentimiento, resumenConsentimientos, historialDe, csvConsentimientos, csvTextos
} from "./_consentimientos.js";

const CON_CLAVE = ["2fa-iniciar", "2fa-desactivar", "2fa-regenerar", "quitar-2fa"];

const espera = (minutos) => `Demasiados intentos fallidos. Espere ${minutos} min.`;

function enviarCSV(res, nombre, contenido) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  return res.status(200).send(contenido);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const d = cuerpoDe(req);
  const accion = String(d.accion || "").slice(0, 40);

  /* ---------- Registro de consentimientos: público ---------- */
  if (accion === "consentimiento") {
    const r = await anotarConsentimiento(req, d);
    return res.status(r.estado).json(r.cuerpo);
  }

  /* ---------- Todo lo demás, con sesión ---------- */
  const control = await exigirSesion(req);
  if (control.error) return res.status(control.estado).json({ error: control.error });
  const s = control.sesion;
  const yo = s.usuario;

  try {
    // Las acciones que piden la contraseña están sujetas al mismo límite de intentos que la entrada
    if (CON_CLAVE.includes(accion)) {
      const minutos = await bloqueoActivo(ipDe(req), yo.correo);
      if (minutos) return res.status(429).json({ error: espera(minutos) });
    }

    switch (accion) {
      /* =================================================================== */
      case "estado": {
        const [mi2FA, sesiones, accesos] = await Promise.all([
          leer2FA(yo.correo), sesionesAbiertas(), ultimosAccesos(400)
        ]);
        const equipo = [];
        for (const u of usuarios()) {
          const cfg = u.correo === yo.correo ? mi2FA : await leer2FA(u.correo);
          const ultima = accesos.find((a) => a.correo === u.correo && a.tipo === "entrada");
          equipo.push({
            correo: u.correo,
            nombre: u.nombre,
            yo: u.correo === yo.correo,
            dosPasos: !!cfg,
            desde: cfg ? cfg.desde : null,
            sesiones: sesiones.filter((x) => x.correo === u.correo).length,
            ultimaEntrada: ultima ? ultima.fecha : null
          });
        }
        let consentimientos = null;
        try { consentimientos = await resumenConsentimientos(); } catch (e) { console.warn(e.message); }
        const nombres = Object.fromEntries(usuarios().map((u) => [u.correo, u.nombre]));
        return res.status(200).json({
          yo: { correo: yo.correo, nombre: yo.nombre },
          dosPasos: mi2FA
            ? { activo: true, desde: mi2FA.desde, codigosRestantes: await codigosRestantes(yo.correo) }
            : { activo: false },
          equipo,
          sesiones,
          estaSesion: s.huella.slice(0, 32),
          accesos: accesos.slice(0, 50).map((a) => ({ ...a, nombre: nombres[a.correo] || "" })),
          tuIP: ipDe(req),
          inactividadMin: Math.round(INACTIVIDAD_SEG / 60),
          duracionMaxHoras: Math.round(DURACION_MAX_SEG / 3600),
          consentimientos
        });
      }

      /* ---------- Activar · paso 1: comprobar la contraseña y generar el QR ---------- */
      case "2fa-iniciar": {
        if (!claveCorrecta(yo, d.clave)) {
          await anotarFallo(req, { motivo: "Contraseña incorrecta al activar la verificación", correo: yo.correo });
          return res.status(403).json({ error: "La contraseña no es correcta." });
        }
        if (await leer2FA(yo.correo)) return res.status(400).json({ error: "La verificación en dos pasos ya está activada." });
        const secreto = nuevoSecreto2FA();
        await guardarPendiente(s.huella, secreto);
        const uri = uriOtpauth(secreto, yo.correo);
        const qr = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
        return res.status(200).json({
          secreto: secreto.replace(/(.{4})/g, "$1 ").trim(),
          uri,
          qr,
          caducaMin: Math.round(QR_SEG / 60)
        });
      }

      /* ---------- Activar · paso 2: comprobar el primer código ---------- */
      case "2fa-confirmar": {
        const secreto = await leerPendiente(s.huella);
        if (!secreto) return res.status(400).json({ error: "El código QR ha caducado. Vuelva a empezar.", reiniciar: true });
        const contador = comprobarTOTP(secreto, d.codigo);
        if (contador < 0) {
          return res.status(400).json({ error: "El código no es correcto. Compruebe que la hora del móvil está en automático." });
        }
        const codigos = await activar2FA(yo.correo, secreto, contador);
        await borrarPendiente(s.huella);
        // Con la verificación recién activada se cierran las otras sesiones de
        // la cuenta (las abiertas solo con contraseña). Esta sigue abierta.
        await cerrarSesionesDe(yo.correo, { excepto: s.huella });
        await anotarAcceso(req, { motivo: "Verificación en dos pasos activada", correo: yo.correo });
        return res.status(200).json({ ok: true, codigos });
      }

      /* ---------- Desactivar: contraseña + código de la app o de recuperación ---------- */
      case "2fa-desactivar": {
        if (!(await leer2FA(yo.correo))) return res.status(400).json({ error: "La verificación en dos pasos no está activada." });
        const claveOK = claveCorrecta(yo, d.clave);
        const codOK = claveOK ? (await verificarSegundoPaso(yo.correo, String(d.codigo || "").slice(0, 20))).ok : false;
        if (!claveOK || !codOK) {
          await anotarFallo(req, { motivo: "Datos incorrectos al desactivar la verificación", correo: yo.correo });
          return res.status(403).json({ error: "La contraseña o el código no son correctos." });
        }
        await quitar2FA(yo.correo);
        await anotarAcceso(req, { motivo: "Verificación en dos pasos desactivada", correo: yo.correo });
        return res.status(200).json({ ok: true });
      }

      /* ---------- Códigos de recuperación nuevos ---------- */
      case "2fa-regenerar": {
        if (!(await leer2FA(yo.correo))) return res.status(400).json({ error: "La verificación en dos pasos no está activada." });
        const claveOK = claveCorrecta(yo, d.clave);
        // Aquí solo vale el código de la app: con uno de recuperación se podrían encadenar códigos nuevos sin el móvil
        const codOK = claveOK ? (await verificarSegundoPaso(yo.correo, String(d.codigo || "").slice(0, 20), { soloApp: true })).ok : false;
        if (!claveOK || !codOK) {
          await anotarFallo(req, { motivo: "Datos incorrectos al renovar los códigos de recuperación", correo: yo.correo });
          return res.status(403).json({ error: "La contraseña o el código de la app no son correctos." });
        }
        const codigos = await regenerarCodigos(yo.correo);
        await anotarAcceso(req, { motivo: "Códigos de recuperación renovados", correo: yo.correo });
        return res.status(200).json({ ok: true, codigos });
      }

      /* ---------- Quitar la verificación a otra persona (ha perdido el móvil y los códigos) ---------- */
      case "quitar-2fa": {
        const otro = buscarUsuario(d.correo);
        if (!otro) return res.status(404).json({ error: "Esa cuenta no está en ADMIN_USUARIOS." });
        if (otro.correo === yo.correo) {
          return res.status(400).json({ error: "Su propia verificación se desactiva en el bloque «Mi verificación en dos pasos»." });
        }
        if (!(await leer2FA(otro.correo))) return res.status(400).json({ error: "Esa cuenta no tiene activada la verificación." });
        if (!(await leer2FA(yo.correo))) {
          return res.status(403).json({
            error: "Para quitar la verificación de otra persona, active antes la suya. Así nadie puede hacerlo solo con una contraseña."
          });
        }
        const claveOK = claveCorrecta(yo, d.clave);
        const codOK = claveOK ? (await verificarSegundoPaso(yo.correo, String(d.codigo || "").slice(0, 20), { soloApp: true })).ok : false;
        if (!claveOK || !codOK) {
          await anotarFallo(req, { motivo: "Datos incorrectos al quitar la verificación de " + otro.correo, correo: yo.correo });
          return res.status(403).json({ error: "Su contraseña o el código de su app no son correctos." });
        }
        await quitar2FA(otro.correo);
        const cerradas = await cerrarSesionesDe(otro.correo);
        await anotarAcceso(req, { motivo: `Verificación en dos pasos quitada a ${otro.correo}`, correo: yo.correo });
        return res.status(200).json({ ok: true, sesionesCerradas: cerradas });
      }

      /* ---------- Sesiones ---------- */
      case "cerrar-sesion": {
        const id = String(d.id || "").toLowerCase();
        const correo = await cerrarSesionPorId(id);
        if (!correo) return res.status(404).json({ error: "Esa sesión ya no está abierta." });
        const propia = id === s.huella.slice(0, 32);
        await anotarAcceso(req, {
          motivo: correo === yo.correo ? "Sesión cerrada desde Seguridad" : `Sesión de ${correo} cerrada desde Seguridad`,
          correo: yo.correo
        });
        return res.status(200).json({ ok: true, propia });
      }

      case "cerrar-mias": {
        const incluida = d.incluida === true;
        const n = await cerrarSesionesDe(yo.correo, incluida ? {} : { excepto: s.huella });
        await anotarAcceso(req, {
          motivo: incluida ? "Sesiones cerradas en todos los dispositivos" : "Sesiones cerradas en los demás dispositivos",
          correo: yo.correo
        });
        return res.status(200).json({ ok: true, cerradas: n, propia: incluida });
      }

      /* ---------- Registro de consentimientos ---------- */
      case "consentimientos-buscar": {
        const r = await historialDe(d.id);
        if (r.error) return res.status(400).json(r);
        return res.status(200).json(r);
      }

      case "consentimientos-csv": {
        const { csv, filas, truncado } = await csvConsentimientos({ desde: d.desde, hasta: d.hasta });
        res.setHeader("X-Filas", String(filas));
        res.setHeader("X-Truncado", truncado ? "si" : "no");
        const hoy = new Date().toISOString().slice(0, 10);
        return enviarCSV(res, `consentimientos-cookies-${hoy}.csv`, csv);
      }

      case "consentimientos-textos": {
        return enviarCSV(res, "consentimientos-cookies-textos.csv", await csvTextos());
      }

      default:
        return res.status(400).json({ error: "Acción no reconocida." });
    }
  } catch (e) {
    console.error("Seguridad:", accion, e);
    return res.status(503).json({ error: AVISO_ALMACEN });
  }
}
