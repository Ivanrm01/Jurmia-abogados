/**
 * Redis simulado con la misma API REST que Upstash, solo para las pruebas.
 * Implementa los comandos que usan el panel y el registro de consentimientos.
 *
 *   const r = await arrancarRedis();   // fija KV_REST_API_URL y KV_REST_API_TOKEN
 *   ...
 *   await r.parar();
 */
import http from "node:http";

export function crearRedis() {
  const datos = new Map();      // clave → { tipo, valor, caduca }
  const ahora = () => Date.now();

  const vivo = (k) => {
    const e = datos.get(k);
    if (!e) return null;
    if (e.caduca && e.caduca <= ahora()) { datos.delete(k); return null; }
    return e;
  };
  const de = (k, tipo, crear) => {
    let e = vivo(k);
    if (!e && crear) { e = { tipo, valor: crear(), caduca: 0 }; datos.set(k, e); }
    if (e && e.tipo !== tipo) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    return e;
  };
  const cota = (v, inferior) => {
    const t = String(v);
    if (t === "-inf") return { n: -Infinity, ex: false };
    if (t === "+inf" || t === "inf") return { n: Infinity, ex: false };
    if (t.startsWith("(")) return { n: Number(t.slice(1)), ex: true };
    return { n: Number(t), ex: false, inferior };
  };
  const dentro = (s, min, max) =>
    (min.ex ? s > min.n : s >= min.n) && (max.ex ? s < max.n : s <= max.n);
  const ordenada = (z) => [...z.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const rango = (lista, ini, fin) => {
    const n = lista.length;
    let a = Number(ini), b = Number(fin);
    if (a < 0) a = n + a;
    if (b < 0) b = n + b;
    a = Math.max(0, a); b = Math.min(n - 1, b);
    return a > b ? [] : lista.slice(a, b + 1);
  };

  const C = {
    PING: () => "PONG",
    GET: ([k]) => { const e = de(k, "s"); return e ? e.valor : null; },
    SET: ([k, v, ...op]) => {
      const o = op.map((x) => String(x).toUpperCase());
      const existe = !!vivo(k);
      if (o.includes("NX") && existe) return null;
      if (o.includes("XX") && !existe) return null;
      let caduca = 0;
      const iEX = o.indexOf("EX");
      if (iEX >= 0) caduca = ahora() + Number(op[iEX + 1]) * 1000;
      const iPX = o.indexOf("PX");
      if (iPX >= 0) caduca = ahora() + Number(op[iPX + 1]);
      if (o.includes("KEEPTTL") && existe) caduca = vivo(k).caduca;
      datos.set(k, { tipo: "s", valor: String(v), caduca });
      return "OK";
    },
    DEL: (ks) => ks.reduce((n, k) => n + (vivo(k) && datos.delete(k) ? 1 : 0), 0),
    EXPIRE: ([k, s]) => { const e = vivo(k); if (!e) return 0; e.caduca = ahora() + Number(s) * 1000; return 1; },
    TTL: ([k]) => { const e = vivo(k); if (!e) return -2; return e.caduca ? Math.ceil((e.caduca - ahora()) / 1000) : -1; },
    INCR: ([k]) => { const e = de(k, "s", () => "0"); e.valor = String(Number(e.valor) + 1); return Number(e.valor); },
    MGET: (ks) => ks.map((k) => { const e = vivo(k); return e && e.tipo === "s" ? e.valor : null; }),

    LPUSH: ([k, ...vs]) => { const e = de(k, "l", () => []); for (const v of vs) e.valor.unshift(String(v)); return e.valor.length; },
    LTRIM: ([k, a, b]) => { const e = de(k, "l"); if (e) e.valor = rango(e.valor, a, b); return "OK"; },
    LRANGE: ([k, a, b]) => { const e = de(k, "l"); return e ? rango(e.valor, a, b) : []; },

    ZADD: ([k, ...r]) => {
      const e = de(k, "z", () => new Map());
      let n = 0;
      for (let i = 0; i + 1 < r.length; i += 2) {
        if (!e.valor.has(String(r[i + 1]))) n++;
        e.valor.set(String(r[i + 1]), Number(r[i]));
      }
      return n;
    },
    ZRANGE: ([k, a, b, ...op]) => {
      const e = de(k, "z");
      if (!e) return [];
      let l = ordenada(e.valor).map(([m]) => m);
      if (op.map((x) => String(x).toUpperCase()).includes("REV")) l = l.reverse();
      return rango(l, a, b);
    },
    ZREVRANGEBYSCORE: ([k, max, min, ...op]) => {
      const e = de(k, "z");
      if (!e) return [];
      const mx = cota(max), mn = cota(min);
      let l = ordenada(e.valor).filter(([, s]) => dentro(s, mn, mx)).reverse().map(([m]) => m);
      const i = op.map((x) => String(x).toUpperCase()).indexOf("LIMIT");
      if (i >= 0) l = l.slice(Number(op[i + 1]), Number(op[i + 1]) + Number(op[i + 2]));
      return l;
    },
    ZRANGEBYSCORE: ([k, min, max, ...op]) => {
      const e = de(k, "z");
      if (!e) return [];
      const mx = cota(max), mn = cota(min);
      let l = ordenada(e.valor).filter(([, s]) => dentro(s, mn, mx)).map(([m]) => m);
      const i = op.map((x) => String(x).toUpperCase()).indexOf("LIMIT");
      if (i >= 0) l = l.slice(Number(op[i + 1]), Number(op[i + 1]) + Number(op[i + 2]));
      return l;
    },
    ZREM: ([k, ...ms]) => { const e = de(k, "z"); if (!e) return 0; return ms.reduce((n, m) => n + (e.valor.delete(String(m)) ? 1 : 0), 0); },
    ZCARD: ([k]) => { const e = de(k, "z"); return e ? e.valor.size : 0; },
    ZCOUNT: ([k, min, max]) => {
      const e = de(k, "z");
      if (!e) return 0;
      const mn = cota(min), mx = cota(max);
      return [...e.valor.values()].filter((s) => dentro(s, mn, mx)).length;
    },
    ZREMRANGEBYSCORE: ([k, min, max]) => {
      const e = de(k, "z");
      if (!e) return 0;
      const mn = cota(min), mx = cota(max);
      let n = 0;
      for (const [m, s] of [...e.valor.entries()]) if (dentro(s, mn, mx)) { e.valor.delete(m); n++; }
      return n;
    },

    HSET: ([k, ...r]) => { const e = de(k, "h", () => new Map()); let n = 0; for (let i = 0; i + 1 < r.length; i += 2) { if (!e.valor.has(r[i])) n++; e.valor.set(String(r[i]), String(r[i + 1])); } return n; },
    HSETNX: ([k, f, v]) => { const e = de(k, "h", () => new Map()); if (e.valor.has(f)) return 0; e.valor.set(String(f), String(v)); return 1; },
    HEXISTS: ([k, f]) => { const e = de(k, "h"); return e && e.valor.has(f) ? 1 : 0; },
    HLEN: ([k]) => { const e = de(k, "h"); return e ? e.valor.size : 0; },
    HGET: ([k, f]) => { const e = de(k, "h"); return e && e.valor.has(f) ? e.valor.get(f) : null; },
    HMGET: ([k, ...fs]) => { const e = de(k, "h"); return fs.map((f) => (e && e.valor.has(f) ? e.valor.get(f) : null)); },
    HGETALL: ([k]) => { const e = de(k, "h"); return e ? [...e.valor.entries()].flat() : []; },
    HDEL: ([k, ...fs]) => { const e = de(k, "h"); if (!e) return 0; return fs.reduce((n, f) => n + (e.valor.delete(f) ? 1 : 0), 0); },

    SADD: ([k, ...ms]) => { const e = de(k, "set", () => new Set()); let n = 0; for (const m of ms) { if (!e.valor.has(String(m))) { e.valor.add(String(m)); n++; } } return n; },
    SREM: ([k, ...ms]) => { const e = de(k, "set"); if (!e) return 0; return ms.reduce((n, m) => n + (e.valor.delete(String(m)) ? 1 : 0), 0); },
    SCARD: ([k]) => { const e = de(k, "set"); return e ? e.valor.size : 0; },
    SMEMBERS: ([k]) => { const e = de(k, "set"); return e ? [...e.valor] : []; }
  };

  let comandos = 0;
  function ejecutar(partes) {
    comandos++;
    const nombre = String(partes[0] || "").toUpperCase();
    const f = C[nombre];
    if (!f) throw new Error("ERR unknown command '" + nombre + "'");
    // Vaciar las claves vacías, como Redis
    const r = f(partes.slice(1).map(String));
    for (const [k, e] of datos) {
      if ((e.tipo === "z" || e.tipo === "h" || e.tipo === "set") && e.valor.size === 0) datos.delete(k);
      if (e.tipo === "l" && e.valor.length === 0) datos.delete(k);
    }
    return r;
  }

  return {
    ejecutar,
    datos,
    claves: () => [...datos.keys()].filter((k) => vivo(k)),
    /** Adelanta el reloj de una clave (para probar caducidades sin esperar). */
    envejecer(k, segundos) { const e = vivo(k); if (e && e.caduca) e.caduca -= segundos * 1000; },
    get comandos() { return comandos; }
  };
}

export async function arrancarRedis({ token = "token-de-prueba" } = {}) {
  const redis = crearRedis();
  const servidor = http.createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.headers.authorization !== "Bearer " + token) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: "Unauthorized" }));
      }
      try {
        const r = redis.ejecutar(JSON.parse(cuerpo));
        res.end(JSON.stringify({ result: r }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const url = "http://127.0.0.1:" + servidor.address().port;
  process.env.KV_REST_API_URL = url;
  process.env.KV_REST_API_TOKEN = token;
  return {
    redis,
    url,
    parar: () => new Promise((ok) => { servidor.closeAllConnections?.(); servidor.close(() => ok()); })
  };
}
