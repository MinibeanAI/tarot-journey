/* Tarot Journey · 塔罗显化之旅 — prototype (vanilla JS, no build) */
(() => {
'use strict';

/* ---------- Test / demo params ----------
   ?demo=1  -> fixed cards IX / XVII / XXI (matches reference)
   ?fail=1  -> first AI reading call fails (to show error + retry)
   ?seed=N  -> deterministic random draws                          */
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
let failOnce = params.has('fail');
let seed = params.has('seed') ? (+params.get('seed') || 1) : null;
const rand = () => {
  if (seed === null) return Math.random();
  seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646;
};

/* ---------- Data ---------- */
const THEMES = {
  career: { cn: '事业', example: '我现在应该勇敢开始新的事业吗？', prefix: '在事业上，', focus: '工作与发展', affirm: '显化宣言：我正在一砖一瓦，建造属于我的城堡。' },
  wealth: { cn: '财富', example: '我该如何打开新的收入机会？', prefix: '在财富与价值上，', focus: '收入与机会', affirm: '显化宣言：我值得丰盛，金钱正以轻松的方式流向我。' },
  love:   { cn: '爱情', example: '这段关系接下来会如何发展？', prefix: '在这段关系里，', focus: '关系与连接', affirm: '显化宣言：我先好好爱自己，也温柔地被爱着。' },
  self:   { cn: '自我', example: '我该如何找回内在的力量与方向？', prefix: '对你自己而言，', focus: '成长与方向', affirm: '显化宣言：我信任自己的节奏，正在成为想成为的人。' },
  custom: { cn: '', example: '', prefix: '', focus: '你关心的这件事', affirm: '显化宣言：我不再等待答案，我正在创造答案。' },
};
const POS = [
  { roman: 'I', cn: '过去', q: '什么正在影响现在的你？', key: 'past', bg: 'assets/bg_past_p.jpg', bgPos: '50% 100%' },
  { roman: 'II', cn: '现在', q: '现在你真正需要看见什么？', key: 'present', bg: 'assets/bg_present_p.jpg', bgPos: '50% 100%' },
  { roman: 'III', cn: '未来', q: '如果继续向前，会遇见怎样的自己？', key: 'future', bg: 'assets/bg_future_p.jpg', bgPos: '50% 100%' },
];
const ROMAN = ['0','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI','XXII'];
const TPL_BASES = [
  ['assets/theme_career.jpg','50% 40%'],['assets/theme_self.jpg','62% 45%'],['assets/bg_tower_alt.jpg','45% 40%'],
  ['assets/theme_love.jpg','50% 45%'],['assets/theme_wealth.jpg','50% 40%'],['assets/bg_present.jpg','45% 40%'],['assets/bg_home.jpg','58% 40%'],
];
// [en, cn, keyword, sym, past, present, future, apply]
const RAW = [
 ['THE FOOL','愚者','勇敢出发','feather','你曾经凭着一股天真的勇气出发，那份纯粹至今仍在推动你。','现在需要的不是完美计划，而是迈出第一步的轻盈。','前方是一段全新的旅程，你会在未知里遇见更自由的自己。','允许自己以新手的姿态开始，不必等一切都准备好'],
 ['THE MAGICIAN','魔术师','唤醒创造力','infinity','你早已拥有实现愿望所需的工具，只是曾经低估了它们。','此刻，你手中的资源足够让想法落地，专注就是魔法。','你将把脑海中的想象，一点点变成真实可触的结果。','盘点你已经拥有的能力与资源，从最擅长的那一件开始'],
 ['THE HIGH PRIESTESS','女祭司','倾听直觉','moon','过去有一些没说出口的直觉，一直在悄悄引导你。','安静下来，你内心其实已经有答案，只是需要被听见。','你会越来越信任自己的直觉，它会带你走向对的地方。','先别急着向外寻求意见，留意那个反复出现的内心声音'],
 ['THE EMPRESS','皇后','丰盛滋养','flower','你曾被温柔地滋养过，那份丰盛感是你力量的根。','现在请先照顾好自己，丰盛会从被好好对待的你身上生长。','你播下的种子将开花结果，生活会变得丰盈而柔软。','用耐心与爱去培育它，而不是用焦虑去催促它'],
 ['THE EMPEROR','皇帝','建立秩序','crown','过去的经历教会你规则与边界，也塑造了你的坚定。','此刻需要为自己建立清晰的结构与边界，稳住节奏。','你将成为自己生活的掌舵者，稳定而有力量。','给它定下明确的计划与边界，让行动变得可执行'],
 ['THE HIEROPHANT','教皇','寻找指引','key','你曾从传统与长辈那里获得过重要的信念。','现在适合向有经验的人请教，或回到你真正相信的价值。','你会找到属于自己的信念体系，并因此更加笃定。','找一位值得信赖的前辈聊聊，也问问自己真正相信什么'],
 ['THE LOVERS','恋人','忠于选择','heart','过去的一次重要选择，至今仍影响着你看待关系的方式。','此刻的关键是做出忠于内心的选择，而不是最安全的那个。','你将遇见与你价值相契合的人与事，连接会更加真实。','面临选择时，选那个让你更像自己的选项'],
 ['THE CHARIOT','战车','意志前行','arrow','你曾凭借意志力穿越困难，那份冲劲仍在你身上。','现在需要把分散的力量收拢，朝一个方向坚定前进。','你会掌控方向，穿越阻碍，抵达你设定的目的地。','确定一个方向后全力推进，不要被两边的声音拉扯'],
 ['STRENGTH','力量','温柔的力量','flame','你曾用温柔驯服过内心的恐惧，那是真正的力量。','此刻不需要硬撑，温柔而坚定地对待自己就够了。','你会发现自己比想象中更有韧性，也更从容。','以温柔代替强迫，用耐心面对它带来的不安'],
 ['THE HERMIT','隐士','内在探索','lantern','也许你不是迷路了，而是正在寻找自己的答案。','现在请给自己一段独处的时间，答案在安静处发光。','你将在沉淀之后，带着更清晰的内在智慧重新出发。','先暂停向外比较，给自己一段安静梳理的时间'],
 ['WHEEL OF FORTUNE','命运之轮','顺势转变','wheel','过去的一次转折，把你带到了今天的位置。','命运的齿轮正在转动，这是一个适合顺势而为的时机。','新的循环即将开始，好运会在你行动时出现。','留意最近出现的机会与巧合，它们可能就是转机'],
 ['JUSTICE','正义','看清真相','scales','你过去做出的选择，正在带来相应的结果。','此刻需要诚实地衡量利弊，做出公正而清醒的决定。','你付出的努力会得到公平的回应，一切会归于平衡。','把事实与情绪分开，列出真实的利弊再做决定'],
 ['THE HANGED MAN','倒吊人','换个视角','drop','过去的一段停滞，其实让你看见了平时看不见的东西。','暂停不是失败，换一个角度，问题会出现新的答案。','放下执念之后，你会迎来意想不到的转化。','试着从相反的角度看待它，卡住的地方也许正是出口'],
 ['DEATH','死神','告别与新生','hourglass','某个阶段的结束，曾经让你痛，也让你蜕变。','是时候放下已经不适合你的东西，为新的开始腾出空间。','旧的篇章合上后，一个崭新的你将会诞生。','勇敢结束消耗你的部分，空出来的位置会迎来新的可能'],
 ['TEMPERANCE','节制','寻找平衡','cup','你曾在两种力量之间学会了调和与耐心。','此刻需要放慢节奏，在付出与休息之间找到平衡。','你会以平和的步调，慢慢调配出理想的生活。','不必一次到位，用稳定的小步调持续前进'],
 ['THE DEVIL','恶魔','挣脱束缚','eye','过去某种执念或习惯，曾悄悄限制了你的选择。','看见让你不自由的那根绳索，你随时可以松开它。','当你挣脱旧的束缚，会发现自己远比想象中自由。','诚实地看见是什么在牵绊你：恐惧、欲望还是习惯'],
 ['THE TOWER','高塔','破旧立新','tower','一次突如其来的变化，打破了你曾以为稳固的东西。','动荡也许正在发生，但倒塌的只是不再真实的部分。','在废墟之上，你会建起更坚固、更真实的自己。','别害怕计划被打乱，真正属于你的东西不会因此失去'],
 ['THE STAR','星星','重新看见希望','star','一段疗愈的经历，让你重新相信了美好。','你已经知道自己想去哪里，只是还没有允许自己相信它。','希望正在前方闪烁，你会被温柔地指引向愿望。','允许自己重新许愿，把想要的样子清楚地写下来'],
 ['THE MOON','月亮','穿越迷雾','moon','过去的不安与迷茫，曾让你看不清前方的路。','此刻的迷雾只是暂时的，跟随直觉一步步走就好。','你会穿过迷雾，发现那些曾令你害怕的东西其实无害。','不必急于看清全部，先分辨哪些担忧是真实的'],
 ['THE SUN','太阳','明亮绽放','sun','你曾有过闪闪发光的时刻，那份自信一直都在。','现在是让自己被看见的时候，大方地展现你的光。','前方阳光明媚，成功与喜悦会自然地来到你身边。','用最真实、最有热情的样子去面对它'],
 ['JUDGEMENT','审判','觉醒召唤','wing','过去的某段经历，正在召唤你重新审视自己。','内心有一个声音在呼唤你，是时候回应真正的使命了。','你将迎来一次觉醒，带着全新的理解重生。','回想你最初为什么想要它，让那份初心重新指引你'],
 ['THE WORLD','世界','走向更大世界','ring','你曾完整地走完过一段旅程，那份圆满给了你底气。','你已经走了很远，现在是整合一切、迈向下一阶段的时候。','一个新的阶段正在展开，你比想象中更接近想要的生活。','相信你已经准备好了，去拥抱更大的舞台'],
];
// Vector art per card: assets/art-manifest.js (generated by tools/process_art.py).
// Every Major Arcana + Creator uses a painted face; no numeral/symbol template.
const ART_FILES = window.TAROT_ART || {};
const ART_POS = window.TAROT_ART_POS || {};
const ART = {};
Object.keys(ART_FILES).forEach(n => { ART[n] = [ART_FILES[n], ART_POS[n] || '50% 42%']; });
// Ensure all 22 majors resolve even if manifest is missing a key (dev safety).
const SLUGS = ['fool','magician','high_priestess','empress','emperor','hierophant','lovers','chariot','strength','hermit','wheel','justice','hanged_man','death','temperance','devil','tower','star','moon','sun','judgement','world'];
SLUGS.forEach((slug, n) => { if (!ART[n]) ART[n] = [`assets/card_${slug}.jpg`, '50% 42%']; });
const DECK = RAW.map((r, n) => ({
  n, roman: ROMAN[n], en: r[0], cn: r[1], kw: r[2], sym: r[3],
  past: r[4], present: r[5], future: r[6], apply: r[7],
  art: ART[n], base: TPL_BASES[n % TPL_BASES.length],
}));
/* ---------- 56 Minor Arcana (upright) ---------- */
const MINOR_SUITS = [
  { key: 'wands', cn: '权杖', en: 'WANDS', sym: 'flame' },
  { key: 'cups', cn: '圣杯', en: 'CUPS', sym: 'heart' },
  { key: 'swords', cn: '宝剑', en: 'SWORDS', sym: 'arrow' },
  { key: 'pentacles', cn: '星币', en: 'PENTACLES', sym: 'flower' },
];
const MINOR_RANKS = [
  ['ACE', '王牌', 'A'], ['TWO', '二', 'II'], ['THREE', '三', 'III'], ['FOUR', '四', 'IV'], ['FIVE', '五', 'V'], ['SIX', '六', 'VI'], ['SEVEN', '七', 'VII'],
  ['EIGHT', '八', 'VIII'], ['NINE', '九', 'IX'], ['TEN', '十', 'X'], ['PAGE', '侍从', 'PAGE'], ['KNIGHT', '骑士', 'KNIGHT'], ['QUEEN', '王后', 'QUEEN'], ['KING', '国王', 'KING'],
];
// [关键词, 正位含义, 行动建议]
const MINOR_TXT = {
  wands: [
    ['新的火花', '一股新的热情与灵感正在点燃', '趁热情还在，马上迈出第一步'],
    ['眺望远方', '你站在起点规划更大的版图', '把心中的蓝图写下来，选一条路出发'],
    ['扬帆远望', '早先的努力开始向外延伸，机会在前方', '保持视野开阔，为下一阶段做好准备'],
    ['欢庆安定', '值得庆祝的稳定与归属感正在到来', '和重要的人分享这份喜悦'],
    ['良性竞争', '不同意见的碰撞正在激发你的潜能', '把冲突当成磨刀石，专注于成长而非输赢'],
    ['凯旋认可', '你的付出被看见，胜利与认可随之而来', '大方接受肯定，也记得感谢同行的人'],
    ['坚守立场', '你需要守住自己的阵地与信念', '面对压力时，坚定地说出你的立场'],
    ['迅速推进', '事情正以很快的速度向前推进', '抓住势头，快速回应，别让机会冷却'],
    ['坚韧守护', '经历考验后的你依然站着，韧性就是力量', '再坚持一下，同时守好自己的界限'],
    ['承担重任', '你肩上扛着许多责任，但终点已近', '学会放下不属于你的担子，或请人分担'],
    ['好奇探索', '一个充满好奇的新消息或新尝试出现了', '像初学者一样去试，允许自己不完美'],
    ['勇往直前', '冒险精神正推动你大胆出发', '带着热情行动，但先看清方向'],
    ['自信温暖', '你散发着自信与温暖，吸引着周围的人', '用你的热情去点亮别人，也照顾好自己'],
    ['远见领导', '你有能力以远见带领局面', '定下愿景，带着大家一起实现它'],
  ],
  cups: [
    ['情感涌现', '新的爱与情感正在内心涌出', '敞开心，允许自己去爱和被爱'],
    ['心意相通', '一段相互吸引、彼此珍惜的连接正在形成', '真诚表达心意，让关系更靠近'],
    ['欢聚友谊', '友谊与庆祝带来温暖的支持', '约上朋友，一起分享生活的美好'],
    ['静心反思', '你对眼前的事物感到倦怠，需要向内看', '暂停一下，留意那些被你忽略的机会'],
    ['面对失落', '失落的情绪需要被承认，但仍有留下的美好', '允许自己难过，然后转身看看还拥有的'],
    ['温柔回忆', '美好的回忆与纯真的善意正在滋养你', '联系一位旧友，或重拾童年的热爱'],
    ['看清幻想', '许多选择摆在眼前，需要分辨真实与幻想', '列出选项，选那个最贴近现实的'],
    ['转身寻觅', '你准备离开不再滋养你的事物，去寻找更深的意义', '勇敢放下，向真正想要的方向走'],
    ['心愿成真', '满足与喜悦正在到来，心愿有望实现', '好好享受此刻，并心存感激'],
    ['圆满和谐', '家庭与情感的圆满和谐近在眼前', '珍惜身边的人，经营让你安心的关系'],
    ['温柔讯息', '一个关于情感或创意的温柔讯息出现了', '保持柔软与好奇，听听直觉的声音'],
    ['浪漫追寻', '你正带着理想与浪漫去追随心意', '跟随内心，同时把梦想落到行动'],
    ['共情疗愈', '你拥有深刻的共情与疗愈的力量', '先照顾自己的情绪，再去温暖别人'],
    ['情绪成熟', '你能在情绪的海洋中保持平衡与包容', '冷静而温和地处理感受，做稳定的支持者'],
  ],
  swords: [
    ['真相清明', '一个清晰的想法或真相正在穿透迷雾', '直面事实，用清晰的判断做决定'],
    ['暂缓抉择', '你处在两难之间，暂时闭上眼不去选择', '收集更多信息，诚实面对内心的倾向'],
    ['释放心痛', '一段心痛需要被承认，才能真正放下', '让眼泪流出来，疗愈从接纳开始'],
    ['休养生息', '身心需要休息与恢复', '给自己安排真正的休息，再重新出发'],
    ['放下输赢', '争执中的胜利未必值得，需衡量代价', '选择和解，而不是赢下每一场争论'],
    ['平静过渡', '你正离开动荡，驶向更平静的水域', '带着学到的经验，安心地往前走'],
    ['策略周旋', '需要智慧与策略来处理眼前的局面', '想清楚再行动，但保持诚实'],
    ['突破束缚', '限制多半来自心中的念头，你其实可以离开', '换个角度看问题，先松开一根绳子'],
    ['安抚焦虑', '夜里的担忧被放大了，现实没有那么糟', '把焦虑写下来，逐条面对它'],
    ['终结重生', '一段痛苦的循环走到了尽头，黎明在后', '接受结束，为新的开始腾出空间'],
    ['敏锐求知', '你充满好奇与警觉，渴望弄清真相', '多提问、多观察，保持思考的锐度'],
    ['果断出击', '你带着决心快速行动，冲向目标', '行动要快，但也要顾及他人的感受'],
    ['清醒独立', '你以清晰的边界与诚实的态度面对一切', '温和而坦率地说出真话'],
    ['理性权威', '理性与公正能帮你做出正确判断', '基于事实做决定，并为之负责'],
  ],
  pentacles: [
    ['丰盛机会', '一个关于财富、工作或健康的新机会出现了', '抓住这颗种子，用实际行动去种下它'],
    ['灵活平衡', '你在多件事之间灵活周转，保持平衡', '排好优先级，适应变化而不慌乱'],
    ['合作精进', '通过合作与专业技能，作品正在成形', '虚心听取意见，和伙伴一起打磨'],
    ['稳守资源', '你珍惜手中的资源，追求安全感', '守住重要的，同时别因害怕失去而封闭'],
    ['渡过难关', '暂时的匮乏与困难，但援手就在附近', '开口求助，温暖的门一直为你开着'],
    ['慷慨分享', '给予与接受之间正在形成良性的流动', '在能力范围内分享，也坦然接受帮助'],
    ['耐心等待', '投入已经开始生根，需要耐心等待收成', '评估进展，相信时间的力量'],
    ['专注技艺', '专注与勤奋正让你的技艺不断精进', '每天打磨一点，积累会带来改变'],
    ['自足优雅', '你靠自己的努力获得了富足与独立', '享受成果，也犒赏一下自己'],
    ['传承丰盛', '长久的稳定与家族的丰盛正在延续', '为长远打算，建立能传承的根基'],
    ['踏实学习', '一个值得认真学习的新机会摆在眼前', '从小处开始，脚踏实地地学'],
    ['稳步前行', '你以稳定可靠的节奏一步步推进', '坚持既定的计划，慢就是快'],
    ['务实滋养', '你用务实与温暖照顾好生活与身边的人', '打理好自己的生活，也照顾好身体'],
    ['稳健富足', '你拥有稳健经营与创造财富的能力', '用长期主义去经营你的事业与资源'],
  ],
};
MINOR_SUITS.forEach((su, si) => MINOR_RANKS.forEach((rk, ri) => {
  const [kw, m, ap] = MINOR_TXT[su.key][ri], num = String(ri + 1).padStart(2, '0');
  DECK.push({
    n: 100 + si * 14 + ri, minor: true, suit: su.key, roman: rk[2],
    en: `${rk[0]} OF ${su.en}`, cn: `${su.cn}${rk[1]}`, kw, sym: su.sym,
    past: `过去，${m}，这份经历仍在影响着你。`,
    present: `此刻，${m}。`,
    future: `接下来，${m}，它会带你走向新的阶段。`,
    apply: ap, meaning: m,
    art: [`assets/card_${su.key}_${num}.jpg`, '50% 42%'], base: TPL_BASES[ri % TPL_BASES.length],
  });
}));
/* 23rd card: random manifestation card from a pool (art list in assets/manifest-art.js) */
const MANIFESTS = [
  { slug: 'creator', cn: '创造者', en: 'THE CREATOR', meaning: '你不再等待答案，而是开始亲手创造答案。', msg: '你不再等待一个确定的答案，<br>而是开始创造答案。' },
  { slug: 'dreamweaver', cn: '织梦者', en: 'THE DREAMWEAVER', meaning: '把零散的愿望织成清晰的蓝图，梦想便有了形状。', msg: '你心里的那张蓝图，<br>正在一针一线变成现实。' },
  { slug: 'lightbearer', cn: '持光者', en: 'THE LIGHTBEARER', meaning: '你本身就是光，带着它前行，也照亮别人。', msg: '不必等别人点灯，<br>你手中的光已经足够照亮前路。' },
  { slug: 'voyager', cn: '启航者', en: 'THE VOYAGER', meaning: '风已经来了，现在是解开缆绳、驶向新海域的时候。', msg: '港口很安全，<br>但你生来是为了远航。' },
  { slug: 'gardener', cn: '培育者', en: 'THE GARDENER', meaning: '耐心浇灌每一颗种子，丰盛会在对的季节绽放。', msg: '你今天种下的每一颗小种子，<br>都会在未来开成一片花园。' },
  { slug: 'phoenix', cn: '重生者', en: 'THE PHOENIX', meaning: '旧的已经燃尽，你正从灰烬里展翅，成为更新的自己。', msg: '你经历的一切都没有白费，<br>它们正化作你重生的羽翼。' },
];
const MANIFEST_OK = window.TAROT_MANIFEST_ART || { creator: 'assets/card_creator.jpg' };
const MANIFEST_POOL = MANIFESTS.filter(m => MANIFEST_OK[m.slug]).map(m => ({ ...m, n: 22, roman: 'XXII', art: [MANIFEST_OK[m.slug], '50% 42%'] }));
const CREATOR = MANIFEST_POOL.find(m => m.slug === 'creator') || MANIFEST_POOL[0];
function pickManifest(cards) {
  if (params.has('manifest')) { const f = MANIFEST_POOL.find(m => m.slug === params.get('manifest')); if (f) return f; }
  let h = params.has('seed') ? (+params.get('seed') || 1) : Date.now();
  cards.forEach(c => { h = (Math.imul(h ^ (c.n + 1), 2654435761) + 0x9e3779b9) >>> 0; });
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return MANIFEST_POOL[(h >>> 0) % MANIFEST_POOL.length];
}

/* ---------- SVG ---------- */
const G = '#f3dca0';
const SYM = {
  sun:'<circle cx="50" cy="50" r="16"/><g>'+Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return `<line x1="${50+24*Math.cos(a)}" y1="${50+24*Math.sin(a)}" x2="${50+(i%2?32:38)*Math.cos(a)}" y2="${50+(i%2?32:38)*Math.sin(a)}"/>`}).join('')+'</g>',
  moon:'<path d="M62 18a34 34 0 1 0 0 64a27 27 0 1 1 0-64z"/><path d="M78 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
  star:'<path d="M50 8l7 35 35 7-35 7-7 35-7-35-35-7 35-7z"/><circle cx="50" cy="50" r="5"/>',
  lantern:'<path d="M42 22h16M45 22v-8h10v8M38 30h24l-4 40H42z"/><path d="M50 40c5 6 5 12 0 18c-5-6-5-12 0-18z"/><path d="M40 76h20"/>',
  ring:'<circle cx="50" cy="50" r="32"/><circle cx="50" cy="50" r="26" stroke-dasharray="2 4"/><path d="M50 30l3 14 14 3-14 3-3 14-3-14-14-3 14-3z"/>',
  feather:'<path d="M70 14C40 22 28 50 30 86M70 14c-4 24-16 44-38 60"/><path d="M40 60l12-2M36 72l10-1M46 46l14-4M54 34l12-5"/>',
  infinity:'<path d="M50 50c-10-14-30-14-30 0s20 14 30 0s30-14 30 0s-20 14-30 0z"/><path d="M50 18v14M50 68v14"/>',
  flower:'<circle cx="50" cy="48" r="8"/>'+[0,72,144,216,288].map(a=>`<ellipse cx="50" cy="30" rx="9" ry="14" transform="rotate(${a} 50 48)"/>`).join('')+'<path d="M50 62v26M50 76c-8-2-12-8-12-8"/>',
  crown:'<path d="M20 66l6-34 16 18 8-24 8 24 16-18 6 34z"/><path d="M20 76h60"/><circle cx="50" cy="24" r="3"/>',
  key:'<circle cx="50" cy="26" r="12"/><path d="M50 38v48M50 64h12M50 76h9"/>',
  heart:'<path d="M50 80C22 60 18 44 24 34c6-10 20-10 26 2c6-12 20-12 26-2c6 10 2 26-26 46z"/><path d="M50 18v8M44 22h12"/>',
  arrow:'<path d="M50 14v72M38 28l12-14 12 14"/><path d="M30 62l20 10 20-10"/><circle cx="50" cy="50" r="6"/>',
  flame:'<path d="M50 14c14 18 22 30 22 44a22 22 0 0 1-44 0c0-10 6-16 10-22c2 8 6 12 10 12c-2-12 0-24 2-34z"/>',
  wheel:'<circle cx="50" cy="50" r="32"/><circle cx="50" cy="50" r="8"/>'+[0,45,90,135].map(a=>`<line x1="50" y1="18" x2="50" y2="82" transform="rotate(${a} 50 50)"/>`).join(''),
  scales:'<path d="M50 14v70M34 84h32M22 30h56"/><path d="M22 30l-10 24h20zM78 30l-10 24h20z"/>',
  drop:'<path d="M50 16c12 18 22 30 22 42a22 22 0 0 1-44 0c0-12 10-24 22-42z"/><path d="M40 58a10 10 0 0 0 10 10"/>',
  hourglass:'<path d="M28 14h44M28 86h44M32 14c0 22 36 22 36 36s-36 14-36 36M68 14c0 22-36 22-36 36s36 14 36 36"/>',
  cup:'<path d="M28 22h44c0 22-8 34-22 34S28 44 28 22zM50 56v22M36 84h28"/><path d="M40 30c4 6 16 6 20 0"/>',
  eye:'<path d="M12 50c20-26 56-26 76 0c-20 26-56 26-76 0z"/><circle cx="50" cy="50" r="12"/><circle cx="50" cy="50" r="4"/>',
  tower:'<path d="M38 86V34l-4-6h32l-4 6v52zM34 28l16-16 16 16"/><path d="M46 50h8v12h-8zM30 86h40"/><path d="M70 16l-6 10 8-2-6 10"/>',
  wing:'<path d="M50 70C30 66 16 50 14 26c10 10 20 12 30 12c-6 6-6 14 6 32z"/><path d="M50 70c20-4 34-20 36-44c-10 10-20 12-30 12c6 6 6 14-6 32z"/><path d="M50 74v12"/>',
};
const symSvg = (k) => `<svg viewBox="0 0 100 100" fill="none" stroke="${G}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${SYM[k] || SYM.star}</svg>`;
const BACK_SVG = (() => {
  const tiny = (x,y,s) => `<path d="M${x} ${y-s}L${x+s*.3} ${y-s*.3}L${x+s} ${y}L${x+s*.3} ${y+s*.3}L${x} ${y+s}L${x-s*.3} ${y+s*.3}L${x-s} ${y}L${x-s*.3} ${y-s*.3}Z" fill="#e6cc8e" stroke="none"/>`;
  return `<svg viewBox="0 0 62 100" preserveAspectRatio="none" fill="none" stroke="#d9bd7e" stroke-width=".55">
  <rect x="6" y="6" width="50" height="88" rx="3" stroke-opacity=".55"/>
  <path d="M31 14L52 50L31 86L10 50Z" stroke-opacity=".45"/>
  <circle cx="31" cy="50" r="13"/><circle cx="31" cy="50" r="16.5" stroke-dasharray=".8 1.6"/>
  <path d="M31 33L33.6 47.4L48 50L33.6 52.6L31 67L28.4 52.6L14 50L28.4 47.4Z" fill="#e6cc8e" fill-opacity=".9" stroke="none"/>
  <path d="M31 40L32.4 48.6L41 50L32.4 51.4L31 60L29.6 51.4L21 50L29.6 48.6Z" fill="#fff6dc" stroke="none" transform="rotate(45 31 50)"/>
  <path d="M34 19a5 5 0 1 1 -6 0a4 4 0 1 0 6 0z" fill="#e6cc8e" stroke="none"/>
  <path d="M28 81a5 5 0 1 1 6 0a4 4 0 1 0 -6 0z" fill="#e6cc8e" stroke="none"/>
  ${tiny(12,13,2.2)}${tiny(50,13,2.2)}${tiny(12,87,2.2)}${tiny(50,87,2.2)}${tiny(18,50,1.4)}${tiny(44,50,1.4)}
  </svg>`;
})();

/* ---------- Card markup ---------- */
function artHtml(card) {
  // Always prefer painted art. Template (numeral+symbol) is last-resort only and must
  // NOT render a second roman numeral inside the art area (numeral lives in .tc-num only).
  if (card.art) return `<div class="tc-art" style="--img:url(${card.art[0]});--pos:${card.art[1]}"></div>`;
  return `<div class="tc-art tpl" style="--img:url(${card.base[0]});--pos:${card.base[1]}"><div class="tpl-sym">${symSvg(card.sym)}</div></div>`;
}
function faceHtml(card) {
  return `<div class="tface"><div class="tc-num">${card.roman}</div>${artHtml(card)}<div class="tc-en">${card.en}</div><div class="tc-cn">${card.cn}</div></div>`;
}
function flipCardHtml(card, flipped) {
  return `<div class="flipper"><div class="side back"><div class="tback">${BACK_SVG}</div></div><div class="side face">${card ? faceHtml(card) : ''}</div></div>`;
}

/* ---------- State ---------- */
const S = { screen: 'home', theme: null, question: '', cards: [null, null, null], strip: null, reading: null, creatorRevealed: false, music: true };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const navStack = [];

function go(name, opts = {}) {
  const prev = $('.screen.active');
  const next = $(`[data-screen="${name}"]`);
  if (!opts.noHistory && prev && prev !== next) navStack.push({ screen: S.screen });
  app.classList.toggle('back-nav', !!opts.back);
  $$('.screen').forEach(s => s.classList.remove('out-left'));
  if (prev && prev !== next) { prev.classList.remove('active'); prev.classList.add('out-left'); }
  if (prev === next) { next.classList.remove('active'); void next.offsetWidth; }
  S.screen = name;
  next.classList.add('active');
  if (name === 'final') $('#finalScroll').scrollTop = 0;
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- Back navigation (keeps drawn cards) ---------- */
function back() {
  const s = S.screen;
  if (s === 'theme') return go('home', { back: true, noHistory: true });
  if (s === 'question') return go('theme', { back: true, noHistory: true });
  if (s === 'pick') return go('question', { back: true, noHistory: true });
  if (s === 'reveal') { renderPick(); return go('pick', { back: true, noHistory: true }); }
}
$$('[data-back]').forEach(b => b.addEventListener('click', back));
$$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

/* ---------- Home ---------- */
/* background music: CC0 "Ethereal Loop" by wipics (see assets/MUSIC_LICENSE.md) */
const BGM = (() => {
  const el = new Audio('assets/bgm_ethereal_loop.mp3'); el.loop = true; el.preload = 'none'; el.volume = 0;
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

/* ---------- Theme -> Question (merged flow) ---------- */
const qInput = $('#qInput');
$$('[data-theme]').forEach(t => t.addEventListener('click', () => {
  S.theme = t.dataset.theme;
  const th = THEMES[S.theme];
  qInput.value = th.example;
  qInput.placeholder = '例如：' + (th.example || '我现在应该勇敢开始新的事业吗？');
  $('#themeChip').textContent = th.cn;
  const hint = $('#qHint'); hint.classList.remove('warn');
  hint.textContent = th.example ? '已为你填入示例问题，可直接修改' : '写下一个具体、真诚的问题，答案会更清晰';
  updateCount();
  resetDraw();
  go('question');
}));
function updateCount() { $('#qCount').textContent = qInput.value.length; }
qInput.addEventListener('input', () => { updateCount(); $('#qHint').classList.remove('warn'); });
$('#enterTower').addEventListener('click', () => {
  const q = qInput.value.trim();
  if (q.length < 2) {
    const h = $('#qHint'); h.textContent = '请先写下你的问题（至少 2 个字）'; h.classList.add('warn');
    qInput.focus(); return;
  }
  if (q !== S.question || drawnCount() === 3) resetDraw();   // a new question starts a fresh draw
  S.question = q;
  renderPick(); go('pick');
});

/* ---------- Motion helpers + particle FX (canvas, auto-stops when idle) ---------- */
const RMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const reduced = () => RMQ.matches;
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} };
const easeOut = u => 1 - Math.pow(1 - u, 3);
const easeIO = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function setIf(el, k, v) { if (el['_' + k] !== v) { el.style[k] = v; el['_' + k] = v; } }
const FX = (() => {
  const cv = document.createElement('canvas'); cv.className = 'fx-canvas'; cv.setAttribute('aria-hidden', 'true'); app.appendChild(cv);
  const ctx = cv.getContext('2d'); let W = 0, H = 0, dpr = 1, parts = [], raf = 0, last = 0;
  function size() { const r = app.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; }
  size(); addEventListener('resize', size);
  const COLORS = ['255,244,214', '255,228,170', '255,255,255', '226,214,255'];
  function rel(el) { const a = app.getBoundingClientRect(), b = el.getBoundingClientRect(); return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2, w: b.width, h: b.height }; }
  function spawn(x, y, o = {}) {
    if (reduced()) return;
    for (let i = 0; i < (o.n || 1); i++) {
      const a = Math.random() * 6.283, sp = (o.speed || .05) * (.3 + Math.random());
      parts.push({ x: x + (Math.random() - .5) * (o.jx || 0), y: y + (Math.random() - .5) * (o.jy || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 0), g: o.g ?? .00002,
        life: 0, max: (o.life || 700) * (.6 + Math.random() * .6), s: (o.size || 2.2) * (.5 + Math.random()), c: COLORS[(Math.random() * COLORS.length) | 0], star: Math.random() < (o.stars ?? .3) });
    }
    if (parts.length > 600) parts.splice(0, parts.length - 600);
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function tick(t) {
    const dt = Math.min(48, t - last); last = t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter';
    parts = parts.filter(p => (p.life += dt) < p.max);
    for (const p of parts) {
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy *= .985;
      const k = 1 - p.life / p.max, a = k * Math.min(1, p.life / 80);
      ctx.fillStyle = `rgba(${p.c},${a.toFixed(3)})`;
      if (p.star) {
        const s = p.s * 2.4 * k + 1; ctx.beginPath(); ctx.moveTo(p.x, p.y - s);
        ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y); ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s);
        ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y); ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * k + .4, 0, 6.283); ctx.fill();
        ctx.fillStyle = `rgba(${p.c},${(a * .22).toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 3 * k + 1, 0, 6.283); ctx.fill();
      }
    }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) ctx.clearRect(0, 0, W, H);
  }
  function burst(el, o = {}) { const c = rel(el); spawn(c.x, c.y + (o.dy || 0), { n: o.n || 60, speed: o.speed || .28, life: o.life || 1100, size: o.size || 2.6, g: .00012, stars: .45, jx: o.jx || 0, jy: o.jy || 0 }); }
  return { spawn, burst, rel };
})();

/* ---------- Draw screen: ONE shuffled fan strip, pick 3 into slots ----------
   Phases: intro (breathe pause) -> shuffle -> strip (swipe + tap to draw) -> ceremony (flip 3) */
const spread = $('#spread'), pickHint = $('#pickHint'), slotsEl = $('#slots');
const STEP_PX = 66;
const P = { els: [], pos: 0, phase: 'idle', run: 0, anim: null, drag: null, raf: 0, focusIdx: -1, busy: false, shufT0: 0 };
function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
S.mode = '22';
const pool = () => S.mode === '22' ? DECK.filter(c => !c.minor) : DECK;
document.querySelectorAll('#qMode [data-mode]').forEach(b => b.addEventListener('click', () => {
  if (S.mode === b.dataset.mode) return;
  S.mode = b.dataset.mode; resetDraw();
  document.querySelectorAll('#qMode [data-mode]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
}));
function resetDraw() { S.cards = [null, null, null]; S.strip = null; P.pos = 0; }
const drawnCount = () => S.cards.filter(Boolean).length;
function hint(txt, still) { pickHint.textContent = txt; pickHint.classList.toggle('done', !!still); }

function lay(d, t, bob) {
  const ad = Math.abs(d), sg = Math.sign(d), a1 = Math.min(ad, 1);
  const x = sg * (a1 * 86 + Math.max(0, ad - 1) * 50);   // wider fan (was 76/40)
  let y = Math.min(ad * ad * 6, 90) - (1 - a1) * 20;
  if (bob) y += Math.sin(t / 520) * 3.2 * (1 - a1);
  return { x, y, r: clamp(d * 6.5, -38, 38), s: Math.max(.62, 1.2 - a1 * .32 - Math.max(0, ad - 1) * .035) };
}
const tf = o => `translate3d(${o.x.toFixed(2)}px,${o.y.toFixed(2)}px,0) rotate(${o.r.toFixed(2)}deg) scale(${o.s.toFixed(3)})`;
const mix = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, r: a.r + (b.r - a.r) * u, s: a.s + (b.s - a.s) * u });

function makeStripEl(card) {
  const el = document.createElement('div');
  el.className = 'flip-card sc'; el._card = card;
  el.innerHTML = `<i class="sc-glow"></i>${flipCardHtml(null)}<i class="sc-dim"></i>`;
  el._glow = el.firstElementChild; el._dim = el.lastElementChild;
  return el;
}
function renderStrip(t) {
  const fi = Math.round(P.pos);
  P.els.forEach((el, i) => {
    if (el._v == null) el._v = i;
    if (el._v !== i) { el._v += (i - el._v) * .2; if (Math.abs(i - el._v) < .003) el._v = i; }   // smooth gap closing
    if (el._ap != null && el._ap < 1) el._ap = Math.min(1, el._ap + .07);                    // appear (returned card)
    const d = el._v - P.pos, ad = Math.abs(d);
    if (ad > 6.5) { if (!el._hid) { el.style.visibility = 'hidden'; el._hid = 1; } return; }
    if (el._hid) { el.style.visibility = ''; el._hid = 0; }
    const L = lay(d, t, true), ap = el._ap == null ? 1 : Math.max(0, el._ap);
    if (ap < 1) { L.y += (1 - ap) * 50; L.s *= .8 + .2 * ap; }
    el.style.transform = tf(L);
    setIf(el, 'opacity', ((ad > 4.5 ? Math.max(0, 1 - (ad - 4.5) / 2) : 1) * ap).toFixed(2));
    const z = 100 - Math.round(ad * 10); if (el._z !== z) { el.style.zIndex = z; el._z = z; }
    setIf(el._dim, 'opacity', (Math.min(ad, 1.6) * .3).toFixed(2));
    setIf(el._glow, 'opacity', Math.max(0, 1 - ad * 1.6).toFixed(2));
  });
  if (fi !== P.focusIdx) { P.focusIdx = fi; P.els.forEach((e, i) => e.classList.toggle('focus', i === fi)); }
}
const RIF_N = 1, RIF_P = 1.2, RIF_END = .5 + RIF_N * RIF_P;   // slow, ceremonial riffle (was 3×.52s)
const easeSine = u => (1 - Math.cos(Math.PI * u)) / 2;
const SHUF_END = RIF_END + .34 + .7;   // gather .5 → riffle 1×1.2 → pause .34 → fan .7 = 2.74s (was 3.1s)
function renderShuffle(t) {
  const T = (t - P.shufT0) / 1000;
  if (T >= SHUF_END) { endShuffle(); renderStrip(t); afterCountChange(); return; }
  P.els.forEach((el, i) => {
    const d = i - P.pos, ad = Math.abs(d);
    if (ad > 9) { if (!el._hid) { el.style.visibility = 'hidden'; el._hid = 1; } return; }   // 78-card deck: only animate nearby backs
    if (el._hid) { el.style.visibility = ''; el._hid = 0; }
    const st = { x: ((i * 37) % 7 - 3) * .7, y: -Math.min(i, 12) * .6, r: ((i * 53) % 9 - 4) * .9, s: .9 };
    let o, op = 1, z = i;
    if (T < .5) { const u = easeOut(clamp((T - (i % 8) * .02) / .42, 0, 1)); o = mix({ x: 0, y: 160, r: 0, s: .7 }, st, u); op = u; }
    else if (T < RIF_END) {         // riffle: halves fly out, cross mid-air, come back together (slow sine ease)
      const TT = T - .5, pass = Math.min(RIF_N - 1, Math.floor(TT / RIF_P));
      const u = easeSine(clamp((TT - pass * RIF_P - (i % 11) * .012) / (RIF_P - .13), 0, 1));
      const side = ((i + pass) % 2 ? 1 : -1) * (pass === 1 ? -1 : 1), k = Math.sin(Math.PI * u), w = Math.sin(2 * Math.PI * u);
      const amp = [72, 62, 54][pass];
      o = { x: st.x + side * amp * w, y: st.y - (32 + (i % 6) * 4) * k, r: st.r + side * 12 * w, s: .9 + .05 * k };
      z = (u < .5) === (side > 0) ? i : 60 + i;
    }
    else if (T < RIF_END + .34) { const u = (T - RIF_END) / .34; o = { ...st, s: .9 + .04 * Math.sin(Math.PI * u) }; }
    else {                          // spread into the fan
      const u = easeIO(clamp((T - RIF_END - .34 - Math.min(ad, 8) * .02) / .54, 0, 1));
      o = mix(st, lay(d, t, false), u); z = u > .5 ? 100 - Math.round(ad * 10) : i;
      if (ad > 6.5) op = 1 - u;
    }
    el.style.transform = tf(o); setIf(el, 'opacity', op.toFixed(2));
    if (el._z !== z) { el.style.zIndex = z; el._z = z; }
    setIf(el._dim, 'opacity', '0'); setIf(el._glow, 'opacity', '0');
  });
}
function endShuffle() { P.phase = 'strip'; P.els.forEach(el => { el._z = null; }); $('#shufTip').classList.remove('show'); }
function skipShuffle() { if (P.phase === 'shuffle') { P.shufT0 = performance.now() - SHUF_END * 1000; kick(); } }
$('#shufTip').addEventListener('click', skipShuffle);
function loop(t) {
  P.raf = 0;
  if (S.screen !== 'pick') return;
  if (P.anim) { const a = P.anim, u = Math.min(1, (t - a.t0) / a.dur); P.pos = a.from + (a.to - a.from) * easeOut(u); if (u >= 1) P.anim = null; }
  if (P.phase === 'strip' || P.phase === 'ceremony') renderStrip(t);
  else if (P.phase === 'shuffle') renderShuffle(t);
  if (P.phase !== 'intro' && P.phase !== 'idle') P.raf = requestAnimationFrame(loop);
}
function kick() { if (!P.raf) P.raf = requestAnimationFrame(loop); }
function animTo(i, dur) {
  i = clamp(i, 0, P.els.length - 1);
  P.anim = { from: P.pos, to: i, t0: performance.now(), dur: dur || Math.min(750, 260 + Math.abs(i - P.pos) * 90) }; kick();
}

function renderPick() {
  const run = ++P.run; P.anim = null; P.drag = null; P.busy = false;
  $('#pickBg').style.cssText = `--img:url(assets/bg_present_p.jpg);--pos:50% 100%`;
  $('#drawQ').textContent = `「${S.question}」`;
  const fresh = !S.strip;
  if (fresh) S.strip = shuffleArr(pool().filter(c => !S.cards.some(x => x && x.n === c.n)));
  const scr = $('#s-pick'); scr.classList.remove('ceremony');
  $('#pickDim').classList.remove('on');
  $$('.slot', slotsEl).forEach(s => s.classList.remove('halo-on', 'flash'));
  spread.innerHTML = '';
  P.els = S.strip.map(c => { const el = makeStripEl(c); spread.appendChild(el); return el; });
  P.focusIdx = -1;
  renderSlots();
  if (fresh) P.pos = Math.floor(S.strip.length / 2); else P.pos = clamp(Math.round(P.pos), 0, S.strip.length - 1);
  if (fresh && drawnCount() === 0) {
    P.phase = 'intro';
    P.els.forEach(el => { setIf(el, 'opacity', '0'); el.style.transform = 'translate3d(0,140px,0) scale(.7)'; });
    updateCounts(); scr.classList.remove('full');
    hint('深呼吸 · 默念你的问题', true);
    showIntro(run);
  } else {
    $('#ritualIntro').classList.remove('show'); $('#shufTip').classList.remove('show');
    P.phase = 'strip'; afterCountChange(); kick();
  }
}
function showIntro(run) {
  const box = $('#ritualIntro');
  $('#riQ').textContent = `「${S.question}」`;
  box.classList.add('show');
  let done = false;
  const next = () => {
    if (done || run !== P.run) return; done = true;
    box.classList.remove('show'); box.onclick = null;
    if (reduced()) { P.phase = 'strip'; afterCountChange(); kick(); return; }
    hint('正在洗牌…', true); vibrate(8); $('#shufTip').classList.add('show');
    P.phase = 'shuffle'; P.shufT0 = performance.now() + 250; kick();
  };
  box.onclick = next;
  setTimeout(next, reduced() ? 500 : 1700);
}
function updateCounts() {
  $('#drawCount').innerHTML = `已抽取 <b>${drawnCount()}</b>/3 张`;
  $('#pickCount').textContent = `剩余 ${S.strip ? S.strip.length : pool().length} 张`;
}
function afterCountChange() {
  const n = drawnCount(); updateCounts();
  $('#s-pick').classList.toggle('full', n === 3);
  if (P.phase !== 'strip') return;
  hint(n === 0 ? '左右滑动挑一张，点击选中' : n < 3 ? `再抽 ${3 - n} 张 · 轻触下方的牌可放回` : '三张牌已就位 ✦', n === 3);
}
function renderSlots() {
  $$('.slot', slotsEl).forEach((s, k) => {
    const c = S.cards[k];
    s.classList.toggle('filled', !!c);
    $('.slot-box', s).innerHTML = c ? `<div class="flip-card slot-card">${flipCardHtml(c)}</div>` : '';
  });
}

/* flying card (Web Animations, transform-only) */
function fly(from, to, toSlot) {
  if (reduced()) return Promise.resolve();
  const scr = $('#s-pick'), sr = scr.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'flip-card flyer'; f.style.setProperty('--cw', from.width + 'px'); f.innerHTML = flipCardHtml(null);
  f.style.left = (from.left - sr.left) + 'px'; f.style.top = (from.top - sr.top) + 'px';
  scr.appendChild(f);
  const dx = to.left - from.left, dy = to.top - from.top, s = to.width / from.width, D = 640;
  const a = f.animate([
    { transform: 'translate(0,0) rotate(0deg) scale(1)' },
    { transform: `translate(${dx * .45}px,${dy * .45 - 70}px) rotate(${toSlot ? -10 : 10}deg) scale(${(1 + s) / 2 * 1.06})`, offset: .45 },
    { transform: `translate(${dx}px,${dy}px) rotate(0deg) scale(${s})` },
  ], { duration: D, easing: 'cubic-bezier(.45,.05,.3,1)' });
  const ar = app.getBoundingClientRect(), x0 = from.left - ar.left + from.width / 2, y0 = from.top - ar.top + from.width / .62 / 2;
  const x1 = to.left - ar.left + to.width / 2, y1 = to.top - ar.top + to.width / .62 / 2, t0 = performance.now();
  const trail = () => {
    const u = (performance.now() - t0) / D; if (u >= 1) return;
    const e = easeIO(u); FX.spawn(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e - Math.sin(Math.PI * e) * 70, { n: 2, speed: .03, life: 600, size: 1.8, g: -.00002 });
    requestAnimationFrame(trail);
  };
  requestAnimationFrame(trail);
  return a.finished.then(() => f.remove(), () => f.remove());
}
function drawFromStrip(idx) {
  if (P.phase !== 'strip' || P.busy) return;
  const k = S.cards.findIndex(c => !c);
  if (k < 0) { toast('已抽满 3 张，轻触下方的牌可放回'); return; }
  const el = P.els[idx]; if (!el) return;
  P.busy = true;
  const card = DEMO ? DECK[[9, 17, 21][k]] : el._card;
  if (card && card.art) { const pre = new Image(); pre.src = card.art[0]; }   // lazy: load face only when picked
  const box = $$('.slot-box', slotsEl)[k];
  const from = el.getBoundingClientRect(), to = box.getBoundingClientRect();
  P.els.splice(idx, 1); S.strip.splice(idx, 1); el.remove(); P.focusIdx = -1;
  if (P.pos > P.els.length - 1) animTo(P.els.length - 1);
  S.cards[k] = card; updateCounts();
  $$('.slot', slotsEl)[k].classList.add('incoming');
  vibrate(12);
  fly(from, to, true).then(() => {
    const slot = $$('.slot', slotsEl)[k]; slot.classList.remove('incoming');
    renderSlots(); slot.classList.add('pop'); setTimeout(() => slot.classList.remove('pop'), 500);
    FX.burst(box, { n: 16, speed: .1, life: 600, size: 2 });
    P.busy = false; afterCountChange();
  });
}
function returnToStrip(k) {
  const c = S.cards[k];
  if (!c || P.busy || P.phase !== 'strip') return;
  P.busy = true;
  const box = $$('.slot-box', slotsEl)[k], from = box.getBoundingClientRect();
  S.cards[k] = null; renderSlots();
  const at = clamp(Math.round(P.pos), 0, P.els.length);
  const el = makeStripEl(c); el._v = at; el._ap = -.9;
  P.els.splice(at, 0, el); S.strip.splice(at, 0, c); spread.appendChild(el);
  P.anim = null; P.pos = at;
  const sr = spread.getBoundingClientRect(), w = 118 * 1.2;
  vibrate(8); afterCountChange(); kick();
  fly(from, { left: sr.left + sr.width / 2 - w / 2, top: sr.top + sr.height / 2 - w / .62 / 2 - 20, width: w }, false).then(() => { P.busy = false; });
}
$$('.slot', slotsEl).forEach((s, k) => s.addEventListener('click', () => returnToStrip(k)));

/* pointer input: drag (touch + mouse) with momentum + snap; tap = center / draw */
const rubber = x => .6 * (1 - 1 / (x * .9 + 1));
spread.addEventListener('pointerdown', e => {
  if (P.phase === 'shuffle') { skipShuffle(); return; }
  if (P.phase !== 'strip' || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const el = e.target.closest('.sc');
  P.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pos0: P.pos, moved: false, idx: el ? P.els.indexOf(el) : -1, samples: [[e.timeStamp, e.clientX]] };
  try { spread.setPointerCapture(e.pointerId); } catch (_) {}
  P.anim = null;
});
spread.addEventListener('pointermove', e => {
  const D = P.drag; if (!D || D.id !== e.pointerId) return;
  const dx = e.clientX - D.x0, dy = e.clientY - D.y0;
  if (!D.moved) { if (Math.hypot(dx, dy) < 8) return; D.moved = true; }
  const max = P.els.length - 1; let p = D.pos0 - dx / STEP_PX;
  if (p < 0) p = -rubber(-p); else if (p > max) p = max + rubber(p - max);
  P.pos = p;
  D.samples.push([e.timeStamp, e.clientX]); if (D.samples.length > 8) D.samples.shift();
  const ar = app.getBoundingClientRect();
  FX.spawn(e.clientX - ar.left, e.clientY - ar.top, { n: 2, speed: .03, life: 650, size: 1.8, g: -.00003, stars: .35 });
  kick();
});
function endDrag(e, cancelled) {
  const D = P.drag; if (!D || D.id !== e.pointerId) return;
  P.drag = null;
  if (!D.moved) {
    if (cancelled || D.idx < 0 || P.phase !== 'strip') return;
    if (D.idx !== Math.round(P.pos)) animTo(D.idx); else drawFromStrip(D.idx);
    return;
  }
  const now = D.samples[D.samples.length - 1][0], s = D.samples.filter(x => now - x[0] < 110);
  const a = s[0], b = s[s.length - 1], v = s.length > 1 ? -(b[1] - a[1]) / Math.max(16, b[0] - a[0]) / STEP_PX : 0;
  const target = Math.round(P.pos + v * 240);
  animTo(target, Math.min(950, 320 + Math.abs(target - P.pos) * 70));
}
spread.addEventListener('pointerup', e => endDrag(e, false));
spread.addEventListener('pointercancel', e => endDrag(e, true));
let wheelT;
spread.addEventListener('wheel', e => {
  if (P.phase !== 'strip' || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
  e.preventDefault(); P.anim = null; P.pos = clamp(P.pos + e.deltaX / 90, 0, P.els.length - 1); kick();
  clearTimeout(wheelT); wheelT = setTimeout(() => animTo(Math.round(P.pos)), 120);
}, { passive: false });

/* ceremony: flip the three cards one by one */
$('#flipAll').addEventListener('click', () => {
  if (drawnCount() < 3 || P.phase !== 'strip' || P.busy) return;
  P.phase = 'ceremony'; const run = P.run;
  $('#s-pick').classList.add('ceremony'); $('#pickDim').classList.add('on'); vibrate(15);
  const later = (ms, f) => setTimeout(() => { if (run === P.run && S.screen === 'pick') f(); }, reduced() ? Math.min(ms, 150) : ms);
  const slots = $$('.slot', slotsEl);
  slots.forEach((s, i) => {
    const t = 900 + i * 700;
    later(t, () => { s.classList.add('halo-on'); $('.slot-card', s).classList.add('flipped'); vibrate(18); });
    later(t + 420, () => { s.classList.add('flash'); FX.burst($('.slot-card', s), { n: 46, speed: .22, life: 1000 }); });
  });
  later(900 + 3 * 700 + 900, () => { renderReveal(); go('reveal'); });
});

/* keyboard */
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('textarea,input')) return;
  if (S.screen === 'pick') {
    if (P.phase === 'intro' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('#ritualIntro').click(); return; }
    if (P.phase !== 'strip') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); animTo(Math.round(P.pos) + (e.key === 'ArrowLeft' ? -1 : 1)); }
    else if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) { e.preventDefault(); drawFromStrip(Math.round(P.pos)); }
  } else if (S.screen === 'reveal' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target !== $('#rvTrack')) {
    e.preventDefault(); rvCar.goTo(rvCar.idx() + (e.key === 'ArrowLeft' ? -1 : 1));
  }
});

/* ---------- Generic swipe carousel (native scroll-snap for touch, drag for mouse, arrows) ---------- */
function carousel(track, dots, onChange) {
  const slides = () => [...track.children];
  const idx = () => { const c = track.scrollLeft + track.clientWidth / 2; let best = 0, bd = 1e9; slides().forEach((s, i) => { const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - c); if (d < bd) { bd = d; best = i; } }); return best; };
  let cur = -1, ticking = false;
  const upd = () => {
    ticking = false; const i = idx(); if (i === cur) return; cur = i;
    slides().forEach((s, k) => s.classList.toggle('on', k === i)); if (slides()[i]) slides()[i].classList.add('seen');
    if (dots) [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    if (onChange) onChange(i);
  };
  const goTo = (i, smooth = true) => {
    i = clamp(i, 0, slides().length - 1); const s = slides()[i]; if (!s) return;
    track.scrollTo({ left: s.offsetLeft + s.offsetWidth / 2 - track.clientWidth / 2, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  };
  track.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
  if (dots) [...dots.children].forEach((d, k) => d.addEventListener('click', () => goTo(k)));
  track.tabIndex = 0;
  track.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); goTo(idx() + (e.key === 'ArrowLeft' ? -1 : 1)); } });
  let md = null;
  track.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    md = { x: e.clientX, sl: track.scrollLeft, start: idx(), moved: false };
    track.classList.add('dragging'); try { track.setPointerCapture(e.pointerId); } catch (_) {}
  });
  track.addEventListener('pointermove', e => { if (!md) return; const dx = e.clientX - md.x; if (Math.abs(dx) > 8) md.moved = true; track.scrollLeft = md.sl - dx; });
  const end = e => {
    if (!md) return; const dx = e.clientX - md.x, m = md; md = null; track.classList.remove('dragging');
    goTo(Math.abs(dx) > 40 ? m.start + (dx < 0 ? 1 : -1) : m.start);
    if (m.moved) track.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
  };
  track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
  // touch swipe (explicit, so it works even with nested vertical scrolling inside slides)
  let td = null;
  track.addEventListener('touchstart', e => { const t = e.touches[0]; td = { x: t.clientX, y: t.clientY, start: idx() }; }, { passive: true });
  track.addEventListener('touchend', e => {
    if (!td) return; const t = e.changedTouches[0], dx = t.clientX - td.x, dy = t.clientY - td.y, m = td; td = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) goTo(m.start + (dx < 0 ? 1 : -1)); else goTo(m.start);
  }, { passive: true });
  return { reset() { cur = -1; track.scrollLeft = 0; upd(); }, goTo, idx };
}

/* ---------- Reveal: swipe between the three revealed cards ---------- */
function relateLine(card) {
  const th = THEMES[S.theme || 'custom'];
  return `${th.prefix}${card.apply}。`;
}
const typeSpans = txt => [...txt].map((ch, i) => `<span style="--d:${i * 32}ms">${esc(ch)}</span>`).join('');
const rvCar = carousel($('#rvTrack'), $('#rvDots'), i => rvChanged(i));
function renderReveal() {
  $('#rvQ').textContent = `「${S.question}」`;
  $('#rvTrack').innerHTML = S.cards.map((c, i) => `
    <div class="rv-slide">
      <div class="rv-card"><span class="sparkle-top">✦</span><div class="flip-card flipped">${flipCardHtml(c)}</div></div>
      <div class="rv-panel">
        <div class="rv-pos">${POS[i].roman} · ${POS[i].cn}　${c.roman} ${c.cn}</div>
        <p class="rv-meaning typing">${typeSpans(c[POS[i].key])}<span class="rv-relate">${relateLine(c)}</span></p>
      </div>
    </div>`).join('');
  requestAnimationFrame(() => rvCar.reset());
  const h = $('#rvHint'); h.classList.toggle('show', !S.swiped);
}
$('#rvPrev').addEventListener('click', () => rvCar.goTo(rvCar.idx() - 1));
$('#rvNext').addEventListener('click', () => rvCar.goTo(rvCar.idx() + 1));
function rvChanged(i) {
  $('#rvPrev').disabled = i <= 0; $('#rvNext').disabled = i >= 2;
  if (i > 0 && !S.swiped) { S.swiped = true; $('#rvHint').classList.remove('show'); }
}
$('#revealNext').addEventListener('click', () => startReading());

/* ---------- AI reading ----------
   generateReading() is the ONLY place that produces the reading.
   1) Real AI: POST /api/reading on the same origin (tarot-server/server.py proxies DeepSeek, falling back to OpenAI;
      the API key lives only on the server).
   2) Fallback: local template (file://, offline, timeout, rate limit, any server error).
   ?fail=1 still forces one simulated failure to show the error + retry screen.
   Shape: { source, title, journey, paragraphs:[html...], actions:[...], quote(html), creatorMsg, affirm } */
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const DEFAULT_QUOTE = '你不再等待一个确定的答案，<br>而是开始创造答案。';
const AI_TIMEOUT_MS = 40000, MIN_LOADING_MS = 1500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function templateReading(question, theme, cards) {
  const th = THEMES[theme || 'custom'];
  const [a, b, c] = cards;
  const journey = `「${a.kw} → ${b.kw} → ${c.kw}」`;
  const trim = s => s.replace(/[。！]$/, '');
  const paragraphs = [
    `这是一段<span class="journey">${journey}</span>的旅程。`,
    `过去的${a.cn}告诉你：${trim(a.past)}；现在的${b.cn}提醒你：${trim(b.present)}；而未来的${c.cn}预示着：${c.future}`,
    `关于「${esc(question)}」，${th.prefix || '对于这件事，'}三张牌指向同一个方向——${trim(a.apply)}，然后${trim(b.apply)}。当你这样做时，${c.cn}所描绘的那个自己，会比想象中来得更快。`,
  ];
  const actions = [
    `今天：用 10 分钟写下你对「${th.focus}」最真实的期待。`,
    `本周：做一件与「${b.kw}」有关的小行动，哪怕很小。`,
    `持续：每晚睡前读一遍你的显化宣言。`,
  ].map(esc);
  return { source: 'template', title: '', journey, paragraphs, actions, quote: S.manifest.msg, creatorMsg: '', affirm: th.affirm };
}

async function fetchAiReading(question, theme, cards) {
  if (!/^https?:$/.test(location.protocol) || !window.fetch) throw new Error('no backend (file://)');
  const ctrl = window.AbortController ? new AbortController() : null;
  const timer = setTimeout(() => ctrl && ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch('api/reading', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({
        question: question.slice(0, 120), theme: theme || 'custom',
        cards: cards.slice(0, 3).map((c, i) => ({ position: POS[i].key, name_cn: c.cn, name_en: c.en, numeral: c.roman })),
        manifest: { name_cn: S.manifest.cn, name_en: S.manifest.en },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`api ${res.status} ${data.error || ''}`);
    if (!Array.isArray(data.reading) || !data.reading.length || !Array.isArray(data.actions) || !data.actions.length) throw new Error('bad payload');
    const th = THEMES[theme || 'custom'];
    const msg = String(data.creator_message || '').trim();
    return {
      source: 'ai', model: data.model || '', title: String(data.title || '').trim(),
      journey: `「${cards.map(c => c.kw).join(' → ')}」`,
      paragraphs: data.reading.slice(0, 3).map(esc),
      actions: data.actions.slice(0, 3).map(esc),
      quote: msg ? esc(msg) : S.manifest.msg, creatorMsg: msg, affirm: th.affirm,
    };
  } finally { clearTimeout(timer); }
}

async function generateReading(question, theme, cards) {
  const t0 = Date.now();
  if (failOnce) {
    failOnce = false; await sleep(1700 + rand() * 700);
    throw new Error('Simulated network error');
  }
  let r;
  try { r = await fetchAiReading(question, theme, cards); }
  catch (e) { console.info('[tarot] AI reading unavailable, using template:', e.message); r = templateReading(question, theme, cards); }
  const wait = (r.source === 'ai' ? MIN_LOADING_MS : 1700 + rand() * 700) - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  return r;
}

let loadTimer;
function startReading() {
  S.manifest = pickManifest(S.cards);
  go('loading');
  $('#loadBox').hidden = false; $('#errBox').hidden = true;
  const subs = ['塔顶的星光正在汇聚…', '正在读取过去、现在与未来的线索…', '为你生成第 23 张显化牌…'];
  let i = 0; $('#loadSub').textContent = subs[0];
  clearInterval(loadTimer); loadTimer = setInterval(() => { i = (i + 1) % subs.length; $('#loadSub').textContent = subs[i]; }, 800);
  generateReading(S.question, S.theme, S.cards).then(r => {
    clearInterval(loadTimer); S.reading = r; renderFinal(); go('final');
  }).catch(err => {
    clearInterval(loadTimer); console.warn(err);
    $('#loadBox').hidden = true; $('#errBox').hidden = false;
  });
}
$('#errRetry').addEventListener('click', startReading);
$('#errBack').addEventListener('click', () => { renderReveal(); go('reveal', { back: true, noHistory: true }); });
(function makeStars() {
  const box = $('#stars'); let h = '';
  for (let i = 0; i < 34; i++) h += `<i style="left:${(Math.random()*100).toFixed(1)}%;top:${(Math.random()*70).toFixed(1)}%;animation-delay:${(Math.random()*2.4).toFixed(2)}s;transform:scale(${(.5+Math.random()).toFixed(2)})"></i>`;
  box.innerHTML = h;
})();

/* ---------- Final ---------- */
function renderFinal() {
  const r = S.reading;
  $('#finalQ').textContent = `「${S.question}」`;
  $('#recap').innerHTML = S.cards.map((c, i) => `
    <div class="rc-slide">
      <div class="rc-card">${faceHtml(c)}</div>
      <div class="rc-info"><span class="rc-pos">${POS[i].roman} · ${POS[i].cn}</span>
        <b class="rc-name">${c.cn}</b><span class="rc-en">${c.roman} · ${c.en}</span>
        <span class="rc-kw">✦ ${c.kw}</span><p class="rc-mean">${c[POS[i].key]}</p></div>
    </div>`).join('');
  requestAnimationFrame(() => recapCar.reset());
  const SUBS = null;  // paragraphs don't map 1:1 to cards, so no per-card subheads
  $('#reading').innerHTML = `<div class="rd-head"><span class="rd-ico">☾</span><b>解读</b></div>` +
    (r.title ? `<p class="r-title"><span class="journey">✦ ${esc(r.title)}</span></p>` : '') +
    r.paragraphs.map((p, i) => `<div class="rd-para">${SUBS ? `<span class="rd-sub">${SUBS[i]}</span>` : ''}<p>${p}</p></div>`).join('');
  const CHIP = { '今天': ['今天', '☀'], '本周': ['本周', '✿'], '持续': ['持续', '∞'] }, DEF = [['今天', '☀'], ['本周', '✿'], ['持续', '∞']];
  $('#actionsCard').innerHTML = `<div class="rd-head"><span class="rd-ico">✦</span><b>行动建议</b></div><ol class="act-list">` +
    r.actions.map((a, i) => {
      const m = a.match(/^(今天|本周|持续)[：:]\s*/); const [lab, ico] = m ? CHIP[m[1]] : DEF[i] || DEF[2];
      return `<li><span class="act-num">${i + 1}</span><div><span class="act-chip">${ico} ${lab}</span><p>${m ? a.slice(m[0].length) : a}</p></div></li>`;
    }).join('') + `</ol>`;
  $('#quote').innerHTML = r.quote; $('#affirm').textContent = r.affirm;
  $('#s-final').dataset.source = r.source;
  $('.proto-note').textContent = r.source === 'ai' ? '解读由 AI 实时生成，仅供自我觉察与娱乐参考' : '离线模式：解读由本地模板生成';
  S.creatorRevealed = false;
  const stage = $('#creatorStage'); stage.classList.remove('revealed', 'flash');
  const cc = $('#creatorCard'); cc.className = 'flip-card big'; cc.innerHTML = flipCardHtml(S.manifest);
  $('#manifestMeaning').textContent = S.manifest.meaning;
  $('#manifestName').textContent = S.manifest.cn; $('#manifestName').classList.remove('show');
  $('#tapHint').textContent = '轻触揭晓';
  $('#creatorAfter').classList.remove('show');
  stage.classList.remove('merging', 'emerge'); $('#converge').innerHTML = '';
}
const recapCar = carousel($('#recap'), $('#recapDots'));
/* 23rd card: the three drawn cards converge into light, merge, and THE CREATOR emerges */
function revealCreator() {
  if (S.creatorRevealed) return;
  S.creatorRevealed = true;
  const stage = $('#creatorStage'), cc = $('#creatorCard');
  const finish = () => {
    stage.classList.remove('merging'); stage.classList.add('flash', 'revealed', 'emerge');
    setTimeout(() => $('#manifestName').classList.add('show'), 500);
    setTimeout(() => cc.classList.add('flipped'), 120);
    setTimeout(() => { FX.burst(cc, { n: 120, speed: .34, life: 1500, size: 2.8 }); vibrate([20, 50, 30]); }, 380);
    setTimeout(() => {
      $('#creatorAfter').classList.add('show');
      const sc = $('#finalScroll');
      setTimeout(() => sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }), 700);
    }, 900);
  };
  if (reduced()) return finish();
  $('#converge').innerHTML = S.cards.map((c, i) => `<div class="cv cv${i}"><div class="cv-card">${faceHtml(c)}</div></div>`).join('') + '<div class="orb"></div>';
  stage.classList.add('merging'); vibrate(10);
  setTimeout(() => FX.burst($('#converge .orb'), { n: 36, speed: .1, life: 900, size: 2 }), 950);
  setTimeout(finish, 1550);
}
$('#creatorCard').addEventListener('click', revealCreator);
$('#creatorCard').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); revealCreator(); } });

$('#againBtn').addEventListener('click', () => { resetDraw(); go('question'); });   // back to question so the deck mode can be re-chosen
$('#changeBtn').addEventListener('click', () => { resetDraw(); S.question = ''; go('theme'); });

/* ---------- Share ---------- */
$('#shareBtn').addEventListener('click', async () => {
  const text = `我在「塔罗显化之旅」抽到了 ${S.cards.map(c => c.cn).join('、')}，第 23 张显化牌是「${S.manifest.cn}」✦`;
  const url = location.href.split('?')[0].split('#')[0];
  if (navigator.share) {
    try { await navigator.share({ title: 'Tarot Journey · 塔罗显化之旅', text, url }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('链接已复制，快去分享吧'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = `${text} ${url}`; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); toast(ok ? '链接已复制，快去分享吧' : '复制失败，请手动复制地址栏链接');
  }
});

/* ---------- Save image (canvas) ----------
   The Creator art comes from an embedded data URI (assets/creator-embed.js) so the
   canvas is never tainted, even when the page is opened via file://.            */
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function wrapText(ctx, text, x, y, maxW, lh, maxLines = 99) {
  let line = '', lines = [];
  for (const ch of text) { if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch; }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines); let l = lines[maxLines - 1];
    while (l && ctx.measureText(l + '…」').width > maxW) l = l.slice(0, -1);
    lines[maxLines - 1] = l + (text.endsWith('」') ? '…」' : '…');
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  return lines.length;
}
async function renderShareCanvas() {
  const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const CN = '-apple-system,"PingFang SC","Microsoft YaHei","Hiragino Sans GB","Noto Sans SC",sans-serif', EN = CN, RM = CN;
  // background
  let g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#8f86cc'); g.addColorStop(.45, '#cfc6ee'); g.addColorStop(1, '#f7efe8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${(Math.random()*.7+.2).toFixed(2)})`; ctx.beginPath(); ctx.arc(Math.random()*W, Math.random()*H*.55, Math.random()*2.6+.6, 0, 7); ctx.fill(); }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fbf6ee'; ctx.font = `400 64px ${EN}`; ctx.letterSpacing = '10px';
  ctx.fillText('TAROT JOURNEY', W / 2, 150);
  ctx.letterSpacing = '6px'; ctx.font = `400 38px ${CN}`; ctx.fillText('塔罗显化之旅 · 第 23 张显化牌', W / 2, 218);
  // manifestation name above the card (no numeral)
  { const M0 = S.manifest || CREATOR; ctx.fillStyle = '#fbf6ee'; ctx.font = `700 56px ${CN}`; ctx.letterSpacing = '14px'; ctx.fillText(M0.cn, W / 2 + 7, 306); }
  // card
  const cw = 640, ch = 982, cx = (W - cw) / 2, cy = 340;
  ctx.save(); ctx.shadowColor = 'rgba(50,40,120,.35)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  g = ctx.createLinearGradient(0, cy, 0, cy + ch); g.addColorStop(0, '#fdf9f1'); g.addColorStop(1, '#f1e6d4');
  ctx.fillStyle = g; rr(ctx, cx, cy, cw, ch, 44); ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#d4b16c'; ctx.lineWidth = 5; rr(ctx, cx, cy, cw, ch, 44); ctx.stroke();
  ctx.strokeStyle = 'rgba(201,164,92,.75)'; ctx.lineWidth = 2; rr(ctx, cx + 18, cy + 18, cw - 36, ch - 36, 30); ctx.stroke();
  const ax = cx + 48, ay = cy + 86, aw = cw - 96, ah = 680;
  const M = S.manifest || CREATOR;
  const img = await loadImg(M.slug === 'creator' && window.CREATOR_DATA_URI ? window.CREATOR_DATA_URI : M.art[0]);
  const s = Math.max(aw / img.width, ah / img.height), iw = img.width * s, ih = img.height * s;
  ctx.save(); rr(ctx, ax, ay, aw, ah, 22); ctx.clip();
  ctx.drawImage(img, ax + (aw - iw) / 2, ay + (ah - ih) * .4, iw, ih); ctx.restore();
  ctx.strokeStyle = '#c9a45c'; ctx.lineWidth = 3; rr(ctx, ax, ay, aw, ah, 22); ctx.stroke();
  ctx.fillStyle = '#3a3466'; ctx.font = `600 50px ${EN}`; ctx.letterSpacing = '8px'; ctx.fillText(M.en, W / 2, ay + ah + 86);
  ctx.fillStyle = '#3b3672'; ctx.font = `700 72px ${CN}`; ctx.letterSpacing = '14px'; ctx.fillText(M.cn, W / 2 + 7, ay + ah + 176);
  // texts
  const R = S.reading || {};
  ctx.letterSpacing = '4px'; ctx.fillStyle = '#3a3466'; ctx.font = `400 40px ${CN}`;
  let y = 1416;
  if (R.creatorMsg) { y += wrapText(ctx, R.creatorMsg, W / 2, y, 900, 58, 3) * 58; }
  else { const [l1, l2] = M.msg.split('<br>'); ctx.fillText(l1, W / 2, 1420); ctx.fillText(l2 || '', W / 2, 1480); y = 1538; }
  const AF = R.affirm || (THEMES[S.theme || 'custom'] || THEMES.custom).affirm;
  if (AF) {   // manifestation affirmation — prominent, gold, wrapped to max 2 lines
    const body = AF.replace(/^显化宣言[：:]\s*/, '');
    ctx.fillStyle = '#a8823f'; ctx.font = `400 28px ${CN}`; ctx.letterSpacing = '8px';
    y += 26; ctx.fillText('✦ 显化宣言 ✦', W / 2, y); y += 62;
    ctx.fillStyle = '#9a7432'; ctx.font = `700 42px ${CN}`; ctx.letterSpacing = '3px';
    y += wrapText(ctx, body, W / 2, y, 940, 58, 2) * 58 + 4;
  }
  let last = y - 58;   // baseline of the last drawn line so far
  if (R.title) {   // reading summary — the image ends here
    ctx.fillStyle = '#a8823f'; ctx.font = `700 32px ${CN}`; ctx.letterSpacing = '3px';
    y += 30; const tl = wrapText(ctx, `✦ ${R.title} ✦`, W / 2, y, 900, 46, 2); last = y + (tl - 1) * 46;
  }
  // crop canvas just below the summary, with a comfortable bottom margin
  const H2 = Math.min(H, Math.ceil(last + 110));
  if (H2 < H) { const out = document.createElement('canvas'); out.width = W; out.height = H2; out.getContext('2d').drawImage(cv, 0, 0); return out; }
  return cv;
}
$('#saveBtn').addEventListener('click', async () => {
  const btn = $('#saveBtn'); btn.disabled = true; const old = btn.textContent; btn.textContent = '正在生成图片…';
  try {
    const cv = await renderShareCanvas();
    const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `tarot-journey-${(S.manifest || CREATOR).slug}-${Date.now()}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('图片已保存 ✦');
  } catch (e) { console.error(e); toast('保存失败，请通过本地服务器打开后重试'); }
  finally { btn.disabled = false; btn.textContent = old; }
});

go("home", { noHistory: true });
// expose for automated tests
window.__tarot = { BGM, S, P, go, DECK, MANIFEST_POOL, pickManifest, startReading, renderReveal, revealCreator, renderShareCanvas, generateReading };
})();
