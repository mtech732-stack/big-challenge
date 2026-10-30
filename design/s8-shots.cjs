// صور ش8 وقياسها (design/s8.md 6): تبلغ اللعبة المبنية كل حالة بالنقر على الشاشة المشتركة كما في tests/،
// ثم تضيف طبقة التصوّر design/s8.css وdesign/s8.js، وتصوّر، وتفحص التداخل والشبكة بـ design/check.js على 1920 و1366 و1280 و3840،
// وتفكّ الباركود المرسوم من الصورة بقارئ مستقل (jsQR) فيطابق النص حرفاً حرفاً.
// الاستعمال: node design/s8-shots.cjs [الرابط] [مجلد الصور] [مجلد المكتبتين]
//   مجلد المكتبتين فيه node_modules بـ qrcode-generator@2.0.4 وjsqr@1.4.0 وpngjs@7.0.0 (للتصوّر والفك وحدهما، لا للعبة).
// ثم: node design/ratio.cjs [مجلد الصور]/*.png
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const H = require('../tests/helpers.cjs');

const base = process.argv[2] || 'http://localhost:8000/';
const out = process.argv[3] || require('os').tmpdir();
const libs = path.join(process.argv[4] || '.', 'node_modules');
const QRLIB = path.join(libs, 'qrcode-generator/dist/qrcode.js');
const jsQR = require(path.join(libs, 'jsqr'));
const { PNG } = require(path.join(libs, 'pngjs'));
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const RANK = require(path.join(root, 'content/packs/general/ranking.json')).lists;
const AUC = require(path.join(root, 'content/packs/general/auction.json')).topics;

// نص الباركود (s8.md 2.2): العنوان سطراً، ثم عنصر في كل سطر بصيغه البديلة بين قوسين. والترتيب برقم الخانة، والفخ «فخ».
const alts = i => (i.alts?.length ? ` (${i.alts.join('، ')})` : '');
const rankText = l => [l.title, ...l.items.map(i => `${i.rank}${i.rank > 10 ? ' فخ' : ''} · ${i.name}${alts(i)}`)].join('\n');
const aucText = t => [`${t.topic} · ${t.items.length}`, ...t.items.map(i => i.name + alts(i))].join('\n');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  for (const LONG of [false, true]) {
    const NAMES = LONG ? ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'] : ['الصقور', 'النجوم'];
    const tag = LONG ? '-long' : '';
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    await H.usePin(context);
    const stage = await context.newPage();
    const errors = [];
    stage.on('pageerror', e => errors.push(e.message));
    await stage.goto(base);
    await stage.evaluate(() => localStorage.clear()); await stage.reload();
    await H.unlock(stage);
    const frame = await H.stageFrame(stage);
    const go = async c => { await frame.waitForSelector(`[data-cmd="${c}"]`, { state: 'attached', timeout: 8000 }); await frame.evaluate(c => document.querySelector(`[data-cmd="${c}"]`).click(), c); await wait(900); };
    const overlay = async () => {
      if (await frame.evaluate(() => !!window.S8)) return;
      await frame.addStyleTag({ path: path.join(__dirname, 's8.css') });
      await frame.addScriptTag({ path: QRLIB });
      await frame.addScriptTag({ path: path.join(__dirname, 's8.js') });
      await frame.addScriptTag({ path: path.join(__dirname, 'check.js') });
    };
    const long = () => LONG && frame.evaluate(() => S8.scores('188', '176'));
    const shot = async (name, opts = {}) => {
      await wait(opts.settle ?? 900);
      const file = path.join(out, `${name}${tag}.png`);
      await stage.screenshot({ path: file });
      const check = [];
      for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 800], [3840, 2160]]) {
        await stage.setViewportSize({ width: w, height: h }); await wait(250);
        const r = await frame.evaluate(() => layoutCheck({ canvas: document.getElementById('canvas'), grid: true }));
        let pair = '';
        for (let i = 0; i < r.items.length; i++) for (let j = i + 1; j < r.items.length; j++) { const a = r.items[i], b = r.items[j];
          const g = Math.max(b.x1 - a.x2, a.x1 - b.x2, b.y1 - a.y2, a.y1 - b.y2); if (Math.abs(g - r.minGap) < .01) pair = a.name + ' ↔ ' + b.name; }
        check.push({ w, ok: r.ok, gap: Math.round(r.minGap * 10) / 10, pair, problems: r.problems });
      }
      await stage.setViewportSize({ width: 1920, height: 1080 }); await wait(250);
      const row = { name: name + tag, check };
      if (opts.qr) {
        const png = PNG.sync.read(fs.readFileSync(file));
        const got = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
        row.qr = { ...opts.qr, decoded: !!got, same: got ? Buffer.from(got.binaryData).toString('utf8') === opts.text : false };
      }
      results.push(row);
      const bad = check.filter(c => !c.ok);
      console.log(`${bad.length ? '✗' : '✓'} ${name}${tag} · أدنى فراغ ${check.map(c => c.gap).join('/')} (${check[0].pair})${row.qr ? ` · باركود v${row.qr.version} ${row.qr.bytes} بايت، وحدة ${row.qr.unit}، فُكّ ${row.qr.decoded ? (row.qr.same ? 'مطابقاً' : 'مختلفاً') : 'لا'}` : ''}${bad.length ? '\n   ' + bad.map(c => c.w + ': ' + c.problems.join('، ')).join('\n   ') : ''}`);
    };

    await frame.waitForSelector('[data-cmd="draw"]');
    await H.sharedToFace(frame, { names: NAMES, picks: ['ranking', 'auction'] });
    await wait(3000);
    // ===== 1. المواجهة =====
    await overlay();
    await frame.evaluate(() => S8.face(false)); await shot('01-face');
    await frame.evaluate(() => S8.face(true)); await shot('02-face-menu');

    // ===== 2–3. الترتيب =====
    await frame.evaluate(() => { document.getElementById('s8menu')?.remove(); document.getElementById('s8opts')?.remove(); document.querySelector('[data-cmd="single"]').click(); }); await wait(1200);
    await go('act:show');
    await overlay(); await long();
    const title = await frame.textContent('#rtitle');
    const list = RANK.find(l => l.title.startsWith(title.trim()));
    const rtext = rankText(list);
    let info = await frame.evaluate(t => S8.qr(t), rtext);
    await shot('03-rank-qr', { qr: info, text: rtext });
    // أطول ترتيب في البنك بالعنوان نفسه على الشاشة: الحجم وحده يتغير
    const longest = RANK.map(rankText).sort((a, b) => Buffer.byteLength(b) - Buffer.byteLength(a))[0];
    info = await frame.evaluate(t => S8.qr(t), longest);
    await shot('04-rank-qr-longest', { qr: info, text: longest });
    await frame.evaluate(() => { S8.unqr(); S8.near([]); S8.board(); S8.reshow(); document.querySelectorAll('#near .cbtn').forEach(b => b.style.display = ''); S8.placeNear(); });
    await shot('05-rank-read');

    await go('act:start:one');
    const it = n => list.items[n - 1].name;
    const t0 = await frame.evaluate(() => document.getElementById('canvas').classList.contains('turn-1') ? 1 : 2), t1 = 3 - t0;
    await frame.evaluate(([a, b, x, y]) => { S8.board({ 3: [a, x], 7: [b, y] }, true); S8.near([['خطأ', 'no'], ['أنهِ القائمة', 'alt']]); S8.reshow(); }, [t0, t1, it(3), it(7)]);
    await long();
    await shot('06-rank-judge');
    // أصاب صاحب الدور الخانة 10: لحظة «صحيحة» 1.2 ثانية، الحدّ عنده والخانة بلونه والمربع يعلن الإصابة. ثم الدور للخصم كالحالة 06 بلا مربع
    await frame.evaluate(([a, b, x, y, z, n1]) => {
      S8.board({ 3: [a, x], 7: [b, y], 10: [a, z] }, false); S8.turn(a, false); document.querySelectorAll('.team .cnt').forEach(c => c.textContent = '');
      S8.box(`${n1} · <span class="ltr">+10</span>`, a, 'المركز 10'); S8.near([]);
    }, [t0, t1, it(3), it(7), it(10), NAMES[t0 - 1]]);
    await long();
    await shot('07-rank-hit');
    // وقع الخصم في الفخ 13: لحظة الفخ 1.2 ثانية، الحدّ في المنتصف، والخانة بلونه ورقمها «−13». ثم الدور لصاحبه كالحالة 06 بلا مربع
    await frame.evaluate(([a, b, x, y, z, w, n2]) => {
      S8.board({ 3: [a, x], 7: [b, y], 10: [a, z], 13: [b, w] }, false); S8.turn(0, false);
      S8.box(`${n2} · <span class="ltr">−13</span>`, b, 'فخّ المركز 13'); S8.near([]);
    }, [t0, t1, it(3), it(7), it(10), list.items[12].name, NAMES[t1 - 1]]);
    await long();
    await shot('08-rank-trap');
    // «خطأ»: لا نقاط بلا مربع، والحدّ في المنتصف، وزرّا لون الدور التالي
    await frame.evaluate(([a, b, x, y, z, w]) => {
      S8.board({ 3: [a, x], 7: [b, y], 10: [a, z], 13: [b, w] }, false); S8.turn(0, false);
      S8.box('لا نقاط', 0, 'لم تُكشف خانة', true); S8.near([['التالي', 'turn t1'], ['التالي', 'turn t2']]);
    }, [t0, t1, it(3), it(7), it(10), list.items[12].name]);
    await long();
    await shot('09-rank-wrong');

    // إلى الشريط: نهاية القائمتين بـ «أنهِ القائمة» و«اعتمد النقاط»
    for (const last of [false, true]) {
      if (last) await go('act:start:one');
      await go('act:finish'); await go('act:commit'); await go('act:next');
    }
    await go('next'); // نهاية الجولة ← الشريط
    // ===== 4. الشريط =====
    await stage.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0.05; });
    await wait(800);
    await overlay(); await long();
    await frame.evaluate(() => S8.band());
    await shot('10-strip-ready');
    await go('act:spin'); await wait(7000);
    await stage.evaluate(() => { Math.random = window.__rnd; });
    await frame.evaluate(() => {
      S8.band(); const sq = document.querySelector('#letter.slot b'); if (sq) sq.textContent = '+10';
      S8.near([['نجح · <span class="ltr">+10</span>'], ['لم ينجح', 'no']]);
      document.getElementById('canvas').classList.remove('running');
      document.querySelectorAll('.team .cnt').forEach(c => c.textContent = '');
    });
    await long();
    await shot('11-strip-challenge');
    // ===== 5. المزاد =====
    // إلى المزاد: كل ما يتقدّم بالمباراة حتى يظهر موضوع المزاد
    for (let i = 0; i < 40 && !(await frame.$('.scr.auc.show')); i++) {
      const c = await frame.evaluate(() => ['act:won', 'act:start', 'act:next', 'act:finish', 'act:spin', 'next', 'act:show']
        .find(c => { const b = document.querySelector(`[data-cmd="${c}"]`); return b && !b.classList.contains('off'); }));
      if (c) await go(c); else await wait(1000);
    }
    if (await frame.$('.scr.auc.show')) {
      await overlay(); await long();
      const topic = (await frame.textContent('#topic')).trim();
      const t = AUC.find(x => x.topic === topic);
      const atext = aucText(t);
      info = await frame.evaluate(x => S8.qr(x), atext);
      await shot('12-auction-qr', { qr: info, text: atext });
      const al = AUC.map(aucText).sort((a, b) => Buffer.byteLength(b) - Buffer.byteLength(a))[0];
      info = await frame.evaluate(x => S8.qr(x), al);
      await shot('13-auction-qr-longest', { qr: info, text: al });
    } else console.log('✗ لم يبلغ المزاد');
    if (errors.length) console.log('أخطاء الصفحة:', errors.join(' | '));
    await context.close();
  }
  fs.writeFileSync(path.join(out, 'check.json'), JSON.stringify(results, null, 1));
  await browser.close();
})();
