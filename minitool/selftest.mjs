import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const root = new URL('.', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, root), 'utf8');

function boot() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    navigator: {},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('package/reading-pack.js'), context, { filename: 'reading-pack.js' });
  vm.runInContext(read('package/platform.js'), context, { filename: 'platform.js' });
  return context;
}

const good = {
  title: '从犹豫走向开工',
  answer: '关于新事业，牌面的倾向是先用已有技能迈出一小步，方向会在行动里变清楚。',
  cards: [
    { keyword: '内在探索', reading: '隐士说明你过去把答案放在安静里寻找，这段沉淀仍然是你出发的根，而不是白白停下的时间。' },
    { keyword: '重新希望', reading: '星星落在现在，提醒你把想做的事写成看得见的一小步，而不是继续等待一个完美时机才允许自己开始。' },
    { keyword: '更大舞台', reading: '世界落在未来。如果沿着这个方向走，你可能逐渐把零散尝试收成一个完整阶段。这是倾向，不是定局。' },
  ],
  synthesis: '隐士把你留在内在探索里，星星要求你把希望写成行动，世界则提示前面可能出现一个更完整的阶段。转折点就是你愿意迈出可见的一小步。',
  actions: ['今天：写下最想验证的一件事。', '本周：找一位同行聊二十分钟。', '持续：每周复盘一次投入与收获。'],
  reflect: '如果不考虑别人的眼光，你会怎么选？',
  affirmation: '我正在把热爱做成事业。',
  manifest_cn: '创造者',
  creator_message: '创造者看见你已有的光，邀请你亲手把下一步做成结果。',
};

const req = {
  question: '我现在应该勇敢开始新的事业吗？',
  theme: 'career',
  cards: [
    { position: 'past', numeral: 'IX', name_cn: '隐士', name_en: 'THE HERMIT' },
    { position: 'present', numeral: 'XVII', name_cn: '星星', name_en: 'THE STAR' },
    { position: 'future', numeral: 'XXI', name_cn: '世界', name_en: 'THE WORLD' },
  ],
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ctx = boot();
const api = ctx.TAROT_XHS;
const pack = ctx.TAROT_READING_PACK;
assert(pack.SYSTEM_PROMPT.includes('简体中文'), 'prompt keeps simplified-Chinese rule');
assert(pack.SYSTEM_PROMPT.includes('显化宣言'), 'prompt keeps affirmation rule');
assert(!/https?:\/\//.test(pack.SYSTEM_PROMPT), 'prompt has no URL');
assert(api.aiReady() === false, 'browser without xhs is not AI-ready');

const saved = await api.saveImage('data:image/png;base64,aGk=');
assert(saved.ok === false, 'browser save must not succeed');
assert(!/已保存/.test(saved.message), 'browser save must not claim success');
assert(/浏览器预览/.test(saved.message), 'browser save explains the preview limit');

const shareMiss = await api.shareText('一段解读');
assert(shareMiss.ok === false, 'share without clipboard or xhs fails honestly');

ctx.xhs = {
  AI: { createModel() { const e = new Error('no'); e.code = 'AI_NOT_ALLOWED'; throw e; } },
};
let denied = null;
try { await api.completeReading(req); } catch (e) { denied = e; }
assert(denied && denied.code === 'AI_NOT_ALLOWED', 'whitelist refusal is visible to the fallback');

ctx.xhs = {
  AI: { createModel() { return { generateText(arg) { arg.success('不是 JSON'); } }; } },
};
let bad = null;
try { await api.completeReading(req); } catch (e) { bad = e; }
assert(bad && bad.code === 'AI_BAD_OUTPUT', 'unusable model text falls back');

let calls = 0;
ctx.xhs = {
  AI: {
    createModel() {
      return {
        generateText(arg) {
          calls += 1;
          if (arg.messages) throw new TypeError('invalid argument');
          arg.success(JSON.stringify(good));
        },
      };
    },
  },
};
const viaString = await api.completeReading(req);
assert(calls === 2, 'argument mismatch retries once');
assert(viaString.answer && viaString.cards.length === 3 && viaString.manifest_cn === '创造者', 'string payload still parses');

ctx.xhs = {
  AI: {
    createModel() {
      return {
        generateText(arg) {
          const copy = Object.assign({}, good, {
            answer: '这是一段故意写得很长的回答，用来确认超字数会被收束到五十个字以内，不能把整段原样交给页面。',
            affirmation: '我不再焦慮',
            title: '這個標題會被轉成簡體並且收短一些呀',
          });
          setTimeout(() => arg.success(JSON.stringify(copy)), 10);
        },
      };
    },
  },
};
const cleaned = await api.completeReading(req);
assert([...cleaned.answer].length <= 50, 'answer is clipped');
assert(!/焦虑|焦慮/.test(cleaned.affirmation), 'negative affirmation is replaced');
assert(cleaned.affirmation.includes('事业'), 'fallback affirmation stays on theme');
assert(!cleaned.title.includes('這') && !cleaned.title.includes('個'), 'mapped traditional characters are simplified');

ctx.xhs = {
  AI: {
    createModel() {
      return {
        generateText(arg) {
          const copy = Object.assign({}, good, { synthesis: good.synthesis + '另外圣杯王牌也在提醒你。' });
          arg.success({ text: JSON.stringify(copy) });
        },
      };
    },
  },
};
let wrong = null;
try { await api.completeReading(req); } catch (e) { wrong = e; }
assert(wrong && wrong.code === 'AI_BAD_OUTPUT', 'a card the user did not draw is rejected');

let albumPath = '';
ctx.xhs = {
  writeTempFile(arg) { setTimeout(() => arg.success({ tempFilePath: 'tmp/tarot.png' }), 5); },
  saveImageToPhotosAlbum(arg) {
    albumPath = arg.filePath;
    setTimeout(() => arg.success({ errMsg: 'saveImageToPhotosAlbum:ok' }), 5);
  },
};
const album = await api.saveImage('data:image/png;base64,aGk=');
assert(album.ok === true && /已保存到相册/.test(album.message), 'xhs album save reports success');
assert(albumPath === 'tmp/tarot.png', 'album save uses the temp path from writeTempFile');

ctx.xhs.saveImageToPhotosAlbum = (arg) => arg.fail({ errMsg: 'saveImageToPhotosAlbum:fail auth deny' });
const deniedAlbum = await api.saveImage('data:image/png;base64,aGk=');
assert(deniedAlbum.ok === false && /相册权限/.test(deniedAlbum.message), 'permission denial is not a success');

const app = read('package/app.js');
const html = read('package/index.html');
assert(!app.includes('fetch(') && !html.includes('onclick='), 'package entry has no fetch or inline handler');
assert(html.includes('reading-pack.js') && html.includes('platform.js'), 'platform scripts are external');

console.log('selftest ok');
void pathToFileURL;
