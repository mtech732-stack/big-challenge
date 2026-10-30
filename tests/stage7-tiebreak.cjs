// اختبار آلي لمرحلة «كسر التعادل» (ش7، الوثيقة 5.8، design/final.md 2.3–2.5 و5 و6):
// وحدةً (دون متصفح): أسئلة tiebreak وحدها، ويبدأ الخاسر في القرعة كل محاولة، ومن أصاب وأخطأ خصمه فاز، وإن أصابا أو أخطآ معاً
// فمحاولة جديدة بسؤالين جديدين، وانتهاء الوقت «لم يُصب» بلا انتقال للخصم، وللإصابة 3 نقاط (TIE_POINTS، بقرار المالك) تظهر خانةً في النتيجة النهائية بعدها،
// ولا إجابة للجمهور قبل الحكم، والتراجع (إلى النتيجة قبل أي فعل، ومن الفائز إلى النتيجة إلى آخر حكم).
// ثم بالمتصفح بنافذتين: المقدمة والسؤال والعدّاد وانتهاء الوقت والحكم والإعلان، وفحص التداخل والشبكة، ونافذة المقدّم بلا تمرير.
// ثم بالنافذة الواحدة بأطول اسمين وأطول سؤال (85 حرفاً): محاولتان حتى الحسم.
// الاستعمال: node tests/stage7-tiebreak.cjs [الرابط] [مجلد الصور]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd } = require('./helpers.cjs');
const { finalMatch } = require('./final-match.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const root = path.join(__dirname, '..');
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const T = await import(path.join(root, 'js/tiebreak.js'));
  const unit = T.default;
  const R = await import(path.join(root, 'js/round.js'));

  // ===== 1. الوحدة =====
  const tie = await finalMatch({ results: ['xxxxxx', 'xxxxxx'], wheel: ['failed', 'failed'], winner: 1 });
  const { M, P, content } = tie;
  const modes = [...tie.modes, unit];
  const letter = content['letter.json'];
  {
    const fin = P.toFinal(tie.match, modes);
    check('لا جولة فاصلة والنتيجة غير متعادلة', P.toTiebreak(M.adjustScore(fin, 1, 2), { modes, content }).step === 'final');
    let m = P.toTiebreak(fin, { modes, content });
    const s0 = m.round.state;
    check('«الجولة الفاصلة»: وحدة في match.round، والجولة الأخيرة محفوظة للتراجع', m.step === 'play' && m.round.tiebreak && m.round.mode === 'tiebreak' && m.lastRound === fin.round);
    check('يبدأ الخاسر في القرعة (فاز الأول بها، فيبدأ الثاني)', tie.match.winner === 1 && s0.first === 2);
    check('أسئلتها أسئلة tiebreak وحدها (20)', s0.questions.length === 20 && s0.questions.every(q => letter.questions.find(x => x.id === q.id)?.tiebreak));
    let a = unit.audience(s0);
    check('المقدمة: القاعدة وسطرها ومن يبدأ، ولا «صعب» ولا «سرقة» ولا «القرعة»', a.screen === 'intro' && a.rule === 'من أصاب وأخطأ خصمه فاز' && a.sub === 'سؤال لكل فريق بالتناوب · 30 ثانية للسؤال'
      && a.turn === 2 && !/صعب|سرقة|القرعة/.test(JSON.stringify(a)));
    check('ولا تراجع في المقدمة إلا إلى النتيجة النهائية', P.undo(m, modes).step === 'final' && P.undo(m, modes).final.phase === 'fin' && P.undo(m, modes).round === fin.round);
    const go = x => { m = P.act(m, modes, x); };
    go('show');
    a = unit.audience(m.round.state);
    const q1 = m.round.state.questions[0];
    check('السؤال الأول: للذي يبدأ، والحرف والسؤال، و30 ثانية، والمحاولة 1', a.screen === 'ask' && a.turn === 2 && a.letter === q1.box && a.question === q1.prompt && a.clock === 30 && a.attempt === 1);
    check('ولا إجابة قبل الحكم', !JSON.stringify(a).includes(q1.answer) && a.answer === undefined);
    check('الأفعال: «ابدأ · 30» و«صحيحة» و«خاطئة»', unit.actions(m.round.state).map(x => x.label).join() === 'ابدأ · 30,صحيحة,خاطئة');
    go('start');
    check('«ابدأ»: عدّاد 30', m.round.timer?.seconds === 30);
    m = P.act(m, modes, 'timeout', m.round.timer.id);
    a = unit.audience(m.round.state);
    check('انتهى الوقت: «لم يُصب» بلا انتقال للخصم ولا عدّاد', a.phase === 'decided' && a.verdict.label === 'لم يُصب' && a.verdict.who === 2 && a.verdict.team === 0 && !m.round.timer && a.turn === 2);
    check('والإجابة بعد الحكم', a.answer === q1.answer);
    check('للإصابة 3 نقاط (TIE_POINTS)، ولم يُصب فلا نقاط', T.TIE_POINTS === 3 && m.scores[1] === 0 && m.scores[2] === 0);
    check('بعد الأول: «التالي» وحده', unit.actions(m.round.state).map(x => x.id).join() === 'next');
    go('next');
    a = unit.audience(m.round.state);
    check('السؤال الثاني: للآخر، بسؤال جديد', a.turn === 1 && a.question === m.round.state.questions[1].prompt && a.n === 2);
    go('wrong');
    check('أخطآ معاً: «سؤالان جديدان · المحاولة 2»، ولا إعلان', unit.presenter(m.round.state).outcome === 'miss' && unit.actions(m.round.state).map(x => x.label).join() === 'سؤالان جديدان · المحاولة 2'
      && P.act(m, modes, 'announce').round.state === m.round.state);
    go('again');
    a = unit.audience(m.round.state);
    check('المحاولة 2: يبدؤها الفريق نفسه بسؤال ثالث', a.attempt === 2 && a.turn === 2 && a.question === m.round.state.questions[2].prompt && a.n === 1);
    go('correct'); go('next'); go('correct');
    check('أصابا معاً: محاولة 3', unit.presenter(m.round.state).outcome === 'hit' && unit.actions(m.round.state)[0].id === 'again');
    go('again'); go('correct');
    a = unit.audience(m.round.state);
    check('أصاب: «[الاسم] · أصاب · +3» والحدّ له ونقاطه', a.verdict.label === 'أصاب · +3' && a.verdict.team === 2 && a.verdict.who === 2 && a.verdict.points === 3 && m.scores[2] === 6 && m.scores[1] === 3);
    go('next');
    const beforeWrong = m;
    go('wrong');
    check('أصاب الأول وأخطأ الثاني: فاز الأول بالمحاولة، و«أعلن الفائز»', unit.presenter(m.round.state).outcome === 2 && unit.actions(m.round.state)[0].label === 'إلى النتيجة النهائية');
    check('التراجع عن آخر حكم: السؤال قبل الحكم', P.undo(m, modes).round.state.phase === beforeWrong.round.state.phase);
    go('announce');
    check('«إلى النتيجة النهائية»: الخطوة final بالنتيجة (tb) وفيها نقاط الجولة الفاصلة', m.step === 'final' && m.final.phase === 'fin' && m.final.tb && m.scores[1] === 3 && m.scores[2] === 6);
    const path = M.gains(m), lastG = path[path.length - 1];
    check('المسار: خانة «الجولة الفاصلة» في آخره بما كسبه كلٌّ فيها، والمجموع الرصيد', path.length === 4 && lastG.kind === 'tiebreak' && lastG.g[1] === 3 && lastG.g[2] === 6
      && path.slice(0, 3).every(x => x.g[1] === 0 && x.g[2] === 0) && [1, 2].every(t => path.reduce((n, x) => n + x.g[t], 0) === m.scores[t]));
    const won = P.announce(m);
    check('«أعلن الفائز»: الفائز من الجولة الفاصلة (tb)', won.final.phase === 'win' && won.final.winner === 2 && won.final.tb);
    check('التراجع من الفائز: النتيجة النهائية بخانة الجولة الفاصلة', P.undoFinal(won).final.phase === 'fin' && P.undoFinal(won).final.tb && !P.undoFinal(won).final.winner);
    const back = P.undoFinal(m);
    check('التراجع من النتيجة: آخر حكم في الجولة الفاصلة، والرصيد قبله', back.step === 'play' && back.round.state.phase === 'decided' && unit.presenter(back.round.state).outcome === 2 && back.scores[2] === 6 && back.scores[1] === 3);
    check('الأسئلة التي ظهرت (used): ستة، بلا تكرار', unit.used(m.round.state).length === 6 && new Set(unit.used(m.round.state)).size === 6);
    check('والتراجع إلى النتيجة قبل الجولة الفاصلة يرفع خانتها', M.gains(P.undo(P.toTiebreak(fin, { modes, content }), modes)).length === 3);
    // الأسئلة التي ظهرت على الجهاز تُترك ما بقي غيرها.
    const seen = letter.questions.filter(q => q.tiebreak).slice(0, 18).map(q => q.id);
    const fresh = unit.setup({ content: letter, first: 1, seen, rng: Math.random });
    check('ما لم يظهر من أسئلتها أولاً (ذاكرة الأسئلة)', fresh.questions.slice(0, 2).every(q => !seen.includes(q.id)));
    // نفاد الأسئلة: تعود إلى أولها، فلا تقف.
    const st = { ...fresh, qi: 39 };
    check('إن نفدت الأسئلة عادت إلى أولها', unit.audience({ ...st, phase: 'ready', k: 0, hits: [null, null] }).question === fresh.questions[39 % 20].prompt);
  }

  // ===== 2. بالمتصفح =====
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const clean = t => t.replace(/\s+/g, ' ').trim();
  const cls = (frame, c) => frame.evaluate(c => document.getElementById('canvas').classList.contains(c), c);
  const side = async f => (await cls(f, 'turn-1')) ? 1 : (await cls(f, 'turn-2')) ? 2 : 0;
  const layout = async (frame, name) => {
    const r = await frame.evaluate(() => window.__stageCheck());
    check(`${name}: لا تداخل والشبكة سليمة (أدنى فراغ ${Math.round(r.minGap)})`, r.ok);
    if (!r.ok) console.log(r.problems.join('\n'));
  };
  const noScroll = async (page, name) => {
    const r = await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
    check(`نافذة المقدّم (${name}): بلا تمرير`, r);
  };
  const badges = f => f.evaluate(() => [document.getElementById('mode').textContent, ...['b1', 'b2'].map(id => document.getElementById(id).classList.contains('off') ? '' : document.getElementById(id).textContent.trim())].join('|'));
  const LONGQ = 'أصغر دولة في العالم مساحةً، وتقع كلها داخل مدينة روما، ويسكنها أقل من ألف شخص اليوم تقريباً';

  async function open(match, { size = { width: 1366, height: 768 }, longQ = false } = {}) {
    const context = await browser.newContext({ viewport: size, serviceWorkers: 'block' });
    await usePin(context);
    if (longQ) {
      const data = { ...letter, questions: letter.questions.map(q => (q.tiebreak ? { ...q, prompt: LONGQ.slice(0, 85) } : q)) };
      await context.route('**/content/packs/general/letter.json', route => route.fulfill({ json: data }));
    }
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
  async function audience(context) {
    const a = await context.newPage();
    await a.setViewportSize({ width: 1920, height: 1080 });
    await a.goto(base + 'audience.html');
    await a.waitForFunction(() => !document.getElementById('canvas').classList.contains('locked') && document.querySelector('.scr.show')?.dataset.s !== 'q', null, { timeout: 10000 });
    return a;
  }
  const fin = P.toFinal(tie.match, modes);
  const names = tie.match.teams;

  // ===== 2.1 بنافذتين =====
  {
    const { context, page } = await open(fin);
    const aud = await audience(context);
    await aud.waitForSelector('.scr.show[data-s="fin"]');
    await page.click('#fCtl [data-act="tiebreak"]');
    await aud.waitForSelector('.scr.show[data-s="intro"]');
    await wait(900);
    check('مقدمة الجولة الفاصلة: القاعدة وسطرها و«يبدأ: [الثاني]»', clean(await aud.textContent('#rule')) === 'من أصاب وأخطأ خصمه فاز'
      && clean(await aud.textContent('#ruleSub')) === 'سؤال لكل فريق بالتناوب · 30 ثانية للسؤال' && clean(await aud.textContent('#starter')) === 'يبدأ: ' + names[2]);
    check('والشارتان «الجولة الفاصلة» و«تعادل»، والحدّ في المنتصف', await badges(aud) === 'الجولة الفاصلة|تعادل|' && await side(aud) === 0);
    await layout(aud, 'مقدمة الجولة الفاصلة');
    await aud.screenshot({ path: path.join(shots, 's7-tie.png') });
    // الملاحظة 41: «تراجع» في المقدمة يعيد إلى النتيجة النهائية.
    check('نافذة المقدّم: «تراجع» في المقدمة', await page.isVisible('#tbUndo'));
    await page.click('#tbUndo');
    await aud.waitForSelector('.scr.show[data-s="fin"]');
    check('«تراجع» من المقدمة: النتيجة النهائية بالتعادل', clean(await page.textContent('#fCtl')) === 'الجولة الفاصلة' && (await aud.$$('#finTrack .seg')).length === 3);
    await wait(800);
    await page.click('#fCtl [data-act="tiebreak"]');
    await aud.waitForSelector('.scr.show[data-s="intro"]');
    await wait(900);
    check('نافذة المقدّم: «الجولة الفاصلة»، و«دور [الثاني] · خسر القرعة يبدأ»، والقواعد الأربع، و«السؤال الأول · دور [الثاني]»',
      clean(await page.textContent('#roundChip')) === 'الجولة الفاصلة' && clean(await page.textContent('#introWho')) === `دور ${names[2]} · خسر القرعة يبدأ`
      && (await page.$$('#introBrief .rule-line')).length === 4 && clean(await page.textContent('#showQ')) === `السؤال الأول · دور ${names[2]}`);
    await noScroll(page, 'المقدمة');
    await page.click('#showQ');
    await aud.waitForSelector('.scr.show[data-s="q"]');
    await wait(1200);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
    const q = st.questions[0];
    check('السؤال: الحرف والسؤال، و«المحاولة 1»، والحدّ للثاني', clean(await aud.textContent('#letter')) === q.box && clean(await aud.textContent('#label')) === q.prompt
      && await badges(aud) === 'الجولة الفاصلة|المحاولة 1|' && await side(aud) === 2);
    check('ولا إجابة على شاشة الجمهور قبل الحكم', !(await aud.textContent('#canvas')).includes(q.answer));
    await layout(aud, 'سؤال الجولة الفاصلة');
    await aud.screenshot({ path: path.join(shots, 's7-tbq.png') });
    check('نافذة المقدّم: «الجولة الفاصلة · المحاولة 1» والإجابة النموذجية', clean(await page.textContent('#roundChip')) === 'الجولة الفاصلة · المحاولة 1' && clean(await page.textContent('#qAnswer')) === q.answer);
    await noScroll(page, 'السؤال');
    await page.click('#startTimer');
    await wait(3000);
    check('العدّاد يعدّ في لوحة الثاني، والوقت في رأس المقدّم', await cls(aud, 'running') && !(await page.isHidden('#wClock')) && /^0:2[4-8]$/.test(clean(await page.textContent('#wClockV'))));
    await aud.screenshot({ path: path.join(shots, 's7-tbrun.png') });
    await page.click('#yes');
    await wait(1200);
    check('أصاب: «[الثاني] · أصاب · +3» بلا مربع، و«الإجابة: …»، والحدّ له، ورقمه 3', clean(await aud.textContent('#vtext')) === names[2] + ' · أصاب · +3'
      && await aud.evaluate(() => document.getElementById('box').classList.contains('bare')) && clean(await aud.textContent('#answer')) === q.answer && await side(aud) === 2
      && clean(await aud.textContent('#s1')) === '0' && clean(await aud.textContent('#s2')) === '3');
    await layout(aud, 'أصاب');
    await aud.screenshot({ path: path.join(shots, 's7-tbright.png') });
    check('نافذة المقدّم: «[الثاني] · أصاب» و«التالي · دور [الأول]»', clean(await page.textContent('#qDone')) === names[2] + ' · أصاب · +3' && clean(await page.textContent('#nextQ')) === 'التالي · دور ' + names[1]);
    await noScroll(page, 'بعد الحكم');
    await page.click('#nextQ');
    await wait(1000);
    check('السؤال الثاني للأول، والحدّ له', await side(aud) === 1 && clean(await aud.textContent('#label')) === st.questions[1].prompt);
    await page.click('#startTimer');
    // انتهاء الوقت: «لم يُصب» بلا انتقال للخصم.
    await aud.waitForFunction(() => !document.getElementById('verdict').hidden, null, { timeout: 36000 });
    await wait(900);
    check('انتهى وقت الأول: «[الأول] · لم يُصب» والحدّ في المنتصف، بلا انتقال للخصم', clean(await aud.textContent('#vtext')) === names[1] + ' · لم يُصب' && await side(aud) === 0 && !(await cls(aud, 'running')));
    await layout(aud, 'لم يُصب');
    await aud.screenshot({ path: path.join(shots, 's7-tbwrong.png') });
    check('نافذة المقدّم: «… · لم يُصب · فاز [الثاني]» و«إلى النتيجة النهائية»', clean(await page.textContent('#qDone')) === `${names[1]} · لم يُصب · فاز ${names[2]}` && clean(await page.textContent('#nextQ')) === 'إلى النتيجة النهائية');
    await page.click('#nextQ');
    await aud.waitForSelector('.scr.show[data-s="fin"]');
    await wait(1600);
    const segs = await aud.$$eval('#finTrack .seg', l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    check('النتيجة النهائية بعد الجولة الفاصلة: خانة «الفاصلة» في آخر المسار بنقاطها، و«التالي: إعلان الفائز»', segs.length === 4 && segs[3].startsWith('الفاصلة') && segs[3].includes('+3')
      && clean(await aud.textContent('#s2')) === '3' && clean(await aud.textContent('#s1')) === '0' && (await aud.textContent('#canvas')).includes('التالي: إعلان الفائز'));
    check('نافذة المقدّم: سطر «الجولة الفاصلة» في الجدول، و«الفائز: [الثاني]» و«أعلن الفائز»', clean(await page.textContent('#fMid')).includes('الجولة الفاصلة')
      && clean(await page.textContent('#fWho')) === 'الفائز: ' + names[2] && clean(await page.textContent('#fCtl')) === 'أعلن الفائز');
    await layout(aud, 'النتيجة بعد الجولة الفاصلة');
    await aud.screenshot({ path: path.join(shots, 's7-fintb.png') });
    await noScroll(page, 'النتيجة بعد الجولة الفاصلة');
    await page.click('#fCtl [data-act="announce"]');
    await aud.waitForSelector('.scr.show[data-s="win"]');
    await wait(1100);
    check('الفائز بالجولة الفاصلة: السطر والاسم والقصاصات، والحدّ له، ورقمه متقدّم بنقاطها', clean(await aud.textContent('#winSub')) === 'الفائز بالجولة الفاصلة'
      && clean(await aud.textContent('#champ')) === names[2] && (await aud.$$('#confetti span')).length === 140 && await side(aud) === 2
      && clean(await aud.textContent('#s2')) === '3' && clean(await aud.textContent('#s1')) === '0');
    check('نافذة المقدّم: «الفائز بالجولة الفاصلة»', clean(await page.textContent('#fMid')).startsWith('الفائز بالجولة الفاصلة'));
    const seenIds = await page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.seen')));
    check('وسؤالاها في ذاكرة الأسئلة', st.questions.slice(0, 2).every(x => seenIds.includes(x.id)));
    await wait(6200);
    await layout(aud, 'الفائز بالجولة الفاصلة');
    await aud.screenshot({ path: path.join(shots, 's7-wintb.png') });
    await page.click('#fUndo');
    await aud.waitForSelector('.scr.show[data-s="fin"]');
    check('التراجع من الفائز: النتيجة بخانة الجولة الفاصلة', (await aud.$$('#finTrack .seg')).length === 4);
    await wait(800);
    await page.click('#fUndo');
    await aud.waitForSelector('.scr.show[data-s="q"]');
    check('ثم آخر حكم في الجولة الفاصلة', clean(await page.textContent('#nextQ')) === 'إلى النتيجة النهائية');
    await context.close();
  }

  // ===== 2.2 بالنافذة الواحدة، بأطول اسمين وأطول سؤال =====
  {
    const longTie = await finalMatch({ results: ['xxxxxx', 'xxxxxx'], wheel: ['failed', 'failed'], names: ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'], winner: 2 });
    const n = longTie.match.teams;
    const { context, page } = await open({ ...longTie.P.toFinal(longTie.match, modes), single: true }, { size: { width: 1920, height: 1080 }, longQ: true });
    const frame = await stageFrame(page);
    await frame.waitForSelector('.scr.show[data-s="fin"]');
    await wait(800);
    await cmd(frame, 'tiebreak');
    await frame.waitForSelector('.scr.show[data-s="intro"]');
    await wait(900);
    check('بنافذة واحدة: «يبدأ: [الأول]» (فاز الثاني بالقرعة)، و«السؤال الأول» في البطاقة', clean(await frame.textContent('#starter')) === 'يبدأ: ' + n[1] && !!(await frame.$('.scr.intro [data-cmd="act:show"]')));
    await layout(frame, 'المقدمة بنافذة واحدة وأطول اسمين');
    check('بنافذة واحدة: «تراجع» في المقدمة مفعّل (الملاحظة 41)', !!(await frame.$('[data-cmd="undo"]:not([disabled])')));
    const step = async (c, name) => { await cmd(frame, c); await wait(900); if (name) await layout(frame, name); };
    await step('act:show', 'السؤال بنافذة واحدة وأطول سؤال');
    check('السؤال الأطول (85 حرفاً) ثلاثة أسطر حداً أقصى', await frame.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('label')); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size <= 3; }));
    await page.screenshot({ path: path.join(shots, 's7-tbq-w1long1.png') });
    check('بنافذة واحدة: «ابدأ» و«صحيحة» و«خاطئة» بجانب الشارات', !!(await frame.$('#near [data-cmd="act:start"]')) && !!(await frame.$('#near [data-cmd="act:correct"]')) && !!(await frame.$('#near [data-cmd="act:wrong"]')));
    await step('act:start');
    await step('act:wrong', 'لم يُصب بنافذة واحدة');
    check('بنافذة واحدة: «التالي · [الثاني]»', clean(await frame.textContent('#near [data-cmd="act:next"]')) === 'التالي · ' + n[2]);
    await step('act:next');
    await step('act:wrong');
    check('أخطآ معاً: «المحاولة 2»', clean(await frame.textContent('#near [data-cmd="act:again"]')) === 'المحاولة 2');
    await layout(frame, 'بعد حكم الثاني بنافذة واحدة');
    await step('act:again');
    check('المحاولة 2: الشارة، والحدّ للأول', await badges(frame) === 'الجولة الفاصلة|المحاولة 2|' && await side(frame) === 1);
    await step('act:correct', 'أصاب بنافذة واحدة');
    await page.screenshot({ path: path.join(shots, 's7-tbright-w1long1.png') });
    await step('act:next');
    await step('act:wrong');
    check('حُسمت: «إلى النتيجة النهائية» بجانب الشارات', clean(await frame.textContent('#near [data-cmd="act:announce"]')) === 'إلى النتيجة النهائية');
    await step('act:announce');
    await frame.waitForSelector('.scr.show[data-s="fin"]');
    await wait(1600);
    check('بنافذة واحدة: خانة «الفاصلة» بنقاطها، و«أعلن الفائز» في البطاقة', (await frame.$$('#finTrack .seg')).length === 4 && !!(await frame.$('[data-cmd="announce"]')));
    await layout(frame, 'النتيجة بعد الجولة الفاصلة بنافذة واحدة');
    await page.screenshot({ path: path.join(shots, 's7-fintb-w1long1.png') });
    await step('announce');
    await frame.waitForSelector('.scr.show[data-s="win"]');
    check('الفائز بالجولة الفاصلة: الأول', clean(await frame.textContent('#champ')) === n[1] && clean(await frame.textContent('#winSub')) === 'الفائز بالجولة الفاصلة');
    await wait(6200);
    await layout(frame, 'الفائز بالجولة الفاصلة بنافذة واحدة');
    // إعادة تحميل الصفحة: الفائز كما هو.
    await page.reload();
    await unlock(page);
    const again = await stageFrame(page);
    await again.waitForSelector('.scr.show[data-s="win"]', { timeout: 10000 });
    check('إعادة التحميل: الفائز بالجولة الفاصلة كما هو', clean(await again.textContent('#winSub')) === 'الفائز بالجولة الفاصلة');
    await context.close();
  }

  await browser.close();
  process.exit(finish(errors) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
