// صور الوثيقة 1.11 وقياسها (design/s8b.md 7): تبلغ اللعبة المبنية (v58) كل حالة بالنقر كما في tests/،
// ثم تضيف طبقة التصوّر design/s8b.css وdesign/s8b.js، وتصوّر، وتفحص التداخل والشبكة بـ design/check.js على 1920 و1366 و1280 و3840.
// ونافذة المقدّم: بلا تمرير على 1280×800 و1366×768، ولا زر ينكسر نصه أو يفيض.
// الاستعمال: node design/s8b-shots.cjs [الرابط] [مجلد الصور]
// ثم: node design/ratio.cjs [مجلد الصور]/*.png (صور الجمهور وحدها، لا p-*)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const H = require('../tests/helpers.cjs');
const { finalMatch } = require('../tests/final-match.cjs');

const base = process.argv[2] || 'http://localhost:8000/';
const out = process.argv[3] || require('os').tmpdir();
const wait = ms => new Promise(r => setTimeout(r, ms));
const SHORT = ['الصقور', 'النجوم'], LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];
const SIZES = [[1920, 1080], [1366, 768], [1280, 800], [3840, 2160]];
const results = [];

async function overlay(frame) {
  if (await frame.evaluate(() => !!window.S8B)) return;
  await frame.addStyleTag({ path: path.join(__dirname, 's8b.css') });
  await frame.addScriptTag({ path: path.join(__dirname, 's8b.js') });
  if (await frame.evaluate(() => !!document.getElementById('canvas') && !window.layoutCheck)) await frame.addScriptTag({ path: path.join(__dirname, 'check.js') });
}
// صورة شاشة الجمهور وقياسها. page: الصفحة التي تُصوَّر (الأم بنافذة واحدة)، وframe: ما فيه #canvas
async function shot(page, frame, name, settle = 1400) {
  await wait(settle);
  await page.screenshot({ path: path.join(out, name + '.png') });
  const check = [];
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h }); await wait(250);
    await frame.evaluate(() => window.S8B?.placeNear && document.querySelector('#near .s8b') && S8B.placeNear());
    const r = await frame.evaluate(() => layoutCheck({ canvas: document.getElementById('canvas'), grid: true }));
    let pair = '';
    for (let i = 0; i < r.items.length; i++) for (let j = i + 1; j < r.items.length; j++) { const a = r.items[i], b = r.items[j];
      const g = Math.max(b.x1 - a.x2, a.x1 - b.x2, b.y1 - a.y2, a.y1 - b.y2); if (Math.abs(g - r.minGap) < .01) pair = a.name + ' ↔ ' + b.name; }
    check.push({ w, ok: r.ok, gap: Math.round(r.minGap * 10) / 10, pair, problems: r.problems });
  }
  await page.setViewportSize({ width: 1920, height: 1080 }); await wait(250);
  await frame.evaluate(() => window.S8B?.placeNear && document.querySelector('#near .s8b') && S8B.placeNear());
  results.push({ name, check });
  const bad = check.filter(c => !c.ok);
  console.log(`${bad.length ? '✗' : '✓'} ${name} · أدنى فراغ ${check.map(c => c.gap).join('/')} (${check[0].pair})${bad.length ? '\n   ' + bad.map(c => c.w + ': ' + c.problems.join('، ')).join('\n   ') : ''}`);
}
// نافذة المقدّم: صورة على مقاسها، ثم بلا تمرير على 1280×800 و1366×768، ولا نص يفيض من زره ولا ينكسر
async function pshot(page, name) {
  await wait(400);
  await page.screenshot({ path: path.join(out, 'p-' + name + '.png') });
  const check = [];
  for (const [w, h] of [[1280, 800], [1366, 768]]) {
    await page.setViewportSize({ width: w, height: h }); await wait(250);
    const r = await page.evaluate(() => {
      const scroll = document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1;
      const over = [...document.querySelectorAll('#judge .s8b')].filter(b => b.scrollWidth > b.clientWidth + 1 || b.getClientRects().length && (() => {
        const rg = document.createRange(); rg.selectNodeContents(b); return new Set([...rg.getClientRects()].map(x => Math.round(x.top))).size > 1; })()).map(b => b.textContent);
      const small = [...document.querySelectorAll('#judge .s8b, #qState, #who')].filter(b => parseFloat(getComputedStyle(b).fontSize) < 20).map(b => b.textContent);
      return { scroll, over, small };
    });
    check.push({ w, ok: !r.scroll && !r.over.length && !r.small.length, ...r });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  results.push({ name: 'p-' + name, check });
  const bad = check.filter(c => !c.ok);
  console.log(`${bad.length ? '✗' : '✓'} p-${name} · ${bad.length ? bad.map(c => `${c.w}: ${c.scroll ? 'تمرير ' : ''}${c.over.join('، ')} ${c.small.join('، ')}`).join(' · ') : 'بلا تمرير، والأزرار سطر واحد'}`);
}
async function newShared(browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
  await H.usePin(context);
  const stage = await context.newPage();
  await stage.goto(base); await stage.evaluate(() => localStorage.clear()); await stage.reload();
  await H.unlock(stage);
  const frame = await H.stageFrame(stage);
  return { context, stage, frame };
}
const go = async (frame, c, ms = 900) => { await frame.waitForSelector(`[data-cmd="${c}"]`, { state: 'attached', timeout: 8000 }); await frame.evaluate(c => document.querySelector(`[data-cmd="${c}"]`).click(), c); await wait(ms); };
const answerOf = stage => stage.evaluate(() => { const st = JSON.parse(localStorage.getItem('big-challenge.match')).round.state; return st.questions[st.index ?? (st.qi % st.questions.length)].answer; });

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();

  // ===== 1. الحرف المعيّن وآخر حرفين بنافذة واحدة =====
  for (const [mode, other] of [['letter', 'last-two'], ['last-two', 'letter']]) for (const names of [SHORT, LONG]) {
    const tag = (mode === 'letter' ? 'l1' : 'l2') + (names === LONG ? '-long' : '');
    const { context, stage, frame } = await newShared(browser);
    await H.sharedToFace(frame, { names, picks: [mode, other] });
    await wait(2700);
    await go(frame, 'begin'); await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
    await go(frame, 'act:show', 1500);
    const owner = await stage.evaluate(() => { const st = JSON.parse(localStorage.getItem('big-challenge.match')).round.state; return st.questions[st.index].owner; }), opp = 3 - owner;
    const answer = await answerOf(stage);
    await overlay(frame);
    if (names === LONG) await frame.evaluate(() => S8B.scores('188', '176'));
    const set = (js, args) => frame.evaluate(js, args);
    const all = mode === 'letter';
    // العدّ قبل الوقت: 3 من 5، أبيض
    await set(([o]) => { S8B.clock(o, 'lead', 3, 5); S8B.near([['إيقاف مؤقت', 'alt pause'], ['وقت الخصم', 'alt']]); S8B.ans('كشف الإجابة'); }, [owner]);
    if (all) await shot(stage, frame, `01-${tag}-lead`);
    // متوقف في العدّ قبل الوقت
    await set(([o]) => { S8B.clock(o, 'lead', 3, 5, true); S8B.near([['استئناف', 'pause on'], ['وقت الخصم', 'alt']]); }, [owner]);
    if (all) await shot(stage, frame, `02-${tag}-paused`);
    // الوقت يجري: 21 من 30
    await set(([o]) => { S8B.clock(o, 'run', 21, 30); S8B.near([['إيقاف مؤقت', 'alt pause'], ['وقت الخصم', 'alt']]); }, [owner]);
    await shot(stage, frame, `03-${tag}-run`);
    // انتهى وقت صاحب السؤال: «وقت الخصم» و«كشف الإجابة»، ولا إيقاف
    await set(([o]) => { S8B.clock(o, 'run', 0, 30); S8B.near([['وقت الخصم', 'alt']]); }, [owner]);
    if (all) await shot(stage, frame, `04-${tag}-timeout`);
    // وقت الخصم: 7 من 10 في لوحته
    await set(([p]) => { S8B.clock(p, 'run', 7, 10); S8B.near([['إيقاف مؤقت', 'alt pause']]); }, [opp]);
    if (all) await shot(stage, frame, `05-${tag}-opp`, 1400);
    // الكشف: الإجابة وحدها، وزرّا الفريقين بلونيهما «+3»، و«لم يُجب أحد»
    await set(([a]) => { S8B.noClock(); S8B.reveal(a); S8B.ans(null); S8B.side(0);
      S8B.near([['<span class="ltr">+3</span>', 'who t1'], ['<span class="ltr">+3</span>', 'who t2'], ['لم يُجب أحد', 'alt']]); }, [answer]);
    await shot(stage, frame, `06-${tag}-reveal`, 1400);
    // بعد الاختيار: الخصم أجاب، ثم «لم يُجب أحد»
    const tn = names[opp - 1];
    await set(([a, n, p]) => { S8B.reveal(a, `${n} · <span class="ltr">+3</span>`, p); S8B.side(p); S8B.near([['السؤال التالي']]); }, [answer, tn, opp]);
    if (all) await shot(stage, frame, `07-${tag}-opp-won`, 1400);
    await set(([a]) => { S8B.reveal(a, 'لم يُجب أحد', 0); S8B.side(0); }, [answer]);
    if (all) await shot(stage, frame, `08-${tag}-none`, 1400);
    await context.close();
  }

  // ===== 2. نافذة المقدّم (بنافذتين، بأطول اسمين) =====
  {
    const { context, stage, frame } = await newShared(browser);
    await H.sharedToFace(frame, { names: LONG, picks: ['letter', 'last-two'] });
    await wait(2700);
    const host = await H.beginTwo(context, frame);
    await host.setViewportSize({ width: 1280, height: 800 });
    await wait(1200);
    await host.click('#showQ'); await wait(1500);
    const aud = await H.stageFrame(stage).catch(() => frame);
    const answer = (await host.textContent('#qAnswer')).trim();
    const owner = await stage.evaluate(() => { const st = JSON.parse(localStorage.getItem('big-challenge.match')).round.state; return st.questions[st.index].owner; }), opp = 3 - owner;
    await host.addStyleTag({ path: path.join(__dirname, 's8b.css') }); await host.addScriptTag({ path: path.join(__dirname, 's8b.js') });
    await overlay(aud);
    const mk = t => `<i class="mark t${t}"></i> دور <b class="tn t${t}">${LONG[t - 1]}</b>`;
    const P = (who, state, list) => host.evaluate(([w, s, l]) => S8B.presenter(w, s, l), [who, state, list]);
    const three = [['إيقاف مؤقت', 'alt'], ['وقت الخصم · 10 ثوانٍ', 'alt'], ['كشف الإجابة', '']];
    await P(mk(owner), 'يبدأ الوقت بعد 3', three);
    await aud.evaluate(([o]) => S8B.clock(o, 'lead', 3, 5), [owner]);
    await pshot(host, 'l1-lead');
    await shot(stage, aud, '09-two-lead');
    await P(mk(owner), 'متوقف · يبدأ الوقت بعد 3', [['استئناف', ''], ['وقت الخصم · 10 ثوانٍ', 'alt'], ['كشف الإجابة', '']]);
    await pshot(host, 'l1-paused');
    await P(mk(owner), 'بقي 21 ثانية', three);
    await pshot(host, 'l1-run');
    await P(mk(owner), 'انتهى الوقت', [['وقت الخصم · 10 ثوانٍ', 'alt'], ['كشف الإجابة', '']]);
    await pshot(host, 'l1-timeout');
    await P(mk(opp), 'وقت الخصم · بقي 7 ثوانٍ', [['إيقاف مؤقت', 'alt'], ['كشف الإجابة', '']]);
    await pshot(host, 'l1-opp');
    await P(null, 'كُشفت الإجابة · من أجاب؟ · <span class="ltr">+3</span>', [[LONG[0], 'who t1'], [LONG[1], 'who t2'], ['لم يُجب أحد', 'alt']]);
    await aud.evaluate(([a]) => { S8B.noClock(); S8B.reveal(a); S8B.side(0); }, [answer]);
    await pshot(host, 'l1-reveal');
    await shot(stage, aud, '10-two-reveal', 1400);
    await context.close();
  }

  // ===== 3. الجولة الفاصلة: بنافذة واحدة بأطول اسمين، ثم نافذة المقدّم =====
  for (const single of [true, false]) {
    const tie = await finalMatch({ results: ['xxxxxx', 'xxxxxx'], wheel: ['failed', 'failed'], names: LONG, winner: 2 });
    const fin = { ...tie.P.toFinal(tie.match, tie.modes), single };
    const context = await browser.newContext({ viewport: single ? { width: 1920, height: 1080 } : { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await H.usePin(context);
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(m => { localStorage.clear(); localStorage.setItem('big-challenge.match', JSON.stringify(m)); }, fin);
    await page.reload(); await H.unlock(page);
    if (single) {
      const frame = await H.stageFrame(page);
      await frame.waitForSelector('.scr.show[data-s="fin"]'); await wait(800);
      await go(frame, 'tiebreak'); await frame.waitForSelector('.scr.show[data-s="intro"]');
      await go(frame, 'act:show', 1500);
      const answer = await answerOf(page);
      const st = await frame.evaluate(() => document.getElementById('canvas').classList.contains('turn-2') ? 2 : 1);
      await overlay(frame);
      await frame.evaluate(([s]) => { S8B.clock(s, 'run', 21, 30); S8B.near([['إيقاف مؤقت', 'alt pause']]); S8B.ans('كشف الإجابة'); }, [st]);
      await shot(page, frame, '11-tb-run');
      await frame.evaluate(([a, s]) => { S8B.noClock(); S8B.ans(null); S8B.reveal(a); S8B.side(0);
        S8B.near([['أصاب', 'who t' + s], ['لم يُجب أحد', 'alt']]); }, [answer, st]);
      await shot(page, frame, '12-tb-reveal', 1400);
    } else {
      const aud = await context.newPage();
      await aud.setViewportSize({ width: 1920, height: 1080 });
      await aud.goto(base + 'audience.html');
      await aud.waitForSelector('.scr.show[data-s="fin"]', { timeout: 10000 });
      await page.click('#fCtl [data-act="tiebreak"]'); await aud.waitForSelector('.scr.show[data-s="intro"]');
      await wait(900); await page.click('#showQ'); await wait(1500);
      const st = await aud.evaluate(() => document.getElementById('canvas').classList.contains('turn-2') ? 2 : 1);
      await page.addStyleTag({ path: path.join(__dirname, 's8b.css') }); await page.addScriptTag({ path: path.join(__dirname, 's8b.js') });
      const mk = `<i class="mark t${st}"></i> دور <b class="tn t${st}">${LONG[st - 1]}</b>`;
      await page.evaluate(([w]) => S8B.presenter(w, 'بقي 21 ثانية', [['إيقاف مؤقت', 'alt'], ['كشف الإجابة', '']]), [mk]);
      await pshot(page, 'tb-run');
      await page.evaluate(([n, s]) => S8B.presenter(null, 'كُشفت الإجابة · هل أصاب؟', [[`أصاب ${n}`, 'who t' + s], ['لم يُجب أحد', 'alt']]), [LONG[st - 1], st]);
      await pshot(page, 'tb-reveal');
    }
    await context.close();
  }

  // ===== 4. د1 والمواجهة (الشاشة المشتركة) =====
  for (const [names, count] of [[SHORT, 'full'], [LONG, 'full'], [LONG, 'short']]) {
    const tag = (names === LONG ? 'long' : 'short') + (count === 'short' ? '-2' : '');
    const { context, stage, frame } = await newShared(browser);
    await frame.fill('#i1', names[0]); await frame.fill('#i2', names[1]);
    await go(frame, 'count:' + count, 400);
    await go(frame, 'draw', 3500);
    const W = await stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).winner), L = 3 - W;
    await go(frame, 'toPick', 1200);
    await overlay(frame);
    // قبل القرعة
    await frame.evaluate(() => S8B.d1Before());
    if (count === 'full') await shot(stage, frame, `13-d1-${tag}-before`, 900);
    // بعد القرعة: الفائز يختار الجولة 1
    await frame.evaluate(() => { document.querySelectorAll('.mc').forEach(c => { c.classList.remove('wait'); c.classList.add('avail'); }); document.getElementById('turnp').hidden = false;
      S8B.d1Buttons([['إلى المواجهة', '', true]]); });
    if (count === 'full') await shot(stage, frame, `14-d1-${tag}-drawn`, 900);
    const ids = count === 'full' ? ['letter', 'auction', 'ranking'] : ['letter', 'last-two'];
    await go(frame, 'pick:' + ids[0], 700); await go(frame, 'pick:' + ids[1], 1100);
    await frame.evaluate(() => S8B.d1Buttons([['تراجع', 'alt'], ['إلى المواجهة', '', true]]));
    if (count === 'full') await shot(stage, frame, `15-d1-${tag}-two`, 900);
    if (ids[2]) await go(frame, 'pick:' + ids[2], 1100);
    await frame.evaluate(([w, n, l]) => { S8B.d1Stamps(l); S8B.d1Starts(w, n); S8B.d1Buttons([['تراجع', 'alt'], ['إلى المواجهة', '']]); }, [W, names[W - 1], L]);
    await shot(stage, frame, `16-d1-${tag}-done`, 900);
    await go(frame, 'toFace', 3200);
    await frame.evaluate(([l]) => S8B.face(l), [L]);
    if (names === LONG) await shot(stage, frame, `17-face-${tag}`, 600);
    await context.close();
  }

  fs.writeFileSync(path.join(out, 'check.json'), JSON.stringify(results, null, 1));
  const all = results.flatMap(r => r.check), bad = all.filter(c => !c.ok).length;
  console.log(`\n${results.length} حالة، ${all.length} فحصاً: ${all.length - bad} سليم${bad ? '، و' + bad + ' فيه خلل' : ''}`);
  await browser.close();
})();
