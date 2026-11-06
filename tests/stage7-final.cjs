// اختبار آلي لمرحلة «النتيجة وإعلان الفائز» (ش7، الوثيقة 5.8 و8، design/final.md):
// وحدةً (دون متصفح): رصيد نهاية كل عنصر في match.ends، ومسار المباراة بما كسبه كل فريق (والتعديل اليدوي بين عنصرين في التالي،
// والمجموع = الرصيد)، والانتقال إلى النتيجة بعد آخر عنصر وحده، و«أعلن الفائز» للمتقدّم ولا إعلان عند التعادل، والتراجع.
// ثم بالمتصفح بالنافذة الواحدة (الوثيقة 1.13): نهاية الجولة الأخيرة ← «إلى النتيجة النهائية» ← المسار والشارة و«التالي: إعلان الفائز» ← «أعلن الفائز»:
// الحدّ يكتسح ويبقى، والاسم بلونه، والقصاصات تسقط ثم تُزال، ونبض الرقم. وفحص التداخل والشبكة في كل شاشة.
// ثم التعادل («التالي: الجولة الفاصلة» وزرها)، ثم أطول اسمين، وإعادة التحميل.
// الاستعمال: node tests/stage7-final.cjs [الرابط] [مجلد الصور]
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd } = require('./helpers.cjs');
const { finalMatch } = require('./final-match.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ===== 1. الوحدة =====
  const won = await finalMatch({ results: ['rrsxrr', 'rxrrsr'], wheel: ['won', 'failed'], adjust: [2, 1] });
  const { M, P, modes } = won;
  {
    const m = won.match, g = M.gains(m);
    check('بعد آخر جولة: التالي «النتيجة النهائية»', P.nextKind(m, modes) === 'final' && P.nextText(m, () => '') === 'التالي: النتيجة النهائية');
    check('رصيد نهاية كل عنصر محفوظ عند الانتقال إلى ما بعده (جولة ثم شريط)', m.ends.length === 2 && m.round.end && m.round.end[1] === m.scores[1]);
    check('المسار بترتيب المباراة: جولة · شريط · جولة', g.map(x => x.kind + (x.mode ?? '')).join() === 'roundletter,wheel,roundlast-two');
    check('مجموع الخانات يساوي الرصيد لكل فريق', [1, 2].every(k => g.reduce((s, x) => s + x.g[k], 0) === m.scores[k]));
    // الشريط: أداره الأول (الأقل نقاطاً) ونجح، وأخفق الثاني. فما للثاني في الشريط هو التعديل (+1) بعد نهاية الجولة الأولى.
    check('التعديل اليدوي بعد نهاية الجولة يدخل في العنصر التالي (الشريط)', g[1].g[2] === 1 && g[0].g[2] === m.ends[0][2]);
    check('لا نهاية قبل آخر عنصر', P.toFinal({ ...m, cursor: 0 }, modes).step !== 'final');
    const f = P.toFinal(m, modes);
    check('«إلى النتيجة النهائية»: الخطوة final بالنتيجة، والجولة الأخيرة محفوظة', f.step === 'final' && f.final.phase === 'fin' && f.round === m.round && M.isMatch(f));
    const w = P.announce(f);
    const lead = M.leaderOf(m.scores);
    check('«أعلن الفائز»: المتقدّم في الرصيد', lead && w.final.phase === 'win' && w.final.winner === lead);
    check('«أعلن الفائز» مرة ثانية لا يغيّر شيئاً', P.announce(w) === w);
    check('التراجع: من الفائز إلى النتيجة، ومنها إلى نهاية الجولة الأخيرة', P.undoFinal(w).final.phase === 'fin' && P.undoFinal(f).step === 'play' && !P.undoFinal(f).final && P.between(P.undoFinal(f), modes));
    const adjusted = M.adjustScore(f, 2, 4);
    check('تعديل الرصيد في النتيجة يدخل في العنصر الأخير، والمجموع يتبعه', M.gains(adjusted)[2].g[2] === g[2].g[2] + 4 && adjusted.scores[2] === m.scores[2] + 4);
    check('والتراجع إلى الجولة يحمل الرصيد المعدّل', P.undoFinal(adjusted).round.scores[2] === adjusted.scores[2]);
    // مباراة محفوظة قبل ش7 (لا ends): المجموع يبقى صحيحاً، والفرق في العنصر الأخير.
    const old = { ...m, ends: undefined };
    check('مباراة بلا ends (قبل ش7): لا خطأ، والمجموع = الرصيد', [1, 2].every(k => M.gains(old).reduce((s, x) => s + x.g[k], 0) === m.scores[k]));
  }
  const tie = await finalMatch({ results: ['xxxxxx', 'xxxxxx'], wheel: ['failed', 'failed'] });
  {
    const f = tie.P.toFinal(tie.match, tie.modes);
    check('التعادل (0 و0): لا إعلان، فالتالي الجولة الفاصلة', M.leaderOf(f.scores) === 0 && tie.P.announce(f) === f);
  }

  // ===== 2. بالمتصفح =====
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const clean = t => t.replace(/\s+/g, ' ').trim();
  const cls = (frame, c) => frame.evaluate(c => document.getElementById('canvas').classList.contains(c), c);
  const layout = async (frame, name) => {
    const r = await frame.evaluate(() => window.__stageCheck());
    check(`${name}: لا تداخل والشبكة سليمة (أدنى فراغ ${Math.round(r.minGap)})`, r.ok);
    if (!r.ok) console.log(r.problems.join('\n'));
  };
  async function open(match, { size = { width: 1366, height: 768 } } = {}) {
    const context = await browser.newContext({ viewport: size, serviceWorkers: 'block' });
    await usePin(context);
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && errors.push(m.text()));
    });
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(m => { localStorage.clear(); localStorage.setItem('big-challenge.match', JSON.stringify(m)); }, match);
    await page.reload();
    await unlock(page);
    return { context, page };
  }
  const card = frame => frame.$$eval('.scr.show .ctl .cbtn', els => els.map(e => e.textContent.trim()).join(' | '));

  // ===== 2.1 بالنافذة الواحدة (الوثيقة 1.13) =====
  {
    const { context, page } = await open(won.match, { size: { width: 1920, height: 1080 } });
    let aud = await stageFrame(page);
    await aud.waitForSelector('.scr.show[data-s="end"]');
    check('نهاية الجولة الأخيرة: «إلى النتيجة النهائية» مفعّل في البطاقة', (await card(aud)) === 'إلى النتيجة النهائية' && !(await aud.$eval('.scr.show .ctl .cbtn', b => b.classList.contains('off'))));
    check('والجمهور: «التالي: النتيجة النهائية»', clean(await aud.textContent('#next')) === 'التالي: النتيجة النهائية');
    await cmd(aud, 'next');
    await aud.waitForSelector('.scr.show[data-s="fin"]');
    await wait(1400);
    const segs = await aud.$$eval('#finTrack .seg', els => els.map(e => ({ wheel: e.classList.contains('wheel'), name: e.querySelector('.mname').textContent, g1: e.querySelector('.g1').textContent, g2: e.querySelector('.g2').textContent })));
    const g = M.gains(won.match), sign = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
    check('النتيجة النهائية: ثلاث خانات بترتيب المباراة (الحرف المعيّن · الشريط · آخر حرفين)', segs.map(s => s.name).join('|') === 'الحرف المعيّن|الشريط|آخر حرفين' && segs[1].wheel);
    check('وفي كل خانة ما كسبه كل فريق بإشارته', segs.every((s, i) => s.g1 === sign(g[i].g[1]) && s.g2 === sign(g[i].g[2])));
    check('الرقمان الكبيران هما المجموع', clean(await aud.textContent('#s1')) === String(won.match.scores[1]) && clean(await aud.textContent('#s2')) === String(won.match.scores[2]));
    check('شارة النمط «انتهت المباراة» ولا شارة ثانية', clean(await aud.textContent('#mode')) === 'انتهت المباراة' && await aud.evaluate(() => document.getElementById('b1').classList.contains('off') && document.getElementById('b2').classList.contains('off')));
    check('«التالي: إعلان الفائز» نصاً بلا مربع، والحدّ في المنتصف', clean(await aud.textContent('#next')) === 'التالي: إعلان الفائز' && await aud.evaluate(() => document.getElementById('box').classList.contains('bare'))
      && !(await cls(aud, 'turn-1')) && !(await cls(aud, 'turn-2')));
    check('لا «يتقدم» ولا «بفارق» ولا «سرقة»', !/يتقدم|يتأخر|فارق|سرقة/.test(await aud.textContent('#canvas')));
    await layout(aud, 'النتيجة النهائية');
    await page.screenshot({ path: path.join(shots, 's7-fin.png') });
    check('البطاقة: «أعلن الفائز»', (await card(aud)) === 'أعلن الفائز');

    await wait(800);
    await cmd(aud, 'announce');
    await aud.waitForSelector('.scr.show[data-s="win"]');
    const w = M.leaderOf(won.match.scores);
    await wait(1100);
    const conf = await aud.$$eval('#confetti span', els => els.length);
    check('إعلان الفائز: القصاصات تسقط (140 شظية)', conf === 140);
    check('والقصاصات بلا أصفر', await aud.$$eval('#confetti span', els => els.every(e => !/255, 195, 0|FFC300/i.test(getComputedStyle(e).backgroundColor))));
    check('ورقم الفائز ينبض (lead)', await aud.evaluate(w => document.getElementById('s' + w).classList.contains('lead'), w));
    check('«الفائز بالمباراة» والاسم بلون فريقه', clean(await aud.textContent('#winSub')) === 'الفائز بالمباراة' && clean(await aud.textContent('#champ')) === won.match.teams[w]
      && await aud.evaluate(w => document.getElementById('champ').classList.contains('t' + w), w));
    check('الحدّ يكتسح إلى الفائز ويبقى، ولا مربع إعلان', await cls(aud, 'turn-' + w) && await aud.evaluate(() => document.getElementById('box').hidden));
    await wait(6200);
    check('القصاصات تُزال بعد نحو 6 ثوانٍ، والحدّ باقٍ على الفائز', (await aud.$$('#confetti span')).length === 0 && await cls(aud, 'turn-' + w));
    await layout(aud, 'الفائز');
    await page.screenshot({ path: path.join(shots, 's7-win.png') });
    check('البطاقة: «مباراة جديدة»', (await card(aud)) === 'مباراة جديدة');

    // إعادة تحميل شاشة الجمهور: الفائز كما هو، والحدّ عليه، ولا قصاصات تتكرر.
    await aud.evaluate(() => location.reload());
    aud = await stageFrame(page);
    await aud.waitForSelector('.scr.show[data-s="win"]', { timeout: 10000 });
    await wait(1200);
    check('إعادة تحميل الجمهور: الفائز والحدّ كما هما، ولا قصاصات', await cls(aud, 'turn-' + w) && (await aud.$$('#confetti span')).length === 0);
    // التراجع: إلى النتيجة، ثم إلى نهاية الجولة الأخيرة.
    await cmd(aud, 'undo');
    await aud.waitForSelector('.scr.show[data-s="fin"]');
    check('التراجع من الفائز: النتيجة النهائية، والحدّ في المنتصف', !(await cls(aud, 'turn-1')) && !(await cls(aud, 'turn-2')));
    // تعديل الرصيد في النتيجة: الرقم الكبير وخانة الجولة الأخيرة يتبعانه.
    await cmd(aud, 'scores');
    await page.waitForSelector('#scores:not([hidden])');
    await page.click('#scores [data-team="2"][data-d="1"]');
    await page.click('#closeScores');
    await wait(400);
    check('تعديل الرصيد في النتيجة: الرقم وخانة الجولة الأخيرة يتبعانه', clean(await aud.textContent('#s2')) === String(won.match.scores[2] + 1)
      && clean(await aud.textContent('#finTrack .seg:last-child .g2')) === sign(g[2].g[2] + 1));
    await wait(800);
    await cmd(aud, 'undo');
    await aud.waitForSelector('.scr.show[data-s="end"]');
    await wait(800);
    check('التراجع من النتيجة: نهاية الجولة الأخيرة و«إلى النتيجة النهائية»', (await card(aud)) === 'إلى النتيجة النهائية');
    await context.close();
  }

  // ===== 2.2 التعادل =====
  {
    const { context, page } = await open(tie.match, { size: { width: 1920, height: 1080 } });
    const aud = await stageFrame(page);
    await aud.waitForSelector('.scr.show[data-s="end"]');
    await cmd(aud, 'next');
    await aud.waitForSelector('.scr.show[data-s="fin"]');
    await wait(1400);
    check('التعادل: «التالي: الجولة الفاصلة» والرقمان متساويان', clean(await aud.textContent('#next')) === 'التالي: الجولة الفاصلة' && clean(await aud.textContent('#s1')) === clean(await aud.textContent('#s2')));
    check('البطاقة: «الجولة الفاصلة» مفعّلاً (مرحلة «كسر التعادل»، stage7-tiebreak)', (await card(aud)) === 'الجولة الفاصلة' && !(await aud.$eval('.scr.show .ctl .cbtn', b => b.classList.contains('off'))));
    await layout(aud, 'النتيجة: تعادل');
    await page.screenshot({ path: path.join(shots, 's7-fintie.png') });
    await context.close();
  }

  // ===== 2.3 النافذة الواحدة بأطول اسمين =====
  {
    const longWon = await finalMatch({ results: ['rrrrrr', 'srrrrr'], wheel: ['won', 'won'], names: ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'], winner: 2 });
    const { context, page } = await open(longWon.match, { size: { width: 1920, height: 1080 } });
    const frame = await stageFrame(page);
    await cmd(frame, 'next');
    await frame.waitForSelector('.scr.show[data-s="fin"]');
    await wait(1500);
    check('بنافذة واحدة: النتيجة النهائية و«أعلن الفائز» في البطاقة، والزوايا الثلاث', !!(await frame.$('.scr.fin [data-cmd="announce"]'))
      && !!(await frame.$('#cornerA [data-cmd="undo"]')) && !!(await frame.$('#cornerA [data-cmd="more"]')) && !(await frame.$('#cornerB .cbtn, #cornerC .cbtn')));
    await layout(frame, 'النتيجة بنافذة واحدة وأطول اسمين');
    await page.screenshot({ path: path.join(shots, 's7-fin-w1long1.png') });
    await cmd(frame, 'announce');
    await frame.waitForSelector('.scr.show[data-s="win"]');
    await wait(1100);
    const w = M.leaderOf(longWon.match.scores);
    check('بنافذة واحدة: الفائز باسمه الأطول سطراً واحداً، والقصاصات، و«مباراة جديدة» في البطاقة', clean(await frame.textContent('#champ')) === longWon.match.teams[w]
      && await frame.evaluate(() => { const c = document.getElementById('champ'); return c.getBoundingClientRect().height < 96 * 1.3 * 1.5 * (document.getElementById('canvas').getBoundingClientRect().width / 1920); })
      && (await frame.$$('#confetti span')).length === 140 && !!(await frame.$('.scr.win [data-cmd="new"]')));
    await wait(6200);
    await layout(frame, 'الفائز بنافذة واحدة وأطول اسمين');
    await page.screenshot({ path: path.join(shots, 's7-win-w1long1.png') });
    await cmd(frame, 'undo');
    await frame.waitForSelector('.scr.show[data-s="fin"]');
    check('بنافذة واحدة: «تراجع» يعود إلى النتيجة', true);
    // إعادة تحميل الصفحة كلها: تعود النتيجة كما هي.
    await page.reload();
    await unlock(page);
    const again = await stageFrame(page);
    await again.waitForSelector('.scr.show[data-s="fin"]', { timeout: 10000 });
    check('إعادة التحميل: النتيجة النهائية كما هي', (await again.$$('#finTrack .seg')).length === 3);
    // «مباراة جديدة» من الفائز تعود إلى الإعداد.
    await cmd(again, 'announce');
    await again.waitForSelector('.scr.show[data-s="win"]');
    page.once('dialog', d => d.accept());
    await wait(800);
    await cmd(again, 'new');
    await again.waitForSelector('[data-hero="start"] .hlogo', { timeout: 8000 });
    check('«مباراة جديدة» من الفائز: الإعداد', true);
    await context.close();
  }

  await browser.close();
  process.exit(finish(errors) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
