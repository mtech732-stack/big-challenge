// تصوّر «د2» على audience.html: يضيف الخلفية بطرفين، والشعار، ومربع الإعلان، ويملؤه مما على الشاشة.
// للتصوير وحده مع design/d2.css. المهندس يبني هذه العناصر في audience.html حين يُعتمد الإصدار 1.3.
(() => {
  const canvas = document.querySelector('.canvas');
  canvas.classList.add('d2');
  const add = (html, before) => { const t = document.createElement('template'); t.innerHTML = html.trim(); const n = t.content.firstChild; canvas.insertBefore(n, before); return n; };
  add('<div class="d2bg"><div class="f f1"></div><div class="f f2"></div><div class="e"></div></div>', canvas.querySelector('.particles'));
  add('<div class="d2logo" data-hud="الشعار" aria-label="التحدي الكبير"><span class="l1">التحدي</span><span class="l2"><i></i><b>الكبير</b></span></div>', canvas.querySelector('.giant'));
  const box = add('<div class="d2box" data-hud="مربع الإعلان" hidden><i></i><p class="chip"><i></i><span></span></p><p class="line"></p></div>', canvas.querySelector('.ctl-near'));
  const shown = sel => { const n = document.querySelector(sel); return n && n.getClientRects().length ? n : null; };
  let last = null;
  const sync = () => {
    let chip = '', line = '', team = 0;
    const face = shown('.scr.face.show');
    const end = shown('.scr.end.show');
    const result = shown('.scr.show[data-s="result"]');
    if (face || result) {
      chip = 'الفائز بالقرعة';
      const w = document.getElementById('winner')?.textContent.trim() || document.getElementById('headline')?.textContent.replace(/^.*:\s*/, '').trim();
      line = w;
    } else if (end) {
      chip = document.querySelector('#b1 span')?.textContent.trim() || 'انتهت الجولة';
      line = document.getElementById('next')?.textContent.trim();
    }
    const key = [chip, line, team].join('|');
    if (key === last) return; last = key;
    box.hidden = !line;
    canvas.classList.toggle('boxed', !!line);
    box.querySelector('.chip span').textContent = chip;
    box.querySelector('.chip').className = 'chip' + (team ? ' t' + team : '');
    box.querySelector('.line').textContent = line || '';
  };
  new MutationObserver(sync).observe(canvas, { subtree: true, childList: true, attributes: true, characterData: true });
  sync();
})();
