/**
 * Motor de reclamaciones aéreas — Reglamento (CE) 261/2004.
 *
 * Único punto de verdad de las reglas. Lo usan tanto el formulario público
 * (/reclamacion-vuelos) como el panel de administración y las funciones
 * serverless, para que el importe que ve el cliente y el que ve el despacho
 * salgan siempre del mismo cálculo.
 *
 * Depende de assets/js/aeropuertos.js (variable global Aeropuertos).
 */
(function (raiz) {
  "use strict";

  var A = raiz.Aeropuertos;

  /* ------------------------------------------------------------------ */
  /* Tarjeta de embarque (BCBP, Resolución IATA 792)                     */
  /* ------------------------------------------------------------------ */

  /**
   * Lee la cadena del código de barras de una tarjeta de embarque.
   * Posiciones fijas del formato M (una o varias etapas), 60 caracteres
   * obligatorios. El estándar no guarda el año: se deduce el más reciente
   * que no sea futuro y se marca para que lo confirme el despacho.
   */
  function leerTarjeta(cadena) {
    var s = String(cadena || "").trim();
    if (!s) return { ok: false, error: "No se ha pegado ninguna cadena." };
    if (s.charAt(0) !== "M") {
      return { ok: false, error: "La cadena debe empezar por «M». Copie el contenido completo del código de barras." };
    }
    if (s.length < 60) {
      return { ok: false, error: "Faltan caracteres: el formato exige al menos 60 posiciones." };
    }

    var origen = s.slice(30, 33).trim().toUpperCase();
    var destino = s.slice(33, 36).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(origen) || !/^[A-Z]{3}$/.test(destino)) {
      return { ok: false, error: "Los códigos de aeropuerto no son legibles. Revise la cadena o rellene los datos a mano." };
    }

    var nombre = s.slice(2, 22).trim();
    var partes = nombre.split("/");
    var compania = s.slice(36, 39).trim().toUpperCase();
    var numero = s.slice(39, 44).trim().replace(/^0+/, "");
    var juliano = parseInt(s.slice(44, 47), 10);

    var fecha = "", anoDeducido = false;
    if (juliano >= 1 && juliano <= 366) {
      var hoy = new Date();
      for (var y = hoy.getUTCFullYear(); y >= hoy.getUTCFullYear() - 5; y--) {
        var d = new Date(Date.UTC(y, 0, juliano));
        if (d <= hoy) { fecha = d.toISOString().slice(0, 10); anoDeducido = true; break; }
      }
    }

    return {
      ok: true,
      pasajero: partes.length > 1 ? (partes[1].trim() + " " + partes[0].trim()).trim() : nombre,
      localizador: s.slice(23, 30).trim(),
      origen: origen,
      destino: destino,
      compania: compania,
      vuelo: compania + numero,
      numero: numero,
      cabina: s.charAt(47),
      asiento: s.slice(48, 52).trim().replace(/^0+/, ""),
      secuencia: s.slice(52, 57).trim().replace(/^0+/, ""),
      fecha: fecha,
      juliano: juliano,
      anoDeducido: anoDeducido
    };
  }

  /* ------------------------------------------------------------------ */
  /* Distancia                                                           */
  /* ------------------------------------------------------------------ */

  /** Distancia ortodrómica en kilómetros, que es el criterio del art. 7.1. */
  function distancia(a, b) {
    if (!a || !b) return 0;
    var R = 6371, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var h = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin(dLon / 2), 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  }

  /* ------------------------------------------------------------------ */
  /* Causas alegadas y su tratamiento jurisprudencial                    */
  /* ------------------------------------------------------------------ */

  var CAUSAS = [
    {
      id: "ninguna", etiqueta: "No ha alegado ninguna causa", extraordinaria: false, probabilidad: 0.92,
      cita: "El artículo 5.3 hace recaer sobre el transportista la carga de probar la circunstancia extraordinaria. Si no la alega ni la acredita, la compensación es debida."
    },
    {
      id: "tecnica", etiqueta: "Avería o problema técnico del aparato", extraordinaria: false, probabilidad: 0.85,
      cita: "STJUE de 22 de diciembre de 2008, Wallentin-Hermann, C-549/07: los problemas técnicos surgidos con ocasión del mantenimiento de las aeronaves son inherentes al ejercicio normal de la actividad del transportista y no constituyen circunstancia extraordinaria."
    },
    {
      id: "huelga_propia", etiqueta: "Huelga del propio personal", extraordinaria: false, probabilidad: 0.82,
      cita: "STJUE de 23 de marzo de 2021, Airhelp / SAS, C-28/20: la huelga convocada por los sindicatos del propio personal, dentro del marco legal de negociación colectiva, es inherente al ejercicio normal de la actividad y controlable por el transportista."
    },
    {
      id: "reaccion", etiqueta: "Retraso arrastrado del avión precedente", extraordinaria: false, probabilidad: 0.75,
      cita: "El retraso reaccionario no exonera por sí solo: el transportista debe acreditar el nexo causal directo y que adoptó todas las medidas razonables de reprogramación de la rotación."
    },
    {
      id: "meteo", etiqueta: "Meteorología adversa", extraordinaria: true, probabilidad: 0.35,
      cita: "Considerando 14 del Reglamento. La exoneración exige prueba del nexo causal concreto con ese vuelo y no un parte meteorológico genérico, además de acreditar las medidas razonables adoptadas."
    },
    {
      id: "huelga_atc", etiqueta: "Huelga de controladores o de personal ajeno", extraordinaria: true, probabilidad: 0.2,
      cita: "Considerando 14 del Reglamento: se trata de un suceso ajeno al control efectivo del transportista."
    },
    {
      id: "cierre", etiqueta: "Cierre de espacio aéreo o decisión de control", extraordinaria: true, probabilidad: 0.15,
      cita: "Considerandos 14 y 15 del Reglamento: la decisión de gestión del tránsito aéreo escapa al control del transportista."
    },
    {
      id: "ave", etiqueta: "Colisión con ave", extraordinaria: true, probabilidad: 0.4,
      cita: "STJUE de 4 de mayo de 2017, Pešková y Peška, C-315/15: la colisión con un ave es circunstancia extraordinaria, pero no exonera si el transportista no acredita haber adoptado todas las medidas razonables para limitar el retraso."
    },
    {
      id: "pasajero", etiqueta: "Pasajero conflictivo o urgencia médica a bordo", extraordinaria: true, probabilidad: 0.35,
      cita: "STJUE de 11 de junio de 2020, Transportes Aéreos Portugueses, C-74/19: el comportamiento perturbador de un pasajero puede ser circunstancia extraordinaria, siempre que el transportista pruebe que agotó las medidas razonables."
    }
  ];

  function causaPorId(id) {
    for (var i = 0; i < CAUSAS.length; i++) if (CAUSAS[i].id === id) return CAUSAS[i];
    return CAUSAS[0];
  }

  var INCIDENCIAS = [
    { id: "retraso", etiqueta: "Retraso en la llegada" },
    { id: "cancelacion", etiqueta: "Vuelo cancelado" },
    { id: "embarque", etiqueta: "Denegación de embarque" },
    { id: "enlace", etiqueta: "Pérdida de enlace" },
    { id: "downgrade", etiqueta: "Acomodación en clase inferior" }
  ];

  /* ------------------------------------------------------------------ */
  /* Evaluación                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Aplica el Reglamento al caso y devuelve el importe junto con la traza de
   * la decisión, que es lo que permite justificar el resultado en el escrito.
   *
   * @param {object} c origen, destino (IATA), incidencia, minutos, avisoDias,
   *                   reubicacionAjustada, causa, companiaUE, pasajeros, gastos
   */
  function evaluar(c) {
    var origen = A.porIata[String(c.origen || "").toUpperCase()];
    var destino = A.porIata[String(c.destino || "").toUpperCase()];
    if (!origen || !destino || origen.iata === destino.iata) {
      return { ok: false, error: "Indique un aeropuerto de origen y otro de destino distintos." };
    }

    var pasos = [];
    var km = distancia(origen, destino);
    var intraUE = origen.ue && destino.ue;
    var causa = causaPorId(c.causa);
    var incidencia = c.incidencia || "retraso";
    var minutos = Math.max(0, parseInt(c.minutos, 10) || 0);
    var pasajeros = Math.max(1, parseInt(c.pasajeros, 10) || 1);
    var gastos = Math.max(0, Number(c.gastos) || 0);

    /* Artículo 3: ámbito de aplicación */
    var saleUE = origen.ue;
    var llegaUE = destino.ue && c.companiaUE !== false;
    var enAmbito = saleUE || llegaUE;
    pasos.push({
      norma: "Art. 3",
      titulo: "Ámbito de aplicación",
      cumple: enAmbito,
      detalle: saleUE
        ? "El vuelo sale de un aeropuerto situado en la Unión Europea o el Espacio Económico Europeo, de modo que el Reglamento se aplica con independencia de la nacionalidad del transportista."
        : llegaUE
          ? "El vuelo llega a la Unión Europea o al Espacio Económico Europeo y lo opera un transportista comunitario, de modo que el Reglamento resulta aplicable."
          : "El vuelo ni sale de la Unión Europea o del Espacio Económico Europeo ni llega a ellos operado por transportista comunitario. Queda fuera del Reglamento; procede valorar el Convenio de Montreal."
    });
    if (!enAmbito) {
      return resultado({ ok: true, viable: false, veredicto: "fuera", importe: 0 });
    }

    /* Base del artículo 7.1 según distancia */
    var base, banda;
    if (km <= 1500) { base = 250; banda = "hasta 1.500 kilómetros"; }
    else if (intraUE || km <= 3500) { base = 400; banda = intraUE ? "intracomunitario de más de 1.500 kilómetros" : "entre 1.500 y 3.500 kilómetros"; }
    else { base = 600; banda = "más de 3.500 kilómetros, extracomunitario"; }

    var importe = 0, mitad = false, reembolsoBillete = false, porcentajeDowngrade = 0;

    if (incidencia === "retraso" || incidencia === "enlace") {
      var supera = minutos >= 180;
      pasos.push({
        norma: "TJUE",
        titulo: "Umbral de tres horas en el destino final",
        cumple: supera,
        detalle: supera
          ? "La llegada al destino final se produjo con " + formatoMinutos(minutos) + " de retraso. Conforme a la STJUE de 19 de noviembre de 2009, Sturgeon, asuntos acumulados C-402/07 y C-432/07, confirmada por la STJUE de 23 de octubre de 2012, Nelson, C-581/10 y C-629/10, los pasajeros que llegan con tres horas o más de retraso se equiparan a los de vuelos cancelados a efectos de la compensación del artículo 7."
          : "El retraso de " + formatoMinutos(minutos) + " no alcanza el umbral de tres horas. No nace la compensación del artículo 7, pero subsisten los derechos de atención del artículo 9."
      });
      if (!supera) return resultado({ ok: true, viable: false, veredicto: "umbral", importe: 0 });

      importe = base;
      if (base === 600 && minutos < 240) { importe = 300; mitad = true; }
      if (minutos >= 300) reembolsoBillete = true;

      if (incidencia === "enlace") {
        pasos.push({
          norma: "Art. 7 / C-11/11",
          titulo: "Cómputo sobre el destino final",
          cumple: true,
          detalle: "Tratándose de vuelos con conexión amparados por una reserva única, el retraso se computa a la llegada al destino final, conforme a la STJUE de 26 de febrero de 2013, Folkerts, C-11/11, y no sobre cada segmento aisladamente."
        });
      }
    }

    if (incidencia === "cancelacion") {
      var aviso = Math.max(0, parseInt(c.avisoDias, 10) || 0);
      var ajustada = c.reubicacionAjustada === true;
      var compensa = true, motivo = "";
      if (aviso >= 14) {
        compensa = false;
        motivo = "La cancelación se comunicó con dos semanas o más de antelación, supuesto excluido por el artículo 5.1.c.i.";
      } else if (aviso >= 7) {
        compensa = !ajustada;
        motivo = ajustada
          ? "Aviso de entre siete y trece días con transporte alternativo que permitía salir con menos de dos horas de antelación y llegar con menos de cuatro horas de retraso: exclusión del artículo 5.1.c.ii."
          : "Aviso de entre siete y trece días sin transporte alternativo dentro de los márgenes del artículo 5.1.c.ii, por lo que la compensación es debida.";
      } else {
        compensa = !ajustada;
        motivo = ajustada
          ? "Aviso inferior a siete días con alternativa que permitía salir con menos de una hora de antelación y llegar con menos de dos horas de retraso: exclusión del artículo 5.1.c.iii."
          : "Aviso inferior a siete días sin alternativa dentro de los márgenes del artículo 5.1.c.iii, por lo que la compensación es debida.";
      }
      pasos.push({ norma: "Art. 5.1.c", titulo: "Preaviso y transporte alternativo", cumple: compensa, detalle: motivo });
      if (!compensa) return resultado({ ok: true, viable: false, veredicto: "preaviso", importe: 0 });
      importe = base;
      reembolsoBillete = true;
    }

    if (incidencia === "embarque") {
      pasos.push({
        norma: "Art. 4.3",
        titulo: "Denegación de embarque",
        cumple: true,
        detalle: "La denegación de embarque contra la voluntad del pasajero genera compensación íntegra sin umbral horario, una vez agotada la búsqueda de voluntarios que impone el artículo 4.1."
      });
      importe = base;
      reembolsoBillete = true;
    }

    if (incidencia === "downgrade") {
      porcentajeDowngrade = km <= 1500 ? 30 : (intraUE || km <= 3500) ? 50 : 75;
      pasos.push({
        norma: "Art. 10.2",
        titulo: "Acomodación en clase inferior",
        cumple: true,
        detalle: "Procede el reembolso del " + porcentajeDowngrade + " % del precio del billete del trayecto afectado. No opera la tabla del artículo 7, sino un porcentaje sobre el precio pagado."
      });
      return resultado({ ok: true, viable: true, veredicto: "downgrade", importe: 0 });
    }

    pasos.push({
      norma: "Art. 7.1",
      titulo: "Banda de distancia",
      cumple: true,
      detalle: "La distancia ortodrómica entre " + origen.iata + " y " + destino.iata + " es de " +
        km.toLocaleString("es-ES") + " kilómetros, lo que sitúa el vuelo en la banda de " + banda +
        " y determina una compensación de " + base + " euros por pasajero."
    });

    if (mitad) {
      pasos.push({
        norma: "Art. 7.2",
        titulo: "Reducción del cincuenta por ciento",
        cumple: false,
        detalle: "Al tratarse de un trayecto superior a 3.500 kilómetros con un retraso comprendido entre tres y cuatro horas, la compensación se reduce a la mitad, quedando en 300 euros."
      });
    }

    pasos.push({
      norma: "Art. 5.3",
      titulo: "Circunstancias extraordinarias",
      cumple: !causa.extraordinaria,
      detalle: causa.etiqueta + ". " + causa.cita
    });

    return resultado({
      ok: true,
      viable: true,
      veredicto: causa.extraordinaria ? "controvertido" : "procede",
      importe: importe
    });

    function resultado(base2) {
      var total = base2.importe * pasajeros + gastos;
      return {
        ok: base2.ok,
        viable: base2.viable,
        veredicto: base2.veredicto,
        origen: origen,
        destino: destino,
        km: km,
        intraUE: intraUE,
        banda: banda || "",
        incidencia: incidencia,
        minutos: minutos,
        pasajeros: pasajeros,
        gastos: gastos,
        importeUnitario: base2.importe,
        importeTotal: total,
        porcentajeDowngrade: porcentajeDowngrade,
        reembolsoBillete: reembolsoBillete,
        reducido: mitad,
        causa: causa,
        probabilidad: base2.viable ? causa.probabilidad : 0,
        valorEsperado: Math.round(total * (base2.viable ? causa.probabilidad : 0)),
        bajoUmbralLEC: total > 0 && total <= 2000,
        pasos: pasos
      };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Prescripción                                                        */
  /* ------------------------------------------------------------------ */

  /** Plazo de cinco años del artículo 1964.2 del Código Civil. */
  function prescripcion(fechaVuelo) {
    if (!fechaVuelo) return null;
    var v = new Date(String(fechaVuelo) + "T00:00:00Z");
    if (isNaN(v.getTime())) return null;
    var limite = new Date(v);
    limite.setUTCFullYear(limite.getUTCFullYear() + 5);
    var ahora = new Date();
    var total = limite - v, restante = limite - ahora;
    return {
      limite: limite.toISOString().slice(0, 10),
      dias: Math.round(restante / 86400000),
      consumido: Math.min(100, Math.max(0, ((total - restante) / total) * 100)),
      vencida: restante <= 0
    };
  }

  function formatoMinutos(m) {
    m = Math.max(0, parseInt(m, 10) || 0);
    return Math.floor(m / 60) + " h " + String(m % 60).replace(/^(\d)$/, "0$1") + " min";
  }

  function euros(n) {
    return (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  }

  raiz.MotorVuelos = {
    leerTarjeta: leerTarjeta,
    distancia: distancia,
    evaluar: evaluar,
    prescripcion: prescripcion,
    formatoMinutos: formatoMinutos,
    euros: euros,
    CAUSAS: CAUSAS,
    INCIDENCIAS: INCIDENCIAS,
    causaPorId: causaPorId
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
