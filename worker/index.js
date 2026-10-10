/**
 * Cloudflare Worker 版本（部署在 tarot-journey.<子域>.workers.dev）
 * - POST /api/reading：与 functions/api/reading.js 相同的 AI 解读逻辑
 * - GET  /api/health ：查看已配置的服务商
 * - 其他路径：从 GitHub 仓库 public/ 目录读取静态文件（raw.githubusercontent.com），
 *   按扩展名设置 Content-Type，并用 caches.default 缓存 1 小时
 * 绑定：DEEPSEEK_API_KEY / OPENAI_API_KEY（secret），ASSET_REF（可选，提交 SHA 或分支，默认 main）
 * 本文件由 functions/api/reading.js 拼接生成，修改解读逻辑请同步两处。
 */
/**
 * Cloudflare Pages Function: POST /api/reading
 * 移植自 tarot-server/server.py —— DeepSeek 优先，OpenAI 兜底。
 *
 * 环境变量 / Secrets（用 `wrangler pages secret put` 设置，绝不写进代码）：
 *   DEEPSEEK_API_KEY  主力（deepseek-chat，20s 超时）
 *   OPENAI_API_KEY    备用（gpt-4.1-mini → gpt-4o-mini → gpt-4.1-nano，25s 超时）
 * 可选：DEEPSEEK_BASE_URL / DEEPSEEK_MODEL / OPENAI_BASE_URL / OPENAI_MODEL
 *       RATE_PER_IP（默认 10）/ RATE_WINDOW（秒，默认 600）/ DAILY_CAP（默认 300）
 * 可选 KV 绑定 TAROT_KV：用于跨实例的每 IP 限流和每日总量上限；未绑定时退回到
 * 单个 isolate 内的内存限流（尽力而为，不是全局的）。
 */

const MAX_Q = 120;
const MAX_BODY = 4096;
const DEEPSEEK_TIMEOUT = 20000;
const OPENAI_TIMEOUT = 25000;
const TOTAL_BUDGET = 38000; // 整条兜底链的总预算（前端 40s 超时）

const THEME_CN = { career: '事业', wealth: '财富', love: '爱情', self: '自我', custom: '自定义' };
const POS_CN = { past: '过去', present: '现在', future: '未来' };

const SYSTEM_PROMPT = `你是「塔罗显化之旅」里的塔罗解读师。用户在一座薰衣草紫色的星光高塔中拾级而上，每登一层抽一张牌：过去、现在、未来；登上塔顶时，会得到第 23 张显化牌「XXII 创造者 THE CREATOR」——寓意"你不再等待答案，而是开始创造答案"。

你的风格：温暖、诗意但务实；像一位温柔而清醒的朋友。用简体中文，避免宿命论与恐吓，不做医疗/法律/投资等确定性承诺，把牌意转化为可执行的自我觉察和行动。可以自然地使用"登塔""星光""台阶""塔顶"等意象，但不要堆砌。

严格只输出一个 JSON 对象，字段如下：
{
  "title": "一句话总结这次三张牌的旅程（不超过 24 字）",
  "reading": ["段落1", "段落2", "段落3（可选）"],
  "actions": ["行动1", "行动2", "行动3"],
  "creator_message": "第 23 张创造者牌给用户的 1–2 句话（不超过 50 字）"
}
要求：reading 为 2–3 段，每段 50–110 字，必须结合用户的问题，把过去、现在、未来三张牌串成一条线；actions 恰好 3 条，每条不超过 30 字，具体、可在今天或本周完成（可用"今天：/本周：/持续："开头）；不要使用 Markdown 或 HTML。`;

// ---------------- 限流（内存，按 isolate） ----------------
const ipHits = new Map(); // ip -> [timestamps]
const daily = { date: null, count: 0 };
const upstreamBlock = new Map(); // provider -> 暂停到的时间戳（额度/鉴权错误）

const cstDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const num = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function memoryLimit(ip, perIp, windowS, cap) {
  const now = Date.now();
  const q = (ipHits.get(ip) || []).filter((t) => now - t <= windowS * 1000);
  if (q.length >= perIp) {
    ipHits.set(ip, q);
    const wait = Math.ceil((windowS * 1000 - (now - q[0])) / 1000) + 1;
    return [429, 'rate_limited', `请求太频繁了，请约 ${Math.max(1, Math.floor(wait / 60))} 分钟后再试`];
  }
  const today = cstDate();
  if (daily.date !== today) { daily.date = today; daily.count = 0; }
  if (daily.count >= cap) return [429, 'daily_cap', '今日的星光解读次数已用完，明天再来吧'];
  q.push(now);
  ipHits.set(ip, q);
  daily.count += 1;
  // 防止 Map 无限增长
  if (ipHits.size > 5000) for (const k of ipHits.keys()) { ipHits.delete(k); if (ipHits.size < 2500) break; }
  return null;
}

// KV 版本：最终一致，不是严格计数，但能跨实例生效
async function kvLimit(kv, ip, perIp, windowS, cap) {
  const now = Date.now();
  const ipKey = `ip:${ip}`;
  const dayKey = `daily:${cstDate()}`;
  const [ipRaw, dayRaw] = await Promise.all([kv.get(ipKey), kv.get(dayKey)]);
  let q = [];
  try { q = JSON.parse(ipRaw || '[]').filter((t) => now - t <= windowS * 1000); } catch { q = []; }
  if (q.length >= perIp) {
    const wait = Math.ceil((windowS * 1000 - (now - q[0])) / 1000) + 1;
    return [429, 'rate_limited', `请求太频繁了，请约 ${Math.max(1, Math.floor(wait / 60))} 分钟后再试`];
  }
  const count = num(dayRaw, 0);
  if (count >= cap) return [429, 'daily_cap', '今日的星光解读次数已用完，明天再来吧'];
  q.push(now);
  await Promise.all([
    kv.put(ipKey, JSON.stringify(q), { expirationTtl: Math.max(60, windowS + 60) }),
    kv.put(dayKey, String(count + 1), { expirationTtl: 2 * 86400 }),
  ]);
  return null;
}

async function checkLimits(env, ip, provs) {
  const now = Date.now();
  if (provs.length && provs.every((p) => (upstreamBlock.get(p.name) || 0) > now)) {
    return [503, 'upstream_unavailable', 'AI 服务暂时不可用，请稍后再试'];
  }
  const perIp = num(env.RATE_PER_IP, 10);
  const windowS = num(env.RATE_WINDOW, 600);
  const cap = num(env.DAILY_CAP, 300);
  const kv = env.TAROT_KV;
  if (kv && typeof kv.get === 'function') {
    try { return await kvLimit(kv, ip, perIp, windowS, cap); } catch (e) { /* KV 出错时退回内存限流 */ }
  }
  return memoryLimit(ip, perIp, windowS, cap);
}

// ---------------- 校验 ----------------
const clean = (s, n) => String(s ?? '').replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, n);

function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [null, '请求格式错误'];
  const q = String(data.question ?? '').trim();
  if (q.length < 2) return [null, '问题太短'];
  if ([...q].length > MAX_Q) return [null, `问题不能超过 ${MAX_Q} 个字`];
  let theme = String(data.theme || 'custom');
  if (!Object.prototype.hasOwnProperty.call(THEME_CN, theme)) theme = 'custom';
  const cards = data.cards;
  if (!Array.isArray(cards) || cards.length !== 3) return [null, '需要恰好 3 张牌'];
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (!c || typeof c !== 'object') return [null, '牌数据格式错误'];
    const pos = String(c.position || ['past', 'present', 'future'][i]);
    const card = {
      position: POS_CN[pos] || clean(pos, 6),
      name_cn: clean(c.name_cn, 12),
      name_en: clean(c.name_en, 24),
      numeral: clean(c.numeral, 6),
    };
    if (!card.name_cn && !card.name_en) return [null, '牌名缺失'];
    out.push(card);
  }
  return [{ question: clean(q, MAX_Q), theme, cards: out }, null];
}

// ---------------- 上游（DeepSeek 优先，OpenAI 兜底） ----------------
class Upstream extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function providers(env) {
  const out = [];
  if (env.DEEPSEEK_API_KEY) {
    out.push({
      name: 'deepseek',
      base: String(env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
      key: env.DEEPSEEK_API_KEY,
      models: [env.DEEPSEEK_MODEL || 'deepseek-chat'],
      timeout: DEEPSEEK_TIMEOUT,
    });
  }
  if (env.OPENAI_API_KEY) {
    out.push({
      name: 'openai',
      base: String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      key: env.OPENAI_API_KEY,
      models: [...new Set([env.OPENAI_MODEL || 'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1-nano'])],
      timeout: OPENAI_TIMEOUT,
    });
  }
  return out;
}

function normalize(o) {
  const s = (x, n) => String(x ?? '').replace(/[<>]/g, '').trim().slice(0, n);
  let reading = o && o.reading;
  if (typeof reading === 'string') reading = reading.split(/\n+/).filter((p) => p.trim());
  reading = (Array.isArray(reading) ? reading : []).filter((p) => String(p).trim()).map((p) => s(p, 300)).slice(0, 3);
  const actions = (Array.isArray(o && o.actions) ? o.actions : []).filter((a) => String(a).trim()).map((a) => s(a, 60)).slice(0, 3);
  if (reading.length < 1 || actions.length < 1) throw new Error('missing fields');
  return { title: s(o.title, 40), reading, actions, creator_message: s(o.creator_message, 90) };
}

class BadOutput extends Error {}

async function postChat(prov, model, user, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(prov.base + '/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: 'Bearer ' + prov.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        temperature: 0.85,
        max_tokens: 900,
      }),
    });
    if (!res.ok) {
      const err = ((await res.json().catch(() => ({}))) || {}).error || {};
      const e = new Error('http');
      e.httpStatus = res.status;
      e.err = err;
      throw e;
    }
    const data = await res.json().catch(() => { throw new BadOutput('json'); });
    try {
      return [normalize(JSON.parse(data.choices[0].message.content)), data.model || model];
    } catch { throw new BadOutput('content'); }
  } finally {
    clearTimeout(timer);
  }
}

async function callProvider(prov, user, timeoutMs) {
  if ((upstreamBlock.get(prov.name) || 0) > Date.now()) throw new Upstream(503, 'upstream_unavailable');
  let last = null;
  for (const model of prov.models) {
    try {
      return await postChat(prov, model, user, timeoutMs);
    } catch (e) {
      if (e instanceof BadOutput) { console.log('upstream bad output', prov.name, model); last = new Upstream(502, 'bad_output'); continue; }
      if (e.httpStatus) {
        const err = e.err || {};
        const code = String(err.code || err.type || `http_${e.httpStatus}`);
        console.log('upstream error', prov.name, model, e.httpStatus, code); // 从不记录 header / key
        if ((e.httpStatus === 404 || e.httpStatus === 400) && String(err.message || '').toLowerCase().includes('model')) {
          last = new Upstream(502, 'model_unavailable'); continue;
        }
        const quota = e.httpStatus === 402 || (e.httpStatus === 429 && /quota|credit|billing|balance/.test(`${code} ${err.type || ''}`));
        if (quota || e.httpStatus === 401 || e.httpStatus === 403) {
          upstreamBlock.set(prov.name, Date.now() + 300e3); // 暂停 5 分钟，避免反复请求
          throw new Upstream(503, quota ? 'upstream_quota' : 'upstream_auth');
        }
        throw new Upstream(502, e.httpStatus === 429 ? 'upstream_rate_limited' : 'upstream_error');
      }
      console.log('upstream network/timeout', prov.name, model, e && e.name);
      throw new Upstream(504, 'timeout');
    }
  }
  throw last || new Upstream(502, 'unknown');
}

async function callAi(provs, req) {
  if (!provs.length) throw new Upstream(503, 'not_configured');
  const cardsTxt = req.cards.map((c) => `- ${c.position}：${c.numeral} ${c.name_cn}（${c.name_en}）`).join('\n');
  const user = `主题：${THEME_CN[req.theme]}\n用户的问题：「${req.question}」\n抽到的三张牌：\n${cardsTxt}\n请按要求输出 JSON。`;
  const t0 = Date.now();
  let last = null;
  for (const prov of provs) {
    const remaining = TOTAL_BUDGET - (Date.now() - t0);
    if (remaining < 5000) break;
    try {
      const [result, model] = await callProvider(prov, user, Math.min(prov.timeout, remaining));
      return [result, prov.name, model];
    } catch (e) {
      last = e instanceof Upstream ? e : new Upstream(502, 'unknown'); // 继续尝试下一个
    }
  }
  throw last || new Upstream(504, 'timeout');
}

// ---------------- 路由 ----------------
async function handlePost({ request, env }) {
  const len = parseInt(request.headers.get('Content-Length') || '', 10);
  if (Number.isFinite(len) && len > MAX_BODY) return json(413, { error: 'bad_request', message: '请求体无效或过大' });
  let text;
  try { text = await request.text(); } catch { return json(400, { error: 'bad_request', message: '请求体无效或过大' }); }
  const bytes = new TextEncoder().encode(text).length;
  if (bytes === 0 || bytes > MAX_BODY) {
    return json(bytes > MAX_BODY ? 413 : 400, { error: 'bad_request', message: '请求体无效或过大' });
  }
  let data;
  try { data = JSON.parse(text); } catch { return json(400, { error: 'bad_json', message: '请求格式错误' }); }
  const [req, err] = validate(data);
  if (err) return json(400, { error: 'invalid', message: err });

  const provs = providers(env);
  const ip = request.headers.get('CF-Connecting-IP') || (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() || 'unknown';
  const lim = await checkLimits(env, ip, provs);
  if (lim) return json(lim[0], { error: lim[1], message: lim[2] });

  try {
    const [result, provider, model] = await callAi(provs, req);
    return json(200, { ...result, provider, model });
  } catch (e) {
    const status = e instanceof Upstream ? e.status : 502;
    const code = e instanceof Upstream ? e.code : 'unknown';
    return json(status, { error: code, message: '星光暂时没有回应，请稍后再试' });
  }
}

async function readingRoute(context) {
  if (context.request.method === 'POST') return handlePost(context);
  return json(405, { error: 'method_not_allowed', message: '请使用 POST' });
}


// ---------------- 静态文件（来自 GitHub） ----------------
const REPO_RAW = 'https://raw.githubusercontent.com/MinibeanAI/tarot-journey';
const MIME = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon', woff2: 'font/woff2',
  woff: 'font/woff', ttf: 'font/ttf', mp3: 'audio/mpeg', txt: 'text/plain; charset=utf-8',
};

async function serveStatic(request, env, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return new Response('Bad Request', { status: 400 }); }
  if (path.endsWith('/')) path += 'index.html';
  if (path.split('/').slice(1).some((seg) => seg === '' || seg.startsWith('.'))) return new Response('Not Found', { status: 404 });
  const ext = (path.split('.').pop() || '').toLowerCase();
  const type = MIME[ext];
  if (!type) return new Response('Not Found', { status: 404 });
  const ref = env.ASSET_REF || 'main';
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/__static/${ref}${path}`, { method: 'GET' });
  let res = await cache.match(cacheKey);
  if (!res) {
    const upstream = await fetch(`${REPO_RAW}/${ref}/public${path.split('/').map(encodeURIComponent).join('/')}`, {
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!upstream.ok) return new Response('Not Found', { status: upstream.status === 404 ? 404 : 502 });
    const short = ['html', 'js', 'css'].includes(ext);
    res = new Response(upstream.body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': short ? 'public, max-age=300' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return request.method === 'HEAD' ? new Response(null, { headers: res.headers }) : res;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/reading') return readingRoute({ request, env });
    if (pathname === '/api/health') {
      const providers = [];
      if (env.DEEPSEEK_API_KEY) providers.push('deepseek');
      if (env.OPENAI_API_KEY) providers.push('openai');
      return json(200, { ok: true, providers, kv: !!env.TAROT_KV });
    }
    if (pathname.startsWith('/api/')) return json(404, { error: 'not_found', message: '接口不存在' });
    return serveStatic(request, env, ctx);
  },
};
