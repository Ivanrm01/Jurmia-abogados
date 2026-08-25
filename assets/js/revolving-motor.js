/**
 * Motor de reclamaciones de crédito revolving.
 *
 * Único punto de verdad del análisis. Lo usan el formulario público, el panel
 * del despacho y las funciones serverless, para que el cliente y el letrado
 * vean siempre el mismo resultado.
 *
 * Doctrina aplicada:
 *  · Usura. Ley de 23 de julio de 1908 (Azcárate). STS 149/2020, de 4 de marzo
 *    (Wizink) y, sobre todo, STS 258/2023, de 15 de febrero, del Pleno, que fija
 *    en SEIS PUNTOS PORCENTUALES sobre el tipo medio publicado por el Banco de
 *    España para esta categoría el umbral a partir del cual el interés es
 *    notablemente superior al normal del dinero. Para contratos anteriores a
 *    2010 el término de comparación es el TEDR de 2010, 19,32 %.
 *  · Transparencia. STS 154/2025 y 155/2025, de 30 de enero, del Pleno
 *    (Roj: STS 242/2025 y STS 241/2025), que abren el control de transparencia
 *    como vía autónoma de nulidad aunque la TAE no alcance el umbral de usura.
 *  · Prescripción. STS 350/2025, de 5 de marzo, del Pleno
 *    (ECLI:ES:TS:2025:836): la acción de nulidad es imprescriptible, pero la
 *    restitutoria prescribe a los cinco años y el plazo corre desde CADA pago,
 *    de modo que se recupera lo abonado en exceso en los cinco años anteriores
 *    a la reclamación extrajudicial o a la demanda.
 */
(function (raiz) {
  "use strict";

  /**
   * Tipo medio del Banco de España para tarjetas de crédito de pago aplazado y
   * revolving (Boletín Estadístico, capítulo 19.4).
   *
   * Solo se fija el valor consolidado por la jurisprudencia para los contratos
   * anteriores a 2010. Para el resto de años el dato debe tomarse del Boletín
   * y confirmarse expediente por expediente: es el documento que hay que
   * aportar con la demanda, y no puede salir de una tabla aproximada.
   */
  var TIPO_MEDIO_PRE_2010 = 19.32;

  var INDICIOS_TRANSPARENCIA = [
    {
      id: "sin_precontractual",
      etiqueta: "No recibió información precontractual antes de firmar",
      peso: 3,
      cita: "Artículos 8 y 10 de la Ley 16/2011, de contratos de crédito al consumo: la Información Normalizada Europea debe entregarse con antelación suficiente."
    },
    {
      id: "lugar_venta",
      etiqueta: "Se contrató en un establecimiento, un stand o por teléfono, sin tiempo de lectura",
      peso: 3,
      cita: "STS 154/2025 y 155/2025: el modo de comercialización condiciona la posibilidad real de comprender la carga económica."
    },
    {
      id: "sin_ejemplo",
      etiqueta: "No le mostraron ningún ejemplo de cuánto acabaría pagando",
      peso: 3,
      cita: "El deber de transparencia exige un ejemplo representativo del coste total; su ausencia impide comprender el sacrificio patrimonial asumido."
    },
    {
      id: "sin_explicar_revolving",
      etiqueta: "Nadie le explicó que la deuda se recalcula y puede no bajar aunque pague",
      peso: 4,
      cita: "STS 154/2025: el consumidor debe poder comprender el efecto de recomposición del capital, que convierte la cuota en pago casi íntegro de intereses."
    },
    {
      id: "sin_plazo",
      etiqueta: "No le informaron de que el crédito era indefinido, sin fecha de fin",
      peso: 3,
      cita: "La falta de información sobre la duración indefinida impide advertir el riesgo de convertirse en deudor cautivo."
    },
    {
      id: "cuota_minima",
      etiqueta: "Le fijaron la cuota mínima por defecto, sin advertirle del efecto",
      peso: 3,
      cita: "Una cuota baja predeterminada maximiza los intereses y prolonga la deuda; su imposición sin advertencia agrava la opacidad."
    },
    {
      id: "sin_copia",
      etiqueta: "No conserva copia del contrato ni se la entregaron",
      peso: 2,
      cita: "Artículo 16 de la Ley 16/2011 y artículo 1258 del Código Civil: la carga de acreditar la entrega y el contenido corresponde al predisponente."
    },
    {
      id: "letra_pequena",
      etiqueta: "La TAE aparecía en letra pequeña, al dorso o entre otras condiciones",
      peso: 2,
      cita: "El control de incorporación y de transparencia exige que el precio real del crédito sea perceptible sin esfuerzo."
    },
    {
      id: "sin_periodica",
      etiqueta: "No ha recibido información periódica clara del estado de la deuda",
      peso: 2,
      cita: "Artículo 33 ter de la Orden EHA/2899/2011, introducido por la Orden ETD/699/2020, de 24 de julio, reguladora del crédito revolvente."
    }
  ];

  var SITUACIONES = [
    { id: "viva", etiqueta: "Sigue pagando la tarjeta" },
    { id: "cancelada", etiqueta: "Ya la canceló o la liquidó" },
    { id: "impago", etiqueta: "Dejó de pagar y le reclaman la deuda" },
    { id: "monitorio", etiqueta: "Le han demandado o hay un monitorio" },
    { id: "asnef", etiqueta: "Está en un fichero de morosos por esta tarjeta" }
  ];

  function indicePorId(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  /* ------------------------------------------------------------------ */

  /**
   * @param {object} c
   *   entidad, anio (año de contratación), tae, tipoMedio (opcional),
   *   capitalDispuesto, totalPagado, deudaPendiente, situacion,
   *   indicios (array de ids), fechaReclamacion (AAAA-MM-DD, opcional)
   */
  function evaluar(c) {
    var pasos = [];
    var anio = parseInt(c.anio, 10) || 0;
    var tae = redondear(Number(c.tae) || 0, 2);
    var capital = Math.max(0, Number(c.capitalDispuesto) || 0);
    var pagado = Math.max(0, Number(c.totalPagado) || 0);
    var pendiente = Math.max(0, Number(c.deudaPendiente) || 0);

    if (!anio || anio < 1980 || anio > new Date().getFullYear()) {
      return { ok: false, error: "Indique el año en que se contrató la tarjeta." };
    }

    /* --- 1. Usura --- */
    var tipoMedio = Number(c.tipoMedio) > 0
      ? redondear(Number(c.tipoMedio), 2)
      : (anio <= 2010 ? TIPO_MEDIO_PRE_2010 : null);
    var umbral = tipoMedio != null ? redondear(tipoMedio + 6, 2) : null;
    var usura = null;
    var franja = null;

    if (!tae) {
      pasos.push({
        norma: "Usura",
        titulo: "Falta la TAE contratada",
        cumple: false,
        detalle: "Sin la TAE no puede aplicarse el criterio de los seis puntos. Se recabará del contrato o se requerirá a la entidad."
      });
    } else if (umbral == null) {
      /*
       * Sin el tipo medio oficial no puede afirmarse la usura, pero sí situar
       * la TAE en una franja orientativa. La serie del Banco de España para
       * este producto se ha movido siempre en el entorno del 18 al 21 %, de
       * modo que el umbral de los seis puntos queda entre el 24 y el 27 %.
       * Por encima de esa horquilla la usura es muy probable con cualquier año
       * de referencia; por debajo, improbable. Es un indicio para triar, nunca
       * un sustituto del dato oficial que hay que aportar con la demanda.
       */
      franja = tae >= 27 ? "probable" : (tae >= 24 ? "limite" : "improbable");
      pasos.push({
        norma: "STS 258/2023",
        titulo: franja === "probable" ? "Usura muy probable, pendiente de confirmar"
          : franja === "limite" ? "En la franja que decide el caso"
          : "Usura improbable por el tipo",
        cumple: franja === "probable",
        detalle: "La TAE pactada fue del " + tae + " %. " +
          (franja === "probable"
            ? "Supera el 27 %, por encima del umbral que resultaría de cualquier tipo medio publicado para este producto, de modo que la usura es muy probable."
            : franja === "limite"
              ? "Queda entre el 24 y el 27 %, la horquilla en la que el resultado depende del tipo medio concreto del año."
              : "Queda por debajo del 24 %, de modo que difícilmente alcanzará el umbral de los seis puntos y el ataque debe articularse por transparencia.") +
          " Debe tomarse el tipo medio publicado por el Banco de España para " + anio +
          " en el capítulo 19.4 de su Boletín Estadístico y confirmarlo antes de sostener la usura en un escrito."
      });
    } else {
      usura = tae > umbral;
      pasos.push({
        norma: "STS 258/2023",
        titulo: usura ? "Interés usurario" : "Por debajo del umbral de usura",
        cumple: usura,
        detalle: "TAE pactada del " + tae + " % frente a un tipo medio del " + tipoMedio + " % en " +
          (anio <= 2010 ? "2010, término de comparación fijado para los contratos anteriores a esa fecha" : anio) +
          ". El umbral se sitúa en " + umbral + " %. " +
          (usura
            ? "La diferencia supera los seis puntos porcentuales que la STS 258/2023, de 15 de febrero, del Pleno, considera interés notablemente superior al normal del dinero, con la nulidad radical del artículo 1 de la Ley de 23 de julio de 1908."
            : "No se alcanza el umbral de los seis puntos, de modo que la vía de la usura no prospera y el ataque debe articularse por falta de transparencia.")
      });
    }

    /* --- 2. Transparencia --- */
    var marcados = (c.indicios || []).map(function (id) { return indicePorId(INDICIOS_TRANSPARENCIA, id); })
      .filter(Boolean);
    var puntos = marcados.reduce(function (s, i) { return s + i.peso; }, 0);
    var maximo = INDICIOS_TRANSPARENCIA.reduce(function (s, i) { return s + i.peso; }, 0);
    var transparencia = puntos >= 6;

    pasos.push({
      norma: "STS 154 y 155/2025",
      titulo: transparencia ? "Indicios sólidos de falta de transparencia" : "Indicios de transparencia insuficientes",
      cumple: transparencia,
      detalle: "Concurren " + marcados.length + " de los " + INDICIOS_TRANSPARENCIA.length +
        " indicios valorados (" + puntos + " sobre " + maximo + " puntos). " +
        (transparencia
          ? "Las sentencias del Pleno 154/2025 y 155/2025, de 30 de enero, permiten declarar abusiva la cláusula de intereses cuando el consumidor no pudo comprender la carga económica ni el funcionamiento del sistema revolvente, aunque la TAE no alcance el umbral de usura."
          : "Convendrá reforzar este frente con la documentación precontractual que se requiera a la entidad antes de decidir la estrategia.")
    });

    /* --- 3. Efecto económico --- */
    var exceso = Math.max(0, redondear(pagado - capital, 2));
    var recuperable = exceso;
    var limitado = false;
    if (c.limitarPrescripcion !== false && pagado > 0 && Number(c.anosPagando) > 5) {
      // Aproximación prudente: la parte proporcional correspondiente a los
      // cinco últimos años, que es lo que la STS 350/2025 permite recuperar.
      recuperable = redondear(exceso * (5 / Number(c.anosPagando)), 2);
      limitado = true;
    }

    pasos.push({
      norma: "STS 350/2025",
      titulo: "Alcance de la restitución",
      cumple: recuperable > 0 || pendiente > 0,
      detalle: "Declarada la nulidad, el artículo 3 de la Ley de Usura obliga a devolver cuanto exceda del capital dispuesto. " +
        "La sentencia del Pleno 350/2025, de 5 de marzo (ECLI:ES:TS:2025:836), declara imprescriptible la acción de nulidad, " +
        "pero somete la restitutoria al plazo de cinco años del artículo 1964.2 del Código Civil computado desde cada pago, " +
        "de modo que se recupera lo abonado en exceso en los cinco años anteriores a la reclamación extrajudicial. " +
        (limitado
          ? "Al llevar más de cinco años pagando, la cifra se ha ajustado en proporción."
          : "La totalidad de lo pagado en exceso queda dentro de plazo.")
    });

    var viable = Boolean(usura) || transparencia || franja === "probable";
    var veredicto = usura ? "usura"
      : (franja === "probable" && !transparencia) ? "usura_probable"
      : (transparencia ? "transparencia" : "a_estudiar");

    /* --- 4. Situación procesal --- */
    if (c.situacion === "monitorio") {
      pasos.push({
        norma: "Art. 815.4 LEC",
        titulo: "Procedimiento monitorio en curso",
        cumple: true,
        detalle: "Existiendo monitorio, el tribunal debe controlar de oficio el carácter abusivo de las cláusulas antes de requerir de pago. " +
          "Urge personarse y oponerse en el plazo de veinte días: es prioritario sobre cualquier otra actuación."
      });
    }
    if (c.situacion === "asnef") {
      pasos.push({
        norma: "Art. 20 LOPDGDD",
        titulo: "Inclusión en fichero de morosos",
        cumple: true,
        detalle: "Si la deuda es controvertida judicialmente no cumple el requisito de ser cierta, vencida y exigible, " +
          "de modo que cabe acumular la acción de tutela del derecho al honor con indemnización, además de la baja del fichero."
      });
    }

    return {
      ok: true,
      viable: viable,
      veredicto: veredicto,
      anio: anio,
      tae: tae,
      tipoMedio: tipoMedio,
      umbral: umbral,
      usura: usura,
      franjaUsura: franja,
      transparencia: transparencia,
      puntosTransparencia: puntos,
      maximoTransparencia: maximo,
      indicios: marcados,
      capitalDispuesto: capital,
      totalPagado: pagado,
      deudaPendiente: pendiente,
      exceso: exceso,
      recuperable: recuperable,
      limitadoPorPrescripcion: limitado,
      beneficioTotal: redondear(recuperable + pendiente, 2),
      situacion: c.situacion || "viva",
      pasos: pasos
    };
  }

  function redondear(n, d) {
    var f = Math.pow(10, d || 2);
    return Math.round((Number(n) || 0) * f) / f;
  }

  function euros(n) {
    var x = Number(n) || 0;
    try {
      return x.toLocaleString("es-ES", {
        style: "currency", currency: "EUR",
        minimumFractionDigits: x % 1 === 0 ? 0 : 2, maximumFractionDigits: 2
      });
    } catch (e) {
      return x.toLocaleString("es-ES") + " €";
    }
  }

  raiz.MotorRevolving = {
    evaluar: evaluar,
    euros: euros,
    INDICIOS: INDICIOS_TRANSPARENCIA,
    SITUACIONES: SITUACIONES,
    TIPO_MEDIO_PRE_2010: TIPO_MEDIO_PRE_2010
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
