var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../workspace/tarot-journey/worker/index.js
var MAX_Q = 120;
var MAX_BODY = 4096;
var DEEPSEEK_TIMEOUT = 2e4;
var OPENAI_TIMEOUT = 25e3;
var TOTAL_BUDGET = 38e3;
var THEME_CN = { career: "\u4E8B\u4E1A", wealth: "\u8D22\u5BCC", love: "\u7231\u60C5", self: "\u81EA\u6211", custom: "\u81EA\u5B9A\u4E49" };
var POS_CN = { past: "\u8FC7\u53BB", present: "\u73B0\u5728", future: "\u672A\u6765" };
var SYSTEM_PROMPT = `\u4F60\u662F\u300C\u5854\u7F57\u663E\u5316\u4E4B\u65C5\u300D\u91CC\u7684\u5854\u7F57\u89E3\u8BFB\u5E08\u3002\u7528\u6237\u5728\u4E00\u5EA7\u85B0\u8863\u8349\u7D2B\u8272\u7684\u661F\u5149\u9AD8\u5854\u4E2D\u62FE\u7EA7\u800C\u4E0A\uFF0C\u6BCF\u767B\u4E00\u5C42\u62BD\u4E00\u5F20\u724C\uFF1A\u8FC7\u53BB\u3001\u73B0\u5728\u3001\u672A\u6765\uFF1B\u767B\u4E0A\u5854\u9876\u65F6\uFF0C\u4F1A\u5F97\u5230\u7B2C 23 \u5F20\u663E\u5316\u724C\uFF08\u7F16\u53F7 XXII\uFF0C\u6BCF\u6B21\u968F\u673A\u4E3A\u521B\u9020\u8005/\u7EC7\u68A6\u8005/\u6301\u5149\u8005/\u542F\u822A\u8005/\u57F9\u80B2\u8005/\u91CD\u751F\u8005\u4E4B\u4E00\uFF0C\u7528\u6237\u6D88\u606F\u4E2D\u4F1A\u544A\u77E5\u672C\u6B21\u662F\u54EA\u4E00\u5F20\uFF09\u3002

\u4F60\u7684\u98CE\u683C\uFF1A\u6E29\u6696\u3001\u8BD7\u610F\u4F46\u52A1\u5B9E\uFF1B\u50CF\u4E00\u4F4D\u6E29\u67D4\u800C\u6E05\u9192\u7684\u670B\u53CB\u3002\u7528\u7B80\u4F53\u4E2D\u6587\uFF0C\u907F\u514D\u5BBF\u547D\u8BBA\u4E0E\u6050\u5413\uFF0C\u4E0D\u505A\u533B\u7597/\u6CD5\u5F8B/\u6295\u8D44\u7B49\u786E\u5B9A\u6027\u627F\u8BFA\uFF0C\u628A\u724C\u610F\u8F6C\u5316\u4E3A\u53EF\u6267\u884C\u7684\u81EA\u6211\u89C9\u5BDF\u548C\u884C\u52A8\u3002\u53EF\u4EE5\u81EA\u7136\u5730\u4F7F\u7528"\u767B\u5854""\u661F\u5149""\u53F0\u9636""\u5854\u9876"\u7B49\u610F\u8C61\uFF0C\u4F46\u4E0D\u8981\u5806\u780C\u3002

\u4E25\u683C\u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u5B57\u6BB5\u5982\u4E0B\uFF1A
{
  "title": "\u4E00\u53E5\u8BDD\u603B\u7ED3\u8FD9\u6B21\u4E09\u5F20\u724C\u7684\u65C5\u7A0B\uFF08\u4E0D\u8D85\u8FC7 24 \u5B57\uFF09",
  "reading": ["\u6BB5\u843D1", "\u6BB5\u843D2", "\u6BB5\u843D3\uFF08\u53EF\u9009\uFF09"],
  "actions": ["\u884C\u52A81", "\u884C\u52A82", "\u884C\u52A83"],
  "creator_message": "\u4EE5\u672C\u6B21\u7B2C 23 \u5F20\u663E\u5316\u724C\u7684\u8EAB\u4EFD\u5BF9\u7528\u6237\u8BF4\u7684 1\u20132 \u53E5\u8BDD\uFF08\u4E0D\u8D85\u8FC7 50 \u5B57\uFF09\uFF0C\u987B\u70B9\u51FA\u8FD9\u5F20\u724C\u7684\u540D\u5B57\u4E0E\u5BD3\u610F"
}
\u8981\u6C42\uFF1Areading \u4E3A 2\u20133 \u6BB5\uFF0C\u6BCF\u6BB5 50\u2013110 \u5B57\uFF0C\u5FC5\u987B\u7ED3\u5408\u7528\u6237\u7684\u95EE\u9898\uFF0C\u628A\u8FC7\u53BB\u3001\u73B0\u5728\u3001\u672A\u6765\u4E09\u5F20\u724C\u4E32\u6210\u4E00\u6761\u7EBF\uFF1Bactions \u6070\u597D 3 \u6761\uFF0C\u6BCF\u6761\u4E0D\u8D85\u8FC7 30 \u5B57\uFF0C\u5177\u4F53\u3001\u53EF\u5728\u4ECA\u5929\u6216\u672C\u5468\u5B8C\u6210\uFF08\u53EF\u7528"\u4ECA\u5929\uFF1A/\u672C\u5468\uFF1A/\u6301\u7EED\uFF1A"\u5F00\u5934\uFF09\uFF1B\u4E0D\u8981\u4F7F\u7528 Markdown \u6216 HTML\u3002`;
var ipHits = /* @__PURE__ */ new Map();
var daily = { date: null, count: 0 };
var upstreamBlock = /* @__PURE__ */ new Map();
var cstDate = /* @__PURE__ */ __name(() => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10), "cstDate");
var num = /* @__PURE__ */ __name((v, d) => Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d, "num");
function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
__name(json, "json");
function memoryLimit(ip, perIp, windowS, cap) {
  const now = Date.now();
  const q = (ipHits.get(ip) || []).filter((t) => now - t <= windowS * 1e3);
  if (q.length >= perIp) {
    ipHits.set(ip, q);
    const wait = Math.ceil((windowS * 1e3 - (now - q[0])) / 1e3) + 1;
    return [429, "rate_limited", `\u8BF7\u6C42\u592A\u9891\u7E41\u4E86\uFF0C\u8BF7\u7EA6 ${Math.max(1, Math.floor(wait / 60))} \u5206\u949F\u540E\u518D\u8BD5`];
  }
  const today = cstDate();
  if (daily.date !== today) {
    daily.date = today;
    daily.count = 0;
  }
  if (daily.count >= cap)
    return [429, "daily_cap", "\u4ECA\u65E5\u7684\u661F\u5149\u89E3\u8BFB\u6B21\u6570\u5DF2\u7528\u5B8C\uFF0C\u660E\u5929\u518D\u6765\u5427"];
  q.push(now);
  ipHits.set(ip, q);
  daily.count += 1;
  if (ipHits.size > 5e3)
    for (const k of ipHits.keys()) {
      ipHits.delete(k);
      if (ipHits.size < 2500)
        break;
    }
  return null;
}
__name(memoryLimit, "memoryLimit");
async function kvLimit(kv, ip, perIp, windowS, cap) {
  const now = Date.now();
  const ipKey = `ip:${ip}`;
  const dayKey = `daily:${cstDate()}`;
  const [ipRaw, dayRaw] = await Promise.all([kv.get(ipKey), kv.get(dayKey)]);
  let q = [];
  try {
    q = JSON.parse(ipRaw || "[]").filter((t) => now - t <= windowS * 1e3);
  } catch {
    q = [];
  }
  if (q.length >= perIp) {
    const wait = Math.ceil((windowS * 1e3 - (now - q[0])) / 1e3) + 1;
    return [429, "rate_limited", `\u8BF7\u6C42\u592A\u9891\u7E41\u4E86\uFF0C\u8BF7\u7EA6 ${Math.max(1, Math.floor(wait / 60))} \u5206\u949F\u540E\u518D\u8BD5`];
  }
  const count = num(dayRaw, 0);
  if (count >= cap)
    return [429, "daily_cap", "\u4ECA\u65E5\u7684\u661F\u5149\u89E3\u8BFB\u6B21\u6570\u5DF2\u7528\u5B8C\uFF0C\u660E\u5929\u518D\u6765\u5427"];
  q.push(now);
  await Promise.all([
    kv.put(ipKey, JSON.stringify(q), { expirationTtl: Math.max(60, windowS + 60) }),
    kv.put(dayKey, String(count + 1), { expirationTtl: 2 * 86400 })
  ]);
  return null;
}
__name(kvLimit, "kvLimit");
async function checkLimits(env, ip, provs) {
  const now = Date.now();
  if (provs.length && provs.every((p) => (upstreamBlock.get(p.name) || 0) > now)) {
    return [503, "upstream_unavailable", "AI \u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5"];
  }
  const perIp = num(env.RATE_PER_IP, 10);
  const windowS = num(env.RATE_WINDOW, 600);
  const cap = num(env.DAILY_CAP, 300);
  const kv = env.TAROT_KV;
  if (kv && typeof kv.get === "function") {
    try {
      return await kvLimit(kv, ip, perIp, windowS, cap);
    } catch (e) {
    }
  }
  return memoryLimit(ip, perIp, windowS, cap);
}
__name(checkLimits, "checkLimits");
var clean = /* @__PURE__ */ __name((s, n) => String(s ?? "").replace(/[\x00-\x1f\x7f<>]/g, "").trim().slice(0, n), "clean");
function validate(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    return [null, "\u8BF7\u6C42\u683C\u5F0F\u9519\u8BEF"];
  const q = String(data.question ?? "").trim();
  if (q.length < 2)
    return [null, "\u95EE\u9898\u592A\u77ED"];
  if ([...q].length > MAX_Q)
    return [null, `\u95EE\u9898\u4E0D\u80FD\u8D85\u8FC7 ${MAX_Q} \u4E2A\u5B57`];
  let theme = String(data.theme || "custom");
  if (!Object.prototype.hasOwnProperty.call(THEME_CN, theme))
    theme = "custom";
  const cards = data.cards;
  if (!Array.isArray(cards) || cards.length !== 3)
    return [null, "\u9700\u8981\u6070\u597D 3 \u5F20\u724C"];
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (!c || typeof c !== "object")
      return [null, "\u724C\u6570\u636E\u683C\u5F0F\u9519\u8BEF"];
    const pos = String(c.position || ["past", "present", "future"][i]);
    const card = {
      position: POS_CN[pos] || clean(pos, 6),
      name_cn: clean(c.name_cn, 12),
      name_en: clean(c.name_en, 24),
      numeral: clean(c.numeral, 6)
    };
    if (!card.name_cn && !card.name_en)
      return [null, "\u724C\u540D\u7F3A\u5931"];
    out.push(card);
  }
  const m = data.manifest && typeof data.manifest === "object" ? data.manifest : {};
  const manifest = { name_cn: clean(m.name_cn, 8) || "\u521B\u9020\u8005", name_en: clean(m.name_en, 24) || "THE CREATOR" };
  return [{ question: clean(q, MAX_Q), theme, cards: out, manifest }, null];
}
__name(validate, "validate");
var Upstream = class extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
};
__name(Upstream, "Upstream");
function providers(env) {
  const out = [];
  if (env.DEEPSEEK_API_KEY) {
    out.push({
      name: "deepseek",
      base: String(env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
      key: env.DEEPSEEK_API_KEY,
      models: [env.DEEPSEEK_MODEL || "deepseek-chat"],
      timeout: DEEPSEEK_TIMEOUT
    });
  }
  if (env.OPENAI_API_KEY) {
    out.push({
      name: "openai",
      base: String(env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
      key: env.OPENAI_API_KEY,
      models: [.../* @__PURE__ */ new Set([env.OPENAI_MODEL || "gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1-nano"])],
      timeout: OPENAI_TIMEOUT
    });
  }
  return out;
}
__name(providers, "providers");
function normalize(o) {
  const s = /* @__PURE__ */ __name((x, n) => String(x ?? "").replace(/[<>]/g, "").trim().slice(0, n), "s");
  let reading = o && o.reading;
  if (typeof reading === "string")
    reading = reading.split(/\n+/).filter((p) => p.trim());
  reading = (Array.isArray(reading) ? reading : []).filter((p) => String(p).trim()).map((p) => s(p, 300)).slice(0, 3);
  const actions = (Array.isArray(o && o.actions) ? o.actions : []).filter((a) => String(a).trim()).map((a) => s(a, 60)).slice(0, 3);
  if (reading.length < 1 || actions.length < 1)
    throw new Error("missing fields");
  return { title: s(o.title, 40), reading, actions, creator_message: s(o.creator_message, 90) };
}
__name(normalize, "normalize");
var BadOutput = class extends Error {
};
__name(BadOutput, "BadOutput");
async function postChat(prov, model, user, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(prov.base + "/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: "Bearer " + prov.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        temperature: 0.85,
        max_tokens: 900
      })
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({})) || {}).error || {};
      const e = new Error("http");
      e.httpStatus = res.status;
      e.err = err;
      throw e;
    }
    const data = await res.json().catch(() => {
      throw new BadOutput("json");
    });
    try {
      return [normalize(JSON.parse(data.choices[0].message.content)), data.model || model];
    } catch {
      throw new BadOutput("content");
    }
  } finally {
    clearTimeout(timer);
  }
}
__name(postChat, "postChat");
async function callProvider(prov, user, timeoutMs) {
  if ((upstreamBlock.get(prov.name) || 0) > Date.now())
    throw new Upstream(503, "upstream_unavailable");
  let last = null;
  for (const model of prov.models) {
    try {
      return await postChat(prov, model, user, timeoutMs);
    } catch (e) {
      if (e instanceof BadOutput) {
        console.log("upstream bad output", prov.name, model);
        last = new Upstream(502, "bad_output");
        continue;
      }
      if (e.httpStatus) {
        const err = e.err || {};
        const code = String(err.code || err.type || `http_${e.httpStatus}`);
        console.log("upstream error", prov.name, model, e.httpStatus, code);
        if ((e.httpStatus === 404 || e.httpStatus === 400) && String(err.message || "").toLowerCase().includes("model")) {
          last = new Upstream(502, "model_unavailable");
          continue;
        }
        const quota = e.httpStatus === 402 || e.httpStatus === 429 && /quota|credit|billing|balance/.test(`${code} ${err.type || ""}`);
        if (quota || e.httpStatus === 401 || e.httpStatus === 403) {
          upstreamBlock.set(prov.name, Date.now() + 3e5);
          throw new Upstream(503, quota ? "upstream_quota" : "upstream_auth");
        }
        throw new Upstream(502, e.httpStatus === 429 ? "upstream_rate_limited" : "upstream_error");
      }
      console.log("upstream network/timeout", prov.name, model, e && e.name);
      throw new Upstream(504, "timeout");
    }
  }
  throw last || new Upstream(502, "unknown");
}
__name(callProvider, "callProvider");
async function callAi(provs, req) {
  if (!provs.length)
    throw new Upstream(503, "not_configured");
  const cardsTxt = req.cards.map((c) => `- ${c.position}\uFF1A${c.numeral} ${c.name_cn}\uFF08${c.name_en}\uFF09`).join("\n");
  const user = `\u4E3B\u9898\uFF1A${THEME_CN[req.theme]}
\u7528\u6237\u7684\u95EE\u9898\uFF1A\u300C${req.question}\u300D
\u62BD\u5230\u7684\u4E09\u5F20\u724C\uFF1A
${cardsTxt}
\u7B2C 23 \u5F20\u663E\u5316\u724C\uFF1AXXII ${req.manifest.name_cn}\uFF08${req.manifest.name_en}\uFF09
\u8BF7\u6309\u8981\u6C42\u8F93\u51FA JSON\uFF0Ccreator_message \u8981\u56F4\u7ED5\u300C${req.manifest.name_cn}\u300D\u8FD9\u5F20\u724C\u6765\u5199\u3002`;
  const t0 = Date.now();
  let last = null;
  for (const prov of provs) {
    const remaining = TOTAL_BUDGET - (Date.now() - t0);
    if (remaining < 5e3)
      break;
    try {
      const [result, model] = await callProvider(prov, user, Math.min(prov.timeout, remaining));
      return [result, prov.name, model];
    } catch (e) {
      last = e instanceof Upstream ? e : new Upstream(502, "unknown");
    }
  }
  throw last || new Upstream(504, "timeout");
}
__name(callAi, "callAi");
async function handlePost({ request, env }) {
  const len = parseInt(request.headers.get("Content-Length") || "", 10);
  if (Number.isFinite(len) && len > MAX_BODY)
    return json(413, { error: "bad_request", message: "\u8BF7\u6C42\u4F53\u65E0\u6548\u6216\u8FC7\u5927" });
  let text;
  try {
    text = await request.text();
  } catch {
    return json(400, { error: "bad_request", message: "\u8BF7\u6C42\u4F53\u65E0\u6548\u6216\u8FC7\u5927" });
  }
  const bytes = new TextEncoder().encode(text).length;
  if (bytes === 0 || bytes > MAX_BODY) {
    return json(bytes > MAX_BODY ? 413 : 400, { error: "bad_request", message: "\u8BF7\u6C42\u4F53\u65E0\u6548\u6216\u8FC7\u5927" });
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json(400, { error: "bad_json", message: "\u8BF7\u6C42\u683C\u5F0F\u9519\u8BEF" });
  }
  const [req, err] = validate(data);
  if (err)
    return json(400, { error: "invalid", message: err });
  const provs = providers(env);
  const ip = request.headers.get("CF-Connecting-IP") || (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() || "unknown";
  const lim = await checkLimits(env, ip, provs);
  if (lim)
    return json(lim[0], { error: lim[1], message: lim[2] });
  try {
    const [result, provider, model] = await callAi(provs, req);
    return json(200, { ...result, provider, model });
  } catch (e) {
    const status = e instanceof Upstream ? e.status : 502;
    const code = e instanceof Upstream ? e.code : "unknown";
    return json(status, { error: code, message: "\u661F\u5149\u6682\u65F6\u6CA1\u6709\u56DE\u5E94\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" });
  }
}
__name(handlePost, "handlePost");
async function readingRoute(context) {
  if (context.request.method === "POST")
    return handlePost(context);
  return json(405, { error: "method_not_allowed", message: "\u8BF7\u4F7F\u7528 POST" });
}
__name(readingRoute, "readingRoute");
var REPO_RAW = "https://raw.githubusercontent.com/MinibeanAI/tarot-journey";
var MIME = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  mp3: "audio/mpeg",
  txt: "text/plain; charset=utf-8"
};
async function serveStatic(request, env, ctx) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method Not Allowed", { status: 405 });
  const url = new URL(request.url);
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  if (path.endsWith("/"))
    path += "index.html";
  if (path.split("/").slice(1).some((seg) => seg === "" || seg.startsWith(".")))
    return new Response("Not Found", { status: 404 });
  const ext = (path.split(".").pop() || "").toLowerCase();
  const type = MIME[ext];
  if (!type)
    return new Response("Not Found", { status: 404 });
  const ref = env.ASSET_REF || "main";
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/__static/${ref}${path}`, { method: "GET" });
  let res = await cache.match(cacheKey);
  if (!res) {
    const upstream = await fetch(`${REPO_RAW}/${ref}/public${path.split("/").map(encodeURIComponent).join("/")}`, {
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    if (!upstream.ok)
      return new Response("Not Found", { status: upstream.status === 404 ? 404 : 502 });
    const short = ["html", "js", "css"].includes(ext);
    res = new Response(upstream.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": short ? "public, max-age=300" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff"
      }
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return request.method === "HEAD" ? new Response(null, { headers: res.headers }) : res;
}
__name(serveStatic, "serveStatic");
var worker_default = {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/reading")
      return readingRoute({ request, env });
    if (pathname === "/api/health") {
      const providers2 = [];
      if (env.DEEPSEEK_API_KEY)
        providers2.push("deepseek");
      if (env.OPENAI_API_KEY)
        providers2.push("openai");
      return json(200, { ok: true, providers: providers2, kv: !!env.TAROT_KV });
    }
    if (pathname.startsWith("/api/"))
      return json(404, { error: "not_found", message: "\u63A5\u53E3\u4E0D\u5B58\u5728" });
    return serveStatic(request, env, ctx);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=index.js.map
