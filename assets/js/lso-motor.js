/**
 * Motor de la Ley de Segunda Oportunidad.
 *
 * Único punto de verdad del test de viabilidad, de la documentación que se pide
 * al cliente, de las fases del expediente, del cálculo del pasivo exonerable y
 * del cómputo de plazos procesales. Lo usan la página pública, el panel del
 * despacho y las funciones serverless, de modo que el cliente y el letrado ven
 * siempre el mismo resultado.
 *
 * Normativa aplicada:
 *  · Texto refundido de la Ley Concursal (RDL 1/2020) tras la Ley 16/2022:
 *    arts. 486 a 502 (exoneración del pasivo insatisfecho), 37 bis a 37 quinquies
 *    (concurso sin masa) y 685 y siguientes (procedimiento especial de
 *    microempresas).
 *  · Crédito público: art. 489.1.5.º TRLC y SSTS 259 a 264/2026, de 18 de
 *    febrero (en particular la STS 264/2026, ECLI:ES:TS:2026:440): 5.000 €
 *    íntegros y el 50 % del exceso, con un máximo de 10.000 € POR CADA ACREEDOR
 *    PÚBLICO; los créditos públicos subordinados se exoneran íntegramente.
 *  · Plazos: arts. 130, 133, 135 y 151 LEC, 182 y 183 LOPJ y LO 14/2022.
 *
 * El resultado del test es orientativo: la revisión de cada caso la hace
 * siempre un abogado del despacho.
 */
(function (raiz) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Test de viabilidad                                                 */
  /* ------------------------------------------------------------------ */

  // Las preguntas se pintan en este orden. «si» indica cuándo se muestra.
  const PREGUNTAS = [
    {
      id: 'deuda',
      titulo: '¿Cuánto debe en total, aproximadamente?',
      ayuda: 'Sume todo: tarjetas, préstamos, Hacienda, Seguridad Social… No hace falta exactitud.',
      opciones: [
        { valor: 'lt5', texto: 'Menos de 5.000 €' },
        { valor: '5_15', texto: 'Entre 5.000 y 15.000 €' },
        { valor: '15_30', texto: 'Entre 15.000 y 30.000 €' },
        { valor: '30_60', texto: 'Entre 30.000 y 60.000 €' },
        { valor: '60_150', texto: 'Entre 60.000 y 150.000 €' },
        { valor: 'gt150', texto: 'Más de 150.000 €' },
      ],
    },
    {
      id: 'acreedores',
      titulo: '¿A cuántas entidades o personas debe dinero?',
      ayuda: 'Cada banco, financiera, Hacienda o Seguridad Social cuenta como uno.',
      opciones: [
        { valor: '1', texto: 'Solo a una' },
        { valor: '2_3', texto: 'A dos o tres' },
        { valor: '4_6', texto: 'Entre cuatro y seis' },
        { valor: '7mas', texto: 'A siete o más' },
      ],
    },
    {
      id: 'tipos',
      titulo: '¿Qué tipo de deudas tiene?',
      ayuda: 'Marque todas las que tenga.',
      multiple: true,
      opciones: [
        { valor: 'tarjetas', texto: 'Tarjetas de crédito o revolving' },
        { valor: 'prestamos', texto: 'Préstamos personales' },
        { valor: 'microcreditos', texto: 'Microcréditos o minicréditos' },
        { valor: 'hipoteca', texto: 'Hipoteca' },
        { valor: 'coche', texto: 'Financiación del coche' },
        { valor: 'hacienda', texto: 'Hacienda o ayuntamiento' },
        { valor: 'seguridad_social', texto: 'Seguridad Social' },
        { valor: 'proveedores', texto: 'Proveedores o deudas de un negocio' },
        { valor: 'avales', texto: 'Avalé a otra persona o empresa' },
        { valor: 'alimentos', texto: 'Pensión de alimentos impagada' },
        { valor: 'otras', texto: 'Otras' },
      ],
    },
    {
      id: 'capacidad',
      titulo: '¿Cómo va con los pagos?',
      opciones: [
        { valor: 'pago_con_dificultad', texto: 'Pago todo, pero me ahoga', ayuda: 'Paga una deuda con otra o no llega a fin de mes.' },
        { valor: 'impago_parcial', texto: 'Ya he dejado de pagar alguna' },
        { valor: 'no_puedo_pagar', texto: 'No puedo pagar casi nada' },
      ],
    },
    {
      id: 'perfil',
      titulo: '¿Cuál es su situación laboral?',
      opciones: [
        { valor: 'asalariado', texto: 'Trabajo por cuenta ajena' },
        { valor: 'autonomo', texto: 'Soy autónomo en activo' },
        { valor: 'exautonomo', texto: 'Fui autónomo y cerré' },
        { valor: 'desempleado', texto: 'En paro' },
        { valor: 'pensionista', texto: 'Pensionista' },
        { valor: 'administrador', texto: 'Administrador o socio de una empresa' },
      ],
    },
    {
      id: 'ingresos',
      titulo: '¿Cuánto ingresa al mes, aproximadamente?',
      ayuda: 'Ingresos netos de su unidad familiar: nómina, pensión, prestación…',
      opciones: [
        { valor: 'ninguno', texto: 'No tengo ingresos' },
        { valor: 'lt1000', texto: 'Menos de 1.000 €' },
        { valor: '1000_1500', texto: 'Entre 1.000 y 1.500 €' },
        { valor: '1500_2500', texto: 'Entre 1.500 y 2.500 €' },
        { valor: 'gt2500', texto: 'Más de 2.500 €' },
      ],
    },
    {
      id: 'bienes',
      titulo: '¿Tiene alguno de estos bienes a su nombre?',
      ayuda: 'Marque todos los que tenga.',
      multiple: true,
      opciones: [
        { valor: 'vivienda_hipoteca', texto: 'Vivienda con hipoteca' },
        { valor: 'vivienda_libre', texto: 'Vivienda sin hipoteca' },
        { valor: 'vehiculo', texto: 'Coche o moto' },
        { valor: 'otros_bienes', texto: 'Otros (locales, terrenos, ahorros…)' },
        { valor: 'ninguno', texto: 'Ninguno' },
      ],
    },
    {
      id: 'conservarVivienda',
      titulo: '¿Quiere conservar su vivienda?',
      ayuda: 'Con un plan de pagos es posible mantenerla.',
      si: (r) => !!(r.bienes && r.bienes.some((b) => b === 'vivienda_hipoteca' || b === 'vivienda_libre')),
      opciones: [
        { valor: 'si', texto: 'Sí, quiero conservarla' },
        { valor: 'no', texto: 'No es prioritario' },
      ],
    },
    {
      id: 'embargos',
      titulo: '¿Tiene ya embargos, demandas o reclamaciones judiciales?',
      opciones: [
        { valor: 'si', texto: 'Sí' },
        { valor: 'no', texto: 'No' },
      ],
    },
    {
      id: 'condena',
      titulo: 'En los últimos diez años, ¿le han condenado por algún delito económico?',
      ayuda: 'Por ejemplo, contra Hacienda, la Seguridad Social, estafa o falsedad documental. Si no lo sabe, marque «No».',
      opciones: [
        { valor: 'no', texto: 'No' },
        { valor: 'si', texto: 'Sí' },
      ],
    },
    {
      id: 'sancion',
      titulo: '¿Tiene alguna sanción muy grave de Hacienda o de la Seguridad Social sin pagar?',
      ayuda: 'Hablamos de sanciones firmes de los últimos diez años. Una deuda normal no es una sanción.',
      opciones: [
        { valor: 'no', texto: 'No' },
        { valor: 'si', texto: 'Sí' },
      ],
    },
    {
      id: 'derivacion',
      titulo: '¿Hacienda o la Seguridad Social le han derivado deudas de una empresa?',
      ayuda: 'Ocurre a algunos administradores de sociedades.',
      si: (r) => r.perfil === 'administrador' || r.perfil === 'autonomo' || r.perfil === 'exautonomo',
      opciones: [
        { valor: 'no', texto: 'No' },
        { valor: 'si', texto: 'Sí' },
      ],
    },
    {
      id: 'exoneracionPrevia',
      titulo: '¿Se ha acogido ya antes a la Ley de Segunda Oportunidad?',
      opciones: [
        { valor: 'no', texto: 'No, es la primera vez' },
        { valor: 'si', texto: 'Sí' },
      ],
    },
  ];

  function preguntasVisibles(r) {
    return PREGUNTAS.filter((p) => !p.si || p.si(r));
  }

  /** Importe representativo de cada tramo, para ordenar y prever. */
  const DEUDA_MEDIA = {
    lt5: 3000,
    '5_15': 10000,
    '15_30': 22500,
    '30_60': 45000,
    '60_150': 100000,
    gt150: 200000,
  };

  /**
   * Honorarios de referencia por vía, solo para la previsión interna del panel.
   * Se sustituyen con la variable de entorno LSO_TARIFAS.
   */
  const TARIFAS_EJEMPLO = {
    sin_masa: 2400,
    liquidacion: 3000,
    plan_pagos: 3600,
    microempresa: 3900,
    complejidad: 900,
  };

  const VIAS = {
    sin_masa: {
      titulo: 'Concurso sin masa',
      texto: 'Si no tiene bienes de valor, es la vía más directa: el juzgado comprueba su situación y, si cumple los requisitos, puede cancelar las deudas sin vender nada.',
    },
    liquidacion: {
      titulo: 'Exoneración con liquidación',
      texto: 'Se venden los bienes que tenga para pagar a los acreedores y el juzgado puede cancelar la deuda que quede pendiente.',
    },
    plan_pagos: {
      titulo: 'Exoneración con plan de pagos',
      texto: 'Conserva su vivienda y paga una parte de la deuda según su capacidad durante tres años (cinco si mantiene la vivienda habitual). Al terminar, se cancela el resto.',
    },
    microempresa: {
      titulo: 'Procedimiento especial para autónomos',
      texto: 'Si sigue con su actividad, existe un procedimiento especial para microempresas, más rápido y en gran parte telemático, que también permite cancelar deudas.',
    },
  };

  function limitar(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function evaluar(r, tarifas) {
    tarifas = tarifas || TARIFAS_EJEMPLO;
    let puntos = 50;
    const lista = [];

    // Insolvencia: es el presupuesto de todo el procedimiento (art. 2 TRLC).
    if (r.capacidad === 'no_puedo_pagar') {
      puntos += 20;
      lista.push({ tipo: 'ok', texto: 'No puede hacer frente a sus deudas: es justo la situación para la que existe la ley.' });
    } else if (r.capacidad === 'impago_parcial') {
      puntos += 15;
      lista.push({ tipo: 'ok', texto: 'Ya ha dejado de pagar alguna deuda, lo que indica una situación de insolvencia.' });
    } else {
      puntos += 6;
      lista.push({ tipo: 'aviso', texto: 'Aún paga todo, pero con mucho esfuerzo. La ley también contempla la insolvencia inminente, cuando sabe que no podrá seguir pagando.' });
    }

    // Importe
    const deuda = DEUDA_MEDIA[r.deuda];
    const ajusteDeuda = { lt5: -25, '5_15': 0, '15_30': 10, '30_60': 15, '60_150': 15, gt150: 10 };
    puntos += ajusteDeuda[r.deuda];
    if (r.deuda === 'lt5') {
      lista.push({ tipo: 'aviso', texto: 'Con una deuda inferior a 5.000 € suele compensar más negociar directamente con los acreedores. Lo valoramos con usted.' });
    }

    // Pluralidad de acreedores
    const ajusteAcreedores = { '1': -15, '2_3': 5, '4_6': 10, '7mas': 10 };
    puntos += ajusteAcreedores[r.acreedores];
    if (r.acreedores === '1') {
      lista.push({ tipo: 'aviso', texto: 'Con un único acreedor el concurso tiene más dificultades. Hay que estudiar su caso en detalle.' });
    } else {
      lista.push({ tipo: 'ok', texto: 'Tiene varios acreedores, como exige el concurso de acreedores.' });
    }

    // Tipos de deuda
    const tipos = new Set(r.tipos);
    if (tipos.has('tarjetas') || tipos.has('microcreditos') || tipos.has('prestamos')) {
      puntos += 5;
      lista.push({ tipo: 'ok', texto: 'Las tarjetas, préstamos y microcréditos son deudas que se pueden cancelar.' });
    }
    if (tipos.has('tarjetas')) {
      lista.push({ tipo: 'ok', texto: 'Revisaremos además sus tarjetas: si alguna es revolving con intereses abusivos, puede reclamarse aparte y recuperar dinero.' });
    }
    if (tipos.has('hacienda') || tipos.has('seguridad_social')) {
      lista.push({
        tipo: 'aviso',
        texto: 'La deuda con Hacienda y Seguridad Social se cancela con límites: hasta 10.000 € por cada administración en la deuda principal (los primeros 5.000 € íntegros y la mitad del resto). Según el Tribunal Supremo, los recargos y los intereses (y las sanciones que no sean muy graves) pueden cancelarse por completo.',
      });
    }
    if (tipos.has('alimentos')) {
      puntos -= 5;
      lista.push({ tipo: 'aviso', texto: 'Las pensiones de alimentos no se pueden cancelar con esta ley, aunque el resto de deudas sí.' });
    }
    if (tipos.has('hipoteca')) {
      lista.push({ tipo: 'aviso', texto: 'La parte de la hipoteca cubierta por el valor de la vivienda no se cancela. Sí puede cancelarse la deuda que quede si el banco ejecuta y no cubre todo.' });
    }
    if (tipos.has('avales')) {
      lista.push({ tipo: 'ok', texto: 'Las deudas por haber avalado a otra persona o empresa también pueden cancelarse.' });
    }

    // Bienes y vía
    const bienes = new Set(r.bienes);
    const tieneVivienda = bienes.has('vivienda_hipoteca') || bienes.has('vivienda_libre');
    const sinBienes = bienes.has('ninguno') || bienes.size === 0;
    let via;
    if (r.perfil === 'autonomo') via = 'microempresa';
    else if (tieneVivienda && r.conservarVivienda === 'si') via = 'plan_pagos';
    else if (sinBienes || (bienes.size === 1 && bienes.has('vehiculo'))) via = 'sin_masa';
    else via = 'liquidacion';
    if (via === 'sin_masa') puntos += 5;
    if (via === 'plan_pagos') {
      lista.push({ tipo: 'ok', texto: 'Con un plan de pagos puede cancelar deudas y conservar su vivienda.' });
      if (r.ingresos === 'ninguno' || r.ingresos === 'lt1000') {
        puntos -= 5;
        lista.push({ tipo: 'aviso', texto: 'Para un plan de pagos hacen falta ingresos estables. Revisaremos si es viable con los suyos.' });
      }
    }

    // Urgencia
    if (r.embargos === 'si') {
      puntos += 5;
      lista.push({ tipo: 'aviso', texto: 'Tiene embargos o demandas. Con la declaración de concurso, por regla general, se paralizan los embargos y las ejecuciones, así que conviene actuar pronto.' });
    }

    // Requisitos de buena fe (art. 487 TRLC) y exoneración previa (art. 488 TRLC)
    let bloqueado = false;
    if (r.condena === 'si') {
      bloqueado = true;
      lista.push({ tipo: 'bloqueo', texto: 'Una condena por delitos económicos en los últimos diez años puede impedir la exoneración, salvo que la responsabilidad esté extinguida y pagada. Necesitamos revisarlo.' });
    }
    if (r.sancion === 'si') {
      bloqueado = true;
      lista.push({ tipo: 'bloqueo', texto: 'Una sanción muy grave de Hacienda o de la Seguridad Social sin pagar puede impedir la exoneración. Hay que estudiarla.' });
    }
    if (r.derivacion === 'si') {
      puntos -= 10;
      lista.push({ tipo: 'aviso', texto: 'Una derivación de responsabilidad ya no impide automáticamente la exoneración, según el Tribunal Supremo (2026). Hay que analizar el origen de esa deuda.' });
    }
    if (r.exoneracionPrevia === 'si') {
      bloqueado = true;
      lista.push({ tipo: 'bloqueo', texto: 'Si ya obtuvo una exoneración hace menos de dos años (o cinco con plan de pagos), no puede pedir otra todavía. Revisaremos las fechas.' });
    }

    if (r.perfil === 'administrador') {
      lista.push({ tipo: 'aviso', texto: 'Como administrador, revisaremos si hay avales personales o responsabilidades derivadas de la empresa.' });
    }

    puntos = limitar(Math.round(puntos), 0, 100);
    if (bloqueado) puntos = Math.min(puntos, 30);

    const encaje = bloqueado ? 'estudio' : puntos >= 70 ? 'alto' : puntos >= 45 ? 'medio' : 'estudio';

    const prioridad =
      encaje === 'alto' && (r.embargos === 'si' || deuda >= 30000 || puntos >= 80)
        ? 'caliente'
        : encaje === 'estudio'
          ? 'frio'
          : 'templado';

    const complejo = deuda >= 60000 || r.acreedores === '7mas';
    const honorariosEstimados = (tarifas[via] || 0) + (complejo ? tarifas.complejidad || 0 : 0);

    const textos = {
      alto: {
        titulo: 'Su caso encaja con la Ley de Segunda Oportunidad',
        resumen: 'Por lo que nos cuenta, cumple los requisitos principales. El siguiente paso es una primera consulta gratuita para revisar su documentación.',
      },
      medio: {
        titulo: 'Su caso puede encajar, con algunos puntos que revisar',
        resumen: 'Hay aspectos que conviene revisar con un abogado antes de decidir. En la consulta gratuita lo vemos con usted.',
      },
      estudio: {
        titulo: 'Su caso necesita un estudio detallado',
        resumen: 'Algunas de sus respuestas requieren que un abogado revise su situación. No significa que no tenga solución: cuéntenoslo y le orientamos.',
      },
    };

    return Object.assign({ encaje }, textos[encaje], {
      puntos: lista,
      via,
      viaTitulo: VIAS[via].titulo,
      viaTexto: VIAS[via].texto,
      puntuacion: puntos,
      prioridad,
      deudaEstimada: deuda,
      honorariosEstimados,
    });
  }

  /** Comprueba que unas respuestas recibidas (p. ej. por la API) son válidas. */
  function validarRespuestas(x) {
    if (!x || typeof x !== 'object') return false;
    for (const p of PREGUNTAS) {
      const v = x[p.id];
      const visible = !p.si || p.si(x);
      if (v === undefined) {
        if (visible && p.id !== 'derivacion' && p.id !== 'conservarVivienda') return false;
        continue;
      }
      const validos = new Set(p.opciones.map((o) => o.valor));
      if (p.multiple) {
        if (!Array.isArray(v) || v.length === 0 || !v.every((i) => typeof i === 'string' && validos.has(i))) return false;
      } else if (typeof v !== 'string' || !validos.has(v)) return false;
    }
    return true;
  }

  /** Deja solo las respuestas conocidas y completa con «no» las opcionales que no se mostraron. */
  function normalizarRespuestas(r) {
    const limpio = {};
    for (const p of PREGUNTAS) if (r[p.id] !== undefined) limpio[p.id] = r[p.id];
    if (limpio.derivacion === undefined) limpio.derivacion = 'no';
    return limpio;
  }

  /** Lee la tarifa de honorarios de un texto «sin_masa:2400,liquidacion:3000,…». */
  function leerTarifas(texto) {
    const t = Object.assign({}, TARIFAS_EJEMPLO);
    String(texto || '').split(/[,;\n]/).forEach((par) => {
      const [k, v] = par.split(':').map((x) => (x || '').trim());
      if (k in t && Number(v) >= 0) t[k] = Number(v);
    });
    return t;
  }

  /* ------------------------------------------------------------------ */
  /* Calculadora: cuánto se podría cancelar                             */
  /* ------------------------------------------------------------------ */

  /** Lee un importe escrito a la española («12.500», «1.234,56») o con punto decimal. */
  function num(v) {
    let t = String(v == null ? '' : v).replace(/[€\s]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    return Math.max(0, Math.round((Number(t) || 0) * 100) / 100);
  }

  /** Campos de la calculadora, en el orden en que se piden. */
  const CAMPOS_CALCULADORA = [
    { id: 'privadas', etiqueta: 'Bancos, tarjetas, préstamos y financieras', ayuda: 'Incluya microcréditos, proveedores y lo que deba como avalista.' },
    { id: 'hacienda', etiqueta: 'Hacienda: deuda principal', ayuda: 'Lo que figura como principal en el certificado de la Agencia Tributaria.' },
    { id: 'haciendaRecargos', etiqueta: 'Hacienda: recargos e intereses', ayuda: 'Si no lo sabe, déjelo en blanco.' },
    { id: 'tgss', etiqueta: 'Seguridad Social: deuda principal', ayuda: 'Cuotas de autónomo o de empresa pendientes.' },
    { id: 'tgssRecargos', etiqueta: 'Seguridad Social: recargos e intereses', ayuda: 'Si no lo sabe, déjelo en blanco.' },
    { id: 'otrasPublicas', etiqueta: 'Ayuntamiento u otras administraciones', ayuda: 'IBI, multas de tráfico no penales, tasas…' },
    { id: 'hipoteca', etiqueta: 'Hipoteca: lo que queda por pagar', ayuda: '' },
    { id: 'valorVivienda', etiqueta: 'Valor actual aproximado de la vivienda', ayuda: 'Solo si tiene hipoteca.' },
    { id: 'alimentos', etiqueta: 'Pensión de alimentos impagada', ayuda: '' },
    { id: 'embargoMensual', etiqueta: 'Lo que le embargan cada mes', ayuda: 'De la nómina, la pensión o la cuenta.' },
  ];

  /**
   * Estimación orientativa de lo que se podría cancelar, con las mismas reglas
   * que el cálculo del panel (art. 489 TRLC y STS 264/2026): lo privado se
   * cancela; del crédito público, 5.000 € íntegros y la mitad del resto hasta
   * 10.000 € por administración, más los recargos e intereses; la parte de la
   * hipoteca cubierta por la vivienda y los alimentos no se cancelan.
   * Da por hecho que se cumplen los requisitos de buena fe.
   */
  function estimarCancelacion(datos) {
    const d = {};
    CAMPOS_CALCULADORA.forEach((c) => { d[c.id] = num(datos && datos[c.id]); });
    const acreedores = [];
    const add = (a) => { if (a.principal > 0 || (a.accesorios || 0) > 0) acreedores.push(a); };
    add({ id: 'privadas', nombre: 'Bancos y financieras', tipo: 'banco', concepto: 'Deuda privada', principal: d.privadas });
    add({ id: 'hacienda', nombre: 'Hacienda', nif: 'AEAT', tipo: 'aeat', concepto: 'Deuda tributaria', principal: d.hacienda, accesorios: d.haciendaRecargos });
    add({ id: 'tgss', nombre: 'Seguridad Social', nif: 'TGSS', tipo: 'tgss', concepto: 'Cuotas', principal: d.tgss, accesorios: d.tgssRecargos });
    add({ id: 'otrasPublicas', nombre: 'Otras administraciones', nif: 'OTRAS', tipo: 'administracion', concepto: 'Tributos locales', principal: d.otrasPublicas });
    if (d.hipoteca > 0) add({ id: 'hipoteca', nombre: 'Hipoteca', tipo: 'banco', concepto: 'Préstamo hipotecario', principal: d.hipoteca, garantia: 'hipoteca', importeGarantizado: d.valorVivienda > 0 ? Math.min(d.valorVivienda, d.hipoteca) : d.hipoteca });
    add({ id: 'alimentos', nombre: 'Pensión de alimentos', tipo: 'particular', concepto: 'Alimentos', principal: d.alimentos, noExonerable: 'Las pensiones de alimentos no se cancelan' });
    const c = calcularExoneracion(acreedores);
    const lineas = c.porAcreedor.map((x) => {
      const id = x.acreedor.id;
      const estado = x.noExonerable <= 0 ? 'si' : x.exonerable <= 0 ? 'no' : 'parcial';
      const motivos = {
        privadas: 'Se cancela entera si se cumplen los requisitos de buena fe.',
        hacienda: estado === 'si' ? 'Dentro del límite: se cancela entera.' : 'Se cancelan 5.000 € y la mitad del resto, hasta 10.000 € de principal, más los recargos e intereses.',
        tgss: estado === 'si' ? 'Dentro del límite: se cancela entera.' : 'Se cancelan 5.000 € y la mitad del resto, hasta 10.000 € de principal, más los recargos e intereses.',
        otrasPublicas: estado === 'si' ? 'Dentro del límite: se cancela entera.' : 'Mismo límite que Hacienda, para cada administración.',
        hipoteca: estado === 'no' ? 'Cubierta por el valor de la vivienda: no se cancela. Con un plan de pagos puede conservarla.' : 'La parte cubierta por la vivienda no se cancela; el resto, sí, si el banco ejecuta.',
        alimentos: 'Las pensiones de alimentos no se cancelan nunca con esta ley.',
      };
      return { id, nombre: x.acreedor.nombre, total: x.total, cancelable: x.exonerable, noCancelable: x.noExonerable, estado, motivo: motivos[id] || '' };
    });
    return {
      datos: d,
      lineas,
      total: c.pasivo,
      cancelable: c.exonerable,
      noCancelable: c.noExonerable,
      porcentaje: c.pasivo ? Math.round((c.exonerable / c.pasivo) * 100) : 0,
      perdidaEspera: Math.round(d.embargoMensual * 6),
      tramo: tramoDeuda(c.pasivo),
    };
  }

  /** Tramo de la primera pregunta del test que corresponde a un importe. */
  function tramoDeuda(total) {
    if (total < 5000) return 'lt5';
    if (total < 15000) return '5_15';
    if (total < 30000) return '15_30';
    if (total < 60000) return '30_60';
    if (total < 150000) return '60_150';
    return 'gt150';
  }

  /** Respuestas del test que ya se pueden deducir de la calculadora. */
  function respuestasDesdeCalculo(est) {
    const d = est.datos;
    const r = {};
    if (est.total > 0) r.deuda = est.tramo;
    const tipos = [];
    if (d.privadas > 0) tipos.push('tarjetas', 'prestamos');
    if (d.hacienda + d.haciendaRecargos + d.otrasPublicas > 0) tipos.push('hacienda');
    if (d.tgss + d.tgssRecargos > 0) tipos.push('seguridad_social');
    if (d.hipoteca > 0) tipos.push('hipoteca');
    if (d.alimentos > 0) tipos.push('alimentos');
    if (tipos.length) r.tipos = tipos;
    if (d.embargoMensual > 0) r.embargos = 'si';
    return r;
  }

  /* ------------------------------------------------------------------ */
  /* Informe para el cliente: sus deudas una a una y su hoja de ruta    */
  /* ------------------------------------------------------------------ */

  /** Qué pasa con cada tipo de deuda del test: si (se cancela), parcial, no o revisar. */
  const SEMAFORO_TIPOS = {
    tarjetas: { estado: 'si', texto: 'Tarjetas y revolving', detalle: 'Se cancelan. Además revisamos si alguna es usuraria.' },
    prestamos: { estado: 'si', texto: 'Préstamos personales', detalle: 'Se cancelan.' },
    microcreditos: { estado: 'si', texto: 'Microcréditos', detalle: 'Se cancelan, aunque estén en manos de una empresa de recobro.' },
    proveedores: { estado: 'si', texto: 'Proveedores y deudas del negocio', detalle: 'Se cancelan como cualquier deuda privada.' },
    avales: { estado: 'si', texto: 'Avales', detalle: 'Lo que debe como avalista también se cancela.' },
    hacienda: { estado: 'parcial', texto: 'Hacienda o ayuntamiento', detalle: 'Hasta 10.000 € de principal por administración, más recargos e intereses.' },
    seguridad_social: { estado: 'parcial', texto: 'Seguridad Social', detalle: 'Hasta 10.000 € de principal, más recargos e intereses.' },
    hipoteca: { estado: 'parcial', texto: 'Hipoteca', detalle: 'La parte cubierta por la vivienda no se cancela; lo que quede tras una ejecución, sí.' },
    coche: { estado: 'revisar', texto: 'Financiación del coche', detalle: 'Depende de cómo esté garantizada: lo revisamos con el contrato.' },
    alimentos: { estado: 'no', texto: 'Pensión de alimentos', detalle: 'No se cancela con esta ley.' },
    otras: { estado: 'revisar', texto: 'Otras deudas', detalle: 'Las revisamos una a una.' },
  };

  /** Pasos del procedimiento según la vía. Los plazos citados son los que fija la ley. */
  const HOJA_DE_RUTA = {
    sin_masa: [
      { titulo: 'Preparamos su solicitud', texto: 'Reunimos la documentación y redactamos la solicitud de concurso con la memoria, el inventario y la relación de acreedores.' },
      { titulo: 'El juzgado declara el concurso sin masa', texto: 'La Sección de lo Mercantil de su provincia comprueba que no hay bienes con los que pagar y lo declara.' },
      { titulo: 'Quince días hábiles para los acreedores', texto: 'Tras publicarse en el BOE, los acreedores pueden pedir un administrador concursal si creen que hay bienes (art. 37 ter TRLC).' },
      { titulo: 'Pedimos la exoneración', texto: 'Si nadie lo pide, en los diez días hábiles siguientes solicitamos que se cancelen sus deudas (art. 501 TRLC).' },
    ],
    liquidacion: [
      { titulo: 'Preparamos su solicitud', texto: 'Documentación, solicitud de concurso, memoria, inventario y relación de acreedores.' },
      { titulo: 'Declaración del concurso', texto: 'El juzgado nombra un administrador concursal y, por regla general, se suspenden las ejecuciones contra su patrimonio.' },
      { titulo: 'Venta de los bienes', texto: 'Se venden los bienes que no sean necesarios y se paga a los acreedores por su orden.' },
      { titulo: 'Exoneración de lo que quede', texto: 'Al terminar la liquidación pedimos que se cancele la deuda pendiente (art. 501.2 TRLC).' },
    ],
    plan_pagos: [
      { titulo: 'Preparamos su solicitud y su plan', texto: 'Calculamos con usted un plan de pagos realista según sus ingresos y gastos necesarios.' },
      { titulo: 'Declaración del concurso', texto: 'Por regla general se suspenden las ejecuciones. Usted conserva su vivienda.' },
      { titulo: 'Aprobación del plan', texto: 'Tres años, o cinco si mantiene la vivienda habitual (art. 497 TRLC). Los acreedores pueden alegar en diez días y el juez concede la exoneración provisional.' },
      { titulo: 'Exoneración definitiva', texto: 'Cumplido el plan, se cancela de forma definitiva el resto de la deuda (art. 500 TRLC).' },
    ],
    microempresa: [
      { titulo: 'Preparamos su solicitud', texto: 'Por el procedimiento especial para microempresas, tramitado en gran parte con formularios oficiales en línea.' },
      { titulo: 'Continuar o liquidar', texto: 'Valoramos con usted si conviene seguir con la actividad con un plan de continuación o liquidarla.' },
      { titulo: 'Exoneración', texto: 'En ambos casos, cumplidos los requisitos, puede cancelarse la deuda que no se pueda pagar.' },
    ],
  };

  /** Importe en euros: «12.500 €», o con céntimos si los tiene. */
  function euros(n) {
    const x = Number(n) || 0;
    try {
      return x.toLocaleString('es-ES', {
        style: 'currency', currency: 'EUR', useGrouping: 'always',
        minimumFractionDigits: x % 1 === 0 ? 0 : 2, maximumFractionDigits: 2,
      });
    } catch (e) {
      return Math.round(x).toLocaleString('es-ES') + ' €';
    }
  }

  const TEXTO_VIAS = VIAS;

  /** Provincias (con los nombres que usa el panel para proponer la sede del juzgado). */
  const PROVINCIAS = [
    'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona',
    'Bizkaia', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba',
    'Cuenca', 'Gipuzkoa', 'Girona', 'Granada', 'Guadalajara', 'Huelva', 'Huesca', 'Illes Balears', 'Jaén',
    'La Rioja', 'Las Palmas', 'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra',
    'Ourense', 'Palencia', 'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria',
    'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Zamora', 'Zaragoza',
  ];

  /* ------------------------------------------------------------------ */
  /* Documentación del cliente                                          */
  /* ------------------------------------------------------------------ */

  const DOCUMENTOS = [
    { id: 'dni', nombre: 'DNI o NIE por las dos caras', comoConseguirlo: 'Una foto con el móvil de cada cara, que se lea bien.' },
    { id: 'cirbe', nombre: 'Informe CIRBE del Banco de España', comoConseguirlo: 'Se pide gratis en la sede electrónica del Banco de España con certificado digital o Cl@ve.' },
    { id: 'aeat', nombre: 'Certificado de deudas con Hacienda', comoConseguirlo: 'Sede electrónica de la Agencia Tributaria, apartado «Certificados».' },
    { id: 'tgss', nombre: 'Certificado de deudas con la Seguridad Social', comoConseguirlo: 'Portal Import@ss o sede electrónica de la Seguridad Social.' },
    { id: 'vida_laboral', nombre: 'Informe de vida laboral', comoConseguirlo: 'Portal Import@ss, en «Tu informe de vida laboral».' },
    { id: 'ingresos', nombre: 'Últimas 3 nóminas, pensión o prestación', comoConseguirlo: 'Las nóminas se las facilita su empresa; el certificado de pensión o paro, la Seguridad Social o el SEPE.' },
    { id: 'renta', nombre: 'Declaraciones de la renta de los últimos 3 años', comoConseguirlo: 'En Renta Web puede descargar las declaraciones presentadas.' },
    { id: 'extractos', nombre: 'Extractos bancarios de los últimos 6 meses', comoConseguirlo: 'Desde la web o app de cada banco, en PDF.' },
    { id: 'contratos', nombre: 'Contratos y últimas cartas de cada deuda', comoConseguirlo: 'Contratos de préstamos y tarjetas, requerimientos de pago o cartas de recobro.' },
    { id: 'antecedentes', nombre: 'Certificado de antecedentes penales', comoConseguirlo: 'Sede electrónica del Ministerio de Justicia, con certificado digital o Cl@ve.' },
    { id: 'padron', nombre: 'Certificado de empadronamiento', comoConseguirlo: 'Lo emite su ayuntamiento, normalmente por internet.' },
    {
      id: 'nota_simple',
      nombre: 'Nota simple de su vivienda',
      comoConseguirlo: 'Se pide por internet en el Colegio de Registradores.',
      si: (r) => r.bienes.includes('vivienda_hipoteca') || r.bienes.includes('vivienda_libre'),
    },
    {
      id: 'hipoteca',
      nombre: 'Escritura y último recibo de la hipoteca',
      comoConseguirlo: 'La escritura se la puede facilitar su notaría o su banco.',
      si: (r) => r.tipos.includes('hipoteca') || r.bienes.includes('vivienda_hipoteca'),
    },
    {
      id: 'vehiculo',
      nombre: 'Permiso de circulación del vehículo',
      comoConseguirlo: 'Una foto del permiso de circulación.',
      si: (r) => r.bienes.includes('vehiculo'),
    },
    {
      id: 'autonomo',
      nombre: 'Modelos de IVA e IRPF del último año (303, 130, 390)',
      comoConseguirlo: 'Se los puede facilitar su gestoría o descargarlos de la Agencia Tributaria.',
      si: (r) => r.perfil === 'autonomo' || r.perfil === 'exautonomo',
    },
    {
      id: 'convenio',
      nombre: 'Sentencia de divorcio o convenio regulador',
      comoConseguirlo: 'Solo si tiene pensiones fijadas por un juzgado.',
      si: (r) => r.tipos.includes('alimentos'),
    },
  ];
  function documentosRequeridos(r) {
    return DOCUMENTOS.filter((d) => !d.si || d.si(r));
  }
  function documentosPendientes(r, estados) {
    return documentosRequeridos(r).filter((d) => {
      const e = estados[d.id]?.estado;
      return !e || e === 'pendiente' || e === 'rechazado';
    });
  }

  /* ------------------------------------------------------------------ */
  /* Fases del expediente                                               */
  /* ------------------------------------------------------------------ */

  // Fases por las que pasa un contacto: primero la captación comercial y, si contrata,
  // el expediente judicial.
  const FASES = [
    { id: 'nuevo', nombre: 'Nuevo', nombreCliente: 'Solicitud recibida', grupo: 'captacion', descripcion: 'Ha hecho el test o ha escrito. Hay que llamarle cuanto antes.' },
    { id: 'contactado', nombre: 'Contactado', nombreCliente: 'En contacto', grupo: 'captacion', descripcion: 'Ya hemos hablado o le hemos escrito y estamos pendientes de respuesta.' },
    { id: 'cita', nombre: 'Consulta agendada', nombreCliente: 'Consulta agendada', grupo: 'captacion', descripcion: 'Tiene reservada la consulta gratuita.' },
    { id: 'propuesta', nombre: 'Propuesta enviada', nombreCliente: 'Propuesta enviada', grupo: 'captacion', descripcion: 'Le hemos enviado la propuesta de honorarios y la hoja de encargo.' },
    { id: 'contratado', nombre: 'Contratado', nombreCliente: 'Encargo firmado', grupo: 'expediente', descripcion: 'Ha firmado la hoja de encargo.' },
    { id: 'documentacion', nombre: 'Documentación', nombreCliente: 'Reuniendo su documentación', grupo: 'expediente', descripcion: 'Estamos reuniendo la documentación del expediente.' },
    { id: 'preparacion', nombre: 'Preparando solicitud', nombreCliente: 'Preparando su solicitud', grupo: 'expediente', descripcion: 'El equipo jurídico redacta la solicitud de concurso y la relación de acreedores.' },
    { id: 'presentado', nombre: 'Presentado', nombreCliente: 'Solicitud presentada en el juzgado', grupo: 'expediente', descripcion: 'La solicitud está presentada en el juzgado.' },
    { id: 'concurso', nombre: 'Concurso declarado', nombreCliente: 'El juzgado ha declarado el concurso', grupo: 'expediente', descripcion: 'El juzgado ha declarado el concurso y el procedimiento sigue su curso.' },
    { id: 'exonerado', nombre: 'Exoneración', nombreCliente: 'Exoneración concedida', grupo: 'cerrado', descripcion: 'El juzgado ha concedido la exoneración del pasivo insatisfecho.' },
    { id: 'descartado', nombre: 'Descartado', nombreCliente: 'Cerrado', grupo: 'cerrado', descripcion: 'No encaja, no contesta o ha decidido no seguir.' },
  ];
  const FASES_CAPTACION = ['nuevo', 'contactado', 'cita', 'propuesta'];
  const FASES_EXPEDIENTE = ['contratado', 'documentacion', 'preparacion', 'presentado', 'concurso'];
  /** Fases que ya cuentan como cliente que ha contratado. */
  const FASES_CLIENTE = [...FASES_EXPEDIENTE, 'exonerado'];
  function fase(id) {
    const f = FASES.find((x) => x.id === id);
    if (!f)
      throw new Error(`Fase desconocida: ${id}`);
    return f;
  }
  /** Orden de la fase en el recorrido del cliente (descartado queda fuera, con -1). */
  function ordenFase(id) {
    if (id === 'descartado')
      return -1;
    return FASES.findIndex((f) => f.id === id);
  }


  /* ------------------------------------------------------------------ */
  /* Relación de acreedores y pasivo exonerable                         */
  /* ------------------------------------------------------------------ */

  // Relación de acreedores y cálculo del pasivo exonerable.
  //
  // Art. 489.1 TRLC (Ley 16/2022) y doctrina de la STS 264/2026, de 18 de febrero
  // (ECLI:ES:TS:2026:440), y de las SSTS 259 a 263/2026 de la misma fecha:
  //  - Crédito público: de la parte ordinaria/privilegiada se exonera íntegro hasta 5.000 €
  //    y el 50 % del exceso, con un máximo de 10.000 € POR CADA ACREEDOR PÚBLICO.
  //  - Los créditos públicos subordinados (recargos, intereses de demora, sanciones)
  //    son exonerables íntegramente.
  //  - El crédito público solo es exonerable en la primera exoneración (art. 489.3).
  //  - Créditos con garantía real: no exonerables dentro del límite del privilegio especial.
  //  - Créditos no exonerables por naturaleza (alimentos, responsabilidad civil por delito
  //    o por daños personales, multas penales...), marcados a mano.
  const TIPOS_ACREEDOR = {
    banco: 'Entidad bancaria',
    financiera: 'Financiera / EFC',
    recobro: 'Fondo o empresa de recobro',
    aeat: 'Agencia Tributaria',
    tgss: 'Seguridad Social',
    administracion: 'Otra administración pública',
    proveedor: 'Proveedor',
    particular: 'Particular',
    otro: 'Otro',
  };
  const esPublico = (a) => a.tipo === 'aeat' || a.tipo === 'tgss' || a.tipo === 'administracion';
  const totalCredito = (a) => round2(a.principal + (a.accesorios ?? 0));
  const LIMITE_PUBLICO = { integro: 5000, maximo: 10000 };
  function round2(n) {
    return Math.round(n * 100) / 100;
  }
  /** Parte exonerable del principal público de un mismo acreedor (art. 489.1.5.º TRLC). */
  function exonerablePublico(principal) {
    if (principal <= 0)
      return 0;
    const integro = Math.min(principal, LIMITE_PUBLICO.integro);
    const mitad = Math.max(0, principal - LIMITE_PUBLICO.integro) * 0.5;
    return round2(Math.min(integro + mitad, LIMITE_PUBLICO.maximo));
  }
  function claveAcreedor(a) {
    return (a.nif?.trim().toUpperCase() || a.nombre.trim().toUpperCase()).replace(/\s+/g, ' ');
  }
  function calcularExoneracion(acreedores, opciones = {}) {
    const porClase = {
      garantia_real: { numero: 0, importe: 0 },
      publico: { numero: 0, importe: 0 },
      subordinado: { numero: 0, importe: 0 },
      ordinario: { numero: 0, importe: 0 },
      no_exonerable: { numero: 0, importe: 0 },
    };
    const sumar = (c, importe) => {
      if (importe <= 0)
        return;
      porClase[c].numero++;
      porClase[c].importe = round2(porClase[c].importe + importe);
    };
    // El límite público se aplica por acreedor: primero se agrupan sus créditos.
    const grupos = new Map();
    for (const a of acreedores) {
      if (!esPublico(a) || a.noExonerable)
        continue;
      const k = claveAcreedor(a);
      const g = grupos.get(k) ?? { nombre: a.nombre, principal: 0, subordinado: 0, ids: [] };
      g.principal = round2(g.principal + a.principal);
      g.subordinado = round2(g.subordinado + (a.accesorios ?? 0));
      g.ids.push(a.id);
      grupos.set(k, g);
    }
    const publicos = [...grupos.entries()].map(([clave, g]) => ({
      clave,
      nombre: g.nombre,
      principal: g.principal,
      subordinado: g.subordinado,
      exonerable: opciones.exoneracionPrevia ? 0 : exonerablePublico(g.principal),
    }));
    // Reparto del exonerable de cada grupo entre sus créditos, en proporción al principal.
    const exonerablePrincipal = new Map();
    for (const [clave, g] of grupos) {
      const ex = publicos.find((p) => p.clave === clave).exonerable;
      let repartido = 0;
      g.ids.forEach((id, i) => {
        const a = acreedores.find((x) => x.id === id);
        const parte = i === g.ids.length - 1 ? round2(ex - repartido) : round2(g.principal ? (ex * a.principal) / g.principal : 0);
        repartido = round2(repartido + parte);
        exonerablePrincipal.set(id, parte);
      });
    }
    const porAcreedor = acreedores.map((a) => {
      const total = totalCredito(a);
      if (a.noExonerable) {
        sumar('no_exonerable', total);
        return { acreedor: a, total, exonerable: 0, noExonerable: total, motivo: a.noExonerable };
      }
      if (esPublico(a)) {
        const exPrin = exonerablePrincipal.get(a.id) ?? 0;
        const sub = opciones.exoneracionPrevia ? 0 : (a.accesorios ?? 0);
        sumar('publico', a.principal);
        sumar('subordinado', a.accesorios ?? 0);
        const exonerable = round2(exPrin + sub);
        const motivo = opciones.exoneracionPrevia
          ? 'Exoneración previa: el crédito público no es exonerable (art. 489.3 TRLC)'
          : exPrin < a.principal
            ? 'Exceso sobre el límite del art. 489.1.5.º TRLC'
            : undefined;
        return { acreedor: a, total, exonerable, noExonerable: round2(total - exonerable), motivo };
      }
      const garantizado = a.garantia === 'hipoteca' || a.garantia === 'prenda' ? Math.min(a.importeGarantizado ?? 0, total) : 0;
      if (garantizado > 0)
        sumar('garantia_real', garantizado);
      const resto = round2(total - garantizado);
      sumar('ordinario', a.principal - Math.min(garantizado, a.principal));
      sumar('subordinado', a.accesorios ?? 0);
      return {
        acreedor: a,
        total,
        exonerable: resto,
        noExonerable: garantizado,
        motivo: garantizado > 0 ? 'Parte cubierta por la garantía real (art. 489.1.8.º TRLC)' : undefined,
      };
    });
    const pasivo = round2(porAcreedor.reduce((s, c) => s + c.total, 0));
    const exonerable = round2(porAcreedor.reduce((s, c) => s + c.exonerable, 0));
    return { porAcreedor, pasivo, exonerable, noExonerable: round2(pasivo - exonerable), porClase, publicos };
  }
  /** Orden alfabético exigido para la relación de acreedores (art. 7 TRLC). */
  function ordenAlfabetico(acreedores) {
    return [...acreedores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  }

  /* ------------------------------------------------------------------ */
  /* Plazos procesales en días hábiles                                  */
  /* ------------------------------------------------------------------ */

  // Cómputo de plazos procesales en días hábiles.
  //
  // Reglas aplicadas (supletoriedad de la LEC en el concurso, art. 521 TRLC):
  //  - Se excluyen sábados, domingos y festivos (art. 133.2 LEC y art. 182 LOPJ).
  //  - Agosto es inhábil (art. 183 LOPJ y art. 130.2 LEC).
  //  - Del 24 de diciembre al 6 de enero es inhábil (LO 14/2022).
  //  - El plazo empieza a correr el día siguiente al acto de comunicación (art. 133.1 LEC).
  //  - Notificaciones por LexNET a profesionales: se tienen por realizadas el día siguiente
  //    a la recepción (art. 151.2 LEC). Se usa el día natural siguiente, que es el cómputo
  //    más prudente (nunca da un vencimiento posterior al real).
  //  - Día de gracia: el escrito puede presentarse hasta las 15:00 del día hábil siguiente
  //    al vencimiento (art. 135.1 LEC).
  // Los festivos autonómicos y locales del partido judicial se añaden en la configuración.
  // Trabaja con fechas 'AAAA-MM-DD' para evitar desfases de zona horaria.
  const pad = (n) => String(n).padStart(2, '0');
  function aFecha(d) {
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function deFecha(f) {
    const [y, m, d] = f.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function sumarDias(f, n) {
    const d = deFecha(f);
    d.setUTCDate(d.getUTCDate() + n);
    return aFecha(d);
  }
  /** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
  function domingoPascua(anio) {
    const a = anio % 19;
    const b = Math.floor(anio / 100);
    const c = anio % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return `${anio}-${pad(mes)}-${pad(dia)}`;
  }
  const FESTIVOS_FIJOS = {
    '01-01': 'Año Nuevo',
    '01-06': 'Epifanía',
    '05-01': 'Fiesta del Trabajo',
    '08-15': 'Asunción',
    '10-12': 'Fiesta Nacional',
    '11-01': 'Todos los Santos',
    '12-06': 'Día de la Constitución',
    '12-08': 'Inmaculada Concepción',
    '12-25': 'Navidad',
  };
  /** Devuelve el motivo por el que un día es inhábil, o null si es hábil. */
  function motivoInhabil(f, op = {}) {
    const d = deFecha(f);
    const dow = d.getUTCDay();
    const md = f.slice(5, 10);
    if (dow === 6)
      return 'Sábado';
    if (dow === 0)
      return 'Domingo';
    if (md.startsWith('08-'))
      return 'Agosto';
    if (md >= '12-24' || md <= '01-06')
      return 'Navidad (24 dic. – 6 ene.)';
    if (FESTIVOS_FIJOS[md])
      return FESTIVOS_FIJOS[md];
    if (f === sumarDias(domingoPascua(d.getUTCFullYear()), -2))
      return 'Viernes Santo';
    if (op.festivosExtra?.some((x) => x === f || x === md))
      return 'Festivo autonómico o local';
    return null;
  }
  const esHabil = (f, op) => motivoInhabil(f, op) === null;
  function siguienteHabil(f, op) {
    let d = sumarDias(f, 1);
    while (!esHabil(d, op))
      d = sumarDias(d, 1);
    return d;
  }
  /**
  * Calcula el vencimiento de un plazo de `dias` hábiles.
  * - 'lexnet': `origen` es la fecha de recepción; el acto se tiene por realizado al día siguiente.
  * - 'publicacion' o 'fecha': el plazo corre desde el día siguiente a `origen`.
  */
  function calcularPlazo(origen, dias, tipoOrigen, base, op) {
    const acto = tipoOrigen === 'lexnet' ? sumarDias(origen, 1) : origen;
    const detalle = [];
    let d = acto;
    let contados = 0;
    let inicio = '';
    // Límite de seguridad: ningún plazo procesal razonable supera 200 días naturales.
    for (let i = 0; i < 400 && contados < dias; i++) {
      d = sumarDias(d, 1);
      const motivo = motivoInhabil(d, op);
      if (motivo) {
        if (contados > 0 || detalle.length < 40)
          detalle.push({ fecha: d, inhabil: motivo });
        continue;
      }
      contados++;
      if (!inicio)
        inicio = d;
      detalle.push({ fecha: d, numero: contados });
    }
    return { origen, tipoOrigen, dias, inicio, vence: d, gracia: siguienteHabil(d, op), base, detalle };
  }
  /** Días hábiles que quedan desde `hoy` (excluido) hasta `vence` (incluido). Negativo si ya venció. */
  function habilesRestantes(hoy, vence, op) {
    if (hoy === vence)
      return 0;
    if (hoy > vence) {
      let n = 0;
      let d = vence;
      while (d < hoy) {
        d = sumarDias(d, 1);
        if (esHabil(d, op))
          n--;
      }
      return n;
    }
    let n = 0;
    let d = hoy;
    while (d < vence) {
      d = sumarDias(d, 1);
      if (esHabil(d, op))
        n++;
    }
    return n;
  }
  /** Resta días hábiles (para avisos internos antes del vencimiento). */
  function restarHabiles(f, n, op) {
    let d = f;
    let quedan = n;
    while (quedan > 0) {
      d = sumarDias(d, -1);
      if (esHabil(d, op))
        quedan--;
    }
    return d;
  }

  raiz.MotorLSO = {
    // test
    PREGUNTAS, preguntasVisibles, evaluar, validarRespuestas, normalizarRespuestas,
    DEUDA_MEDIA, TARIFAS_EJEMPLO, leerTarifas, VIAS: TEXTO_VIAS, euros, PROVINCIAS,
    // calculadora e informe
    CAMPOS_CALCULADORA, estimarCancelacion, tramoDeuda, respuestasDesdeCalculo, SEMAFORO_TIPOS, HOJA_DE_RUTA,
    // documentación
    DOCUMENTOS, documentosRequeridos, documentosPendientes,
    // fases
    FASES, FASES_CAPTACION, FASES_EXPEDIENTE, FASES_CLIENTE, fase, ordenFase,
    // acreedores
    TIPOS_ACREEDOR, esPublico, totalCredito, LIMITE_PUBLICO, exonerablePublico, claveAcreedor,
    calcularExoneracion, ordenAlfabetico,
    // plazos
    aFecha, deFecha, sumarDias, domingoPascua, motivoInhabil, esHabil, siguienteHabil,
    calcularPlazo, habilesRestantes, restarHabiles,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
