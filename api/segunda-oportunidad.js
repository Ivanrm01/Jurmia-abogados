/**
 * Recepción de contactos del test de Ley de Segunda Oportunidad.
 *
 * El test se vuelve a evaluar aquí: lo que manda el navegador son respuestas,
 * nunca el resultado. Después se guarda el expediente, se reparte entre los
 * responsables, se avisa al despacho y, si hay correo, se envía al cliente el
 * acuse con su resultado y los primeros documentos que le pediremos.
 *
 * Si el mismo teléfono repite el test mientras su expediente sigue en
 * captación, se actualiza ese expediente en lugar de abrir uno nuevo.
 *
 * Admite además:
 *  · calculo: los importes de la calculadora «¿Cuánto puede cancelar?», que se
 *    recalculan aquí y quedan en el expediente;
 *  · urgente: { tipo } para la vía urgente (embargo, demanda, subasta), que
 *    puede llegar sin test: solo nombre y teléfono.
 */

import {
  almacenDisponible, expedientePorTelefono, recordarTelefono, leerExpediente, siguienteTurno
} from "./_almacen-lso.js";
import { contarEnvios } from "./_almacen.js";
import { enviarCorreo, correoConfigurado } from "./_correo.js";
import { M, limpio, nuevoExpediente, origenDe, persistir, responsables, tarifas, anotar } from "./_lso.js";
import { acuseCliente, avisoDespacho } from "./_correos-lso.js";

const LIMITE_POR_HORA = 10;
const PROVINCIAS = new Set(M.PROVINCIAS);
export const URGENCIAS = {
  embargo: "Embargo de nómina, pensión o cuenta",
  demanda: "Demanda, monitorio o carta del juzgado",
  subasta: "Subasta o desahucio de la vivienda",
  otra: "Otra urgencia"
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Método no permitido" });
    }

    let d = {};
    try {
      d = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    } catch {
      return res.status(400).json({ error: "El cuerpo de la petición no es JSON válido." });
    }

    // Campo trampa: si viene relleno es un robot; se responde bien para no dar pistas.
    if (d.empresa) return res.status(200).json({ ok: true, referencia: "S000000-0000" });

    if (!d.consentimiento) {
      return res.status(400).json({ error: "Falta el consentimiento para tratar los datos." });
    }
    const nombre = limpio(d.nombre, 120);
    const telefono = limpio(d.telefono, 40);
    const email = limpio(d.email, 160);
    if (!nombre || !telefono) {
      return res.status(400).json({ error: "Necesitamos su nombre y un teléfono para llamarle." });
    }
    if (telefono.replace(/\D/g, "").length < 9) {
      return res.status(400).json({ error: "Revise el teléfono: debe tener al menos nueve cifras." });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "El correo electrónico no es válido." });
    }
    const urgente = d.urgente && URGENCIAS[d.urgente.tipo]
      ? { tipo: d.urgente.tipo, texto: URGENCIAS[d.urgente.tipo], fecha: new Date().toISOString() }
      : null;
    const conTest = M.validarRespuestas(d.respuestas);
    if (!conTest && !urgente) {
      return res.status(400).json({ error: "Faltan respuestas del test. Vuelva atrás y complételo." });
    }
    const respuestas = conTest ? M.normalizarRespuestas(d.respuestas) : null;
    const estimacion = d.calculo && typeof d.calculo === "object" ? M.estimarCancelacion(d.calculo) : null;
    const calculadora = estimacion && estimacion.total > 0 ? estimacion : null;

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "desconocida";
    try {
      if (almacenDisponible() && (await contarEnvios("lso:" + ip)) > LIMITE_POR_HORA) {
        return res.status(429).json({ error: "Demasiados envíos desde esta conexión. Inténtelo más tarde o llámenos." });
      }
    } catch (e) {
      console.error("Freno de envíos no disponible:", e.message);
    }

    const cliente = {
      nombre,
      telefono,
      email,
      provincia: PROVINCIAS.has(d.provincia) ? d.provincia : "",
      canal: ["llamada", "whatsapp", "email"].includes(d.canal) ? d.canal : "llamada",
      franja: ["manana", "tarde", "indiferente"].includes(d.franja) ? d.franja : "indiferente",
      observaciones: limpio(d.observaciones, 2000)
    };
    const consentimiento = {
      aceptado: true, fecha: new Date().toISOString(), ip, textoVersion: "privacidad-2026"
    };

    let expediente = null;
    let repetido = false;
    let guardado = false;

    if (almacenDisponible()) {
      try {
        // ¿Ya lo teníamos? Si sigue en captación, se actualiza en lugar de duplicar.
        const previoId = await expedientePorTelefono(telefono);
        const previo = previoId ? await leerExpediente(previoId) : null;
        if (previo && M.FASES_CAPTACION.includes(previo.fase)) {
          previo.cliente = Object.assign({}, previo.cliente, cliente, {
            email: cliente.email || previo.cliente.email,
            provincia: cliente.provincia || previo.cliente.provincia,
            observaciones: [previo.cliente.observaciones, cliente.observaciones].filter(Boolean).join("\n—\n").slice(0, 3000)
          });
          if (respuestas) {
            previo.respuestas = respuestas;
            previo.resultado = M.evaluar(respuestas, tarifas());
          }
          if (calculadora) previo.calculadora = calculadora;
          if (urgente) previo.urgente = urgente;
          previo.consentimiento = consentimiento;
          anotar(previo, "Web", urgente && !respuestas
            ? `Ha vuelto a escribir por la vía urgente: ${urgente.texto}`
            : `Ha vuelto a hacer el test: ${previo.resultado ? previo.resultado.titulo.toLowerCase() + " · " + previo.resultado.viaTitulo : "sin resultado"}`, "sistema");
          expediente = previo;
          repetido = true;
        } else if (previo && M.FASES_CLIENTE.includes(previo.fase)) {
          // Ya es cliente: no se abre otro expediente ni se tocan sus datos.
          anotar(previo, "Web", (urgente ? `Ha escrito por la vía urgente (${urgente.texto})` : "Ha vuelto a hacer el test desde la web") +
            (cliente.observaciones ? `. Nos dice: ${cliente.observaciones}` : ""), "sistema");
          expediente = previo;
          repetido = true;
        }
      } catch (e) {
        console.error("No se pudo comprobar si el contacto ya existía:", e.message);
      }
    }

    if (!expediente) {
      let asignado = "";
      try {
        if (almacenDisponible()) asignado = await siguienteTurno(responsables());
      } catch (e) {
        console.error("Reparto por turnos no disponible:", e.message);
      }
      expediente = nuevoExpediente({
        cliente,
        respuestas,
        origen: origenDe(d.origen),
        consentimiento,
        comercial: d.comercial === true,
        asignado,
        calculadora,
        urgente
      });
    }

    try {
      if (almacenDisponible()) {
        await persistir(expediente);
        await recordarTelefono(telefono, expediente.id);
        guardado = true;
      }
    } catch (e) {
      console.error("No se pudo guardar el expediente:", e.message);
    }

    if (correoConfigurado()) {
      try {
        const aviso = avisoDespacho(expediente, { guardado, repetido });
        await enviarCorreo({ remitente: "Segunda Oportunidad JURMIA", asunto: aviso.asunto, html: aviso.html, responderA: email });
      } catch (e) {
        console.error("No se pudo avisar al despacho:", e.message);
      }
      if (email) {
        try {
          const acuse = acuseCliente(expediente);
          await enviarCorreo({ remitente: "JURMIA Abogados", para: email, asunto: acuse.asunto, html: acuse.html });
        } catch (e) {
          console.error("No se pudo enviar el acuse al cliente:", e.message);
        }
      }
    }

    if (!guardado) {
      console.error("CONTACTO LSO SIN ALMACENAR:", JSON.stringify(expediente).slice(0, 3000));
    }

    const r = expediente.resultado || (respuestas ? M.evaluar(respuestas, tarifas()) : null);
    return res.status(200).json({
      ok: true,
      referencia: expediente.id,
      urgente: Boolean(expediente.urgente),
      resultado: r ? { encaje: r.encaje, titulo: r.titulo, via: r.via, viaTitulo: r.viaTitulo } : null
    });
  } catch (error) {
    console.error("Segunda oportunidad:", error);
    return res.status(500).json({ error: (error && error.message) || "Error inesperado en el servidor." });
  }
}
