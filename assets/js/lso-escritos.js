/**
 * Escritos judiciales del expediente de segunda oportunidad.
 *
 * Para cada expediente sabe qué escritos tocan según la vía y la fase, si se
 * pueden redactar ya, el plazo para presentarlos y genera el borrador con los
 * datos del cliente y de sus acreedores. Lo usan el panel (para redactar y
 * previsualizar) y el servidor (para el Word y el aviso diario de plazos).
 *
 * Necesita /assets/js/lso-motor.js cargado antes.
 *
 * Formato de los borradores (sencillo a propósito, para editarlos a mano):
 *   # TÍTULO              → centrado y en negrita
 *   ## PRIMERO.- …        → apartado en negrita
 *   texto                 → párrafo justificado (cada línea es un párrafo)
 *   > texto               → cita sangrada
 *   >> texto              → alineado a la derecha (lugar y fecha)
 *   - texto               → lista
 *   | a | b |             → tabla (si la 2.ª fila es |---|, la 1.ª es cabecera)
 *   **negrita** *cursiva*
 *   [[dato pendiente]]    → hueco por completar: impide marcarlo como revisado
 *
 * Normativa: TRLC (RDL 1/2020) tras la Ley 16/2022 y LO 1/2025 (Tribunales de
 * Instancia). Las citas se contrastaron en octubre de 2026; el letrado revisa
 * cada borrador antes de presentarlo.
 */
(function (raiz) {
  "use strict";

  const M = raiz.MotorLSO;
  if (!M) throw new Error("Falta lso-motor.js: cárguelo antes que lso-escritos.js");
  const {
    calcularExoneracion, esPublico, ordenAlfabetico, TIPOS_ACREEDOR, totalCredito,
    calcularPlazo, deFecha, aFecha, habilesRestantes, restarHabiles, FASES_CLIENTE,
  } = M;

  /* ------------------------------------------------------------------ */
  /* Formato de los escritos                                            */
  /* ------------------------------------------------------------------ */

  // Formato de texto de los escritos. Es deliberadamente sencillo para que se pueda editar
  // a mano en el panel y convertir a Word sin perder nada:
  //
  //   # HECHOS                  → título centrado en negrita
  //   ## PRIMERO.- ...          → apartado en negrita
  //   texto normal              → párrafo justificado (cada línea es un párrafo)
  //   > texto                   → cita sangrada (jurisprudencia)
  //   - texto                   → elemento de lista
  //   | a | b |                 → tabla (si la 2.ª fila es |---|, la 1.ª es cabecera)
  //   >> texto                  → párrafo alineado a la derecha (lugar y fecha)
  //   **negrita**  *cursiva*    → formato dentro del texto
  //   [[dato pendiente]]        → hueco por completar: impide marcar el escrito como revisado
  const celdas = (linea) => linea
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
  const esSeparador = (linea) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea.trim());
  function analizar(texto) {
    const lineas = texto.replace(/\r\n/g, '\n').split('\n');
    const bloques = [];
    let i = 0;
    while (i < lineas.length) {
      const l = lineas[i];
      const t = l.trim();
      if (!t) {
        i++;
        continue;
      }
      if (t.startsWith('|')) {
        const filas = [];
        let cabecera = false;
        let n = 0;
        while (i < lineas.length && lineas[i].trim().startsWith('|')) {
          const actual = lineas[i];
          if (esSeparador(actual)) {
            if (n === 1)
              cabecera = true;
          }
          else {
            filas.push(celdas(actual));
            n++;
          }
          i++;
        }
        bloques.push({ t: 'tabla', filas, cabecera });
        continue;
      }
      if (t.startsWith('- ')) {
        const items = [];
        while (i < lineas.length && lineas[i].trim().startsWith('- ')) {
          items.push(lineas[i].trim().slice(2));
          i++;
        }
        bloques.push({ t: 'lista', items });
        continue;
      }
      if (t.startsWith('## '))
        bloques.push({ t: 'apartado', texto: t.slice(3) });
      else if (t.startsWith('# '))
        bloques.push({ t: 'titulo', texto: t.slice(2) });
      else if (t.startsWith('>> '))
        bloques.push({ t: 'derecha', texto: t.slice(3) });
      else if (t.startsWith('> '))
        bloques.push({ t: 'cita', texto: t.slice(2) });
      else
        bloques.push({ t: 'parrafo', texto: t });
      i++;
    }
    return bloques;
  }
  const TOKEN = /(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  /** Trocea una línea en fragmentos con formato. */
  function enLinea(texto, base = {}) {
    const out = [];
    for (const parte of texto.split(TOKEN)) {
      if (!parte)
        continue;
      if (parte.startsWith('[[') && parte.endsWith(']]'))
        out.push({ ...base, texto: parte.slice(2, -2), pendiente: true });
      else if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4)
        out.push(...enLinea(parte.slice(2, -2), { ...base, negrita: true }));
      else if (parte.startsWith('*') && parte.endsWith('*') && parte.length > 2)
        out.push(...enLinea(parte.slice(1, -1), { ...base, cursiva: true }));
      else
        out.push({ ...base, texto: parte });
    }
    return out;
  }
  /** Datos pendientes de completar ([[...]]), sin repetir. */
  function pendientes(texto) {
    const vistos = new Set();
    for (const m of texto.matchAll(/\[\[([^\]]+)\]\]/g))
      vistos.add(m[1].trim());
    return [...vistos];
  }
  /** Texto plano (para copiar al portapapeles o pegar en otro editor). */
  function textoPlano(texto) {
    return analizar(texto)
      .map((b) => {
      const limpio = (s) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
      switch (b.t) {
        case 'lista':
          return b.items.map((x) => `- ${limpio(x)}`).join('\n');
        case 'tabla':
          return b.filas.map((f) => f.map(limpio).join('\t')).join('\n');
        default:
          return limpio(b.texto);
      }
    })
      .join('\n\n');
  }

  /* ------------------------------------------------------------------ */
  /* Contexto y redacción                                               */
  /* ------------------------------------------------------------------ */

  // Datos que necesitan las plantillas, ya preparados, y utilidades de redacción.

  function hoyMadrid(ahora) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(ahora);
  }
  /** Respuestas vacías, para expedientes dados de alta a mano sin test. */
  const RESPUESTAS_VACIAS = { tipos: [], bienes: [] };

  /**
   * Prepara el expediente para las plantillas.
   *  · e.judicial: datos procesales (tratamiento, DNI, sede, plaza, autos, hitos…).
   *  · e.despacho: letrado, colegio, colegiado y procurador (por defecto, los del
   *    despacho, que el servidor toma de las variables DESPACHO_*).
   */
  function crearContexto(e, ahora) {
    const cliente = e.cliente || {};
    const d = e.despacho || {};
    const judicial = e.judicial || {};
    const exp = Object.assign({}, judicial, {
      hitos: judicial.hitos || {},
      procurador: judicial.procurador || d.procurador || undefined,
      sede: judicial.sede || sedePorProvincia(cliente.provincia),
    });
    const respuestas = Object.assign({}, RESPUESTAS_VACIAS, e.respuestas || {});
    const lead = {
      id: e.id,
      fase: e.fase,
      nombre: cliente.nombre || '',
      provincia: cliente.provincia || undefined,
      respuestas,
      resultado: e.resultado || {},
    };
    const acreedores = e.acreedores || [];
    return {
      lead,
      exp,
      acreedores,
      bienes: e.bienes || [],
      letrado: d.letrado ? { nombre: d.letrado, colegiado: d.colegiado || undefined, colegio: d.colegio || undefined } : undefined,
      via: exp.via || (e.resultado && e.resultado.via) || 'sin_masa',
      calculo: calcularExoneracion(acreedores, { exoneracionPrevia: respuestas.exoneracionPrevia === 'si' }),
      hoy: hoyMadrid(ahora || new Date()),
      festivos: festivosDe(e),
    };
  }

  /** Festivos autonómicos y locales del partido judicial (DESPACHO_FESTIVOS). */
  function festivosDe(e) {
    const f = (e && e.despacho && e.despacho.festivos) || [];
    return Array.isArray(f) ? f : String(f).split(/[,\s]+/).filter(Boolean);
  }
  // --- Redacción ---------------------------------------------------------------
  const hueco = (etiqueta) => `[[${etiqueta}]]`;
  function dato(valor, etiqueta) {
    if (valor === undefined || valor === null || valor === '' || (typeof valor === 'number' && Number.isNaN(valor)))
      return hueco(etiqueta);
    return String(valor);
  }
  const eur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  const euros = (n, etiqueta = 'importe') => (n === undefined || Number.isNaN(n) ? hueco(etiqueta) : eur2.format(n));
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fechaLarga(f, etiqueta = 'fecha') {
    if (!f)
      return hueco(etiqueta);
    const [y, m, d] = f.slice(0, 10).split('-').map(Number);
    return `${d} de ${MESES[m - 1]} de ${y}`;
  }
  function fechaCorta(f, etiqueta = 'fecha') {
    if (!f)
      return hueco(etiqueta);
    const [y, m, d] = f.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  /** Concordancia de género a partir del tratamiento (D. / D.ª). */
  function g(ctx, masc, fem) {
    if (ctx.exp.tratamiento === 'D.ª')
      return fem;
    if (ctx.exp.tratamiento === 'D.')
      return masc;
    return `${masc}/${fem.replace(masc.slice(0, -1), '')}`.replace(/\/$/, '');
  }
  const representado = (ctx) => (ctx.exp.tratamiento === 'D.ª' ? 'mi representada' : ctx.exp.tratamiento === 'D.' ? 'mi representado' : 'mi representado/a');
  const Representado = (ctx) => representado(ctx).replace(/^m/, 'M');
  function nombreCompleto(ctx, mayusculas = true) {
    const trat = ctx.exp.tratamiento ?? hueco('D./D.ª');
    return `${trat} ${mayusculas ? ctx.lead.nombre.toUpperCase() : ctx.lead.nombre}`;
  }
  function domicilio(ctx) {
    const e = ctx.exp;
    if (!e.domicilio && !e.municipio)
      return hueco('domicilio completo');
    return `${dato(e.domicilio, 'calle y número')}, ${dato(e.codigoPostal, 'C.P.')} ${dato(e.municipio, 'municipio')} (${dato(ctx.lead.provincia, 'provincia')})`;
  }
  const sede = (ctx) => (ctx.exp.sede ? ctx.exp.sede.toUpperCase() : hueco('SEDE DE LA SECCIÓN DE LO MERCANTIL'));
  const sedeNombre = (ctx) => dato(ctx.exp.sede, 'sede de la Sección de lo Mercantil');
  /** Añade punto final sin duplicarlo (p. ej. tras «S.A.»). */
  const punto = (t) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
  function encabezado(ctx, inicial = false) {
    if (inicial)
      return [`## AL TRIBUNAL DE INSTANCIA DE ${sede(ctx)}, SECCIÓN DE LO MERCANTIL, QUE POR TURNO DE REPARTO CORRESPONDA`, ''];
    return [`## AL TRIBUNAL DE INSTANCIA DE ${sede(ctx)}, SECCIÓN DE LO MERCANTIL, PLAZA N.º ${dato(ctx.exp.plaza, 'n.º')}`, `**${dato(ctx.exp.autos, 'Concurso de acreedores n.º …/…')}**`, ''];
  }
  function letradoTexto(ctx) {
    const l = ctx.letrado;
    const col = l?.colegiado ? `colegiado/a n.º ${l.colegiado}` : `colegiado/a n.º ${hueco('n.º de colegiado')}`;
    const colegio = l?.colegio ?? hueco('colegio');
    return `${l?.nombre ?? hueco('letrado/a')}, ${col} del Ilustre Colegio de la Abogacía de ${colegio}`;
  }
  function comparecencia(ctx, acreditacion) {
    return `${dato(ctx.exp.procurador, 'Procurador/a')}, Procurador/a de los Tribunales, en nombre y representación de ${nombreCompleto(ctx)}, mayor de edad, con DNI ${dato(ctx.exp.dni, 'DNI')} y domicilio en ${domicilio(ctx)}, ${acreditacion}, bajo la dirección letrada de ${letradoTexto(ctx)}, ante el Tribunal comparezco y, como mejor proceda en Derecho, **DIGO**:`;
  }
  function firma(ctx) {
    const lugar = ctx.exp.sede ?? ctx.exp.municipio;
    return [
      '',
      `>> En ${dato(lugar, 'lugar')}, a ${fechaLarga(ctx.hoy)}.`,
      '',
      `Fdo.: ${ctx.letrado?.nombre ?? hueco('letrado/a')} — Letrado/a`,
      `Fdo.: ${dato(ctx.exp.procurador, 'procurador/a')} — Procurador/a`,
    ];
  }
  // --- Cifras del caso ---------------------------------------------------------
  function resumenPasivo(ctx) {
    const c = ctx.calculo;
    const filas = [
      ['Créditos con garantía real (parte garantizada)', c.porClase.garantia_real.numero, c.porClase.garantia_real.importe],
      ['Crédito público (principal)', c.porClase.publico.numero, c.porClase.publico.importe],
      ['Créditos ordinarios', c.porClase.ordinario.numero, c.porClase.ordinario.importe],
      ['Recargos, intereses y sanciones (subordinados)', c.porClase.subordinado.numero, c.porClase.subordinado.importe],
      ['Créditos no exonerables por su naturaleza', c.porClase.no_exonerable.numero, c.porClase.no_exonerable.importe],
    ];
    return filas.filter(([, , imp]) => imp > 0);
  }
  const hayPublicos = (ctx) => ctx.acreedores.some(esPublico);
  /**
  * Propuesta de plan de pagos (arts. 496 y 497 TRLC): con la capacidad mensual
  * (ingresos menos gastos necesarios) se paga primero lo no exonerable y el resto
  * se reparte a prorrata entre los créditos ordinarios. La parte con garantía real
  * se sigue pagando conforme a su contrato, fuera del plan.
  */
  function calcularPlan(ctx) {
    const conservaVivienda = ctx.bienes.some((b) => b.tipo === 'vivienda') || ctx.lead.respuestas.conservarVivienda === 'si';
    const meses = conservaVivienda ? 60 : 36;
    const ingresos = ctx.exp.ingresosMensuales;
    const gastos = ctx.exp.gastosMensuales;
    const capacidad = ingresos !== undefined && gastos !== undefined ? Math.max(0, Math.floor(ingresos - gastos)) : undefined;
    // Lo que entra en el plan: todo menos la parte con garantía real (se paga por contrato).
    const enPlan = ctx.calculo.porAcreedor.map((c) => {
      const fueraPlan = c.acreedor.garantia === 'hipoteca' || c.acreedor.garantia === 'prenda' ? c.noExonerable : 0;
      return { c, noEx: Math.max(0, c.noExonerable - fueraPlan), ex: c.exonerable };
    });
    const deudaEnPlan = enPlan.reduce((s, x) => s + x.noEx + x.ex, 0);
    // Si la capacidad de pago supera la deuda, el plan se limita a pagarla.
    const total = capacidad !== undefined ? Math.min(capacidad * meses, Math.round(deudaEnPlan * 100) / 100) : undefined;
    const cubreTodo = capacidad !== undefined && capacidad * meses >= deudaEnPlan;
    const filas = [];
    let disponible = total ?? 0;
    // 1) Primero lo no exonerable.
    for (const x of enPlan) {
      if (x.noEx <= 0)
        continue;
      const pagar = Math.min(x.noEx, disponible);
      disponible -= pagar;
      filas.push({ acreedor: x.c.acreedor, credito: x.c.total, pagar, cuota: 0, noExonerable: true });
    }
    // 2) El resto, a prorrata entre lo exonerable.
    const sumaEx = enPlan.reduce((s, x) => s + x.ex, 0);
    for (const x of enPlan.filter((y) => y.ex > 0)) {
      const pagar = sumaEx > 0 ? Math.min(x.ex, Math.floor(((disponible * x.ex) / sumaEx) * 100) / 100) : 0;
      const previa = filas.find((f) => f.acreedor.id === x.c.acreedor.id);
      if (previa)
        previa.pagar += pagar;
      else
        filas.push({ acreedor: x.c.acreedor, credito: x.c.total, pagar, cuota: 0, noExonerable: false });
    }
    for (const f of filas)
      f.cuota = Math.round((f.pagar / meses) * 100) / 100;
    const pagado = Math.round(filas.reduce((s, f) => s + f.pagar, 0) * 100) / 100;
    const cuota = total !== undefined ? Math.round((pagado / meses) * 100) / 100 : undefined;
    const fueraDelPlan = ctx.calculo.pasivo - deudaEnPlan;
    return {
      meses,
      anios: meses / 12,
      conservaVivienda,
      ingresos,
      gastos,
      capacidad,
      cuota,
      total,
      cubreTodo,
      filas,
      pagado,
      fueraDelPlan,
      exoneradoAlFinal: Math.max(0, Math.round((deudaEnPlan - pagado) * 100) / 100),
    };
  }
  /** Documentos que acompañan a la solicitud de concurso, numerados. */
  function documentosSolicitud(ctx) {
    const r = ctx.lead.respuestas;
    const docs = [
      'Poder especial para solicitar el concurso o apoderamiento *apud acta*.',
      'Memoria expresiva de la historia jurídica y económica (art. 7, ordinal 1.º, TRLC).',
      'Inventario de bienes y derechos (art. 7, ordinal 2.º, TRLC).',
      'Relación de acreedores (art. 7, ordinal 3.º, TRLC).',
      'DNI.',
      'Certificado de empadronamiento.',
      'Informe de la Central de Información de Riesgos del Banco de España (CIRBE).',
      'Certificados de deudas con la Agencia Tributaria y con la Tesorería General de la Seguridad Social.',
      'Informe de vida laboral.',
      'Justificantes de ingresos de los tres últimos meses.',
      'Declaraciones del IRPF de los tres últimos ejercicios.',
      'Extractos bancarios de los seis últimos meses.',
      'Contratos, requerimientos de pago y reclamaciones de cada acreedor.',
      'Certificado de antecedentes penales.',
    ];
    if (r.bienes.includes('vivienda_hipoteca') || r.bienes.includes('vivienda_libre'))
      docs.push('Nota simple registral de la vivienda.');
    if (r.tipos.includes('hipoteca') || r.bienes.includes('vivienda_hipoteca'))
      docs.push('Escritura de préstamo hipotecario y último recibo.');
    if (r.bienes.includes('vehiculo'))
      docs.push('Permiso de circulación y valoración del vehículo.');
    if (r.perfil === 'autonomo' || r.perfil === 'exautonomo')
      docs.push('Modelos 303, 130 y 390 del último ejercicio.');
    if (r.tipos.includes('alimentos'))
      docs.push('Sentencia o convenio regulador de las medidas familiares.');
    return docs;
  }
  const ESTADO_CIVIL = {
    soltero: 'soltero/a',
    casado: 'casado/a',
    pareja: 'pareja de hecho inscrita',
    divorciado: 'divorciado/a',
    viudo: 'viudo/a',
  };
  const REGIMEN = {
    gananciales: 'sociedad de gananciales',
    separacion: 'separación de bienes',
    participacion: 'participación',
    otro: 'otro régimen',
  };
  function estadoCivilTexto(ctx) {
    const e = ctx.exp;
    if (!e.estadoCivil)
      return hueco('estado civil');
    const base = (ESTADO_CIVIL[e.estadoCivil] ?? e.estadoCivil).replace('o/a', g(ctx, 'o', 'a'));
    if (e.estadoCivil === 'casado')
      return `${base} con ${dato(e.conyuge, 'nombre y DNI del cónyuge')} desde el ${fechaLarga(e.fechaMatrimonio, 'fecha del matrimonio')}, en régimen de ${e.regimen ? REGIMEN[e.regimen] : hueco('régimen económico')}`;
    if (e.estadoCivil === 'pareja')
      return `${base} con ${dato(e.conyuge, 'nombre y DNI de la pareja')}, inscrita el ${fechaLarga(e.fechaMatrimonio, 'fecha de inscripción')}`;
    return base;
  }

  /* ------------------------------------------------------------------ */
  /* Plantillas                                                         */
  /* ------------------------------------------------------------------ */

  // Plantillas de los escritos del procedimiento de segunda oportunidad.
  // Cada plantilla devuelve el borrador en el formato de `marcado.ts`. Los datos que falten
  // quedan como [[huecos]] y el escrito no se puede marcar como revisado hasta completarlos.
  //
  // Normativa: texto refundido de la Ley Concursal (RDL 1/2020) tras la Ley 16/2022 y
  // LO 1/2025 (Tribunales de Instancia). Las citas se han contrastado en octubre de 2026;
  // el letrado debe revisar cada borrador antes de presentarlo.

  const TRLC = 'texto refundido de la Ley Concursal, aprobado por Real Decreto Legislativo 1/2020, de 5 de mayo (en adelante, TRLC)';
  const STS_CREDITO_PUBLICO = 'STS 264/2026, de 18 de febrero, rec. 3528/2024, ECLI:ES:TS:2026:440';
  const lineas = (...xs) => xs
    .flat()
    .filter((x) => typeof x === 'string')
    .join('\n');
  // ---------------------------------------------------------------------------
  // Bloques reutilizables
  // ---------------------------------------------------------------------------
  function insolvencia(ctx) {
    const inminente = ctx.lead.respuestas.capacidad === 'pago_con_dificultad';
    return inminente
      ? {
        tipo: 'inminente',
        texto: `${Representado(ctx)} atiende todavía sus pagos, pero a costa de nuevo endeudamiento, y prevé que dentro de los tres meses siguientes no podrá cumplir regular y puntualmente sus obligaciones. Se encuentra, por tanto, en estado de **insolvencia inminente** (art. 2.3 TRLC).`,
      }
      : {
        tipo: 'actual',
        texto: `${Representado(ctx)} no puede cumplir regular y puntualmente sus obligaciones exigibles: ha dejado de atender las cuotas de sus créditos${ctx.acreedores.some((a) => a.procedimiento) ? ' y soporta reclamaciones judiciales y embargos' : ''}. Se encuentra, por tanto, en estado de **insolvencia actual** (art. 2.3 TRLC).`,
      };
  }
  function tablaPasivo(ctx) {
    const filas = resumenPasivo(ctx);
    if (!filas.length)
      return [hueco('Completar la relación de acreedores en la pestaña Acreedores')];
    return [
      '| Clase de crédito | Créditos | Importe |',
      '|---|---|---|',
      ...filas.map(([c, n, i]) => `| ${c} | ${n} | ${euros(i)} |`),
      `| **Total pasivo** | **${ctx.acreedores.length}** | **${euros(ctx.calculo.pasivo)}** |`,
    ];
  }
  function tablaExoneracion(ctx) {
    if (!ctx.acreedores.length)
      return [hueco('Completar la relación de acreedores')];
    return [
      '| Acreedor | Crédito | Exonerable | No exonerable | Observaciones |',
      '|---|---|---|---|---|',
      ...ordenAlfabetico(ctx.acreedores).map((a) => {
        const c = ctx.calculo.porAcreedor.find((x) => x.acreedor.id === a.id);
        return `| ${a.nombre}${a.nif ? ` (${a.nif})` : ''} — ${a.concepto} | ${euros(c.total)} | ${euros(c.exonerable)} | ${euros(c.noExonerable)} | ${c.motivo ?? '—'} |`;
      }),
      `| **Total** | **${euros(ctx.calculo.pasivo)}** | **${euros(ctx.calculo.exonerable)}** | **${euros(ctx.calculo.noExonerable)}** | |`,
    ];
  }
  function bienesResumen(ctx) {
    if (!ctx.bienes.length)
      return `${Representado(ctx)} no es titular de bienes inmuebles, vehículos ni otros bienes o derechos de valor realizable.`;
    return ctx.bienes.map((b) => `${b.descripcion}${b.valorActual !== undefined ? `, con un valor estimado de ${euros(b.valorActual)}` : ''}${b.cargas ? ` (${b.cargas})` : ''}`).join('; ') + '.';
  }
  function supuestoSinMasa(ctx) {
    const conValor = ctx.bienes.filter((b) => b.tipo !== 'cuenta' && (b.valorActual ?? 0) > 0);
    if (!conValor.length)
      return 'por carecer de bienes y derechos legalmente embargables';
    const conCargas = ctx.bienes.some((b) => b.tipo === 'vivienda' || b.tipo === 'inmueble');
    if (conCargas)
      return 'porque los gravámenes y cargas que pesan sobre sus bienes superan su valor de mercado';
    return 'porque sus bienes y derechos libres de cargas tienen un valor inferior al previsible coste del procedimiento';
  }
  function buenaFe(ctx) {
    const r = ctx.lead.respuestas;
    return [
      `- No ha sido ${g(ctx, 'condenado', 'condenada')} en sentencia firme, en los diez años anteriores, por delitos contra el patrimonio y el orden socioeconómico, de falsedad documental, contra la Hacienda Pública y la Seguridad Social o contra los derechos de los trabajadores (art. 487.1.1.º TRLC).${r.condena === 'si' ? ` ${hueco('ATENCIÓN: el cliente indicó una condena; revisar antes de presentar')}` : ''}`,
      `- No ha sido ${g(ctx, 'sancionado', 'sancionada')} por resolución administrativa firme por infracciones tributarias, de seguridad social o del orden social muy graves en los diez años anteriores, ni le consta acuerdo firme de derivación de responsabilidad (art. 487.1.2.º TRLC).${r.sancion === 'si' || r.derivacion === 'si' ? ` ${hueco('ATENCIÓN: el cliente indicó sanción o derivación; adaptar este punto')}` : ''}`,
      `- Ha facilitado y facilitará al Tribunal toda la información patrimonial requerida, en cumplimiento de sus deberes de colaboración (art. 487.1.5.º TRLC).`,
      `- Su endeudamiento no responde a una actuación temeraria o negligente, sino a las causas expuestas en esta solicitud (art. 487.1.6.º TRLC).`,
      `- No ha obtenido con anterioridad la exoneración del pasivo insatisfecho (art. 488 TRLC).${r.exoneracionPrevia === 'si' ? ` ${hueco('ATENCIÓN: hubo exoneración previa; comprobar plazos del art. 488')}` : ''}`,
    ];
  }
  /** Doctrina del Tribunal Supremo de 2026 sobre crédito público, en cuatro bloques. */
  function doctrinaCreditoPublico(ctx, ordinal) {
    const publicos = ctx.calculo.publicos;
    const subsuncion = publicos.length
      ? publicos.map((p) => `- **${p.nombre}**: principal de ${euros(p.principal)}, del que resultan exonerables ${euros(p.exonerable)} por aplicación del límite propio de este acreedor; ${p.subordinado > 0 ? `y ${euros(p.subordinado)} de recargos, intereses y sanciones, exonerables en su totalidad` : 'sin créditos subordinados'}.`)
      : [`- ${hueco('Detallar cada acreedor público')}`];
    return [
      `## ${ordinal}.- Los recargos, intereses y sanciones del crédito público son exonerables en su totalidad, y el límite de 10.000 € se aplica por cada acreedor público.`,
      `La Sala Primera del Tribunal Supremo, en seis sentencias de 18 de febrero de 2026 (SSTS 259 a 264/2026), ha fijado doctrina sobre el alcance de la exoneración del crédito público tras la Ley 16/2022. Venía a resolver la disparidad de criterios entre Audiencias Provinciales sobre dos cuestiones: si la limitación del artículo 489.1.5.º TRLC alcanza a todo crédito público o solo al no subordinado, y si el tope cuantitativo opera de forma global o por cada administración acreedora.`,
      `> *"los créditos públicos subordinados sí pueden quedar afectados íntegramente por la exoneración"* (${STS_CREDITO_PUBLICO}). ${hueco('Cotejar la literalidad y el fundamento jurídico con el texto de CENDOJ antes de presentar')}`,
      `De esta doctrina resultan tres reglas: (i) la limitación del artículo 489.1.5.º TRLC se justifica respecto del crédito público ordinario y privilegiado, pero no respecto de los créditos subordinados —recargos, intereses de demora y sanciones—, que quedan exonerados en su integridad; (ii) el límite cuantitativo —exoneración íntegra hasta 5.000 € y del 50 % del exceso, con un máximo de 10.000 €— se aplica a cada acreedor público por separado, y no solo a la Agencia Tributaria y a la Tesorería General de la Seguridad Social, sino a cualquier administración acreedora; y (iii) el deudor debe relacionar sus créditos y la resolución que conceda la exoneración debe identificar los créditos exonerados.`,
      `En el caso que nos ocupa, la aplicación de estas reglas a los créditos públicos de ${representado(ctx)} arroja el siguiente resultado:`,
      ...subsuncion,
      `Estos importes se identifican, crédito por crédito, en la tabla del hecho correspondiente, de modo que la resolución que conceda la exoneración pueda individualizar los créditos exonerados conforme a la doctrina expuesta.`,
    ];
  }
  // ---------------------------------------------------------------------------
  // 1. Solicitud de concurso voluntario
  // ---------------------------------------------------------------------------
  function solicitudConcurso(ctx) {
    const e = ctx.exp;
    const ins = insolvencia(ctx);
    const ejecuciones = ctx.acreedores.filter((a) => a.procedimiento);
    const docs = documentosSolicitud(ctx);
    const n = (busca) => docs.findIndex((d) => d.toLowerCase().includes(busca)) + 1;
    const coletilla = ctx.via === 'sin_masa'
      ? 'con declaración de **concurso sin masa** (arts. 37 bis y 37 ter TRLC)'
      : ctx.via === 'plan_pagos'
        ? 'con anuncio de la solicitud de **exoneración del pasivo insatisfecho con plan de pagos** (arts. 495 y siguientes TRLC)'
        : 'con solicitud de **apertura de la fase de liquidación** (art. 406 TRLC)';
    let hecho = 0;
    const ord = () => ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO'][hecho++];
    return lineas(encabezado(ctx, true), comparecencia(ctx, `según acredito mediante poder especial para solicitar el concurso, que acompaño como documento n.º 1 ${hueco('o apoderamiento apud acta en la sede judicial electrónica')}`), '', `Que mediante el presente escrito, al amparo de los artículos 2, 3, 6 y 7 del ${TRLC}, solicito la **declaración de concurso voluntario** de ${representado(ctx)}, ${coletilla}, con base en los siguientes`, '# HECHOS', `## ${ord()}.- ${Representado(ctx)} es persona natural con domicilio y centro de intereses principales en ${dato(e.municipio, 'municipio')}.`, `${nombreCompleto(ctx, false)}, ${g(ctx, 'nacido', 'nacida')} el ${fechaLarga(e.fechaNacimiento, 'fecha de nacimiento')}, es ${estadoCivilTexto(ctx)}. Tiene ${e.personasACargo === undefined ? hueco('n.º') : e.personasACargo} ${e.personasACargo === 1 ? 'persona' : 'personas'} a su cargo. Situación laboral: ${dato(e.situacionLaboral, 'situación laboral y empleador')}.`, `Percibe unos ingresos netos mensuales de ${euros(e.ingresosMensuales, 'ingresos mensuales')} y soporta unos gastos necesarios de ${euros(e.gastosMensuales, 'gastos mensuales')} al mes en vivienda, suministros, alimentación y transporte.`, `Su domicilio habitual, que constituye el centro de sus intereses principales, se encuentra en ${domicilio(ctx)}, según acredita el certificado de empadronamiento (documento n.º ${n('empadronamiento')}).`, `## ${ord()}.- Pasivo de ${euros(ctx.calculo.pasivo)} frente a ${ctx.acreedores.length || hueco('n.º')} acreedores, que no puede atender.`, ins.texto, ...tablaPasivo(ctx), `El pago ordinario de estas deudas exigiría cuotas mensuales de ${euros(e.cuotasMensuales, 'cuotas mensuales')}, frente a unos ingresos netos de ${euros(e.ingresosMensuales, 'ingresos mensuales')}. El detalle de cada crédito figura en la relación de acreedores (documento n.º 4).`, `## ${ord()}.- Causas de la insolvencia.`, dato(e.causas, 'Exponer las causas del endeudamiento: hechos, fechas y por qué no fue posible atender los pagos'), `## ${ord()}.- ${ctx.via === 'sin_masa' ? `${Representado(ctx)} carece de masa activa suficiente para atender los costes del procedimiento.` : 'Masa activa.'}`, bienesResumen(ctx), ctx.via === 'sin_masa' && `Concurre, por tanto, insuficiencia de masa activa en los términos del artículo 37 bis.1 TRLC, ${supuestoSinMasa(ctx)}. El detalle figura en el inventario (documento n.º 3).`, ctx.via === 'plan_pagos' && `${Representado(ctx)} desea conservar su vivienda habitual y destinar su renta futura al pago de sus acreedores conforme a un plan de pagos, por lo que formulará solicitud de exoneración con sujeción a un plan de pagos sin liquidación de la masa activa (arts. 495 a 498 TRLC).`, ctx.via === 'liquidacion' && `${Representado(ctx)} carece de propuesta de convenio viable y solicita la apertura de la liquidación para, una vez realizados sus bienes, acceder a la exoneración del pasivo insatisfecho (art. 501.2 TRLC).`, ejecuciones.length > 0 && [
      `## ${ord()}.- Reclamaciones judiciales y ejecuciones en curso.`,
      ...ejecuciones.map((a) => `- ${a.procedimiento.autos} — ${a.procedimiento.organo}. Ejecutante: ${punto(a.nombre)} Estado: ${punto(a.procedimiento.estado)}`),
    ], `## ${ord()}.- ${Representado(ctx)} es ${g(ctx, 'deudor', 'deudora')} de buena fe: no concurre ninguna de las causas de los artículos 487 y 488 TRLC.`, ...buenaFe(ctx), `## ${ord()}.- Documentación que se acompaña (arts. 6 y 7 TRLC).`, ...docs.map((d, i) => `- Documento n.º ${i + 1}: ${d}`), '# FUNDAMENTOS DE DERECHO', `## I.- Competencia del Tribunal de Instancia de ${sedeNombre(ctx)}, Sección de lo Mercantil, por radicar en su territorio el centro de intereses principales de ${representado(ctx)}.`, `La competencia para declarar y tramitar el concurso corresponde a los jueces de lo mercantil (art. 44 TRLC), hoy integrados en las Secciones de lo Mercantil de los Tribunales de Instancia conforme a la Ley Orgánica 1/2025, de 2 de enero, también cuando el deudor es persona natural no empresaria. La competencia territorial se determina por el lugar en que el deudor tiene el centro de sus intereses principales (art. 45 TRLC), que en este caso coincide con su domicilio habitual (hecho primero).`, `## II.- Legitimación de ${representado(ctx)} y postulación.`, `${Representado(ctx)} está ${g(ctx, 'legitimado', 'legitimada')} para solicitar su propio concurso (art. 3.1 TRLC) y comparece representad${g(ctx, 'o', 'a')} por procurador y asistid${g(ctx, 'o', 'a')} de letrado, como exige el artículo 510 TRLC.`, `## III.- Concurre el presupuesto objetivo: insolvencia ${ins.tipo} (art. 2 TRLC).`, `El pasivo exigible de ${euros(ctx.calculo.pasivo)} y la desproporción entre las cuotas comprometidas y los ingresos disponibles, expuestos en el hecho segundo, acreditan el estado de insolvencia ${ins.tipo} definido en el artículo 2.3 TRLC.`, `## IV.- La solicitud reúne los requisitos de los artículos 6 y 7 TRLC.`, `${Representado(ctx)} expresa su estado de insolvencia y acompaña la memoria, el inventario de bienes y derechos y la relación de acreedores exigidos por el artículo 7 TRLC, junto con la documentación que los justifica.`, ctx.via === 'sin_masa' && [
      '## V.- Procede declarar el concurso sin masa (arts. 37 bis y 37 ter TRLC).',
      `Concurre el supuesto de insuficiencia de masa activa del artículo 37 bis.1 TRLC, ${supuestoSinMasa(ctx)}. Procede, por tanto, dictar auto que declare el concurso con expresión del pasivo, sin más pronunciamientos, y ordene la publicación del edicto en el Boletín Oficial del Estado y en el Registro público concursal, con llamamiento a los acreedores que representen al menos el cinco por ciento del pasivo para que, en el plazo de quince días, puedan solicitar el nombramiento de administrador concursal (art. 37 ter.1 TRLC). De no hacerlo, ${representado(ctx)} podrá solicitar la exoneración del pasivo insatisfecho (arts. 37 ter.2 y 501.1 TRLC).`,
    ], ctx.via === 'liquidacion' && [
      '## V.- Procede la apertura de la liquidación a solicitud del deudor (art. 406 TRLC).',
      'El deudor puede solicitar la liquidación en cualquier momento, y el juez debe dictar auto de apertura en el plazo de diez días (art. 406 TRLC).',
    ], ctx.via === 'plan_pagos' && [
      '## V.- Exoneración con plan de pagos sin liquidación de la masa activa (arts. 495 a 498 TRLC).',
      `La solicitud de exoneración con plan de pagos puede presentarse en cualquier momento antes de que se acuerde la liquidación de la masa activa (art. 495 TRLC). ${Representado(ctx)} la formulará con la propuesta de plan y la documentación que exige la ley.`,
    ], `## VI.- ${Representado(ctx)} podrá acceder a la exoneración del pasivo insatisfecho (arts. 486 y siguientes TRLC).`, `Como persona natural de buena fe (art. 487 TRLC) que no ha obtenido antes la exoneración (art. 488 TRLC), ${representado(ctx)} podrá obtener la exoneración de todas sus deudas, con las únicas excepciones del artículo 489.1 TRLC.`, hayPublicos(ctx) &&
      `En cuanto al crédito público, la Sala Primera ha declarado que el límite del artículo 489.1.5.º TRLC opera por cada acreedor público y que los créditos públicos subordinados son exonerables en su totalidad (${STS_CREDITO_PUBLICO}). Por ello, la relación de acreedores identifica por separado el principal y los recargos, intereses y sanciones de cada administración.`, '', `Por lo expuesto,`, `**SUPLICO AL TRIBUNAL** que tenga por presentado este escrito con los documentos que lo acompañan y sus copias, me tenga por comparecido y parte en nombre de ${nombreCompleto(ctx)} y, previos los trámites legales, dicte auto por el que:`, `- Declare en concurso voluntario a ${nombreCompleto(ctx)}, con DNI ${dato(e.dni, 'DNI')}.`, ctx.via === 'sin_masa' && '- Aprecie la insuficiencia de masa activa y acuerde los pronunciamientos del artículo 37 ter TRLC, con publicación del edicto en el Boletín Oficial del Estado y en el Registro público concursal.', ctx.via === 'liquidacion' && '- Acuerde la apertura de la fase de liquidación conforme al artículo 406 TRLC.', ctx.via === 'plan_pagos' && '- Tenga por anunciada la solicitud de exoneración del pasivo insatisfecho con plan de pagos y, presentada la propuesta, le dé el trámite del artículo 498 TRLC.', ejecuciones.length > 0 &&
      ctx.via !== 'sin_masa' && [
      '',
      `**OTROSÍ DIGO** que, a los efectos del artículo 143.1 TRLC, interesa a esta parte que se comunique la declaración de concurso a los órganos ante los que se siguen las ejecuciones relacionadas en el hecho correspondiente.`,
      '**SUPLICO AL TRIBUNAL** que así lo acuerde.',
    ], firma(ctx));
  }
  // ---------------------------------------------------------------------------
  // 2-4. Documentos del artículo 7 TRLC
  // ---------------------------------------------------------------------------
  function memoria(ctx) {
    const e = ctx.exp;
    const r = ctx.lead.respuestas;
    const empresario = r.perfil === 'autonomo' || r.perfil === 'exautonomo' || r.perfil === 'administrador';
    const plan = ctx.via === 'plan_pagos' ? calcularPlan(ctx) : null;
    return lineas('# DOCUMENTO N.º 2', '# MEMORIA EXPRESIVA DE LA HISTORIA JURÍDICA Y ECONÓMICA DEL DEUDOR', `>> Artículo 7, ordinal 1.º, TRLC · ${nombreCompleto(ctx)}`, '## 1. Identificación.', `${nombreCompleto(ctx, false)}, con DNI ${dato(e.dni, 'DNI')}, ${g(ctx, 'nacido', 'nacida')} el ${fechaLarga(e.fechaNacimiento, 'fecha de nacimiento')} y con domicilio en ${domicilio(ctx)}.`, '## 2. Situación personal y familiar.', `Estado civil: ${estadoCivilTexto(ctx)}.`, `Personas a su cargo: ${e.personasACargo ?? hueco('n.º')}.`, '## 3. Actividad durante los tres últimos años.', dato(e.situacionLaboral, 'Describir empleos, contratos y periodos de desempleo de los tres últimos años'), empresario && `Ha desarrollado actividad por cuenta propia: ${hueco('actividad, epígrafe, fechas de alta y baja, establecimientos u oficinas de los que haya sido titular')}.`, '## 4. Causas del estado de insolvencia.', dato(e.causas, 'Causas del endeudamiento'), '## 5. Situación patrimonial actual.', '| Concepto | Importe |', '|---|---|', `| Ingresos netos mensuales | ${euros(e.ingresosMensuales, 'ingresos')} |`, `| Gastos necesarios mensuales | ${euros(e.gastosMensuales, 'gastos')} |`, `| Cuotas mensuales de las deudas | ${euros(e.cuotasMensuales, 'cuotas')} |`, `| Valor estimado de los bienes y derechos | ${euros(ctx.bienes.reduce((s, b) => s + (b.valorActual ?? 0), 0))} |`, `| Pasivo total | ${euros(ctx.calculo.pasivo)} |`, `El detalle del activo figura en el inventario (documento n.º 3) y el del pasivo, en la relación de acreedores (documento n.º 4).`, '## 6. Valoraciones y propuestas sobre la viabilidad patrimonial.', ctx.via === 'sin_masa' && `El patrimonio de ${representado(ctx)} es insuficiente para atender siquiera los costes del procedimiento, y sus ingresos apenas cubren sus necesidades básicas. No existe alternativa viable de pago, por lo que se propone la declaración de concurso sin masa y la posterior exoneración del pasivo insatisfecho.`, ctx.via === 'liquidacion' && `No existe propuesta de convenio viable. Se propone la liquidación de los bienes y la posterior exoneración del pasivo que quede insatisfecho.`, ctx.via === 'plan_pagos' &&
      plan &&
      `${Representado(ctx)} dispone de una capacidad de pago de ${euros(plan.capacidad, 'capacidad mensual')} al mes, que destinará a un plan de pagos de ${plan.anios} años con el fin de conservar su vivienda habitual y obtener la exoneración del resto del pasivo.`, ctx.via === 'microempresa' && `Se propone la tramitación por el procedimiento especial para microempresas, con liquidación o continuación de la actividad según se valore en el expediente.`, firma(ctx).slice(0, 2));
  }
  function inventario(ctx) {
    const total = ctx.bienes.reduce((s, b) => s + (b.valorActual ?? 0), 0);
    return lineas('# DOCUMENTO N.º 3', '# INVENTARIO DE BIENES Y DERECHOS', `>> Artículo 7, ordinal 2.º, TRLC · ${nombreCompleto(ctx)}`, ctx.bienes.length
      ? [
        '| N.º | Bien o derecho | Ubicación y datos registrales | Valor de adquisición | Valor actual estimado | Cargas y gravámenes |',
        '|---|---|---|---|---|---|',
        ...ctx.bienes.map((b, i) => `| ${i + 1} | ${b.descripcion}${b.necesario ? ' (necesario)' : ''} | ${dato(b.identificacion, 'datos registrales o identificación')} | ${euros(b.valorAdquisicion, 'valor de adquisición')} | ${euros(b.valorActual, 'valor actual')} | ${b.cargas || 'Libre de cargas'} |`),
        `| | **Total** | | | **${euros(total)}** | |`,
      ]
      : [
        `${Representado(ctx)} no es titular de bienes inmuebles, vehículos, valores ni otros bienes o derechos de valor realizable.`,
        `Es titular de la cuenta corriente ${hueco('IBAN')} en ${hueco('entidad')}, en la que percibe sus ingresos, con un saldo a la fecha de ${hueco('saldo')}.`,
      ], `Los valores actuales se han estimado a la fecha de la solicitud ${hueco('indicar criterio: tasación, tablas de Hacienda para vehículos, valor de mercado…')}.`, firma(ctx).slice(0, 2));
  }
  function filaAcreedor(a, i) {
    const garantia = a.garantia && a.garantia !== 'ninguna' ? { hipoteca: 'Hipoteca', prenda: 'Prenda', aval: 'Aval personal' }[a.garantia] + (a.importeGarantizado ? ` (${euros(a.importeGarantizado)})` : '') : 'Ninguna';
    const contacto = [a.domicilio ?? hueco('domicilio'), a.email].filter(Boolean).join(' · ');
    const importe = a.accesorios ? `${euros(totalCredito(a))} (principal ${euros(a.principal)}; recargos e intereses ${euros(a.accesorios)})` : euros(a.principal);
    return `| ${i + 1} | ${a.nombre}${a.nif ? `, ${a.nif}` : ''} | ${contacto} | ${a.concepto} | ${importe} | ${a.vencimiento ? fechaCorta(a.vencimiento) : 'Vencido'} | ${garantia} | ${a.procedimiento ? `${a.procedimiento.autos} (${a.procedimiento.organo}): ${a.procedimiento.estado}` : 'No'} |`;
  }
  function relacionAcreedores(ctx) {
    const lista = ordenAlfabetico(ctx.acreedores);
    return lineas('# DOCUMENTO N.º 4', '# RELACIÓN DE ACREEDORES', `>> Artículo 7, ordinal 3.º, TRLC · ${nombreCompleto(ctx)}`, 'Relación por orden alfabético, con expresión de la identidad, domicilio y dirección electrónica de cada acreedor, la cuantía y el vencimiento de los créditos, las garantías constituidas y, en su caso, las reclamaciones judiciales y su estado.', lista.length
      ? [
        '| N.º | Acreedor | Domicilio y correo electrónico | Concepto | Importe | Vencimiento | Garantías | Reclamación judicial |',
        '|---|---|---|---|---|---|---|---|',
        ...lista.map(filaAcreedor),
        `| | **Total** | | | **${euros(ctx.calculo.pasivo)}** | | | |`,
      ]
      : hueco('Añadir los acreedores en la pestaña Acreedores del expediente'), '## Clasificación orientativa', 'A efectos meramente informativos, sin perjuicio de la clasificación que proceda en el concurso:', ...tablaPasivo(ctx), hayPublicos(ctx) && `Los créditos públicos se desglosan en principal y en recargos, intereses y sanciones, que tienen la consideración de subordinados y son exonerables en su totalidad (${STS_CREDITO_PUBLICO}).`, firma(ctx).slice(0, 2));
  }
  // ---------------------------------------------------------------------------
  // 5. Exoneración con plan de pagos
  // ---------------------------------------------------------------------------
  function planPagos(ctx) {
    const p = calcularPlan(ctx);
    const noEx = ctx.calculo.porAcreedor.filter((c) => c.noExonerable > 0);
    return lineas(encabezado(ctx), comparecencia(ctx, 'cuya representación consta acreditada en autos'), '', `Que, al amparo de los artículos 495 a 498 TRLC, y no habiéndose acordado la liquidación de la masa activa, formulo **SOLICITUD DE EXONERACIÓN DEL PASIVO INSATISFECHO CON SUJECIÓN A UN PLAN DE PAGOS**, sin liquidación de la masa activa, con base en las siguientes`, '# ALEGACIONES', `## PRIMERA.- ${Representado(ctx)} reúne los presupuestos de la exoneración: persona natural de buena fe que no ha obtenido antes este beneficio (arts. 486 a 488 TRLC).`, ...buenaFe(ctx), `## SEGUNDA.- Propuesta de plan de pagos: ${p.meses} cuotas mensuales de ${euros(p.cuota, 'cuota mensual')} durante ${p.anios} años (arts. 496 y 497 TRLC).`, p.conservaVivienda
      ? `La duración del plan es de cinco años porque no se realiza la vivienda habitual de ${representado(ctx)} y de su familia (art. 497.2 TRLC).`
      : 'La duración del plan es de tres años, conforme a la regla general del artículo 497.1 TRLC.', `${Representado(ctx)} abonará ${p.meses} cuotas mensuales de ${euros(p.cuota, 'cuota mensual')}, el día ${hueco('día del mes')} de cada mes, a partir del mes siguiente a la aprobación judicial del plan, fecha en que comenzará a correr su plazo (art. 497.3 TRLC). El total destinado al plan asciende a ${euros(p.total, 'total del plan')}.`, 'Calendario de pagos por acreedor (art. 496.1 TRLC):', '| Acreedor | Crédito | Total a pagar en el plan | Cuota mensual | Observaciones |', '|---|---|---|---|---|', ...p.filas.map((f) => `| ${f.acreedor.nombre} — ${f.acreedor.concepto} | ${euros(f.credito)} | ${euros(f.pagar)} | ${euros(f.cuota)} | ${f.noExonerable ? 'Incluye parte no exonerable' : 'A prorrata'} |`), `| **Total** | **${euros(p.filas.reduce((s, f) => s + f.credito, 0))}** | **${euros(p.pagado)}** | **${euros(p.cuota, 'cuota')}** | |`, p.fueraDelPlan > 0 && `Quedan fuera del plan ${euros(p.fueraDelPlan)} correspondientes a la parte de los créditos cubierta por garantía real, que se atenderá conforme a sus contratos.`, p.exoneradoAlFinal > 0 ? `Cumplido el plan, quedará exonerado el resto del pasivo incluido en él, por importe estimado de ${euros(p.exoneradoAlFinal)}.` : 'Con la capacidad de pago indicada, el plan atiende la totalidad de los créditos incluidos en él.', '## TERCERA.- Recursos para el cumplimiento del plan (art. 496.2 TRLC).', `${Representado(ctx)} percibe unos ingresos netos mensuales de ${euros(p.ingresos, 'ingresos')} y soporta unos gastos necesarios de ${euros(p.gastos, 'gastos')}, lo que arroja la capacidad de pago indicada. ${hueco('Exponer la estabilidad de la renta futura: tipo de contrato, antigüedad, previsiones')}.`, `Bienes y derechos necesarios para el cumplimiento del plan: ${ctx.bienes.filter((b) => b.necesario).map((b) => b.descripcion).join('; ') || hueco('vivienda habitual, vehículo necesario para el trabajo…')}.`, ctx.acreedores.some((a) => a.garantia === 'hipoteca') && 'Las cuotas del préstamo con garantía hipotecaria sobre la vivienda habitual se seguirán atendiendo conforme a su contrato, al margen del plan.', '## CUARTA.- Pago de los créditos no exonerables.', noEx.length
      ? noEx.map((c) => `- ${c.acreedor.nombre}: ${euros(c.noExonerable)} no exonerables. Motivo: ${punto(c.motivo ?? 'art. 489.1 TRLC')}`)
      : 'No existen créditos no exonerables más allá de los atendidos conforme a su contrato.', '## QUINTA.- El plan respeta el orden legal de pago y no consiste en la liquidación total del patrimonio (art. 496.4 TRLC).', '## SEXTA.- Constancia en el Registro público concursal.', `${Representado(ctx)} acepta expresamente que la concesión de la exoneración conste en el Registro público concursal durante el plazo legal (art. 495 TRLC).`, '## SÉPTIMA.- Documentación.', `Se acompañan las declaraciones del impuesto sobre la renta de las personas físicas de los tres últimos ejercicios cerrados de ${representado(ctx)} y de los demás miembros de su unidad familiar (art. 495 TRLC).`, '', 'Por lo expuesto,', `**SUPLICO AL TRIBUNAL** que tenga por formulada solicitud de exoneración del pasivo insatisfecho con plan de pagos, dé traslado de la propuesta a los acreedores personados por plazo de diez días (art. 498.1 TRLC) y, previos los trámites legales, dicte auto por el que conceda a ${nombreCompleto(ctx)} la exoneración provisional del pasivo insatisfecho y apruebe el plan de pagos propuesto (art. 498.2 TRLC), con identificación de los créditos afectados.`, firma(ctx));
  }
  // ---------------------------------------------------------------------------
  // 6-7. Solicitudes de exoneración
  // ---------------------------------------------------------------------------
  function cuerpoExoneracion(ctx, entradilla, hechosProcesales, fundamentoPlazo) {
    return lineas(encabezado(ctx), comparecencia(ctx, 'cuya representación consta acreditada en autos'), '', entradilla, '# HECHOS', ...hechosProcesales, `## TERCERO.- Pasivo cuya exoneración se solicita: ${euros(ctx.calculo.exonerable)} de un total de ${euros(ctx.calculo.pasivo)}.`, 'Se identifican a continuación todos los créditos, con expresión de la parte exonerable y de la que no lo es:', ...tablaExoneracion(ctx), `## CUARTO.- ${Representado(ctx)} no está ${g(ctx, 'incurso', 'incursa')} en ninguna de las circunstancias que impiden obtener la exoneración.`, `A los efectos del artículo 501.3 TRLC, ${representado(ctx)} manifiesta expresamente que no concurre en su persona ninguna de las causas de exclusión de los artículos 487 y 488 TRLC:`, ...buenaFe(ctx), '## QUINTO.- Declaraciones tributarias.', 'Se acompañan las declaraciones del impuesto sobre la renta de las personas físicas de los tres años anteriores a la solicitud (art. 501.3 TRLC).', '# FUNDAMENTOS DE DERECHO', fundamentoPlazo, `## II.- Concurren los presupuestos subjetivos de la exoneración: ${representado(ctx)} es persona natural y ${g(ctx, 'deudor', 'deudora')} de buena fe (arts. 486 y 487 TRLC).`, 'La buena fe se acredita por la ausencia de las causas tasadas del artículo 487.1 TRLC, manifestada en el hecho cuarto y que resulta de la documentación obrante en autos.', '## III.- La exoneración alcanza a todo el pasivo insatisfecho, con las únicas excepciones del artículo 489.1 TRLC.', 'Quedan fuera de la exoneración, exclusivamente, los créditos que se indican como no exonerables en la tabla del hecho tercero y por los motivos allí expresados.', hayPublicos(ctx) && doctrinaCreditoPublico(ctx, 'IV'), '', 'Por lo expuesto,', `**SUPLICO AL TRIBUNAL** que tenga por formulada en tiempo y forma solicitud de exoneración del pasivo insatisfecho y, de no formularse oposición, conceda a ${nombreCompleto(ctx)} la exoneración en la resolución que declare la conclusión del concurso (art. 502 TRLC), con identificación de los créditos exonerados, por importe de ${euros(ctx.calculo.exonerable)}, conforme a la relación del hecho tercero.`, '', '**OTROSÍ DIGO** que interesa a esta parte que, concedida la exoneración, se libren los oficios necesarios para que los acreedores afectados y los sistemas de información crediticia actualicen la información relativa a los créditos exonerados.', '**SUPLICO AL TRIBUNAL** que así lo acuerde.', firma(ctx));
  }
  function exoneracionSinMasa(ctx) {
    const h = ctx.exp.hitos;
    const finAcreedores = h.edictoBOE ? calcularPlazo(h.edictoBOE, 15, 'publicacion', 'art. 37 ter.1 TRLC', { festivosExtra: ctx.festivos }).vence : undefined;
    return cuerpoExoneracion(ctx, `Que, publicado en el Boletín Oficial del Estado el ${fechaLarga(h.edictoBOE, 'fecha de publicación del edicto')} el edicto del auto que declaró el concurso sin masa de ${representado(ctx)}, y transcurrido el plazo de quince días del artículo 37 ter.1 TRLC sin que ningún acreedor legitimado haya solicitado el nombramiento de administrador concursal, dentro del plazo de diez días del artículo 501.1 TRLC formulo **SOLICITUD DE EXONERACIÓN DEL PASIVO INSATISFECHO**, con base en los siguientes`, [
      `## PRIMERO.- Por auto de ${fechaLarga(h.autoDeclaracion, 'fecha del auto')} se declaró el concurso sin masa de ${representado(ctx)}.`,
      `El edicto se publicó en el Boletín Oficial del Estado el ${fechaLarga(h.edictoBOE, 'fecha del edicto')}, con el llamamiento a los acreedores previsto en el artículo 37 ter.1 TRLC.`,
      `## SEGUNDO.- Ningún acreedor ha solicitado el nombramiento de administrador concursal.`,
      `El plazo de quince días para hacerlo venció el ${fechaLarga(finAcreedores, 'fin del plazo de los acreedores')} sin que ningún acreedor legitimado lo haya solicitado (art. 37 ter.2 TRLC).`,
    ], '## I.- La solicitud se presenta en tiempo y forma (arts. 37 ter.2 y 501.1 TRLC).\nEl deudor persona natural en concurso sin masa puede solicitar la exoneración dentro de los diez días siguientes al vencimiento del plazo de los acreedores para pedir el nombramiento de administrador concursal sin que lo hayan hecho (art. 501.1 TRLC). La presente solicitud se formula dentro de ese plazo.');
  }
  function exoneracionLiquidacion(ctx) {
    const h = ctx.exp.hitos;
    return cuerpoExoneracion(ctx, `Que, dentro del plazo de audiencia concedido por la resolución recibida el ${fechaLarga(h.trasladoConclusion, 'fecha de recepción del traslado')} para formular oposición a la solicitud de conclusión del concurso, y al amparo del artículo 501.2 TRLC, formulo **SOLICITUD DE EXONERACIÓN DEL PASIVO INSATISFECHO**, con base en los siguientes`, [
      `## PRIMERO.- Concluidas las operaciones de liquidación, la masa activa no alcanza para satisfacer a los acreedores.`,
      `Por auto de ${fechaLarga(h.liquidacion, 'fecha del auto de apertura de la liquidación')} se abrió la fase de liquidación. Realizados los bienes de ${representado(ctx)}, ${hueco('resumir el resultado de la liquidación y los pagos efectuados')}.`,
      `## SEGUNDO.- Se ha dado traslado de la solicitud de conclusión del concurso.`,
      `Por resolución recibida el ${fechaLarga(h.trasladoConclusion, 'fecha de recepción')} se concedió a las partes un plazo de audiencia de ${h.diasAudienciaConclusion ?? hueco('n.º de días')} días para oponerse a la conclusión.`,
    ], '## I.- La solicitud se presenta en tiempo y forma (art. 501.2 TRLC).\nTras la liquidación de la masa activa, la solicitud de exoneración debe presentarse dentro del plazo de audiencia concedido a las partes para formular oposición a la solicitud de conclusión del concurso (art. 501.2 TRLC), plazo en el que se formula este escrito.');
  }
  // ---------------------------------------------------------------------------
  // 8. Contestación a la oposición (incidente concursal)
  // ---------------------------------------------------------------------------
  function contestacionOposicion(ctx) {
    const h = ctx.exp.hitos;
    const acreedor = dato(h.oposicionAcreedor, 'acreedor que se opone');
    return lineas(encabezado(ctx), `**Incidente concursal de oposición a la exoneración del pasivo insatisfecho**`, '', comparecencia(ctx, 'cuya representación consta acreditada en autos'), '', `Que, ${g(ctx, 'emplazado', 'emplazada')} ${representado(ctx)} mediante resolución recibida el ${fechaLarga(h.oposicionRecepcion, 'fecha de recepción')} en el incidente concursal promovido por ${acreedor} en oposición a la solicitud de exoneración del pasivo insatisfecho, dentro del plazo de diez días del artículo 536.3 TRLC formulo **CONTESTACIÓN A LA DEMANDA INCIDENTAL**, interesando su íntegra desestimación, con base en los siguientes`, '# HECHOS', `## PRIMERO.- Sobre los hechos de la demanda incidental.`, `${hueco('Resumir la causa de oposición invocada por el acreedor y negar expresamente los hechos que no se reconozcan')}`, `## SEGUNDO.- Origen del endeudamiento de ${representado(ctx)}.`, dato(ctx.exp.causas, 'Causas del endeudamiento'), '# FUNDAMENTOS DE DERECHO', `## I.- La oposición solo puede fundarse en la falta de los presupuestos o requisitos legales de la exoneración (art. 502 TRLC), que concurren en este caso.`, `El artículo 502 TRLC limita los motivos de oposición a la ausencia de alguno de los presupuestos o requisitos legales. ${acreedor.charAt(0).toUpperCase()}${acreedor.slice(1)} no acredita ninguno: ${hueco('subsumir: por qué la causa alegada no encaja en los arts. 487 a 489 TRLC')}.`, `${hueco('BLOQUES OPCIONALES: conservar los que respondan a la oposición y suprimir los demás')}`, `## II.- La sanción tributaria invocada no impide la exoneración (art. 487.1.2.º TRLC). ${hueco('Suprimir si no procede')}`, `El artículo 487.1.2.º TRLC solo excluye la exoneración por sanciones administrativas firmes muy graves impuestas en los diez años anteriores, salvo que se hayan pagado íntegramente antes de la solicitud; y, en el caso de las graves, únicamente cuando su importe supere el cincuenta por ciento de la cuantía exonerable del crédito público. ${hueco('En el caso que nos ocupa: calificación de la sanción, fecha de firmeza, importe y, en su caso, pago')}.`, `## III.- La derivación de responsabilidad no es, por sí sola, causa de exclusión. ${hueco('Suprimir si no procede')}`, `La STS 264/2026, de 18 de febrero (rec. 3528/2024, ECLI:ES:TS:2026:440), examinó por primera vez la causa de exclusión del artículo 487.1.2.º TRLC relativa a los acuerdos firmes de derivación de responsabilidad, que hasta entonces las Audiencias aplicaban de forma automática.`, `> La derivación de responsabilidad *"solo operará como un obstáculo a la exoneración del pasivo insatisfecho"* cuando traiga causa de una conducta fraudulenta del administrador (${STS_CREDITO_PUBLICO}). ${hueco('Cotejar la literalidad con CENDOJ')}`, 'El Tribunal Supremo razona que el acuerdo de derivación es un mecanismo de garantía del cobro y no una sanción, de modo que no puede equipararse sin más a las infracciones muy graves que sí excluyen la exoneración. Solo cuando la derivación responde a una conducta fraudulenta equiparable a una infracción muy grave puede justificar la denegación, en línea con la Directiva (UE) 2019/1023.', `En el caso que nos ocupa, ${hueco('origen de la derivación, conducta de mi representado/a como administrador/a y ausencia de fraude, con referencia a los documentos')}.`, `## IV.- El endeudamiento no fue temerario ni negligente (art. 487.1.6.º TRLC). ${hueco('Suprimir si no procede')}`, 'Para apreciar esta causa, el juez debe valorar la información patrimonial suministrada por el deudor al acreedor antes de la concesión del préstamo, el nivel social y profesional del deudor, las circunstancias personales del sobreendeudamiento y, en el caso de empresarios, si utilizó las herramientas de alerta temprana puestas a su disposición por las administraciones públicas (art. 487.1.6.º TRLC).', `En el caso que nos ocupa, ${hueco('información facilitada a cada prestamista, evaluación de solvencia realizada por la entidad, causa sobrevenida del sobreendeudamiento')}.`, hayPublicos(ctx) ? doctrinaCreditoPublico(ctx, 'V') : null, `## ${hayPublicos(ctx) ? 'VI' : 'V'}.- Costas.`, `Procede imponer las costas del incidente a la parte demandante incidental, conforme al artículo 542 TRLC en relación con el artículo 394 de la Ley de Enjuiciamiento Civil.`, '', 'Por lo expuesto,', `**SUPLICO AL TRIBUNAL** que tenga por contestada en tiempo y forma la demanda incidental y, previos los trámites legales, dicte sentencia que la desestime íntegramente, conceda a ${nombreCompleto(ctx)} la exoneración del pasivo insatisfecho en los términos solicitados e imponga las costas a la parte demandante incidental.`, '', `**OTROSÍ DIGO** que, conforme al artículo 539 TRLC, propongo los siguientes medios de prueba: documental, consistente en los documentos obrantes en autos y los que se acompañan a este escrito; ${hueco('interrogatorio, testifical o pericial, si procede')}. ${hueco('Indicar si se solicita la celebración de vista')}`, '**SUPLICO AL TRIBUNAL** que tenga por propuesta la prueba y acuerde su práctica.', firma(ctx));
  }
  // ---------------------------------------------------------------------------
  // 9. Cumplimiento de requerimiento
  // ---------------------------------------------------------------------------
  function requerimiento(ctx) {
    const h = ctx.exp.hitos;
    return lineas(encabezado(ctx), comparecencia(ctx, 'cuya representación consta acreditada en autos'), '', `Que por resolución recibida el ${fechaLarga(h.requerimientoRecepcion, 'fecha de recepción')} se requirió a esta parte para que, en el plazo de ${h.requerimientoDias ?? hueco('n.º')} días, ${dato(h.requerimientoTexto, 'contenido del requerimiento')}. Dentro de plazo, por medio del presente escrito **DOY CUMPLIMIENTO AL REQUERIMIENTO** en los siguientes términos:`, `## ÚNICO.- ${hueco('Subsanación o aclaración')}.`, `${hueco('Detallar la subsanación y relacionar los documentos que se aportan')}`, `- Documento n.º 1: ${hueco('documento')}.`, '', 'Por lo expuesto,', '**SUPLICO AL TRIBUNAL** que tenga por cumplimentado en tiempo y forma el requerimiento, por aportados los documentos que se acompañan y acuerde la continuación del procedimiento por sus trámites.', firma(ctx));
  }
  // ---------------------------------------------------------------------------
  // 10. Suspensión de ejecución (uno por cada procedimiento)
  // ---------------------------------------------------------------------------
  function suspensionEjecucion(ctx, acreedorId) {
    const a = ctx.acreedores.find((x) => x.id === acreedorId);
    const proc = a?.procedimiento;
    const h = ctx.exp.hitos;
    const embargoIngresos = proc ? /n[óo]mina|salario|pensi[óo]n|sueldo|retenci/i.test(proc.estado) : false;
    return lineas(`## AL ${proc ? proc.organo.toUpperCase() : hueco('ÓRGANO DE LA EJECUCIÓN')}`, `**${proc?.autos ?? hueco('Procedimiento de ejecución n.º …/…')}**`, '', comparecencia(ctx, 'según acredito con la copia del poder que acompaño'), '', `Que ${representado(ctx)} es parte ejecutada en el presente procedimiento, seguido a instancia de ${a?.nombre ?? hueco('ejecutante')}, y por medio del presente escrito **COMUNICO LA DECLARACIÓN DE CONCURSO E INTERESO LA SUSPENSIÓN DE LA EJECUCIÓN**, con base en las siguientes`, '# ALEGACIONES', `## PRIMERA.- ${Representado(ctx)} ha sido ${g(ctx, 'declarado', 'declarada')} en concurso de acreedores.`, `Por auto de ${fechaLarga(h.autoDeclaracion, 'fecha del auto de declaración')}, dictado por el Tribunal de Instancia de ${sedeNombre(ctx)}, Sección de lo Mercantil, Plaza n.º ${dato(ctx.exp.plaza, 'n.º')}, en el ${dato(ctx.exp.autos, 'n.º de autos del concurso')}, se declaró el concurso de acreedores de ${representado(ctx)} (documento n.º 1).`, `## SEGUNDA.- Desde la declaración de concurso, la presente ejecución queda en suspenso (art. 143.1 TRLC).`, 'Conforme al artículo 143.1 TRLC, desde la fecha de declaración del concurso quedan en suspenso las actuaciones y los procedimientos de ejecución contra los bienes y derechos de la masa activa, y son nulas las actuaciones que se practiquen desde esa fecha.', '', 'Por lo expuesto,', `**SUPLICO** que tenga por comunicada la declaración de concurso de ${nombreCompleto(ctx)} y acuerde la suspensión de la presente ejecución${embargoIngresos ? `, ordenando el cese inmediato de las retenciones sobre los ingresos de ${representado(ctx)}` : ''}, dejando sin efecto las actuaciones practicadas desde la fecha de declaración del concurso y acordando que las cantidades retenidas con posterioridad a esa fecha ${hueco(`se reintegren a ${representado(ctx)} / se pongan a disposición del juez del concurso`)}.`, firma(ctx));
  }
  // ---------------------------------------------------------------------------
  // 11. Exoneración definitiva tras el plan de pagos
  // ---------------------------------------------------------------------------
  function exoneracionDefinitiva(ctx) {
    const h = ctx.exp.hitos;
    const p = calcularPlan(ctx);
    return lineas(encabezado(ctx), comparecencia(ctx, 'cuya representación consta acreditada en autos'), '', `Que, transcurrido el plazo del plan de pagos aprobado en este procedimiento sin que se haya revocado la exoneración provisional concedida a ${representado(ctx)}, por medio del presente escrito **INTERESO QUE SE DICTE AUTO DE EXONERACIÓN DEFINITIVA** (art. 500.1 TRLC), con base en las siguientes`, '# ALEGACIONES', `## PRIMERA.- Por auto de ${fechaLarga(h.planAprobado, 'fecha del auto de aprobación del plan')} se aprobó el plan de pagos y se concedió la exoneración provisional del pasivo insatisfecho.`, `El plan tenía una duración de ${p.anios} años, computados desde su aprobación judicial (art. 497.3 TRLC).`, `## SEGUNDA.- ${Representado(ctx)} ha cumplido el plan de pagos.`, `Ha abonado a sus acreedores un total de ${hueco('importe total abonado')}, conforme al calendario aprobado, según acreditan los justificantes que se acompañan como documento n.º 1, y ha respetado las limitaciones impuestas a sus facultades de disposición y administración.`, `## TERCERA.- Incumplimiento parcial por causas no imputables (art. 500.2 TRLC). ${hueco('Suprimir si el plan se cumplió íntegramente')}`, `El incumplimiento parcial obedeció a ${hueco('accidente, enfermedad u otros acontecimientos graves e imprevisibles')}, que afectaron a ${representado(ctx)} o a las personas que conviven con ${g(ctx, 'él', 'ella')}, sin que haya dejado de respetar las limitaciones del plan ni las medidas de cesión en pago. Procede, por ello, conceder la exoneración definitiva previa audiencia de los acreedores (art. 500.2 TRLC).`, '', 'Por lo expuesto,', `**SUPLICO AL TRIBUNAL** que dicte auto por el que conceda a ${nombreCompleto(ctx)} la exoneración definitiva del pasivo insatisfecho y ordene su publicación en el Registro público concursal (art. 500.3 TRLC).`, firma(ctx));
  }

  /* ------------------------------------------------------------------ */
  /* Catálogo                                                           */
  /* ------------------------------------------------------------------ */

  // Qué escritos tocan en cada expediente, cuándo y con qué plazo.

  const GRUPOS = {
    solicitud: 'Solicitud de concurso',
    tramite: 'Trámites del procedimiento',
    exoneracion: 'Exoneración',
    ejecuciones: 'Ejecuciones en curso',
  };
  const opc = (c) => ({ festivosExtra: c.festivos });
  const viaSinMasa = (c) => c.exp.hitos.sinMasa ?? c.via === 'sin_masa';
  const CATALOGO = [
    {
      tipo: 'solicitud_concurso',
      nombre: 'Solicitud de declaración de concurso voluntario',
      corto: 'Solicitud de concurso',
      base: 'Arts. 2, 3, 6, 7, 44, 45 y 510 TRLC',
      grupo: 'solicitud',
      orden: 1,
      aplica: (c) => c.via !== 'microempresa',
      disponible: () => true,
      generar: solicitudConcurso,
      notas: (c) => [
        'Compruebe que el domicilio del empadronamiento coincide con el centro de intereses principales (art. 45 TRLC). Un cambio de domicilio reciente puede plantear dudas de competencia.',
        'La relación de acreedores debe incluir todos los créditos públicos (Agencia Tributaria, Seguridad Social, ayuntamientos, comunidad autónoma): la STS 264/2026 exige identificar los créditos exonerados.',
        'Para la exoneración harán falta las declaraciones del IRPF de los tres últimos ejercicios (arts. 495 y 501.3 TRLC). Pídalas ya.',
        ...(c.via === 'sin_masa' && c.bienes.some((b) => b.tipo === 'vehiculo') ? ['Hay un vehículo: justifique su valor (tablas de Hacienda o tasación) para sostener la insuficiencia de masa. Un acreedor del 5 % del pasivo puede pedir administrador concursal si aprecia bienes realizables.'] : []),
        ...(c.lead.respuestas.tipos.includes('microcreditos') ? ['Hay microcréditos: prepare la explicación de su origen y fechas para descartar el endeudamiento temerario o negligente (art. 487.1.6.º TRLC).'] : []),
        'Deber de solicitar el concurso en los dos meses siguientes a conocer la insolvencia actual (art. 5 TRLC): si se ha superado, valore su incidencia en la calificación.',
      ],
    },
    {
      tipo: 'memoria',
      nombre: 'Memoria de la historia jurídica y económica (documento n.º 2)',
      corto: 'Memoria',
      base: 'Art. 7, ordinal 1.º, TRLC',
      grupo: 'solicitud',
      orden: 2,
      aplica: () => true,
      disponible: () => true,
      generar: memoria,
      notas: (c) => [
        'Si el deudor está casado, la memoria debe identificar al cónyuge, la fecha del matrimonio, el régimen económico y, en su caso, la fecha de las capitulaciones.',
        ...(c.exp.regimen === 'gananciales' ? ['Régimen de gananciales: valore la incidencia sobre los bienes comunes y si procede la solicitud conjunta con el cónyuge.'] : []),
      ],
    },
    {
      tipo: 'inventario',
      nombre: 'Inventario de bienes y derechos (documento n.º 3)',
      corto: 'Inventario',
      base: 'Art. 7, ordinal 2.º, TRLC',
      grupo: 'solicitud',
      orden: 3,
      aplica: () => true,
      disponible: () => true,
      generar: inventario,
      notas: () => ['Indique el criterio de valoración de cada bien. Para vehículos, las tablas de precios medios de Hacienda son un criterio objetivo.', 'Incluya todas las cuentas bancarias que figuren en los extractos aportados.'],
    },
    {
      tipo: 'relacion_acreedores',
      nombre: 'Relación de acreedores (documento n.º 4)',
      corto: 'Relación de acreedores',
      base: 'Art. 7, ordinal 3.º, TRLC',
      grupo: 'solicitud',
      orden: 4,
      aplica: () => true,
      disponible: (c) => (c.acreedores.length ? true : 'Añada los acreedores en la pestaña «Acreedores y bienes»'),
      generar: relacionAcreedores,
      notas: (c) => [
        'Contraste la relación con la CIRBE, los certificados de deuda pública y los ficheros de solvencia. Un crédito olvidado puede quedar fuera de la exoneración.',
        ...(c.acreedores.some((a) => !a.domicilio) ? ['Faltan domicilios de algún acreedor: son obligatorios (art. 7 TRLC).'] : []),
      ],
    },
    {
      tipo: 'plan_pagos',
      nombre: 'Solicitud de exoneración con plan de pagos',
      corto: 'Plan de pagos',
      base: 'Arts. 495 a 498 TRLC',
      grupo: 'exoneracion',
      orden: 10,
      aplica: (c) => c.via === 'plan_pagos',
      disponible: (c) => (c.exp.hitos.liquidacion ? 'Ya se ha acordado la liquidación: la ley no permite pedir el plan de pagos después (art. 495 TRLC)' : true),
      generar: planPagos,
      notas: (c) => {
        const p = calcularPlan(c);
        return [
          `Capacidad de pago: ingresos menos gastos necesarios (${p.capacidad ?? '¿?'} € al mes). Si los gastos no son realistas, el plan puede no ser «objetivamente cumplible» y el juez lo denegará o modificará (art. 498.2 TRLC).`,
          ...(p.cubreTodo ? ['Con esa capacidad el plan paga el 100 % de lo incluido en él: valore reducir la duración o si compensa la exoneración frente a un acuerdo con los acreedores.'] : []),
          'Los acreedores personados tienen diez días para alegar y pueden pedir limitaciones a los actos de disposición durante el plan (art. 498.1 TRLC).',
          'Si los pagos dependen sobre todo de la evolución de la renta, el plan es de cinco años (art. 497.2 TRLC).',
        ];
      },
    },
    {
      tipo: 'suspension_ejecucion',
      nombre: 'Comunicación del concurso y solicitud de suspensión de la ejecución',
      corto: 'Suspensión de ejecución',
      base: 'Art. 143 TRLC',
      grupo: 'ejecuciones',
      orden: 20,
      aplica: (c) => c.acreedores.some((a) => a.procedimiento) && c.lead.fase !== 'exonerado',
      disponible: (c) => (c.exp.hitos.autoDeclaracion ? true : 'Disponible cuando se dicte el auto de declaración de concurso'),
      repetir: (c) => c.acreedores.filter((a) => a.procedimiento).map((a) => ({ refId: a.id, etiqueta: `${a.nombre} · ${a.procedimiento.autos}` })),
      generar: suspensionEjecucion,
      notas: (c) => [
        'Embargos administrativos (Agencia Tributaria, Seguridad Social, ayuntamientos): tienen un régimen propio y el art. 143.2 TRLC excluye su levantamiento. Revíselo antes de presentar.',
        ...(viaSinMasa(c) ? ['Concurso sin masa: el auto se dicta «sin más pronunciamientos» (art. 37 ter TRLC). Valore si procede pedir la suspensión o esperar a la exoneración.'] : []),
        'Adjunte copia del auto de declaración de concurso como documento n.º 1.',
      ],
    },
    {
      tipo: 'requerimiento',
      nombre: 'Cumplimiento de requerimiento',
      corto: 'Requerimiento',
      base: 'Requerimiento del Tribunal',
      grupo: 'tramite',
      orden: 15,
      aplica: (c) => !!c.exp.hitos.requerimientoRecepcion,
      disponible: () => true,
      plazo: (c) => {
        const h = c.exp.hitos;
        if (!h.requerimientoRecepcion || !h.requerimientoDias)
          return null;
        return calcularPlazo(h.requerimientoRecepcion, h.requerimientoDias, 'lexnet', 'Plazo fijado en el requerimiento', opc(c));
      },
      generar: requerimiento,
      notas: () => ['El plazo de subsanación suele ser único e improrrogable: si falta un documento de un tercero, aporte el justificante de haberlo solicitado.'],
    },
    {
      tipo: 'exoneracion_sin_masa',
      nombre: 'Solicitud de exoneración del pasivo insatisfecho (concurso sin masa)',
      corto: 'Exoneración (sin masa)',
      base: 'Arts. 37 ter y 501.1 TRLC',
      grupo: 'exoneracion',
      orden: 11,
      aplica: (c) => viaSinMasa(c) && c.via !== 'plan_pagos',
      disponible: (c) => (c.exp.hitos.edictoBOE ? true : 'Indique la fecha de publicación del edicto en el BOE'),
      plazo: (c) => {
        const h = c.exp.hitos;
        if (!h.edictoBOE)
          return null;
        const acreedores = calcularPlazo(h.edictoBOE, 15, 'publicacion', 'Art. 37 ter.1 TRLC', opc(c));
        return calcularPlazo(acreedores.vence, 10, 'fecha', 'Art. 501.1 TRLC (tras los 15 días del art. 37 ter.1)', opc(c));
      },
      generar: exoneracionSinMasa,
      notas: (c) => [
        'Solo se puede presentar cuando haya vencido el plazo de quince días de los acreedores sin que nadie haya pedido administrador concursal. Compruebe el Registro público concursal y el expediente antes de presentar.',
        'Acompañe las declaraciones del IRPF de los tres años anteriores (art. 501.3 TRLC).',
        ...(c.calculo.publicos.length ? ['La AEAT y la TGSS suelen personarse: revise que el desglose de principal y recargos coincide con sus certificados.'] : []),
      ],
    },
    {
      tipo: 'exoneracion_liquidacion',
      nombre: 'Solicitud de exoneración tras la liquidación',
      corto: 'Exoneración (liquidación)',
      base: 'Art. 501.2 TRLC',
      grupo: 'exoneracion',
      orden: 12,
      aplica: (c) => c.via === 'liquidacion' || (!!c.exp.hitos.liquidacion && c.via !== 'plan_pagos'),
      disponible: (c) => (c.exp.hitos.trasladoConclusion ? true : 'Disponible cuando se dé traslado de la solicitud de conclusión del concurso'),
      plazo: (c) => {
        const h = c.exp.hitos;
        if (!h.trasladoConclusion || !h.diasAudienciaConclusion)
          return null;
        return calcularPlazo(h.trasladoConclusion, h.diasAudienciaConclusion, 'lexnet', 'Art. 501.2 TRLC (plazo de audiencia de la conclusión)', opc(c));
      },
      generar: exoneracionLiquidacion,
      notas: (c) => [
        ...(c.exp.hitos.trasladoConclusion && !c.exp.hitos.diasAudienciaConclusion ? ['Indique en el expediente los días de audiencia que concede la resolución para poder calcular el plazo.'] : []),
        'Acompañe las declaraciones del IRPF de los tres años anteriores (art. 501.3 TRLC).',
      ],
    },
    {
      tipo: 'contestacion_oposicion',
      nombre: 'Contestación a la oposición a la exoneración (incidente concursal)',
      corto: 'Contestación a la oposición',
      base: 'Arts. 502 y 536.3 TRLC',
      grupo: 'exoneracion',
      orden: 13,
      aplica: (c) => !!c.exp.hitos.oposicionRecepcion,
      disponible: () => true,
      plazo: (c) => (c.exp.hitos.oposicionRecepcion ? calcularPlazo(c.exp.hitos.oposicionRecepcion, 10, 'lexnet', 'Art. 536.3 TRLC', opc(c)) : null),
      generar: contestacionOposicion,
      notas: () => [
        'La oposición solo puede basarse en la falta de presupuestos o requisitos legales (art. 502 TRLC): delimite el debate a la causa concreta alegada.',
        'Coteje con CENDOJ las citas literales de la STS 264/2026 antes de presentar.',
        'Previsible: el acreedor alegará endeudamiento temerario si hubo créditos concedidos en los meses previos. Prepare la prueba de la causa sobrevenida (despido, enfermedad, divorcio…) y de la evaluación de solvencia que hizo la entidad.',
        'Proposición de prueba en la propia contestación (art. 539 TRLC).',
      ],
    },
    {
      tipo: 'exoneracion_definitiva',
      nombre: 'Solicitud de exoneración definitiva tras el plan de pagos',
      corto: 'Exoneración definitiva',
      base: 'Art. 500 TRLC',
      grupo: 'exoneracion',
      orden: 14,
      aplica: (c) => c.via === 'plan_pagos' && !!c.exp.hitos.planAprobado,
      disponible: (c) => {
        const h = c.exp.hitos;
        if (!h.planAprobado)
          return 'Disponible cuando se apruebe el plan de pagos';
        const fin = deFecha(h.planAprobado);
        fin.setUTCMonth(fin.getUTCMonth() + calcularPlan(c).meses);
        return aFecha(fin) <= c.hoy ? true : `El plan termina el ${aFecha(fin).split('-').reverse().join('/')}`;
      },
      generar: exoneracionDefinitiva,
      notas: () => ['Reúna los justificantes de todos los pagos del plan. Si hubo incumplimiento parcial, documente la causa (art. 500.2 TRLC).'],
    },
  ];
  const definicion = (tipo) => CATALOGO.find((d) => d.tipo === tipo);
  const esCliente = (l) => FASES_CLIENTE.includes(l.fase);
  /** Clave con la que se guarda cada escrito del expediente. */
  const claveEscrito = (tipo, refId) => (refId ? tipo + '|' + refId : tipo);

  /**
   * Escritos que tocan en el expediente, con su estado, si se pueden redactar ya
   * y el plazo para presentarlos. e.escritos guarda los datos de cada borrador
   * (sin el texto, que va aparte).
   */
  function escritosDelExpediente(e, ahora) {
    if (!esCliente(e))
      return [];
    const ctx = crearContexto(e, ahora);
    const propios = e.escritos || {};
    const out = [];
    for (const def of CATALOGO) {
      if (!def.aplica(ctx))
        continue;
      const instancias = def.repetir ? def.repetir(ctx) : [{ refId: undefined, etiqueta: undefined }];
      for (const inst of instancias) {
        const plazo = def.plazo?.(ctx) ?? null;
        let abreEl;
        if (def.tipo === 'exoneracion_sin_masa' && plazo)
          abreEl = plazo.inicio;
        out.push({
          def,
          refId: inst.refId,
          etiqueta: inst.etiqueta,
          escrito: propios[claveEscrito(def.tipo, inst.refId)],
          clave: claveEscrito(def.tipo, inst.refId),
          disponible: def.disponible(ctx),
          plazo,
          restantes: plazo ? habilesRestantes(ctx.hoy, plazo.vence, opc(ctx)) : undefined,
          abreEl,
        });
      }
    }
    return out.sort((a, b) => a.def.orden - b.def.orden);
  }
  function generarEscrito(tipo, e, ahora, refId) {
    const def = definicion(tipo);
    if (!def)
      throw new Error('Tipo de escrito desconocido');
    const ctx = crearContexto(e, ahora);
    const inst = def.repetir?.(ctx).find((x) => x.refId === refId);
    return {
      titulo: inst ? `${def.corto} · ${inst.etiqueta}` : def.nombre,
      contenido: def.generar(ctx, refId),
      notas: def.notas(ctx),
    };
  }
  function notasEscrito(tipo, e, ahora) {
    const def = definicion(tipo);
    return def ? def.notas(crearContexto(e, ahora)) : [];
  }
  /** El plazo está «abierto» y pendiente: no presentado y con vencimiento. */
  function plazoPendiente(n) {
    return !!n.plazo && n.escrito?.estado !== 'presentado';
  }

  /* ------------------------------------------------------------------ */
  /* Avisos de plazo y sede                                             */
  /* ------------------------------------------------------------------ */

  // Tareas automáticas ligadas a los escritos: avisos de plazo y encargos de redacción.

  /**
   * Un aviso por cada plazo abierto. El aviso salta dos días hábiles antes del
   * vencimiento, para dejar margen de revisión, y desaparece cuando el escrito
   * se marca como presentado.
   */
  function avisosDePlazo(e, ahora) {
    const op = { festivosExtra: festivosDe(e) };
    const nombre = (e.cliente && e.cliente.nombre) || e.id;
    const out = [];
    for (const n of escritosDelExpediente(e, ahora)) {
      if (!n.plazo || (n.escrito && n.escrito.estado === 'presentado'))
        continue;
      const aviso = restarHabiles(n.plazo.vence, 2, op);
      out.push({
        expediente: e.id,
        cliente: nombre,
        clave: n.clave,
        tipo: n.def.tipo,
        corto: n.def.corto,
        etiqueta: n.etiqueta || '',
        estado: n.escrito ? n.escrito.estado : 'pendiente',
        inicio: n.plazo.inicio,
        vence: n.plazo.vence,
        gracia: n.plazo.gracia,
        aviso: n.plazo.inicio && aviso < n.plazo.inicio ? n.plazo.inicio : aviso,
        restantes: n.restantes,
        base: n.plazo.base,
        titulo: `Presentar «${n.def.corto}» de ${nombre}. Vence el ${fechaCorta(n.plazo.vence)} (día de gracia hasta las 15:00 del ${fechaCorta(n.plazo.gracia)})`,
      });
    }
    return out.sort((a, b) => (a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0));
  }
  const SEDES = {
    'A Coruña': 'A Coruña', Álava: 'Vitoria-Gasteiz', Albacete: 'Albacete', Alicante: 'Alicante', Almería: 'Almería', Asturias: 'Oviedo', Ávila: 'Ávila',
    Badajoz: 'Badajoz', Barcelona: 'Barcelona', Bizkaia: 'Bilbao', Burgos: 'Burgos', Cáceres: 'Cáceres', Cádiz: 'Cádiz', Cantabria: 'Santander',
    Castellón: 'Castellón de la Plana', Ceuta: 'Ceuta', 'Ciudad Real': 'Ciudad Real', Córdoba: 'Córdoba', Cuenca: 'Cuenca', Gipuzkoa: 'Donostia-San Sebastián',
    Girona: 'Girona', Granada: 'Granada', Guadalajara: 'Guadalajara', Huelva: 'Huelva', Huesca: 'Huesca', 'Illes Balears': 'Palma', Jaén: 'Jaén',
    'La Rioja': 'Logroño', 'Las Palmas': 'Las Palmas de Gran Canaria', León: 'León', Lleida: 'Lleida', Lugo: 'Lugo', Madrid: 'Madrid', Málaga: 'Málaga',
    Melilla: 'Melilla', Murcia: 'Murcia', Navarra: 'Pamplona', Ourense: 'Ourense', Palencia: 'Palencia', Pontevedra: 'Pontevedra', Salamanca: 'Salamanca',
    'Santa Cruz de Tenerife': 'Santa Cruz de Tenerife', Segovia: 'Segovia', Sevilla: 'Sevilla', Soria: 'Soria', Tarragona: 'Tarragona', Teruel: 'Teruel',
    Toledo: 'Toledo', Valencia: 'Valencia', Valladolid: 'Valladolid', Zamora: 'Zamora', Zaragoza: 'Zaragoza',
  };
  /** Sede habitual de la Sección de lo Mercantil: la capital de la provincia. */
  const sedePorProvincia = (p) => (p ? SEDES[p] : undefined);
  /** Datos procesales de partida al contratar: sede por la provincia y vía del test. */
  function judicialInicial(e) {
    const j = Object.assign({ hitos: {} }, e.judicial || {});
    if (!j.sede) j.sede = sedePorProvincia(e.cliente && e.cliente.provincia);
    if (!j.via) j.via = (e.resultado && e.resultado.via) || undefined;
    return j;
  }

  raiz.EscritosLSO = {
    // formato
    analizar, enLinea, pendientes, textoPlano,
    // contexto y cifras
    crearContexto, calcularPlan, hoyMadrid, fechaCorta, fechaLarga, festivosDe,
    // catálogo
    GRUPOS, CATALOGO, definicion, esCliente, claveEscrito, escritosDelExpediente,
    generarEscrito, notasEscrito, plazoPendiente,
    // plazos y sede
    avisosDePlazo, SEDES, sedePorProvincia, judicialInicial,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
