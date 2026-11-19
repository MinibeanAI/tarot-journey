const fs = require('fs');
const path = require('path');
const puppeteer = require('/tmp/ppt/node_modules/puppeteer-core');

const OUT = path.join(__dirname, 'preview');
const URL_BASE = process.env.MINITOOL_URL || 'http://127.0.0.1:8765/?demo=1&template=1';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  const remote = [];
  const failed = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    let host = '';
    try { host = new URL(u).hostname; } catch (e) { remote.push(u); return; }
    if (host !== '127.0.0.1' && host !== 'localhost') remote.push(u);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) failed.push(res.status() + ' ' + res.url());
  });
  page.on('pageerror', (err) => failed.push('pageerror ' + err.message));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const tap = async (sel) => {
    const el = await page.waitForSelector(sel);
    const b = await el.boundingBox();
    if (!b) throw new Error('no box ' + sel);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await pause(750);
  };
  await page.goto(URL_BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#s-home.active');
  await pause(400);
  await page.screenshot({ path: path.join(OUT, '01-home.png') });

  await tap('[data-go="theme"]');
  await page.waitForSelector('#s-theme.active');
  await page.screenshot({ path: path.join(OUT, '02-theme.png') });

  await tap('[data-theme="career"]');
  await page.waitForSelector('#s-question.active');
  const mode22 = await page.$eval('#qMode [data-mode="22"]', (el) => el.classList.contains('on'));
  assert(mode22, 'default deck should be 22');
  await page.screenshot({ path: path.join(OUT, '03-question.png') });

  await tap('#enterTower');
  await page.waitForSelector('#s-pick.active');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#ritualIntro')).visibility === 'hidden');
  const left22 = await page.$eval('#pickCount', (el) => el.textContent);
  assert(left22.includes('22'), '22-card deck count: ' + left22);
  await page.screenshot({ path: path.join(OUT, '04-pick.png') });

  for (let i = 0; i < 3; i++) {
    const box = await page.evaluate(() => {
      const P = window.__tarot.P;
      const el = P.els[Math.round(P.pos)];
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
    await page.waitForFunction((n) => document.querySelectorAll('.slot.filled').length >= n, { timeout: 8000 }, i + 1);
  }
  await tap('#flipAll');
  await page.waitForSelector('#s-reveal.active', { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('#rvTrack').classList.contains('txt-ready'));
  const align = await page.$eval('.rv-meaning', (el) => getComputedStyle(el).textAlign);
  assert(align === 'left', 'reveal text align ' + align);
  const meaning = await page.$eval('.rv-meaning', (el) => el.textContent.trim());
  assert(meaning.length > 12, 'reveal paragraph missing');
  const arrows = await page.$$eval('.rv-arrow', (els) => els.map((el) => ({ id: el.id, display: getComputedStyle(el).display })));
  assert(arrows.some((a) => a.id === 'rvNext' && a.display !== 'none'), 'next arrow missing ' + JSON.stringify(arrows));
  await page.screenshot({ path: path.join(OUT, '05-reveal.png') });
  await tap('#rvNext');
  await page.waitForFunction(() => document.querySelectorAll('.rv-slide')[1].classList.contains('on'));
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, '06-reveal-next.png') });

  await tap('#revealNext');
  await page.waitForSelector('#s-final.active', { timeout: 8000 });
  await page.waitForSelector('.rd-notice');
  const notice = await page.$eval('.rd-notice', (el) => el.textContent);
  assert(/基础解读/.test(notice), 'template notice missing: ' + notice);
  assert(!/网络/.test(notice), 'notice should not mention network');
  const readAlign = await page.$eval('.rd-answer p', (el) => getComputedStyle(el).textAlign);
  assert(readAlign === 'left', 'final reading align ' + readAlign);
  await page.$eval('#reading', (el) => el.scrollIntoView({ block: 'start' }));
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT, '07-reading.png') });

  await page.$eval('#creatorCard', (el) => el.scrollIntoView({ block: 'center' }));
  await pause(400);
  await tap('#creatorCard');
  await page.waitForSelector('#creatorAfter.show', { timeout: 8000 });
  await page.$eval('#finalScroll', (el) => el.scrollTo(0, el.scrollHeight));
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT, '08-manifest.png') });

  await tap('#saveBtn');
  await page.waitForSelector('#saveOverlay.show', { timeout: 8000 });
  const caption = await page.$eval('#saveOverlay p', (el) => el.textContent);
  const toast = await page.$eval('#toast', (el) => el.textContent);
  assert(/没有写入相册|浏览器预览/.test(caption), 'save caption: ' + caption);
  assert(!/已保存/.test(toast), 'toast must not claim a save: ' + toast);
  await page.screenshot({ path: path.join(OUT, '09-save-preview.png') });

  await tap('.save-ov-x');
  await page.$eval('#againBtn', (el) => el.scrollIntoView({ block: 'center' }));
  await tap('#againBtn');
  await page.waitForSelector('#s-question.active');
  await tap('#qMode [data-mode="78"]');
  const mode78 = await page.$eval('#qMode [data-mode="78"]', (el) => el.getAttribute('aria-checked'));
  assert(mode78 === 'true', '78 mode not selected');
  await page.screenshot({ path: path.join(OUT, '10-deck-78.png') });
  await tap('#enterTower');
  await page.waitForSelector('#s-pick.active');
  const left78 = await page.$eval('#pickCount', (el) => el.textContent);
  assert(left78.includes('78'), '78-card count: ' + left78);

  assert(remote.length === 0, 'remote requests: ' + remote.join('\n'));
  assert(failed.length === 0, 'failed responses: ' + failed.join('\n'));
  await browser.close();
  console.log('shoot ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
