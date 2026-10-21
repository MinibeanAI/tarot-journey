/**
 * Cloudflare Worker — 塔罗显化之旅 v2
 * 绑定：DEEPSEEK_API_KEY / OPENAI_API_KEY（secret），ASSET_REF（plain_text）
 * 绝不在日志中打印 key。
 */
const MAX_Q = 120;
const MAX_BODY = 4096;
const DEEPSEEK_TIMEOUT = 22000;
const OPENAI_TIMEOUT = 25000;
const TOTAL_BUDGET = 38000;

const THEME_CN = { career: '事业', wealth: '财富', love: '爱情', self: '自我', custom: '自定义' };
const POS_CN = { past: '过去', present: '现在', future: '未来' };
const MANIFEST_POOL = [
  { cn: '创造者', en: 'THE CREATOR', meaning: '亲手创造答案' },
  { cn: '织梦者', en: 'THE DREAMWEAVER', meaning: '把愿望织成蓝图' },
  { cn: '持光者', en: 'THE LIGHTBEARER', meaning: '以光看清自己' },
  { cn: '启航者', en: 'THE VOYAGER', meaning: '解开缆绳启航' },
  { cn: '培育者', en: 'THE GARDENER', meaning: '耐心浇灌等待' },
  { cn: '重生者', en: 'THE PHOENIX', meaning: '从灰烬中展翅' },
];

const SYSTEM_PROMPT = `你是「塔罗显化之旅」的资深塔罗解读师，熟悉韦特（RWS）体系的 78 张牌（含小阿卡纳：权杖=行动热情，圣杯=情感关系，宝剑=思维沟通，星币=物质现实；数字 1 开端…10 完成，宫廷牌代表人格/阶段）。三张牌阵：过去（影响你的根源）/ 现在（当下的核心课题）/ 未来（照目前方向发展的可能趋势，而非注定结果）。

写作原则：
1. 切题：第一句就正面回应用户的具体问题，使用问题里的关键词，不绕开。
2. 牌义准确：每张牌写出它在韦特体系的核心意象或含义，并说明它在该位置意味着什么；不要编造牌面。
3. 叙事串联：说明三张牌之间的因果/转折（例如“正因为…所以现在…如果…未来可能…”），不要三段平行罗列。
4. 不说空话：禁止“相信自己”“一切都会好”“宇宙会安排”这类无信息量套话；同一个意象不重复使用。
5. 可执行：建议要具体到动作、时间或数量，贴合问题场景。
6. 语气：温暖、清醒、有仪式感，像一位温柔可靠的朋友。可轻用“登塔/星光/台阶”意象，全篇合计最多 2 处；禁止“宇宙”“命运注定”“天意”等词。
7. 合规：只谈可能性与倾向（用“可能/倾向/如果…”），禁止“保证”“一定”“必将”“必然”“百分之百”“稳稳”“绝对”等绝对化表述；不给医疗诊断、投资理财收益、法律结论；涉及他人内心时不替对方下定论。
8. 语言：全部使用简体中文，禁止繁体字。
9. 显化宣言：第一人称、现在进行时、积极具体，必须含用户问题里的主题词，不超过 20 字，不用“显化宣言：”前缀；只写正向状态，不复述困扰或负面词（如忽冷忽热、焦虑、匮乏、失败、辞职恐惧）。
10. 显化牌挑选：从下列 6 张中按牌义挑选最贴合本次问题与三张牌的一张，填入 manifest_cn（只允许这六个中文名之一）：创造者 / 织梦者 / 持光者 / 启航者 / 培育者 / 重生者。

严格只输出一个 JSON 对象，不要 Markdown：
{
 "title": "本次旅程一句话（≤18字）",
 "answer": "直接回应问题的核心结论（30–45字，非绝对化）",
 "cards": [
   {"position":"过去","keyword":"2–4字关键词","reading":"该牌在此位置的解读（50–72字，含牌义+联系问题）"},
   {"position":"现在","keyword":"2–4字关键词","reading":"50–72字"},
   {"position":"未来","keyword":"2–4字关键词","reading":"50–72字"}
 ],
 "synthesis": "综合解读：三张牌如何串成一条线、关键转折点在哪（80–110字）",
 "actions": ["今天：…", "本周：…", "持续：…"],
 "reflect": "留给用户的一个自问句（≤26字）",
 "affirmation": "个性化显化宣言（≤22字，正向）",
 "manifest_cn": "六选一中文名",
 "creator_message": "以该显化牌身份说的话，点出牌名寓意并呼应三张牌（≤50字）"
}
actions 恰好 3 条，每条 ≤26 字。所有字数上限都是硬性的，写完请自查字数。`;

const RETRY_HINT = `\n【重写要求】上次输出不合规，请严格遵守：①全部简体中文；②answer≤50字、每张牌 reading≤80字、synthesis≤120字、affirmation≤22字且正向无负面词；③禁止“保证/一定/必将/必然/稳稳/绝对”；④登塔/星光/台阶合计≤2处；⑤manifest_cn 必须是六选一。`;

const ABSOLUTE_RE = /保证|一定|必将|必然|百分之百|绝对|稳稳|注定|天意|宇宙会/;
const NEGATIVE_AFFIRM_RE = /忽冷忽热|焦虑|匮乏|失败|恐惧|痛苦|刺痛|崩溃|绝望|分手|被甩|抛弃|穷|负债/;
const IMAGERY_RE = /登塔|星光|台阶/g;
// Common traditional → simplified replacements appearing in LLM output
const T2S = {"過": "过", "來": "来", "們": "们", "為": "为", "這": "这", "時": "时", "間": "间", "會": "会", "還": "还", "說": "说", "對": "对", "開": "开", "關": "关", "見": "见", "現": "现", "從": "从", "後": "后", "無": "无", "與": "与", "將": "将", "麼": "么", "樣": "样", "種": "种", "東": "东", "裡": "里", "邊": "边", "處": "处", "點": "点", "長": "长", "書": "书", "學": "学", "氣": "气", "發": "发", "經": "经", "濟": "济", "實": "实", "寫": "写", "讀": "读", "聽": "听", "話": "话", "語": "语", "問": "问", "題": "题", "應": "应", "該": "该", "認": "认", "識": "识", "覺": "觉", "觀": "观", "變": "变", "動": "动", "靜": "静", "溫": "温", "軟": "软", "堅": "坚", "強": "强", "傷": "伤", "愛": "爱", "戀": "恋", "係": "系", "選": "选", "擇": "择", "決": "决", "斷": "断", "繼": "继", "續": "续", "進": "进", "讓": "让", "給": "给", "頭": "头", "錢": "钱", "資": "资", "業": "业", "試": "试", "輕": "轻", "嗎": "吗", "夠": "够", "歲": "岁", "熱": "热", "燈": "灯", "亂": "乱", "習": "习", "慣": "惯", "環": "环", "擔": "担", "憂": "忧", "慮": "虑", "錯": "错", "願": "愿", "夢": "梦", "鬆": "松", "結": "结", "紹": "绍", "記": "记", "錄": "录", "個": "个", "員": "员", "預": "预", "測": "测", "適": "适", "當": "当", "聯": "联", "繫": "系", "帶": "带", "衝": "冲", "礙": "碍", "寶": "宝", "劍": "剑", "聖": "圣", "權": "权", "幣": "币", "騎": "骑", "國": "国"};
function toSimplified(s) {
  let out = '';
  for (const ch of String(s ?? '')) out += T2S[ch] || ch;
  return out;
}
function hasTraditional(s) {
  for (const ch of String(s ?? '')) if (T2S[ch]) return true;
  return false;
}
const ABS_FIX = [[/保证/g, '有机会'], [/一定会/g, '可能会'], [/一定/g, '或许'], [/必将/g, '可能'], [/必然/g, '往往'], [/百分之百/g, '更'], [/绝对/g, '真的'], [/稳稳地?/g, '逐步'], [/注定/g, '倾向'], [/天意/g, '时机'], [/宇宙会/g, '生活会']];
const fixAbs = (t) => ABS_FIX.reduce((x, [re, r]) => x.replace(re, r), t);
const IMG_ALT = { '登塔': '前行', '星光': '微光', '台阶': '一步' };
function limitImagery(parts) {
  let n = 0;
  return parts.map((t) => t.replace(IMAGERY_RE, (m) => (++n <= 2 ? m : IMG_ALT[m])));
}
const THEME_AFFIRM = {
  career: '我正一步步把热爱做成可以依靠的事业。',
  wealth: '我正温柔而有序地让财富在生活里积累。',
  love: '我正清晰地表达需要，也温柔地爱着自己。',
  self: '我正回到自己的节奏，平静地照顾好内心。',
  custom: '我正带着清醒与勇气，创造属于我的答案。',
};
const MAJ = ['愚者','魔术师','女祭司','皇后','皇帝','教皇','恋人','战车','力量','隐士','命运之轮','正义','倒吊人','死神','节制','恶魔','高塔','星星','月亮','太阳','审判','世界'];
// index into MANIFEST_POOL: 0创造 1织梦 2持光 3启航 4培育 5重生 (kept identical to public/app.js MAJ_MANI / SUIT_MANI)
const MAJ_MANI = [3,0,1,4,0,2,1,3,5,2,3,2,5,5,4,5,5,1,2,0,5,3];
const SUIT_MANI = { '权杖': 3, '圣杯': 1, '宝剑': 2, '星币': 4 };
const THEME_MANI = { career: 0, wealth: 4, love: 1, self: 2, custom: 0 };

const ipHits = new Map();
const daily = { date: null, count: 0 };
const upstreamBlock = new Map();
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
  if (ipHits.size > 5000) for (const k of ipHits.keys()) { ipHits.delete(k); if (ipHits.size < 2500) break; }
  return null;
}

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
    try { return await kvLimit(kv, ip, perIp, windowS, cap); } catch (e) { /* fallback */ }
  }
  return memoryLimit(ip, perIp, windowS, cap);
}

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
  const m = data.manifest && typeof data.manifest === 'object' ? data.manifest : {};
  const manifest = { name_cn: clean(m.name_cn, 8) || '创造者', name_en: clean(m.name_en, 24) || 'THE CREATOR' };
  return [{ question: clean(q, MAX_Q), theme, cards: out, manifest, v2: Number(data.v) === 2 }, null];
}

class Upstream extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
class BadOutput extends Error {}

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

function pickManifestDeterministic(req) {
  const score = [0, 0, 0, 0, 0, 0];
  const W = [1, 1.5, 2];
  req.cards.forEach((c, i) => {
    const mi = MAJ.indexOf(c.name_cn);
    let k = mi >= 0 ? MAJ_MANI[mi] : SUIT_MANI[c.name_cn.slice(0, 2)];
    if (k == null) k = 0;
    score[k] += W[i] || 1;
  });
  score[THEME_MANI[req.theme] ?? 0] += 0.75;
  let best = 0;
  score.forEach((v, i) => { if (v > score[best]) best = i; });
  return MANIFEST_POOL[best];
}

function resolveManifest(o, req) {
  if (!req.v2) return MANIFEST_POOL.find((m) => m.cn === req.manifest.name_cn) || { cn: req.manifest.name_cn, en: req.manifest.name_en };
  const name = clean(o && o.manifest_cn, 8);
  const hit = MANIFEST_POOL.find((m) => m.cn === name);
  return hit || pickManifestDeterministic(req);
}

function countChars(s) { return [...String(s ?? '')].length; }

function softClip(s, n) {
  const arr = [...String(s ?? '').trim()];
  if (arr.length <= n) return arr.join('');
  const min = Math.floor(n * 0.5);
  for (let i = n - 1; i >= min; i--) if ('。！？'.includes(arr[i])) return arr.slice(0, i + 1).join('');
  for (let i = n - 2; i >= min; i--) if ('；，、：,;'.includes(arr[i])) return arr.slice(0, i).join('') + '。';
  return arr.slice(0, n - 1).join('') + '…';
}

/** Returns {ok, reason, value} — value always a sanitized (possibly truncated) object when fields exist. */
function normalizeV2(o, req, { truncate = false } = {}) {
  const s = (x, n) => softClip(fixIf(toSimplified(String(x ?? '').replace(/[\x00-\x1f\x7f<>]/g, '').trim())), n);
  const fixIf = (t) => (truncate ? fixAbs(t) : t);
  if (!o || typeof o !== 'object') return { ok: false, reason: 'not_object' };
  const rawBlob = JSON.stringify(o);

  const title = s(o.title, 18);
  const answer = s(o.answer, 50);
  let cardsIn = Array.isArray(o.cards) ? o.cards : [];
  if (cardsIn.length < 3) return { ok: false, reason: 'cards_missing' };
  const cards = cardsIn.slice(0, 3).map((c, i) => ({
    position: ['过去', '现在', '未来'][i],
    keyword: s(c && c.keyword, 5),
    reading: s(c && c.reading, 80),
  }));
  const synthesis = s(o.synthesis, 120);
  let actions = (Array.isArray(o.actions) ? o.actions : []).filter((a) => String(a).trim()).map((a) => s(a, 28)).slice(0, 3);
  const reflect = s(o.reflect, 26);
  let affirmation = s(String(o.affirmation ?? '').replace(/^显化宣言[：:]\s*/, ''), 24);
  const manifest = resolveManifest(o, req);
  const creator_message = s(o.creator_message, 50);

  if (!answer || cards.some((c) => !c.reading) || !synthesis || actions.length < 1) {
    return { ok: false, reason: 'missing_fields' };
  }

  // Compliance checks (non-truncate pass) — collect every problem so the retry can fix them all
  const blob = [title, answer, ...cards.map((c) => c.keyword + c.reading), synthesis, affirmation, reflect, creator_message, ...actions].join('|');
  if (!truncate) {
    const probs = [];
    const len = (x) => countChars(String(x ?? '').trim());
    const absHits = blob.match(new RegExp(ABSOLUTE_RE.source, 'g'));
    if (absHits) probs.push(`出现绝对化用词（${[...new Set(absHits)].join('、')}），请改成可能性表述`);
    if (NEGATIVE_AFFIRM_RE.test(affirmation)) probs.push('affirmation 含负面词，请只写正向状态');
    if (hasTraditional(rawBlob)) probs.push('出现繁体字，请全部使用简体中文');
    const imagery = (blob.match(IMAGERY_RE) || []).length;
    if (imagery > 2) probs.push(`“登塔/星光/台阶”出现 ${imagery} 次，最多 2 次`);
    if (len(o.title) > 18) probs.push(`title ${len(o.title)} 字，需 ≤18 字`);
    if (len(o.answer) > 50) probs.push(`answer ${len(o.answer)} 字，需 ≤50 字`);
    cardsIn.slice(0, 3).forEach((c, i) => { if (len(c && c.reading) > 80) probs.push(`cards[${i}].reading ${len(c.reading)} 字，需 ≤80 字`); });
    if (len(o.synthesis) > 120) probs.push(`synthesis ${len(o.synthesis)} 字，需 ≤120 字`);
    (Array.isArray(o.actions) ? o.actions : []).forEach((a, i) => { if (len(a) > 28) probs.push(`actions[${i}] ${len(a)} 字，需 ≤28 字`); });
    if (len(o.reflect) > 26) probs.push(`reflect ${len(o.reflect)} 字，需 ≤26 字`);
    if (len(String(o.affirmation || '').replace(/^显化宣言[：:]\s*/, '')) > 22) probs.push('affirmation 需 ≤22 字');
    if (len(o.creator_message) > 50) probs.push(`creator_message ${len(o.creator_message)} 字，需 ≤50 字`);
    const drawn = req.cards.map((c) => c.name_cn);
    const named = [...new Set(blob.match(/(?:权杖|圣杯|宝剑|星币)(?:王牌|侍从|骑士|王后|国王|十|[一二三四五六七八九])/g) || [])];
    const wrong = named.filter((x) => !drawn.includes(x));
    if (wrong.length) probs.push(`提到了用户没有抽到的牌（${wrong.join('、')}），本次只有：${drawn.join('、')}`);
    if (req.v2 && !MANIFEST_POOL.some((m) => m.cn === String(o.manifest_cn || '').trim())) probs.push('manifest_cn 必须是六张显化牌之一');
    if (probs.length) return { ok: false, reason: probs.join('；'), probs };
  }

  if (truncate) {
    const rawAff = String(o.affirmation || '').replace(/^显化宣言[：:]\s*/, '').trim();
    if (NEGATIVE_AFFIRM_RE.test(affirmation) || countChars(affirmation) < 6 || countChars(rawAff) > 24) affirmation = THEME_AFFIRM[req.theme] || THEME_AFFIRM.custom;
  }
  // Pad actions
  while (actions.length < 3) actions.push(['今天：写下此刻最真实的感受。', '本周：做一件与问题相关的小行动。', '持续：每晚读一遍你的显化宣言。'][actions.length]);

  // Legacy reading array for old frontends

  let fields = [title, answer, ...cards.map((c) => c.keyword), ...cards.map((c) => c.reading), synthesis, creator_message, reflect];
  if (truncate) fields = limitImagery(fields);
  const [t2, a2, k0, k1, k2, c0, c1, c2, s2, m2, r2] = fields;
  [k0, k1, k2].forEach((k, i) => { cards[i].keyword = k; });
  [c0, c1, c2].forEach((r, i) => { cards[i].reading = r; });
  return {
    ok: true,
    value: {
      title: t2, answer: a2, cards, synthesis: s2, actions, reflect: r2, affirmation,
      creator_message: m2, manifest_cn: manifest.cn, manifest_en: manifest.en,
      reading: [a2, s2], // legacy for old cached frontends
    },
  };
}

async function postChat(prov, model, messages, timeoutMs) {
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
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 1200,
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
      return [JSON.parse(data.choices[0].message.content), data.model || model];
    } catch { throw new BadOutput('content'); }
  } finally {
    clearTimeout(timer);
  }
}

async function callProvider(prov, messages, timeoutMs) {
  if ((upstreamBlock.get(prov.name) || 0) > Date.now()) throw new Upstream(503, 'upstream_unavailable');
  let last = null;
  for (const model of prov.models) {
    try {
      return await postChat(prov, model, messages, timeoutMs);
    } catch (e) {
      if (e instanceof BadOutput) { console.log('upstream bad output', prov.name, model); last = new Upstream(502, 'bad_output'); continue; }
      if (e.httpStatus) {
        const err = e.err || {};
        const code = String(err.code || err.type || `http_${e.httpStatus}`);
        console.log('upstream error', prov.name, model, e.httpStatus, code);
        if ((e.httpStatus === 404 || e.httpStatus === 400) && String(err.message || '').toLowerCase().includes('model')) {
          last = new Upstream(502, 'model_unavailable'); continue;
        }
        const quota = e.httpStatus === 402 || (e.httpStatus === 429 && /quota|credit|billing|balance/.test(`${code} ${err.type || ''}`));
        if (quota || e.httpStatus === 401 || e.httpStatus === 403) {
          upstreamBlock.set(prov.name, Date.now() + 300e3);
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

function buildUser(req) {
  const cardsTxt = req.cards.map((c) => `- ${c.position}：${c.numeral} ${c.name_cn}（${c.name_en}）`).join('\n');
  const pool = MANIFEST_POOL.map((m) => `${m.cn}（${m.meaning}）`).join(' / ');
  const mani = req.v2 ? `请从显化牌池挑选最贴合的一张：${pool}` : `本次显化牌已确定为「${req.manifest.name_cn}」，manifest_cn 请填它，creator_message 围绕它来写。`;
  return `主题：${THEME_CN[req.theme]}\n用户的问题：「${req.question}」\n抽到的三张牌（均为正位）：\n${cardsTxt}\n${mani}\n按要求输出 JSON。`;
}

async function callAi(provs, req) {
  if (!provs.length) throw new Upstream(503, 'not_configured');
  const user = buildUser(req);
  const t0 = Date.now();
  let last = null;
  for (const prov of provs) {
    const remaining = TOTAL_BUDGET - (Date.now() - t0);
    if (remaining < 5000) break;
    try {
      const timeout = Math.min(prov.timeout, remaining);
      let messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ];
      let [raw, model] = await callProvider(prov, messages, timeout);
      let checked = normalizeV2(raw, req, { truncate: false });
      if (!checked.ok) {
        console.log('v2 retry', prov.name, checked.reason.slice(0, 160));
        const rem2 = TOTAL_BUDGET - (Date.now() - t0);
        if (rem2 >= 5000) {
          messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: user },
            { role: 'assistant', content: JSON.stringify(raw) },
            { role: 'user', content: `上面的 JSON 有这些问题：${checked.reason}。请在保持内容与结构不变的前提下逐条修正（超字数就精简句子，不要截断半句），重新输出完整 JSON。${RETRY_HINT}` },
          ];
          try {
            [raw, model] = await callProvider(prov, messages, Math.min(prov.timeout, rem2));
            checked = normalizeV2(raw, req, { truncate: false });
            if (!checked.ok) console.log('v2 after retry still', checked.reason.slice(0, 120));
          } catch (e) { /* fall through to truncate */ }
        }
      }
      // Final pass: always truncate to hard caps
      const final = normalizeV2(raw, req, { truncate: true });
      if (!final.ok) throw new BadOutput('normalize');
      return [final.value, prov.name, model];
    } catch (e) {
      last = e instanceof Upstream ? e : (e instanceof BadOutput ? new Upstream(502, 'bad_output') : new Upstream(502, 'unknown'));
    }
  }
  throw last || new Upstream(504, 'timeout');
}

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
    return json(200, { ...result, provider, model, v: 2 });
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
      return json(200, { ok: true, providers, kv: !!env.TAROT_KV, v: 2 });
    }
    if (pathname.startsWith('/api/')) return json(404, { error: 'not_found', message: '接口不存在' });
    return serveStatic(request, env, ctx);
  },
};
