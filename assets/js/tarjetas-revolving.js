/**
 * Formulario público de reclamación de tarjetas revolving.
 *
 * Muestra al cliente los tres bloques de captura y una valoración orientativa.
 * El análisis jurídico completo, los honorarios y los escritos viven en el
 * panel del despacho. El cálculo se repite en el servidor al recibir el caso.
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

  var estado = { canal: "", situacion: "viva", indicios: [] };

  /* ---------------- indicios de transparencia ---------------- */

  $("indicios").innerHTML = M.INDICIOS.map(function (i) {
    return '<label class="indicio" data-marcado="no" data-id="' + i.id + '">' +
      '<input type="checkbox" value="' + i.id + '">' +
      "<span>" + i.etiqueta + "</span></label>";
  }).join("");

  alPulsar("indicios", "change", function (ev) {
    var caja = ev.target.closest(".indicio");
    if (!caja) return;
    caja.setAttribute("data-marcado", ev.target.checked ? "si" : "no");
    estado.indicios = Array.prototype.slice
      .call(document.querySelectorAll("#indicios input:checked"))
      .map(function (c) { return c.value; });
    calcular();
  });

  /* ---------------- situación actual ---------------- */

  $("situacion").innerHTML = M.SITUACIONES.map(function (s) {
    return '<button type="button" data-id="' + s.id + '" aria-pressed="' + (s.id === estado.situacion) + '">' +
      s.etiqueta + "</button>";
  }).join("");

  function grupoOpciones(id, clave) {
    alPulsar(id, "click", function (ev) {
      var b = ev.target.closest("button[data-id]");
      if (!b) return;
      estado[clave] = b.getAttribute("data-id");
      Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) {
        x.setAttribute("aria-pressed", x === b);
      });
      calcular();
    });
  }
  grupoOpciones("situacion", "situacion");
  grupoOpciones("canal", "canal");

  ["anio", "tae", "dispuesto", "pagado", "pendiente", "anos"].forEach(function (id) {
    alPulsar(id, "input", calcular);
  });

  /* ---------------- valoración ---------------- */

  function datosCaso() {
    return {
      entidad: $("entidad").value.trim(),
      anio: parseInt($("anio").value, 10) || 0,
      canal: estado.canal,
      contrato: $("contrato").value,
      tae: Number($("tae").value) || 0,
      limite: Number($("limite").value) || 0,
      capitalDispuesto: Number($("dispuesto").value) || 0,
      totalPagado: Number($("pagado").value) || 0,
      deudaPendiente: Number($("pendiente").value) || 0,
      anosPagando: Number($("anos").value) || 0,
      situacion: estado.situacion,
      indicios: estado.indicios
    };
  }

  function calcular() {
    var datos = datosCaso();
    if (!datos.anio) { $("resultado").classList.add("oculto"); return; }

    var r = M.evaluar(datos);
    if (!r.ok) { $("resultado").classList.add("oculto"); return; }

    $("resultado").classList.remove("oculto");
    var via = $("resultado-via"), cifra = $("resultado-cifra"), nota = $("resultado-nota");

    var etiquetas = {
      usura: "Vía principal: usura",
      transparencia: "Vía principal: falta de transparencia",
      a_estudiar: "Requiere estudio"
    };
    via.textContent = etiquetas[r.veredicto];

    if (r.beneficioTotal > 0) {
      cifra.textContent = M.euros(r.beneficioTotal);
    } else if (r.viable) {
      cifra.textContent = "Su caso es reclamable";
    } else {
      cifra.textContent = "Conviene revisarlo";
    }

    var partes = [];
    if (r.usura === true) {
      partes.push("La TAE del " + r.tae + " % supera el umbral de " + r.umbral +
        " % que marca el Tribunal Supremo para el año " + r.anio + ", así que el contrato sería nulo por usurario.");
    } else if (r.usura === false) {
      partes.push("La TAE del " + r.tae + " % no alcanza el umbral de usura de " + r.umbral +
        " %, pero eso ya no cierra la puerta.");
    } else if (!r.tae) {
      partes.push("Sin la TAE no podemos aplicar el criterio de usura, pero la reclamaremos a la entidad.");
    } else {
      partes.push("Para comparar su TAE hace falta el tipo medio oficial de " + r.anio + ", que consultaremos nosotros.");
    }

    if (r.transparencia) {
      partes.push("Ha marcado " + r.indicios.length +
        " indicios de que no le explicaron cómo funcionaba la tarjeta, lo que abre la vía de nulidad por falta de transparencia que el Tribunal Supremo consolidó en 2025.");
    }

    if (r.exceso > 0) {
      partes.push("Según sus cifras ha pagado " + M.euros(r.exceso) + " por encima de lo que gastó" +
        (r.limitadoPorPrescripcion ? ", de los que serían recuperables unos " + M.euros(r.recuperable) + " por el límite de los cinco años" : "") + ".");
    }
    if (r.deudaPendiente > 0) {
      partes.push("Además dejaría de deber los " + M.euros(r.deudaPendiente) + " que aún le reclaman.");
    }
    if (r.situacion === "monitorio") {
      partes.push("Atención: si hay un procedimiento judicial en marcha los plazos son muy cortos. Escríbanos hoy mismo.");
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
    if (!$("entidad").value.trim()) return aviso("Indique la entidad o el nombre de la tarjeta.", true);
    if (!$("anio").value) return aviso("Indique el año en que contrató la tarjeta.", true);
    if (!$("nombre").value.trim() || !$("telefono").value.trim() || !$("email").value.trim()) {
      return aviso("Necesitamos su nombre, teléfono y correo para responderle.", true);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("email").value.trim())) {
      return aviso("Revise el correo electrónico.", true);
    }
    if (!$("consentimiento").checked) {
      return aviso("Para poder estudiar su caso necesitamos que acepte la política de privacidad.", true);
    }

    var cuerpo = datosCaso();
    cuerpo.nombre = $("nombre").value.trim();
    cuerpo.telefono = $("telefono").value.trim();
    cuerpo.email = $("email").value.trim();
    cuerpo.observaciones = $("observaciones").value.trim();
    cuerpo.consentimiento = true;
    cuerpo.empresa = $("empresa").value;

    boton.disabled = true;
    aviso("Enviando el caso al despacho…");

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
          ". Un abogado estudiará el contrato y le responderá en 24 horas laborables.");
        $("caja-contacto").querySelectorAll("input, textarea, button").forEach(function (x) { x.disabled = true; });
      })
      .catch(function (e) {
        aviso("No hemos podido enviarlo: " + e.message + ". Escríbanos a info@jurmiabogados.es y lo vemos igualmente.", true);
        boton.disabled = false;
      });
  });
})();
