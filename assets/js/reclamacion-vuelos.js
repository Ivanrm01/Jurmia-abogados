/**
 * Formulario público de reclamación de vuelos.
 *
 * Muestra al cliente solo los pasos 01, 02 y 03 y una cifra orientativa.
 * Todo lo demás (traza jurídica, probabilidad, honorarios, prescripción y
 * documentos) vive en el panel del despacho.
 *
 * El cálculo se repite en el servidor al recibir el caso: lo que se ve aquí
 * es una estimación, nunca la fuente de verdad.
 */
(function () {
  "use strict";

  var M = window.MotorVuelos, A = window.Aeropuertos;
  if (!M || !A || !document.getElementById("calculadora")) return;

  var $ = function (id) { return document.getElementById(id); };
  var estado = {
    origen: null,
    destino: null,
    incidencia: "retraso",
    minutos: 210,
    aviso: 3,
    reubicacion: "no",
    causa: "ninguna"
  };

  /* ---------------- buscador de aeropuertos ---------------- */

  function buscador(clave) {
    var entrada = $(clave), lista = $(clave + "-lista"), elegido = $(clave + "-elegido");
    var activa = 0, resultados = [];

    function pintar() {
      if (!resultados.length) { lista.classList.add("oculto"); return; }
      lista.innerHTML = resultados.map(function (a, i) {
        return '<li><button type="button" class="' + (i === activa ? "activa" : "") + '" data-iata="' + a.iata + '">' +
          '<span class="sug-codigo">' + a.iata + '</span>' +
          '<span class="sug-nombre">' + a.etiqueta + '</span>' +
          '<span class="sug-pais">' + (a.ue ? "UE/EEE" : a.pais) + "</span></button></li>";
      }).join("");
      lista.classList.remove("oculto");
    }

    function buscar(texto) {
      var s = texto.trim().toUpperCase();
      resultados = [];
      if (s.length < 2) { lista.classList.add("oculto"); return; }
      var exactos = [], empiezan = [], contienen = [];
      for (var i = 0; i < A.lista.length; i++) {
        var a = A.lista[i], L = a.etiqueta.toUpperCase();
        if (a.iata === s) exactos.push(a);
        else if (L.indexOf(s) === 0) empiezan.push(a);
        else if (L.indexOf(s) !== -1) contienen.push(a);
        if (empiezan.length > 25) break;
      }
      resultados = exactos.concat(empiezan, contienen).slice(0, 7);
      activa = 0;
      pintar();
    }

    function elegir(iata) {
      var a = A.porIata[iata];
      if (!a) return;
      estado[clave] = a;
      elegido.innerHTML = "<b>" + a.iata + "</b><span>" + a.etiqueta + "</span><em>cambiar</em>";
      elegido.classList.remove("oculto");
      entrada.classList.add("oculto");
      lista.classList.add("oculto");
      calcular();
    }

    entrada.addEventListener("input", function () { buscar(entrada.value); });
    entrada.addEventListener("keydown", function (e) {
      if (!resultados.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); activa = Math.min(activa + 1, resultados.length - 1); pintar(); }
      if (e.key === "ArrowUp") { e.preventDefault(); activa = Math.max(activa - 1, 0); pintar(); }
      if (e.key === "Enter") { e.preventDefault(); elegir(resultados[activa].iata); }
      if (e.key === "Escape") lista.classList.add("oculto");
    });
    lista.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-iata]");
      if (b) elegir(b.getAttribute("data-iata"));
    });
    elegido.addEventListener("click", function () {
      estado[clave] = null;
      elegido.classList.add("oculto");
      entrada.classList.remove("oculto");
      entrada.value = "";
      entrada.focus();
      calcular();
    });
    document.addEventListener("click", function (e) {
      if (!$("caja-" + clave).contains(e.target)) lista.classList.add("oculto");
    });

    return { elegir: elegir };
  }

  var bOrigen = buscador("origen");
  var bDestino = buscador("destino");

  /* ---------------- tarjeta de embarque ---------------- */

  $("btn-tarjeta").addEventListener("click", function () {
    var salida = $("tarjeta-salida");
    var t = M.leerTarjeta($("bcbp").value);
    if (!t.ok) {
      salida.innerHTML = '<div class="tarjeta-leida error">' + t.error + "</div>";
      return;
    }
    if (A.porIata[t.origen]) bOrigen.elegir(t.origen);
    if (A.porIata[t.destino]) bDestino.elegir(t.destino);
    if (t.fecha) $("fecha").value = t.fecha;
    if (t.vuelo) $("vuelo").value = t.vuelo;

    var texto = "Tarjeta leída · " + t.pasajero + " · vuelo " + t.vuelo + " · " + t.origen + "–" + t.destino;
    if (t.asiento) texto += " · asiento " + t.asiento;
    if (t.anoDeducido) texto += "<br>La tarjeta no guarda el año: confirme que la fecha es correcta.";
    salida.innerHTML = '<div class="tarjeta-leida">' + texto + "</div>";
    calcular();
  });

  /* ---------------- incidencias y causas ---------------- */

  $("incidencias").innerHTML = M.INCIDENCIAS.map(function (i) {
    return '<button type="button" data-id="' + i.id + '" aria-pressed="' + (i.id === estado.incidencia) + '">' +
      i.etiqueta + "</button>";
  }).join("");

  $("incidencias").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-id]");
    if (!b) return;
    estado.incidencia = b.getAttribute("data-id");
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", x === b);
    });
    var esCancelacion = estado.incidencia === "cancelacion";
    var conMinutos = estado.incidencia === "retraso" || estado.incidencia === "enlace";
    $("caja-minutos").classList.toggle("oculto", !conMinutos);
    $("caja-aviso").classList.toggle("oculto", !esCancelacion);
    $("caja-reubicacion").classList.toggle("oculto", !esCancelacion);
    calcular();
  });

  $("causa").innerHTML = M.CAUSAS.map(function (c) {
    return '<option value="' + c.id + '">' + c.etiqueta + "</option>";
  }).join("");

  $("minutos").addEventListener("input", function () {
    estado.minutos = +this.value;
    $("minutos-lectura").textContent = M.formatoMinutos(estado.minutos);
    calcular();
  });

  $("aviso").addEventListener("input", function () {
    estado.aviso = +this.value;
    $("aviso-lectura").textContent = estado.aviso + (estado.aviso === 1 ? " día" : " días");
    calcular();
  });

  ["reubicacion", "causa", "pasajeros", "gastos"].forEach(function (id) {
    $(id).addEventListener("input", calcular);
  });

  /* ---------------- cálculo orientativo ---------------- */

  function datosCaso() {
    return {
      origen: estado.origen ? estado.origen.iata : "",
      destino: estado.destino ? estado.destino.iata : "",
      incidencia: estado.incidencia,
      minutos: estado.minutos,
      avisoDias: estado.aviso,
      reubicacionAjustada: $("reubicacion").value === "ajustada",
      causa: $("causa").value,
      companiaUE: true,
      pasajeros: +$("pasajeros").value || 1,
      gastos: +$("gastos").value || 0
    };
  }

  function calcular() {
    if (!estado.origen || !estado.destino) { $("resultado").classList.add("oculto"); return; }
    var r = M.evaluar(datosCaso());
    if (!r.ok) { $("resultado").classList.add("oculto"); return; }

    var caja = $("resultado"), cifra = $("resultado-cifra"), nota = $("resultado-nota");
    caja.classList.remove("oculto");

    if (r.veredicto === "downgrade") {
      cifra.textContent = r.porcentajeDowngrade + " % del billete";
      nota.textContent = "Al haber viajado en una clase inferior a la contratada, le corresponde el reembolso de ese porcentaje del precio del trayecto afectado. Envíenos el caso y lo calculamos sobre su billete.";
      return;
    }

    if (!r.viable) {
      cifra.textContent = "Conviene revisarlo";
      nota.textContent = r.veredicto === "umbral"
        ? "Con menos de tres horas de retraso no nace la compensación automática, pero sí el derecho a que le reembolsen comidas, llamadas y alojamiento. Si adelantó gastos, cuéntenoslo."
        : r.veredicto === "preaviso"
          ? "Según lo que nos indica, el preaviso o el vuelo alternativo podrían excluir la compensación. Aun así merece la pena que lo miremos: las aerolíneas no siempre acreditan cuándo avisaron."
          : "Este vuelo queda fuera del Reglamento europeo, pero puede haber cobertura por el Convenio de Montreal o por el contrato de transporte. Envíenoslo y se lo decimos.";
      return;
    }

    cifra.textContent = M.euros(r.importeTotal);
    var partes = [];
    partes.push(r.importeUnitario + " € por pasajero según la distancia de " +
      r.km.toLocaleString("es-ES") + " km, por " + r.pasajeros +
      (r.pasajeros === 1 ? " pasajero" : " pasajeros") + ".");
    if (r.gastos > 0) partes.push("Se añaden " + M.euros(r.gastos) + " de gastos adelantados.");
    if (r.causa.extraordinaria) {
      partes.push("La aerolínea alega una causa que suele defenderse como extraordinaria: la carga de probarla es suya, y en muchos casos no lo consigue.");
    }
    nota.textContent = partes.join(" ");
  }

  /* ---------------- envío ---------------- */

  function aviso(texto, error) {
    var caja = $("aviso-envio-vuelos");
    caja.textContent = texto;
    caja.style.borderLeftColor = error ? "#a12a2a" : "";
    caja.classList.add("visible");
  }

  $("btn-enviar").addEventListener("click", function () {
    var boton = this;
    if (!estado.origen || !estado.destino) return aviso("Indique el aeropuerto de salida y el de destino.", true);
    if (!$("fecha").value) {
      $("fecha").focus();
      return aviso("Indique la fecha del vuelo: sin ella no podemos comprobar el retraso ni calcular el plazo para reclamar.", true);
    }
    if ($("fecha").value > new Date().toISOString().slice(0, 10)) {
      $("fecha").focus();
      return aviso("La fecha del vuelo no puede ser futura.", true);
    }
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
    cuerpo.fecha = $("fecha").value;
    cuerpo.vuelo = $("vuelo").value.trim().toUpperCase();
    cuerpo.aerolinea = $("aerolinea").value.trim();
    cuerpo.nombre = $("nombre").value.trim();
    cuerpo.telefono = $("telefono").value.trim();
    cuerpo.email = $("email").value.trim();
    cuerpo.observaciones = $("observaciones").value.trim();
    cuerpo.consentimiento = true;
    cuerpo.empresa = $("empresa").value;
    cuerpo.tarjeta = $("bcbp").value.trim().slice(0, 400);

    boton.disabled = true;
    aviso("Enviando el caso al despacho…");

    fetch("/api/reclamaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    })
      .then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error(d.error || "Error " + r.status);
          return d;
        });
      })
      .then(function (d) {
        aviso("Recibido. Su referencia es " + d.referencia +
          ". Un abogado revisará el vuelo y le responderá en 24 horas laborables.");
        $("caja-contacto").querySelectorAll("input, textarea, button").forEach(function (x) { x.disabled = true; });
      })
      .catch(function (e) {
        aviso("No hemos podido enviarlo: " + e.message + ". Escríbanos a info@jurmiabogados.es y lo vemos igualmente.", true);
        boton.disabled = false;
      });
  });

  /* estado inicial */
  $("minutos-lectura").textContent = M.formatoMinutos(estado.minutos);
})();
