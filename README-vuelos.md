# Módulo de reclamaciones aéreas

Reglamento (CE) 261/2004. Captación por la web, tramitación desde el panel.

```
Cliente                             Despacho
───────────────────────────────     ─────────────────────────────────────
/reclamacion-vuelos                 /admin/vuelos
  01 tarjeta de embarque              valoración, traza jurídica
  02 datos del vuelo         ──►      prescripción y economía del caso
  03 incidencia                       comprobación del retraso
  04 contacto y consentimiento        escritos: reclamación, AESA,
                                      encargo, demanda y nota interna
```

El cliente solo ve los tres pasos de entrada, sus datos de contacto y una cifra
orientativa. La traza jurídica, la probabilidad, la minuta y los documentos son
internos.

---

## 1. Archivos

| Archivo | Qué hace |
|---|---|
| `reclamacion-vuelos.html` | Página pública. Usa la hoja de estilos del sitio. |
| `assets/js/aeropuertos.js` | 1.224 aeropuertos con IATA, ICAO, coordenadas y huso. |
| `assets/js/vuelos-motor.js` | Motor de reglas. Único punto de verdad del cálculo. |
| `assets/js/reclamacion-vuelos.js` | Controlador del formulario público. |
| `api/reclamaciones.js` | Recibe el caso, recalcula en servidor, guarda y avisa. |
| `api/expedientes.js` | API del panel: listar, abrir, actualizar, comprobar, documentos, borrar. |
| `api/_almacen.js` | Persistencia sobre Redis por HTTP. |
| `api/_sesion.js` | Verificación del token del panel. |
| `api/_opensky.js` | Comprobación del retraso con fuentes abiertas. |
| `api/_documentos.js` | Generación de los cinco escritos. |
| `admin/vuelos.html` | Panel de expedientes. |

Los archivos de `api/` que empiezan por guion bajo no son rutas: Vercel los
ignora como funciones y solo se importan desde las otras.

---

## 2. Variables de entorno

En Vercel, **Settings → Environment Variables**. Después, **Redeploy**.

### Imprescindibles

| Variable | Valor |
|---|---|
| `KV_REST_API_URL` | URL de la base Redis |
| `KV_REST_API_TOKEN` | Token de esa base |

Se crean en **Storage → Create Database → Upstash for Redis** dentro del propio
Vercel: el plan gratuito sobra para varios miles de expedientes. Si prefiere
Upstash directamente, valen también `UPSTASH_REDIS_REST_URL` y
`UPSTASH_REDIS_REST_TOKEN`.

Ya en uso por el resto del sitio y necesarias aquí: `ADMIN_USUARIOS`,
`ADMIN_SECRETO`, `RESEND_API_KEY`, `CORREO_DESTINO`, `CORREO_ORIGEN`.

### Datos del despacho para los escritos

Se rellenan una vez y salen ya puestos en todos los documentos. También pueden
editarse expediente por expediente desde el panel.

| Variable | Ejemplo |
|---|---|
| `DESPACHO_NOMBRE` | JURMIA Abogados |
| `DESPACHO_LETRADO` | Nombre y apellidos del firmante |
| `DESPACHO_COLEGIO` | Valencia |
| `DESPACHO_COLEGIADO` | 12345 |
| `DESPACHO_DOMICILIO` | calle, número, ciudad |
| `DESPACHO_CIUDAD` | Valencia |
| `DESPACHO_EMAIL` | reclamaciones@jurmiabogados.es |
| `DESPACHO_PARTIDO` | Valencia |
| `DESPACHO_AUDIENCIA` | Valencia |
| `DESPACHO_HONORARIOS` | 25 |

### Opcionales: comprobación de vuelos

| Variable | Para qué |
|---|---|
| `OPENSKY_CLIENT_ID` | Cupo mayor y más histórico en OpenSky |
| `OPENSKY_CLIENT_SECRET` | |

Se obtienen registrándose gratis en opensky-network.org y creando un cliente de
API en el perfil. Sin ellas funciona en modo anónimo, con cupo reducido.

---

## 3. Qué comprueba y qué no la verificación del retraso

Consulta las llegadas reales al aeropuerto de destino en la red ADS-B de
OpenSky Network y busca el indicativo del vuelo. Devuelve la hora del último
contacto con la aeronave, que se produce al terminar el rodaje.

**Es un suelo, no una prueba.** El Tribunal de Justicia declaró en la sentencia
de 4 de septiembre de 2014, Germanwings, C-452/13, que la hora de llegada
relevante es aquella en que se abre al menos una de las puertas del avión, que
es posterior. El dato sirve para triar el expediente, para decidir si merece la
pena litigar y para preparar el interrogatorio; para el juicio hay que pedir el
certificado a la aerolínea o requerir judicialmente los registros.

Puede no encontrar el vuelo si falta cobertura ADS-B, si la compañía usa un
indicativo distinto del número comercial o si la fecha queda fuera del histórico
accesible. En ese caso el panel lo dice y el retraso se introduce a mano.

Para calcular el retraso hace falta rellenar la **hora programada de llegada**
en hora local del aeropuerto de destino. La conversión de husos respeta el
horario de verano.

---

## 4. Protección de datos

- Los expedientes **no** se guardan en el repositorio, a diferencia de los
  artículos del blog. El historial de Git es inmutable y haría imposible
  atender un derecho de supresión. Van a Redis, donde el botón *Borrar
  expediente* del panel borra de verdad.
- Cada envío guarda la fecha, la IP y la versión del texto de privacidad
  aceptado, que es lo que acredita el consentimiento si alguien lo discute.
- Conviene añadir a `privacidad.html` una fila en la tabla de tratamientos:
  finalidad «valoración y tramitación de reclamaciones de transporte aéreo»,
  base jurídica «consentimiento y ejecución de contrato», destinatarios
  «compañía aérea reclamada, AESA y órganos judiciales», conservación «durante
  la tramitación y los plazos de prescripción de la responsabilidad
  profesional».
- El panel está en `/admin/`, ya cubierto por el `Disallow` de `robots.txt` y
  por la cabecera `noindex` de `vercel.json`.

---

## 5. Lo que hay que revisar antes de usar los escritos

Los documentos son borradores de trabajo, no plantillas cerradas. En concreto:

1. **Encabezamiento de la demanda.** Va dirigida al Tribunal de Instancia,
   sección de lo mercantil. Confirme la denominación y la sección competente en
   su partido judicial.
2. **Requisito de procedibilidad.** La reclamación extrajudicial se redacta
   también como intento de negociación previa a los efectos de la Ley Orgánica
   1/2025. Verifique que el modo de envío que use deja constancia fehaciente.
3. **Jurisprudencia.** El desarrollo doctrinal es del Tribunal de Justicia de la
   Unión Europea, que es quien fija la doctrina en esta materia, con la
   estructura de contexto, ratio, desarrollo y subsunción. No se ha incluido
   ninguna cita del Tribunal Supremo ni de Audiencias: hay un marcador expreso
   para que añada la de su Audiencia Provincial, con número, fecha y ECLI.
   Preferimos dejar el hueco antes que arriesgar una cita inexacta en un escrito
   que va a entrar en un juzgado.
4. **Domicilio de la demandada.** Queda como marcador: compruébelo en el
   Registro Mercantil o en la sucursal en España.

---

## 6. Probar en local

```bash
npm install
npm run dev              # sitio en localhost:8000, formulario incluido
```

Las funciones de `/api` solo responden con `vercel dev` (`npm i -g vercel`).

Cadena de ejemplo para probar el lector de tarjeta de embarque:

```
M1PEREZ/ANA           EABC123 MADBCNIB 03401210Y012C0045 100
```

---

## 7. Ideas para más adelante

- **Escáner con la cámara**: hoy se pega la cadena del código de barras. Leer el
  PDF417 desde una foto necesita una librería de reconocimiento; es la mejora
  con más impacto en la conversión.
- **Ajustar las probabilidades**: las de `vuelos-motor.js` son estimaciones de
  partida. Con treinta expedientes cerrados tendrá datos propios por aerolínea,
  que valen mucho más.
- **Acumulación de pasajeros**: cuando varios afectados del mismo vuelo entren
  por separado, el panel podría agruparlos para superar el umbral de los 2.000 €
  del artículo 32.5 de la Ley de Enjuiciamiento Civil.
