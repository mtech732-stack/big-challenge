// تصوّر الوثيقة 1.11 على اللعبة المبنية (v58): يضيف ما في design/s8b.css إلى الحالة التي تعرضها اللعبة، للتصوير والقياس وحده.
// يحمّله design/s8b-shots.cjs في إطار الشاشة المشتركة، ثم ينادي window.S8B.*.
// المهندس يبني هذه العناصر في audience.html وindex.html بقواعد design/s8b.md، والحالة فيها من الوحدة لا من هذا الملف.
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const btn = (label, kind = '') => el(`<button class="cbtn ${kind}">${label}</button>`);

  // ===== شاشة الجمهور =====
  // العدّاد في لوحة صاحب الدور: kind = 'lead' (العدّ قبل الوقت، أبيض) أو 'run' (أصفر). left من total، وpaused متقطع.
  function clock(team, kind, left, total, paused = false) {
    canvas.classList.add('running'); canvas.classList.toggle('lead', kind === 'lead'); canvas.classList.toggle('paused', !!paused);
    canvas.classList.toggle('turn-1', team === 1); canvas.classList.toggle('turn-2', team === 2);
    for (const i of [1, 2]) $('p' + i).classList.toggle('on', i === team);
    const L = 100 * left / total, poly = $('p' + team).querySelector('polygon');
    poly.getAnimations().forEach(a => a.cancel());
    poly.style.strokeDashoffset = paused ? 0 : 100 - L;
    // المتقطع حتى الطول الباقي وحده، ثم فراغ
    const d = []; for (let x = 0; x + 1.6 <= L; x += 2.8) d.push(1.6, 1.2);
    canvas.style.setProperty('--dash', [...d, 0, 200].join(' '));
    $('c' + team).innerHTML = `<span class="ltr">${left}</span>`;
    $('c' + (3 - team)).textContent = '';
  }
  function noClock() { canvas.classList.remove('running', 'lead', 'paused'); }
  // جهة الحقل: 0 محايد (بعد الكشف وقبل الاختيار، وبعد «لم يُجب أحد»)، أو جهة من أخذ النقاط
  function side(t) { canvas.classList.toggle('turn-1', t === 1); canvas.classList.toggle('turn-2', t === 2); }

  // أزرار اللعبة تبقى مخفية تحتها، فيستمر النقر عليها بعد التصوير
  function near(list) {
    const n = $('near'); n.querySelectorAll('.s8b').forEach(b => b.remove()); n.querySelectorAll('.cbtn').forEach(b => b.style.display = 'none');
    n.append(...list.map(([label, kind]) => { const b = btn(label, kind); b.classList.add('s8b'); return b; }));
    placeNear();
  }
  function placeNear() {
    const k = canvas.getBoundingClientRect().width / 1920, n = $('near');
    const badges = [...document.querySelectorAll('.badge')].filter(b => b.getClientRects().length);
    const left = Math.min(...badges.map(b => (b.getBoundingClientRect().left - canvas.getBoundingClientRect().left) / k));
    n.style.left = Math.floor(left - 32 - n.getBoundingClientRect().width / k) + 'px';
  }
  // «كشف الإجابة» أسفل اليمين مكان مربع الإعلان (s8b.css 2.1). وnull يحذفه
  function ans(label) {
    let row = $('s8bAns');
    if (!row) { row = el('<div class="ctl-ans" id="s8bAns" data-hud="زر الكشف"></div>'); canvas.append(row); }
    row.innerHTML = ''; if (label) row.append(btn(label));
  }
  // مربع الإعلان: الإجابة وحدها بعد الكشف، أو الشارة فوقها بعد الاختيار (team 0 = «لم يُجب أحد»)
  function reveal(answer, chip = null, team = 0) {
    const b = $('box'); b.hidden = false; b.classList.remove('bare', 'two', 'wrap'); b.classList.toggle('ans', chip === null);
    for (const id of ['faceChip', 'told', 'say', 'faceWin', 'next']) $(id).hidden = true;
    $('reveal').hidden = false; $('answer').textContent = answer;
    const v = $('verdict'); v.hidden = chip === null; v.className = 'chip' + (team ? ' t' + team : ''); $('vtext').innerHTML = chip ?? '';
  }
  function hideBox() { $('box').hidden = true; }
  function scores(a, b) { $('s1').textContent = a; $('s2').textContent = b; document.querySelectorAll('.team .score').forEach(s => s.classList.toggle('three', s.textContent.trim().length >= 3)); }

  // ===== د1 =====
  // قبل القرعة: لا مؤشر دور، والبطاقات غير متاحة، والزر «قرعة البداية»
  function d1Before() {
    $('turnp').hidden = true;
    document.querySelectorAll('.mc').forEach(c => { c.classList.remove('avail'); c.classList.add('wait'); delete c.dataset.cmd; });
    d1Buttons([['قرعة البداية', '']]);
  }
  // أزرار الصفحة: [[النص، النوع، معطّل]] من اليمين
  function d1Buttons(list) {
    const row = document.querySelector('.pick-ctl'); row.querySelectorAll('.cbtn').forEach(b => b.style.display = 'none');
    row.querySelectorAll('.s8b').forEach(b => b.remove());
    row.append(...list.map(([label, kind, off]) => { const b = btn(label, kind); b.classList.add('s8b'); if (off) b.classList.add('off'); return b; }));
  }
  // الختم بلون البادئ: الجولة الباقية (بلا صاحب) يبدؤها الخاسر في القرعة
  function d1Stamps(loser) { document.querySelectorAll('.mc.picked:not(.tm1):not(.tm2)').forEach(c => c.classList.add('st' + loser)); }
  // بعد اكتمال الاختيار: مؤشر الدور للفائز بسطر «يبدأ الإجابة»
  function d1Starts(team, name) {
    const t = $('turnp'); t.hidden = false; t.className = 'turnp t' + team;
    $('turnName').textContent = name; $('turnLine').textContent = 'يبدأ الإجابة';
  }

  // ===== المواجهة =====
  function face(loser) {
    document.querySelector('#faceChip span').textContent = 'يبدأ الإجابة';
    document.querySelectorAll('#track .seg:not(.wheel):not(.by1):not(.by2)').forEach(s => s.classList.add('by' + loser));
  }

  window.S8B = { clock, noClock, side, near, placeNear, ans, reveal, hideBox, scores, d1Before, d1Buttons, d1Stamps, d1Starts, face };
})();
