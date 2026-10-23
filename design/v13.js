// تصوّر الإصدار 1.3 على audience.html: يضيف المسرح بطرفين والشعار ومربع الإعلان، ويتبع الدور والعدّاد والحكم مما على الشاشة.
// للتصوير وحده مع design/v13.css. المهندس يبني هذه العناصر في audience.html بقواعد design/system.md §15.
(() => {
  const canvas = document.querySelector('.canvas');
  canvas.classList.add('v13');
  const $ = id => document.getElementById(id);
  const add = (html, before) => { const t = document.createElement('template'); t.innerHTML = html.trim(); const n = t.content.firstChild; canvas.insertBefore(n, before); return n; };
  add('<div class="v13bg"><div class="f f1"></div><div class="f f2"></div><div class="e"></div></div>', canvas.querySelector('.particles'));
  add('<div class="v13logo" data-hud="الشعار" aria-label="التحدي الكبير"><span class="l1">التحدي</span><span class="l2"><i></i><b>الكبير</b></span></div>', canvas.querySelector('.giant'));
  const box = add('<div class="v13box" data-hud="مربع الإعلان" hidden><i></i><p class="chip"><i></i><span></span></p><p class="line"></p></div>', $('near'));
  const cnt = document.createElement('span'); cnt.className = 'v13cnt';
  const shown = el => el && el.getClientRects().length && !el.hidden ? el : null;
  let last = null, running = false, lastSecs = 0;
  const sync = () => {
    const on = $('p1').classList.contains('on') ? 1 : $('p2').classList.contains('on') ? 2 : 0;
    // العدّاد يعمل إذا نقص رقمه منذ آخر مرة (في القراءة يُضبط على المدة كاملة فيزيد)
    const secs = (s => { const [m, x] = s.split(':').map(Number); return m * 60 + x; })($('timer').textContent.trim());
    const timer = $('timerBox'), live = on && shown(document.querySelector('.scr.q.show')) && !$('verdict').getClientRects().length && timer && !timer.hidden;
    if (!live) running = false; else if (secs < lastSecs) running = true; else if (secs > lastSecs) running = false;
    lastSecs = secs;
    const asking = !!(live && running);
    // الحدّ يكتسح لصاحب الدور وقت العدّاد، ويتأرجح مع القرعة ويقف على الفائز. وفي غير ذلك يعود إلى المنتصف
    const drawing = shown(document.querySelector('.scr.show[data-s="spin"]')) || shown(document.querySelector('.scr.show[data-s="result"]'));
    const t = asking || drawing ? on : 0;
    canvas.classList.toggle('turn-1', t === 1); canvas.classList.toggle('turn-2', t === 2); canvas.classList.toggle('asking', asking);
    canvas.classList.toggle('has-a', !!($('cornerA').children.length || $('cornerB').children.length));
    document.querySelectorAll('.team .score').forEach(s => s.classList.toggle('three', s.textContent.trim().length >= 3));
    // العدّاد في لوحة صاحب الدور وقت السؤال
    const row = t && document.querySelector(`#p${t} .row`);
    if (asking && row) { if (cnt.parentNode !== row) row.append(cnt); const v = $('timer').textContent.replace(/^0:0?/, ''); if (cnt.textContent !== v) cnt.textContent = v; }
    else if (cnt.parentNode) cnt.remove();
    // النافذة الواحدة: أزرار العدّاد في صف الشارات، تنتهي قبل أول شارة بـ 32 (24 بعد ميلها) (العدّاد خرج من الصف إلى اللوحة)
    const near = $('near'), badges = [...document.querySelectorAll('.badge')].filter(b => b.getClientRects().length);
    if (near.children.length && badges.length) {
      const edge = Math.min(...badges.map(b => b.offsetLeft)) - 32 - near.offsetWidth + 'px';
      if (near.style.left !== edge) near.style.left = edge;
    }
    // مربع الإعلان
    let chip = '', line = '', team = 0;
    const v = $('verdict');
    if (v && !v.hidden) {
      chip = $('vtext').textContent.trim(); team = v.classList.contains('t1') ? 1 : v.classList.contains('t2') ? 2 : 0;
      const a = $('answer')?.textContent.trim(); line = a ? `<b>الإجابة:</b> ${a}` : '';
      if (!line) { line = chip; chip = 'الحكم'; }
    } else if (shown(document.querySelector('.scr.face.show'))) {
      chip = 'الفائز بالقرعة';
      line = ($('winner')?.textContent || $('headline')?.textContent.replace(/^.*:\s*/, '') || '').trim();
    } else if (shown(document.querySelector('.scr.end.show'))) {
      chip = '';   // «انتهت الجولة» في صف الشارات، فلا تتكرر
      line = $('next')?.textContent.trim();
    }
    const key = [chip, line, team].join('|');
    if (key === last) return; last = key;
    box.hidden = !line; canvas.classList.toggle('boxed', !!line);
    box.querySelector('.chip span').textContent = chip;
    box.querySelector('.chip').className = 'chip' + (team ? ' t' + team : '') + (chip ? '' : ' none');
    box.querySelector('.line').innerHTML = line || '';
  };
  new MutationObserver(sync).observe(canvas, { subtree: true, childList: true, attributes: true, characterData: true });
  sync();
})();
