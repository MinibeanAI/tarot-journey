#!/usr/bin/env python3
"""Build the Xiaohongshu minitool package and zip. Does not modify public/ or worker/."""
import json
import re
import shutil
import subprocess
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
WORKER = ROOT / "worker" / "index.js"
SRC_PLATFORM = Path(__file__).resolve().parent / "platform.js"
OUT = Path(__file__).resolve().parent / "package"
ZIP_PATH = Path(__file__).resolve().parent / "tarot-journey-xhs.zip"

ALLOW_EXT = {".html", ".css", ".js", ".webp", ".png", ".jpg", ".jpeg", ".gif", ".woff", ".woff2", ".json"}
FIRST_SCREEN = {"bg_home_p.jpg": "bg_home.webp", "moon.png": "moon.webp"}

# Referenced by the page or by template fallbacks. Portrait duplicates that the UI never loads are omitted.
KEEP_RASTER = {
    "bg_home_p.jpg", "moon.png", "bg_tower_alt.jpg", "bg_past.jpg", "bg_present.jpg", "bg_home.jpg",
    "bg_present_p.jpg", "bg_future.jpg", "bg_past_p.jpg", "bg_future_p.jpg",
    "theme_career.jpg", "theme_wealth.jpg", "theme_love.jpg", "theme_self.jpg",
}


def run(cmd):
    subprocess.run(cmd, check=True)


def extract_pack():
    text = WORKER.read_text(encoding="utf-8")
    prompt = re.search(r"const SYSTEM_PROMPT = `([\s\S]*?)`;\n", text)
    t2s = re.search(r"const T2S = (\{[\s\S]*?\});\n", text)
    if not prompt or not t2s:
        sys.exit("failed to read SYSTEM_PROMPT / T2S from worker/index.js")
    prompt_s = prompt.group(1)
    if "deepseek.com" in prompt_s or "api.openai" in prompt_s or "KEY" in prompt_s:
        sys.exit("system prompt unexpectedly contains a URL or key")
    mapping = json.loads(t2s.group(1))
    return prompt_s, mapping


def convert_image(src: Path, dest: Path, kind: str):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if kind == "card":
        vf, q = "scale='min(560,iw)':-2", "60"
    elif kind == "moon":
        vf, q = "scale=iw:-2", "82"
    else:
        vf, q = "scale='min(900,iw)':-2", "62"
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src), "-vf", vf,
        "-c:v", "libwebp", "-quality", q, "-compression_level", "6",
        str(dest),
    ])


def patch_app(src: str) -> str:
    src = src.replace(
        """/* ---------- Test / demo params ----------
   ?demo=1  -> fixed cards IX / XVII / XXI (matches reference)
   ?fail=1  -> first AI reading call fails (to show error + retry)
   ?seed=N  -> deterministic random draws                          */
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
let failOnce = params.has('fail');
""",
        """/* Tarot Journey minitool build. No background audio, no self-hosted API.
   ?demo=1 fixed cards; ?template=1 skip platform AI; ?seed=N deterministic shuffle. */
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
""",
    )
    old_bgm = """/* ---------- Home ---------- */
/* background music: CC0 "Soft Piano Emotional 1" by Tozan (see assets/MUSIC_LICENSE.md) */
const BGM = (() => {
  const el = new Audio('assets/bgm_soft_piano_emotional1.mp3'); el.loop = true; el.preload = 'none'; el.volume = 0;
  const VOL = .35; let fadeT = 0, unlocked = false;
  const fade = (to, ms, done) => {
    clearInterval(fadeT); const from = el.volume, t0 = performance.now();
    fadeT = setInterval(() => { const u = Math.min(1, (performance.now() - t0) / ms); el.volume = from + (to - from) * u; if (u >= 1) { clearInterval(fadeT); done && done(); } }, 40);
  };
  const play = () => { if (!S.music || !unlocked || document.hidden) return; const pr = el.play(); if (pr && pr.catch) pr.catch(() => {}); fade(VOL, 1500); };
  const pause = () => fade(0, 600, () => el.pause());
  const unlock = () => { if (unlocked) return; unlocked = true; play(); };
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInterval(fadeT); el.volume = 0; el.pause(); } else play(); });
  return { el, play, pause, unlock };
})();
$('#musicBtn').addEventListener('click', (e) => {
  S.music = !S.music; e.currentTarget.setAttribute('aria-pressed', S.music);
  if (S.music) { BGM.unlock(); BGM.play(); } else BGM.pause();
  toast(S.music ? '背景音乐 已开启' : '背景音乐 已关闭');
});
"""
    if old_bgm not in src:
        sys.exit("BGM block not found")
    src = src.replace(old_bgm, """/* ---------- Home ---------- */
/* Minitool build has no background music (package cannot include audio). */
const BGM = { play() {}, pause() {}, unlock() {} };
""")
    src = src.replace(
        "    box.classList.remove('show'); box.onclick = null;\n",
        "    box.classList.remove('show');\n    if (box._intro) { box.removeEventListener('click', box._intro); box._intro = null; }\n",
    )
    src = src.replace(
        "  box.onclick = next;\n",
        "  if (box._intro) box.removeEventListener('click', box._intro);\n  box._intro = next;\n  box.addEventListener('click', next);\n",
    )
    start = src.find("/* ---------- AI reading ----------")
    end = src.find("let loadTimer;")
    if start < 0 or end < 0:
        sys.exit("AI reading block not found")
    src = src[:start] + AI_BLOCK + src[end:]
    src = src.replace(
        """function startReading() {
  S.manifest = pickManifest(S.cards, S.theme);
  go('loading');
  $('#loadBox').hidden = false; $('#errBox').hidden = true;
  const subs = ['塔顶的星光正在汇聚…', '正在读取过去、现在与未来的线索…', '为你生成第 23 张显化牌…'];
""",
        """function startReading() {
  S.manifest = pickManifest(S.cards, S.theme);
  go('loading');
  $('#loadBox').hidden = false; $('#errBox').hidden = true;
  const aiOn = !!(window.TAROT_XHS && window.TAROT_XHS.aiReady && window.TAROT_XHS.aiReady());
  $('#loadTitle').textContent = aiOn ? 'AI 正在连接你的三张牌' : '正在整理你的三张牌';
  const subs = aiOn
    ? ['塔顶的星光正在汇聚…', '正在读取过去、现在与未来的线索…', '为你生成第 23 张显化牌…']
    : ['正在对照牌义…', '正在串起过去、现在与未来…', '正在写好你的显化宣言…'];
""",
    )
    share_start = src.find("/* ---------- Share ---------- */")
    save_canvas = src.find("/* ---------- Save image (canvas) ----------")
    if share_start < 0 or save_canvas < 0 or save_canvas < share_start:
        sys.exit("share block not found")
    src = src[:share_start] + SHARE_BLOCK + src[save_canvas:]
    note = src.find("/* Save image → photo album.")
    ua = src.find("const UA = navigator.userAgent || '';\n")
    share_key = src.find("function shareKey()")
    if ua < 0 or share_key < 0:
        sys.exit("save prelude not found")
    start = note if 0 <= note < ua else ua
    src = src[:start] + "const shareImg = { key: '', p: null };\n" + src[share_key:]
    overlay = src.find("function showSaveOverlay")
    home_call = src.find('\ngo("home"')
    if overlay < 0 or home_call < 0:
        sys.exit("save overlay block not found")
    src = src[:overlay] + OVERLAY_BLOCK + src[home_call:]
    src = src.replace(".jpg", ".webp")
    for bad in ("fetch(", "XMLHttpRequest", "new Audio", ".mp3", "onclick"):
        if bad in src:
            sys.exit(f"patched app.js still contains {bad}")
    for needle, expect in (("function prepareShareImage", 1), ("function renderShareCanvas", 1), ("const shareImg", 1), ("function xhsAiReading", 1), ("function templateReading", 1), ("const esc ", 1), ("const sleep ", 1)):
        if src.count(needle) != expect:
            sys.exit(f"{needle} count {src.count(needle)} != {expect}")
    return src


AI_BLOCK = r"""/* ---------- Reading ----------
   Platform AI only: window.xhs.AI.createModel('deepseek-v4-flash').generateText (non-streaming).
   Any miss (no bridge, AI_NOT_ALLOWED, quota, bad JSON) falls back to the local template.
   ?template=1 skips the platform call so a normal browser can preview the full flow. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const DEFAULT_QUOTE = '你不再等待一个确定的答案，<br>而是开始创造答案。';
const MIN_LOADING_MS = 1500;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SUIT_DOMAIN = { wands: '权杖·行动与热情', cups: '圣杯·情感与关系', swords: '宝剑·思考与沟通', pentacles: '星币·现实与资源' };
const THEME_FALLBACK = {
  career: { acts: ['今天：写下「{f}」里你最想验证的一件事。', '本周：找一位同行聊 20 分钟，问一个具体问题。', '持续：每周复盘一次投入与收获，再调整方向。'], reflect: '如果不考虑别人的眼光，你会怎么选？' },
  wealth: { acts: ['今天：记下今天的每一笔支出，标出可省项。', '本周：为「{f}」设一个具体金额和截止日。', '持续：每月底复盘一次收支，微调下月计划。'], reflect: '这笔钱，你真正想用它换回什么？' },
  love:   { acts: ['今天：写下这段关系里你最在意的一个瞬间。', '本周：用「我感到……」说出一次自己的需要。', '持续：观察两周对方的回应，再决定投入多少。'], reflect: '在这段关系里，你最想被怎样对待？' },
  self:   { acts: ['今天：留十分钟独处，只写下此刻的感受。', '本周：做一件让身体放松的小事，比如散步。', '持续：每晚记一件今天做到的小事。'], reflect: '此刻的你，最需要被自己怎样照顾？' },
  custom: { acts: ['今天：把「{f}」拆成一个能马上做的小步骤。', '本周：收集两条可靠信息，再做判断。', '持续：每周回看一次，记录心里的变化。'], reflect: '如果答案已经在你心里，它会是什么？' },
};
function templateReading(question, theme, cards) {
  const th = THEMES[theme || 'custom'], fb = THEME_FALLBACK[theme || 'custom'] || THEME_FALLBACK.custom;
  const [a, b, c] = cards, F = qFocus(question) || th.focus;
  const trim = s => String(s).replace(/[。！]$/, '');
  const dom = x => x.minor ? SUIT_DOMAIN[x.suit] : '大阿卡纳·人生课题';
  const cardsOut = cards.map((x, i) => ({ position: POS[i].cn, name: x.cn, keyword: x.kw, reading: `${x.cn}（${dom(x)}）：${x[POS[i].key]}` }));
  const answer = `关于「${F}」，牌面的倾向是：从「${a.kw}」走到「${b.kw}」，此刻的关键在于${trim(b.apply)}。`;
  const synthesis = `${a.cn}说明过去的「${a.kw}」把你带到了今天；${b.cn}点出此刻的课题——${trim(b.apply)}；如果沿着这个方向走，${c.cn}提示未来可能逐渐出现「${c.kw}」的样子。这是倾向，不是定局，选择权一直在你手里。`;
  const actions = fb.acts.map(x => x.replace('{f}', F));
  return {
    source: 'template', notice: 'AI 暂时繁忙，以下为基础解读', title: `从${a.kw}到${c.kw}`,
    journey: `「${a.kw} → ${b.kw} → ${c.kw}」`, answer, cards: cardsOut, synthesis, actions, reflect: fb.reflect,
    quote: S.manifest.msg, creatorMsg: '', affirm: th.affirm,
  };
}
async function xhsAiReading(question, theme, cards) {
  const api = window.TAROT_XHS;
  if (!api || typeof api.completeReading !== 'function') {
    const err = new Error('XHS_AI_UNAVAILABLE'); err.code = 'XHS_AI_UNAVAILABLE'; throw err;
  }
  const data = await api.completeReading({
    question: question.slice(0, 120),
    theme: theme || 'custom',
    cards: cards.slice(0, 3).map((c, i) => ({
      position: POS[i].key, position_cn: POS[i].cn, name_cn: c.cn, name_en: c.en, numeral: c.roman,
    })),
  });
  const th = THEMES[theme || 'custom'];
  const picked = manifestByCn(data.manifest_cn); if (picked) S.manifest = picked;
  const msg = String(data.creator_message || '').trim();
  const actions = Array.isArray(data.actions) ? data.actions.filter(Boolean).slice(0, 3).map(x => esc(String(x))) : [];
  const aff = String(data.affirmation || '').trim().replace(/^显化宣言[：:]\s*/, '');
  return {
    source: 'ai', model: data.model || 'deepseek-v4-flash',
    title: String(data.title || '').trim(), journey: `「${cards.map(c => c.kw).join(' → ')}」`, actions,
    answer: String(data.answer).trim(), synthesis: String(data.synthesis).trim(), reflect: String(data.reflect || '').trim(),
    cards: (data.cards || []).slice(0, 3).map((c, i) => ({
      position: POS[i].cn, name: cards[i].cn, keyword: String((c && c.keyword) || cards[i].kw).trim(), reading: String((c && c.reading) || '').trim(),
    })),
    quote: msg ? esc(msg) : S.manifest.msg, creatorMsg: msg, affirm: aff ? `显化宣言：${aff}` : th.affirm,
  };
}
function noticeFor(code) {
  const c = String(code || '');
  if (c === 'AI_NOT_ALLOWED') return '当前账号未开通平台 AI，以下为基础解读';
  if (c === 'AI_QUOTA') return '今日的平台 AI 次数已用完，以下为基础解读';
  if (c === 'XHS_AI_UNAVAILABLE' || c === 'template preview') return '当前未连接小红书 AI，以下为基础解读';
  return 'AI 暂时不可用，以下为基础解读';
}
async function generateReading(question, theme, cards) {
  const t0 = Date.now();
  let r;
  try {
    if (params.has('template')) throw Object.assign(new Error('template preview'), { code: 'template preview' });
    r = await xhsAiReading(question, theme, cards);
  } catch (e) {
    const code = (e && (e.code || e.message)) || 'AI_FAILED';
    console.info('[tarot] platform AI unavailable, using template:', code);
    r = templateReading(question, theme, cards);
    r.notice = noticeFor(code);
  }
  const wait = (r.source === 'ai' ? MIN_LOADING_MS : 700) - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  return r;
}

"""

SHARE_BLOCK = r"""/* ---------- Share (text only; no site URL, no file download) ---------- */
$('#shareBtn').addEventListener('click', async () => {
  const text = `我在「塔罗显化之旅」抽到了 ${S.cards.map(c => c.cn).join('、')}，第 23 张显化牌是「${S.manifest.cn}」✦`;
  const api = window.TAROT_XHS;
  if (!api || typeof api.shareText !== 'function') { toast('当前环境无法分享'); return; }
  try {
    const r = await api.shareText(text);
    toast((r && r.message) || '当前环境无法分享');
  } catch (e) { toast('当前环境无法分享'); }
});

"""

OVERLAY_BLOCK = r"""function showSaveOverlay(dataUrl, caption) {
  let ov = $('#saveOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'saveOverlay'; ov.className = 'save-ov';
    ov.innerHTML = '<button type="button" class="save-ov-x" aria-label="关闭">×</button><div class="save-ov-body"><img alt="显化牌图片"><p></p></div>';
    document.body.appendChild(ov);
    const close = () => ov.classList.remove('show');
    ov.querySelector('.save-ov-x').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
  }
  ov.querySelector('img').src = dataUrl;
  ov.querySelector('p').textContent = caption || '请在小红书小工具内保存到相册';
  ov.classList.add('show');
}
$('#saveBtn').addEventListener('click', () => {
  const btn = $('#saveBtn');
  if (btn.disabled) return;
  btn.disabled = true; const old = btn.textContent; btn.textContent = '正在生成图片…';
  prepareShareImage().then(async (img) => {
    const api = window.TAROT_XHS;
    if (!api || typeof api.saveImage !== 'function') {
      showSaveOverlay(img.dataUrl, '当前是浏览器预览，没有写入相册。');
      toast('浏览器预览不能保存到相册');
      return;
    }
    const r = await api.saveImage(img.dataUrl);
    if (r && r.ok) toast(r.message || '已保存到相册 ✦');
    else {
      showSaveOverlay(img.dataUrl, (r && r.preview) || '没有保存到相册');
      toast((r && r.message) || '当前无法写入相册');
    }
  }).catch(e => { console.error(e); toast('图片生成失败，请稍后重试'); })
    .finally(() => { btn.disabled = false; btn.textContent = old; });
});

"""


def patch_html(html: str) -> str:
    html = re.sub(r'\s*<link rel="icon" href="data:image/svg\+xml[^>]*>\n', '\n<link rel="icon" href="moon.webp">\n', html)
    html = re.sub(r'\s*<button class="icon-btn music"[\s\S]*?</button>\n', '\n', html)
    html = html.replace('<script src="assets/creator-embed.js"></script>\n', '')
    html = html.replace(
        '<script src="app.js"></script>',
        '<script src="reading-pack.js"></script>\n<script src="platform.js"></script>\n<script src="app.js"></script>',
    )
    html = html.replace(
        '<p>解读生成失败，可能是网络波动。你的三张牌已为你保留。</p>',
        '<p>解读没有完成。你的三张牌已为你保留，可以再试一次。</p>',
    )
    html = html.replace(
        '<p class="proto-note">解读由 AI 实时生成；离线时使用本地模板</p>',
        '<p class="proto-note">小红书内使用平台 AI；未开通或预览时使用基础解读</p>',
    )
    html = html.replace('.jpg', '.webp').replace('.png', '.webp')
    html = html.replace('url(assets/bg_home_p.webp)', 'url(bg_home.webp)')
    html = html.replace('src="assets/moon.webp"', 'src="moon.webp"')
    if html.count('<script') != html.count('<script src='):
        sys.exit('inline script detected in index.html')
    if 'onclick=' in html or 'http://' in html or 'https://' in html:
        sys.exit('index.html contains an inline handler or remote URL')
    if html.count('<html') != 1:
        sys.exit('expected a single html document')
    return html


def patch_css(css: str) -> str:
    css = css.replace(
        'url(assets/fonts/cinzel/cinzel-500-title.woff2)',
        'url(fonts/cinzel-500-title.woff2)',
    )
    css = css.replace(
        'url(assets/fonts/heading-cn/heading-cn-250.woff2)',
        'url(fonts/heading-cn-250.woff2)',
    )
    css += """
/* minitool: portrait container, reading stays left-aligned, save caption can wrap */
.reading, .reading .rd-para, .reading .rd-para p, .rd-card p, .act-list p, .rc-mean { text-align: left; }
.ritual-intro { pointer-events: none; }
.ritual-intro.show { pointer-events: auto; }
.save-ov-body p { white-space: normal; text-align: center; max-width: 18em; line-height: 1.6; letter-spacing: .06em; }
@media (max-height: 740px) {
  .q-panel { max-height: calc(100% - 16px); overflow: auto; }
  .theme-arch { overflow: auto; }
}
"""
    if 'http://' in css or 'https://' in css:
        sys.exit('styles.css contains a remote URL')
    return css


def copy_fonts():
    (OUT / "fonts").mkdir(parents=True, exist_ok=True)
    shutil.copy(PUBLIC / "assets/fonts/cinzel/cinzel-500-title.woff2", OUT / "fonts/cinzel-500-title.woff2")
    shutil.copy(PUBLIC / "assets/fonts/heading-cn/heading-cn-250.woff2", OUT / "fonts/heading-cn-250.woff2")
    wenkai_src = PUBLIC / "assets/fonts/wenkai"
    wenkai_dest = OUT / "assets/fonts/wenkai"
    wenkai_dest.mkdir(parents=True, exist_ok=True)
    shutil.copy(wenkai_src / "wenkai.css", wenkai_dest / "wenkai.css")
    for font in wenkai_src.glob("*.woff2"):
        shutil.copy(font, wenkai_dest / font.name)


def build_images():
    jobs = []
    assets = PUBLIC / "assets"
    for path in sorted(assets.iterdir()):
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        if path.name.startswith("card_"):
            jobs.append((path, OUT / "assets" / (path.stem + ".webp"), "card"))
        elif path.name in FIRST_SCREEN:
            jobs.append((path, OUT / FIRST_SCREEN[path.name], "scene" if path.suffix != ".png" else "moon"))
        elif path.name in KEEP_RASTER:
            jobs.append((path, OUT / "assets" / (path.stem + ".webp"), "scene"))
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = [pool.submit(convert_image, src, dest, kind) for src, dest, kind in jobs]
        for fut in as_completed(futs):
            fut.result()
    return len(jobs)


def write_pack(prompt, mapping):
    payload = json.dumps({"SYSTEM_PROMPT": prompt, "T2S": mapping}, ensure_ascii=False, separators=(",", ":"))
    (OUT / "reading-pack.js").write_text("window.TAROT_READING_PACK=" + payload + ";\n", encoding="utf-8")


def copy_scripts():
    for name in ("art-manifest.js", "manifest-art.js", "minor-pos.js"):
        text = (PUBLIC / "assets" / name).read_text(encoding="utf-8").replace(".jpg", ".webp")
        (OUT / "assets" / name).write_text(text, encoding="utf-8")
    shutil.copy(SRC_PLATFORM, OUT / "platform.js")


def audit():
    htmls = list(OUT.rglob("*.html"))
    if [p.relative_to(OUT).as_posix() for p in htmls] != ["index.html"]:
        sys.exit(f"zip entry must be the only index.html, found {htmls}")
    bad_types = []
    for path in OUT.rglob("*"):
        if path.is_dir():
            continue
        if path.suffix.lower() not in ALLOW_EXT:
            bad_types.append(path.relative_to(OUT).as_posix())
    if bad_types:
        sys.exit("disallowed files: " + ", ".join(bad_types))
    forbidden = ("fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "new Audio", ".mp3", "onclick=", "http://", "https://", "api.deepseek", "api.openai", "DEEPSEEK_API", "OPENAI_API")
    for path in OUT.rglob("*"):
        if path.suffix.lower() not in {".html", ".css", ".js", ".json"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for token in forbidden:
            if token in text:
                sys.exit(f"{path.relative_to(OUT)} contains {token}")
    index = (OUT / "index.html").read_text(encoding="utf-8")
    if "<script" in index and index.count("<script src=") != index.count("<script"):
        sys.exit("inline script in index.html")
    if not (OUT / "bg_home.webp").exists() or not (OUT / "moon.webp").exists():
        sys.exit("first-screen images missing from package root")
    if not list((OUT / "assets").glob("card_*.webp")):
        sys.exit("card images missing from assets/")
    # cards must not sit next to index.html
    if list(OUT.glob("card_*.webp")):
        sys.exit("card images must live under assets/")


def make_zip():
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(OUT.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(OUT).as_posix())
    names = zipfile.ZipFile(ZIP_PATH).namelist()
    if names.count("index.html") != 1 or any(n.endswith(".html") and n != "index.html" for n in names):
        sys.exit("zip html entry check failed")
    if any(Path(n).suffix.lower() not in ALLOW_EXT for n in names):
        sys.exit("zip contains a disallowed file type")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    (OUT / "assets").mkdir()
    prompt, mapping = extract_pack()
    write_pack(prompt, mapping)
    n = build_images()
    copy_fonts()
    copy_scripts()
    (OUT / "app.js").write_text(patch_app((PUBLIC / "app.js").read_text(encoding="utf-8")), encoding="utf-8")
    (OUT / "styles.css").write_text(patch_css((PUBLIC / "styles.css").read_text(encoding="utf-8")), encoding="utf-8")
    (OUT / "index.html").write_text(patch_html((PUBLIC / "index.html").read_text(encoding="utf-8")), encoding="utf-8")
    audit()
    make_zip()
    icon_dir = Path(__file__).resolve().parent / "upload"
    icon_dir.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "color=c=0x3b3672:s=192x192",
        "-i", str(PUBLIC / "assets/moon.png"),
        "-filter_complex", "[1:v]scale=118:118:force_original_aspect_ratio=decrease,format=rgba[m];[0:v][m]overlay=(W-w)/2:(H-h)/2",
        "-frames:v", "1", str(icon_dir / "icon-192.png"),
    ])
    size = ZIP_PATH.stat().st_size
    print(f"images {n}")
    print(f"package {sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file()) / 1024 / 1024:.2f} MB")
    print(f"zip {ZIP_PATH} {size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
