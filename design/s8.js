// تصوّر ش8 على شاشة الجمهور المبنية (audience.html): يضيف ما في design/s8.css إلى الحالة التي تعرضها اللعبة، للتصوير والقياس وحده.
// يحمّله design/s8-shots.cjs في إطار الشاشة المشتركة بعد أن تبلغ اللعبة الحالة، ثم ينادي window.S8.*.
// المهندس يبني هذه العناصر في audience.html وindex.html بقواعد design/s8.md، والحالة فيها من الوحدة لا من هذا الملف.
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const btn = (label, kind = '') => el(`<button class="cbtn ${kind}">${label}</button>`);

  // 1. المواجهة: «ابدأ المباراة» بنافذة واحدة، و«بنافذة واحدة» يُحذف من البطاقة، وزر الخيارات في آخر صف الزاوية
  function face(open) {
    const one = document.querySelector('.scr.face [data-cmd="single"]'); if (one) one.hidden = true;
    let row = $('s8opts');
    if (!row) { row = el('<div class="ctl-corner opts" id="s8opts" data-hud="زر الخيارات"></div>'); canvas.append(row); }
    let opt = row.querySelector('.opt');
    if (!opt) { opt = btn('', 'alt opt'); opt.setAttribute('aria-label', 'خيارات'); row.append(opt); }
    opt.classList.toggle('open', !!open);
    $('s8menu')?.remove();
    if (open) {
      const m = el('<div class="optmenu" id="s8menu" data-hud="قائمة الخيارات"></div>');
      m.append(btn('ابدأ بنافذتين'));
      canvas.append(m);
    }
  }

  // 2. الباركود: النص بصيغة s8.md 2.2، والرمز بمكتبة qrcode-generator (UTF-8، تصحيح L)، والوحدة عدد صحيح من النقاط
  function qr(text) {
    let box = $('s8qr');
    if (!box) {
      box = el('<div class="qrbox" id="s8qr" data-hud="الباركود"><div class="plate"></div><div class="sheet"><canvas></canvas></div></div>');
      $('cardWrap').after(box);
    }
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const q = qrcode(0, 'L'); q.addData(text, 'Byte'); q.make();
    const n = q.getModuleCount(), m = Math.floor(520 / (n + 6));
    const c = box.querySelector('canvas');   // يُرسم بنقاط المسرح (1920)، والمقياس يكبّره
    c.width = c.height = n * m; c.style.width = c.style.height = n * m + 'px';
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, n * m, n * m); x.fillStyle = '#2F3138';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(k * m, r * m, m, m);
    canvas.classList.add('qr');
    $('box').hidden = true;
    // زر الإخفاء في رأس البطاقة تحت العنوان، وصف الشارات فارغ حتى يُخفى
    const head = document.querySelector('.scr.show .rhead, .scr.show .ahead');
    if (!head.querySelector('.qrctl')) { const k = el('<div class="ctl qrctl"></div>'); k.append(btn('أخفِ الباركود')); head.append(k); }
    near([]);
    return { modules: n, version: (n - 17) / 4, unit: m, bytes: new TextEncoder().encode(text).length };
  }
  function unqr() { canvas.classList.remove('qr'); document.querySelectorAll('.qrctl').forEach(n => n.remove()); }

  // «الباركود» لإعادته بطلب: في صف النوافذ (152) بعد «المقدّم» و«ملء الشاشة» (1.2، كما بناه المهندس)
  function reshow() {
    const row = $('cornerB').querySelector('.ctl') ?? $('cornerB');
    if (!row.querySelector('.reqr')) row.append(btn('الباركود', 'alt reqr'));
  }

  // 3. الترتيب: اللوحة بالخانات الثلاث عشرة ظاهرة الأرقام، والمكشوف { r: [فريق، اسم] }، والفخ المكشوف رقمه خصمه
  function board(revealed = {}, judge = false) {
    const sl = [...document.querySelectorAll('#board .sl')];
    sl.forEach((p, i) => {
      const r = i + 1, trap = r > 10, hit = revealed[r];
      p.className = 'sl' + (trap ? ' trap' : '') + (hit ? ' t' + hit[0] : '');
      p.innerHTML = `<b>${hit && trap ? '−' + r : r}</b>` + (hit ? `<span>${hit[1]}</span>` : '');
    });
    $('rnk').classList.toggle('judge', judge);
  }
  // أزرار اللعبة تبقى مخفية تحتها، فيستمر النقر عليها بعد التصوير
  function near(list) { const n = $('near'); n.querySelectorAll('.s8b').forEach(b => b.remove()); n.querySelectorAll('.cbtn').forEach(b => b.style.display = 'none');
    n.append(...list.map(([label, kind]) => { const b = btn(label, kind); b.classList.add('s8b'); return b; })); placeNear(); }
  // صف الشارات: الأزرار تنتهي قبل أول شارة بـ 24 بعد ميلها (كما في audience.html)
  function placeNear() {
    const k = canvas.getBoundingClientRect().width / 1920, b1 = $('b1').getBoundingClientRect(), n = $('near');
    const lean = 64 * Math.tan(14 * Math.PI / 180) / 2;
    const right = (b1.left - canvas.getBoundingClientRect().left) / k - 24 - lean;
    n.style.left = Math.floor(right - n.getBoundingClientRect().width / k) + 'px';
  }
  function turn(t, running) {
    canvas.classList.toggle('turn-1', t === 1); canvas.classList.toggle('turn-2', t === 2); canvas.classList.toggle('running', !!running);
    for (const i of [1, 2]) $('p' + i).classList.toggle('on', i === t);
  }
  // مربع الإعلان كما يرسمه audience.html: الشارة بلون الفريق، والسطر تحتها. وbare بلا مربع (كحكم المزاد، auction.css 6)
  function box(chip, team, line, bare = false) {
    const b = $('box'); b.hidden = false; b.classList.remove('bare', 'two', 'wrap'); b.classList.toggle('bare', bare);
    const v = $('verdict'); v.hidden = false; v.className = 'chip' + (team ? ' t' + team : ''); $('vtext').innerHTML = chip;
    for (const id of ['faceChip', 'reveal', 'told', 'faceWin', 'next']) $(id).hidden = true;
    $('say').hidden = false; $('say').textContent = line;
  }
  function scores(a, b) { $('s1').textContent = a; $('s2').textContent = b; document.querySelectorAll('.team .score').forEach(s => s.classList.toggle('three', s.textContent.trim().length >= 3)); }

  // 4. الشريط: الخانات بقيم ش8، وشاشة التحدي بلا عدّاد
  function band() {
    const face = { 'خسارة': '−5', 'خصم': '5', 'هدية': '+5', 'تحدٍّ': '+10' };
    document.querySelectorAll('#band .ws').forEach(w => { const k = w.querySelector('span').textContent.trim(); if (face[k]) w.querySelector('b').textContent = face[k]; });
  }

  window.S8 = { face, qr, unqr, reshow, board, near, turn, box, scores, band, placeNear };
})();
