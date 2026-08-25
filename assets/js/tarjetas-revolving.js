/**
 * Formulario público de tarjetas revolving.
 *
 * Criterio de diseño: pedir lo mínimo. El cliente rara vez conserva el contrato
 * y casi nunca recuerda la TAE, así que lo obligatorio se reduce a entidad,
 * época aproximada, situación e indicios de falta de transparencia. Las cifras
 * exactas quedan en un desplegable opcional y, si no llegan, se reclaman
 * después a la entidad.
 *
 * El cálculo se repite en el servidor: esto es solo el gancho.
 */
(function () {
  "use strict";

  var M = window.MotorRevolving;
  if (!M || !document.getElementById("calculadora")) return;

  var $ = function (id) { return document.getElementById(id); };

  function alPulsar(id, evento, fn) {
    var el = $(id);
    if (!el) { console.warn("Falta en el HTML el elemento:", id); return; }
    el.addEventListener(evento, fn);
  }

  /* Entidades que concentran la mayoría de los casos, para no hacer escribir. */
  var ENTIDADES = ["WiZink", "Cofidis", "Carrefour Pass", "Cetelem", "Oney", "Santander",
                   "CaixaBank", "BBVA", "Bankinter", "El Corte Inglés", "Vivus", "Otra"];

  /**
   * Épocas en lugar de año exacto. Se envía un año representativo del tramo:
   * para los anteriores a 2010 vale cualquiera, porque la doctrina aplica a
   * todos ellos el mismo término de comparación del 19,32 %.
   */
  var EPOCAS = {
    pre2010: 2008,
    "2010-2015": 2013,
    "2016-2020": 2018,
    post2020: 2022,
    nose: 2016
  };

  /* Solo los cinco indicios de más peso, redactados como los cuenta el cliente. */
  var INDICIOS_VISIBLES = [
    { id: "sin_explicar_revolving", texto: "Nadie me explicó que la deuda se recalcula y puede no bajar" },
    { id: "lugar_venta", texto: "La firmé en una tienda, en un stand o por teléfono, deprisa" },
    { id: "sin_ejemplo", texto: "No me enseñaron cuánto acabaría pagando en total" },
    { id: "sin_precontractual", texto: "No me dieron ningún papel antes de firmar" },
    { id: "sin_copia", texto: "No conservo el contrato ni me lo entregaron" }
  ];

  var estado = { entidad: "", epoca: "", situacion: "", indicios: [] };

  /* ---------------- entidad ---------------- */

  $("entidades").innerHTML = ENTIDADES.map(function (n) {
    return '<button type="button" data-id="' + n + '" aria-pressed="false">' + n + "</button>";
  }).join("");

  alPulsar("entidades", "click", function (ev) {
    var b = ev.target.closest("button[data-id]");
    if (!b) return;
    estado.entidad = b.getAttribute("data-id");
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", x === b);
    });
    var otra = estado.entidad === "Otra";
    $("caja-otra").classList.toggle("oculto", !otra);
    if (otra) $("entidad-otra").focus();
    calcular();
  });

  /* ---------------- época ---------------- */

  alPulsar("epoca", "click", function (ev) {
    var b = ev.target.closest("button[data-id]");
    if (!b) return;
    estado.epoca = b.getAttribute("data-id");
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", x === b);
    });
    calcular();
  });

  /* ---------------- situación ---------------- */

  $("situacion").innerHTML = M.SITUACIONES.map(function (s) {
    return '<button type="button" data-id="' + s.id + '" aria-pressed="false">' + s.etiqueta + "</button>";
  }).join("");

  alPulsar("situacion", "click", function (ev) {
    var b = ev.target.closest("button[data-id]");
    if (!b) return;
    estado.situacion = b.getAttribute("data-id");
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", x === b);
    });
    calcular();
  });

  /* ---------------- indicios ---------------- */

  $("indicios").innerHTML = INDICIOS_VISIBLES.map(function (i) {
    return '<label class="marca-op" data-marcado="no"><input type="checkbox" value="' + i.id + '">' +
      "<span>" + i.texto + "</span></label>";
  }).join("");

  alPulsar("indicios", "change", function (ev) {
    var caja = ev.target.closest(".marca-op");
    if (caja) caja.setAttribute("data-marcado", ev.target.checked ? "si" : "no");
    estado.indicios = Array.prototype.slice
      .call(document.querySelectorAll("#indicios input:checked"))
      .map(function (c) { return c.value; });
    calcular();
  });

  ["tae", "anos", "dispuesto", "pagado", "pendiente"].forEach(function (id) {
    alPulsar(id, "input", calcular);
  });

  /* ---------------- valoración ---------------- */

  function nombreEntidad() {
    if (estado.entidad && estado.entidad !== "Otra") return estado.entidad;
    return $("entidad-otra").value.trim();
  }

  function datosCaso() {
    return {
      entidad: nombreEntidad(),
      anio: EPOCAS[estado.epoca] || 0,
      epoca: estado.epoca,
      tae: Number($("tae").value) || 0,
      capitalDispuesto: Number($("dispuesto").value) || 0,
      totalPagado: Number($("pagado").value) || 0,
      deudaPendiente: Number($("pendiente").value) || 0,
      anosPagando: Number($("anos").value) || 0,
      situacion: estado.situacion || "viva",
      indicios: estado.indicios
    };
  }

  function calcular() {
    var datos = datosCaso();
    if (!datos.anio || !estado.situacion) { $("resultado").classList.add("oculto"); return; }

    var r = M.evaluar(datos);
    if (!r.ok) { $("resultado").classList.add("oculto"); return; }

    $("resultado").classList.remove("oculto");
    var via = $("resultado-via"), cifra = $("resultado-cifra"), nota = $("resultado-nota");

    var VIAS = {
      usura: "Vía principal: usura",
      usura_probable: "Vía principal: intereses desproporcionados",
      transparencia: "Vía principal: falta de transparencia",
      a_estudiar: "Merece un estudio"
    };
    via.textContent = VIAS[r.veredicto] || VIAS.a_estudiar;

    if (r.beneficioTotal > 0) {
      cifra.textContent = "Hasta " + M.euros(r.beneficioTotal);
    } else if (r.viable) {
      cifra.textContent = "Su tarjeta es reclamable";
    } else {
      cifra.textContent = "Merece que lo miremos";
    }

    var partes = [];

    if (r.usura === true) {
      partes.push("Con una TAE del " + r.tae + " % frente al umbral de " + r.umbral +
        " % que fija el Tribunal Supremo, el contrato sería nulo por usurario.");
    } else if (r.franjaUsura === "probable") {
      partes.push("Una TAE del " + r.tae +
        " % supera el umbral que resultaría de cualquier tipo medio publicado para este producto, así que la nulidad por usura es muy probable. Lo confirmaremos con el dato oficial del año.");
    } else if (r.franjaUsura === "limite") {
      partes.push("Una TAE del " + r.tae +
        " % está justo en la franja donde se decide el caso: depende del tipo medio oficial de ese año, que consultaremos nosotros.");
    } else if (r.transparencia) {
      partes.push("Ha marcado " + r.indicios.length +
        (r.indicios.length === 1 ? " indicio" : " indicios") +
        " de que no le explicaron cómo funcionaba la tarjeta. Desde 2025 eso basta por sí solo para anular la cláusula de intereses.");
    } else if (estado.indicios.length === 0) {
      partes.push("De momento no ha marcado ningún indicio, pero eso no cierra nada: la mayoría de los casos se ganan con la documentación que le pediremos a la entidad.");
    } else {
      partes.push("Su caso necesita que veamos el contrato antes de decidir la vía. Es lo habitual y no cuesta nada.");
    }

    if (r.exceso > 0) {
      partes.push("Por lo que nos cuenta, ha pagado " + M.euros(r.exceso) + " más de lo que gastó.");
    }
    if (r.deudaPendiente > 0) {
      partes.push("Además dejaría de deber los " + M.euros(r.deudaPendiente) + " que le reclaman.");
    }
    if (estado.situacion === "monitorio") {
      partes.push("Ojo: si ya hay un procedimiento judicial, el plazo para oponerse es de veinte días hábiles y no se recupera. Escríbanos hoy.");
    } else if (estado.situacion === "asnef") {
      partes.push("Estando la deuda discutida, también puede pedirse la baja del fichero de morosos.");
    }
    if (r.beneficioTotal === 0) {
      partes.push("Si nos deja las cifras en el desplegable de arriba, le damos una estimación en euros.");
    }

    nota.textContent = partes.join(" ");
  }

  /* ---------------- envío ---------------- */

  function aviso(texto, error) {
    var caja = $("aviso-envio-revolving");
    if (!caja) return;
    caja.textContent = texto;
    caja.style.borderLeftColor = error ? "#a12a2a" : "";
    caja.classList.add("visible");
  }

  alPulsar("btn-enviar", "click", function () {
    var boton = this;
    if (!nombreEntidad()) return aviso("Indique de qué entidad es la tarjeta.", true);
    if (!estado.epoca) return aviso("Indique más o menos cuándo la contrató.", true);
    if (!estado.situacion) return aviso("Indique cómo está la tarjeta ahora mismo.", true);
    if (!$("nombre").value.trim() || !$("telefono").value.trim() || !$("email").value.trim()) {
      return aviso("Necesitamos su nombre, teléfono y correo para responderle.", true);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("email").value.trim())) {
      return aviso("Revise el correo electrónico.", true);
    }
    if (!$("consentimiento").checked) {
      return aviso("Para estudiar su caso necesitamos que acepte la política de privacidad.", true);
    }

    var cuerpo = datosCaso();
    cuerpo.nombre = $("nombre").value.trim();
    cuerpo.telefono = $("telefono").value.trim();
    cuerpo.email = $("email").value.trim();
    cuerpo.observaciones = $("observaciones").value.trim();
    cuerpo.consentimiento = true;
    cuerpo.empresa = $("empresa").value;

    boton.disabled = true;
    aviso("Enviando su caso al despacho…");

    fetch("/api/revolving", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    })
      .then(function (r) {
        return r.text().then(function (t) {
          var d = null;
          try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
          if (!d) throw new Error("respuesta inesperada del servidor (HTTP " + r.status + ")");
          if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
          return d;
        });
      })
      .then(function (d) {
        aviso("Recibido. Su referencia es " + d.referencia +
          ". Un abogado estudiará el caso y le responderá en 24 horas laborables.");
        $("caja-contacto").querySelectorAll("input, textarea, button").forEach(function (x) { x.disabled = true; });
      })
      .catch(function (e) {
        aviso("No hemos podido enviarlo: " + e.message + ". Escríbanos a info@jurmiabogados.es y lo vemos igualmente.", true);
        boton.disabled = false;
      });
  });
})();
