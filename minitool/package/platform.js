/* 小红书小工具平台适配。不访问自建接口，不含 API key。
   解读规范常量在 reading-pack.js（构建时从 worker 同步）。 */
(function () {
  'use strict';

  const MODEL = 'deepseek-v4-flash';
  const PACK = window.TAROT_READING_PACK || {};
  const T2S = PACK.T2S || {};
  const SYSTEM_PROMPT = PACK.SYSTEM_PROMPT || '';

  const THEME_CN = { career: '事业', wealth: '财富', love: '爱情', self: '自我', custom: '自定义' };
  const POS_CN = { past: '过去', present: '现在', future: '未来' };
  const MANIFESTS = ['创造者', '织梦者', '持光者', '启航者', '培育者', '重生者'];
  const MANIFEST_HINT = [
    ['创造者', '亲手创造答案'],
    ['织梦者', '把愿望织成蓝图'],
    ['持光者', '以光看清自己'],
    ['启航者', '解开缆绳启航'],
    ['培育者', '耐心浇灌等待'],
    ['重生者', '从灰烬中展翅'],
  ];
  const THEME_AFFIRM = {
    career: '我正一步步把热爱做成可以依靠的事业。',
    wealth: '我正温柔而有序地让财富在生活里积累。',
    love: '我正清晰地表达需要，也温柔地爱着自己。',
    self: '我正回到自己的节奏，平静地照顾好内心。',
    custom: '我正带着清醒与勇气，创造属于我的答案。',
  };
  const ACTION_PAD = ['今天：写下此刻最真实的感受。', '本周：做一件与问题相关的小行动。', '持续：每晚读一遍你的显化宣言。'];
  const ABSOLUTE_RE = /保证|一定|必将|必然|百分之百|绝对|稳稳|注定|天意|宇宙会/;
  const NEGATIVE_AFFIRM_RE = /忽冷忽热|焦虑|匮乏|失败|恐惧|痛苦|刺痛|崩溃|绝望|分手|被甩|抛弃|穷|负债/;
  const IMAGERY_RE = /登塔|星光|台阶/g;
  const IMG_ALT = { '登塔': '前行', '星光': '微光', '台阶': '一步' };
  const ABS_FIX = [[/保证/g, '有机会'], [/一定会/g, '可能会'], [/一定/g, '或许'], [/必将/g, '可能'], [/必然/g, '往往'], [/百分之百/g, '更'], [/绝对/g, '真的'], [/稳稳地?/g, '逐步'], [/注定/g, '倾向'], [/天意/g, '时机'], [/宇宙会/g, '生活会']];

  function getXhs() {
    try { return window.xhs || null; } catch (e) { return null; }
  }
  function aiReady() {
    const x = getXhs();
    return !!(x && x.AI && typeof x.AI.createModel === 'function');
  }
  function canSave() {
    const x = getXhs();
    return !!(x && typeof x.writeTempFile === 'function' && typeof x.saveImageToPhotosAlbum === 'function');
  }
  function explain(e) {
    if (e == null) return '';
    if (typeof e === 'string') return e;
    return [e.code, e.errCode, e.errno, e.errMsg, e.message, e.name].filter(Boolean).join(' ');
  }
  function codeOf(e) {
    const s = explain(e);
    if (/AI_NOT_ALLOWED/.test(s)) return 'AI_NOT_ALLOWED';
    if (/timeout|TIMEOUT|超时/.test(s)) return 'AI_TIMEOUT';
    if (/quota|次数|DAILY|rate.?limit|too many/i.test(s)) return 'AI_QUOTA';
    if (/TypeError|argument|parameter|invalid|unexpected/i.test(s)) return 'AI_BAD_ARGS';
    if (/AI_BAD_OUTPUT/.test(s)) return 'AI_BAD_OUTPUT';
    if (/XHS_AI_UNAVAILABLE/.test(s)) return 'XHS_AI_UNAVAILABLE';
    return 'AI_FAILED';
  }
  function fail(code, message) {
    const err = new Error(message || code);
    err.code = code;
    return err;
  }
  function invoke(fn, arg, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = 0;
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (ok) resolve(value);
        else {
          const err = value instanceof Error ? value : fail(codeOf(value), explain(value) || 'failed');
          if (!err.code) err.code = codeOf(value);
          reject(err);
        }
      };
      const payload = (arg && typeof arg === 'object') ? Object.assign({}, arg) : { prompt: String(arg || '') };
      payload.success = (v) => finish(true, v);
      payload.fail = (e) => finish(false, e);
      payload.complete = (r) => {
        const msg = r && (r.errMsg || r.message || r.code || '');
        if (r && (r.success === false || r.code === 'AI_NOT_ALLOWED' || /:fail|\bfail\b|error|not allowed|AI_NOT_ALLOWED/i.test(String(msg)))) finish(false, r);
        else if (r && (pickPath(r) || extractText(r))) finish(true, r);
      };
      let ret;
      try { ret = fn(payload); }
      catch (e) { finish(false, e); return; }
      if (ret && typeof ret.then === 'function') ret.then((v) => finish(true, v), (e) => finish(false, e));
      else if (ret !== undefined) finish(true, ret);
      timer = setTimeout(() => finish(false, fail('AI_TIMEOUT', 'AI_TIMEOUT')), timeoutMs || 20000);
    });
  }
  function extractText(res) {
    if (res == null) return '';
    if (typeof res === 'string') return res;
    if (typeof res.text === 'string') return res.text;
    if (typeof res.content === 'string') return res.content;
    if (typeof res.output_text === 'string') return res.output_text;
    if (typeof res.output === 'string') return res.output;
    if (typeof res.result === 'string') return res.result;
    if (res.message && typeof res.message.content === 'string') return res.message.content;
    if (res.data) {
      const inner = extractText(res.data);
      if (inner) return inner;
    }
    if (Array.isArray(res.choices) && res.choices[0]) {
      const c = res.choices[0];
      if (c.message && typeof c.message.content === 'string') return c.message.content;
      if (typeof c.text === 'string') return c.text;
    }
    return '';
  }
  function parseJson(text) {
    let t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i < 0 || j <= i) throw fail('AI_BAD_OUTPUT', 'AI_BAD_OUTPUT');
    try { return JSON.parse(t.slice(i, j + 1)); }
    catch (e) { throw fail('AI_BAD_OUTPUT', 'AI_BAD_OUTPUT'); }
  }
  function toSimplified(s) {
    let out = '';
    for (const ch of String(s ?? '')) out += T2S[ch] || ch;
    return out;
  }
  function countChars(s) { return [...String(s ?? '')].length; }
  function fixAbs(t) { return ABS_FIX.reduce((x, pair) => x.replace(pair[0], pair[1]), t); }
  function softClip(s, n) {
    const arr = [...String(s ?? '').trim()];
    if (arr.length <= n) return arr.join('');
    const min = Math.floor(n * 0.5);
    for (let i = n - 1; i >= min; i--) if ('。！？'.includes(arr[i])) return arr.slice(0, i + 1).join('');
    for (let i = n - 2; i >= min; i--) if ('；，、：,;'.includes(arr[i])) return arr.slice(0, i).join('') + '。';
    return arr.slice(0, n - 1).join('') + '…';
  }
  function cleanText(s, n) {
    const t = fixAbs(toSimplified(String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim()));
    return softClip(t, n);
  }
  function limitImagery(parts) {
    let n = 0;
    return parts.map((t) => String(t).replace(IMAGERY_RE, (m) => (++n <= 2 ? m : (IMG_ALT[m] || m))));
  }
  function buildUser(req) {
    const cardsTxt = req.cards.map((c) => `- ${POS_CN[c.position] || c.position_cn || ''}：${c.numeral} ${c.name_cn}（${c.name_en}）`).join('\n');
    const mani = `请从显化牌池挑选最贴合的一张：${MANIFEST_HINT.map((m) => `${m[0]}（${m[1]}）`).join(' / ')}`;
    return `主题：${THEME_CN[req.theme] || '自定义'}\n用户的问题：「${req.question}」\n抽到的三张牌（均为正位）：\n${cardsTxt}\n${mani}\n按要求输出 JSON。`;
  }
  function normalize(o, req) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw fail('AI_BAD_OUTPUT', 'AI_BAD_OUTPUT');
    const title = cleanText(o.title, 18);
    const answer = cleanText(o.answer, 50);
    const cardsIn = Array.isArray(o.cards) ? o.cards : [];
    if (cardsIn.length < 3) throw fail('AI_BAD_OUTPUT', 'AI_BAD_OUTPUT');
    const cards = cardsIn.slice(0, 3).map((c) => ({
      keyword: cleanText(c && c.keyword, 5),
      reading: cleanText(c && c.reading, 80),
    }));
    const synthesis = cleanText(o.synthesis, 120);
    let actions = (Array.isArray(o.actions) ? o.actions : []).map((a) => cleanText(a, 28)).filter(Boolean).slice(0, 3);
    while (actions.length < 3) actions.push(ACTION_PAD[actions.length]);
    const reflect = cleanText(o.reflect, 26);
    let affirmation = cleanText(String(o.affirmation ?? '').replace(/^显化宣言[：:]\s*/, ''), 22);
    const rawAff = String(o.affirmation || '').replace(/^显化宣言[：:]\s*/, '').trim();
    if (NEGATIVE_AFFIRM_RE.test(affirmation) || countChars(affirmation) < 6 || countChars(rawAff) > 24) {
      affirmation = THEME_AFFIRM[req.theme] || THEME_AFFIRM.custom;
    }
    const manifestName = cleanText(o.manifest_cn, 8);
    const manifest_cn = MANIFESTS.indexOf(manifestName) >= 0 ? manifestName : '';
    const creator_message = cleanText(o.creator_message, 50);
    if (!answer || cards.some((c) => !c.reading) || !synthesis) throw fail('AI_BAD_OUTPUT', 'AI_BAD_OUTPUT');
    const blob = [title, answer, ...cards.map((c) => c.keyword + c.reading), synthesis, affirmation, reflect, creator_message, ...actions].join('|');
    if (ABSOLUTE_RE.test(blob)) {
      /* cleanText already rewrites the listed words; a leftover means the rewrite missed a phrase. */
    }
    const drawn = req.cards.map((c) => c.name_cn);
    const named = [...new Set(blob.match(/(?:权杖|圣杯|宝剑|星币)(?:王牌|侍从|骑士|王后|国王|十|[一二三四五六七八九])/g) || [])];
    if (named.some((x) => drawn.indexOf(x) < 0)) throw fail('AI_BAD_OUTPUT', 'AI_BAD_OUTPUT');
    const fields = limitImagery([title, answer, cards[0].keyword, cards[1].keyword, cards[2].keyword, cards[0].reading, cards[1].reading, cards[2].reading, synthesis, creator_message, reflect]);
    cards[0].keyword = fields[2]; cards[1].keyword = fields[3]; cards[2].keyword = fields[4];
    cards[0].reading = fields[5]; cards[1].reading = fields[6]; cards[2].reading = fields[7];
    return {
      title: fields[0],
      answer: fields[1],
      cards,
      synthesis: fields[8],
      actions,
      reflect: fields[10],
      affirmation,
      creator_message: fields[9],
      manifest_cn,
      model: MODEL,
    };
  }
  async function generateRaw(model, system, user) {
    try {
      return await invoke(model.generateText.bind(model), {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        system,
        prompt: user,
        temperature: 0.8,
      }, 40000);
    } catch (e) {
      if (codeOf(e) !== 'AI_BAD_ARGS') throw e;
      return await invoke(model.generateText.bind(model), { prompt: system + '\n\n' + user }, 40000);
    }
  }
  async function completeReading(req) {
    if (!SYSTEM_PROMPT) throw fail('AI_FAILED', 'AI_FAILED');
    const x = getXhs();
    if (!aiReady()) throw fail('XHS_AI_UNAVAILABLE', 'XHS_AI_UNAVAILABLE');
    let model;
    try { model = x.AI.createModel(MODEL); }
    catch (e) { throw fail(codeOf(e), explain(e)); }
    if (!model || typeof model.generateText !== 'function') throw fail('XHS_AI_UNAVAILABLE', 'XHS_AI_UNAVAILABLE');
    let raw;
    try { raw = await generateRaw(model, SYSTEM_PROMPT, buildUser(req)); }
    catch (e) { throw fail(codeOf(e), explain(e)); }
    const text = extractText(raw);
    if (!text) throw fail('AI_BAD_OUTPUT', 'AI_BAD_OUTPUT');
    return normalize(parseJson(text), req);
  }
  function pickPath(res) {
    if (!res) return '';
    if (typeof res === 'string') return res;
    return res.tempFilePath || res.filePath || res.path || res.apFilePath || (res.data && pickPath(res.data)) || '';
  }
  async function saveImage(dataUrl) {
    if (!canSave()) {
      return {
        ok: false,
        reason: 'no-xhs',
        message: '浏览器预览不能保存到相册',
        preview: '当前是浏览器预览，没有写入相册。在小红书小工具里会保存到系统相册。',
      };
    }
    const x = getXhs();
    const full = String(dataUrl || '');
    const base64 = full.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
    if (!base64) return { ok: false, message: '图片生成失败，请稍后重试', preview: '没有拿到图片数据' };
    const fileName = 'tarot-journey.png';
    try {
      const written = await invoke(x.writeTempFile.bind(x), {
        fileName,
        filePath: fileName,
        path: fileName,
        data: base64,
        base64,
        dataUrl: full,
        encoding: 'base64',
      }, 12000);
      const filePath = pickPath(written) || fileName;
      await invoke(x.saveImageToPhotosAlbum.bind(x), { filePath, tempFilePath: filePath }, 12000);
      return { ok: true, message: '已保存到相册 ✦' };
    } catch (e) {
      const s = explain(e);
      if (/auth|deny|permission|权限|authorize|album|privacy/i.test(s)) {
        return { ok: false, reason: 'permission', message: '需要相册权限后再试', preview: '系统没有允许保存到相册。请在小红书里打开相册权限后重试。' };
      }
      return { ok: false, reason: 'save-failed', message: '当前无法写入相册', preview: '没有保存到相册。可以稍后再试。' };
    }
  }
  async function shareText(text) {
    const body = String(text || '').trim();
    if (!body) return { ok: false, message: '当前环境无法分享' };
    const x = getXhs();
    const shareFn = x && (x.share || x.shareAppMessage);
    if (typeof shareFn === 'function') {
      try {
        await invoke(shareFn.bind(x), { title: '塔罗显化之旅', content: body, text: body }, 12000);
        return { ok: true, message: '已打开分享' };
      } catch (e) {
        if (/cancel|取消|abort/i.test(explain(e))) return { ok: false, message: '已取消分享' };
      }
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(body);
        return { ok: true, message: '解读文案已复制' };
      } catch (e) { /* 剪贴板被拒绝时不假装成功 */ }
    }
    return { ok: false, message: '当前环境无法分享' };
  }

  window.TAROT_XHS = {
    MODEL,
    aiReady,
    canSave,
    completeReading,
    saveImage,
    shareText,
    _test: { codeOf, normalize, extractText, parseJson },
  };
})();
