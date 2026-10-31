// تحكيم المزاد بكشف القائمة (الوثيقة 1.14، design/s8c.md). تصوّر فوق اللعبة المبنية للتصوير والقياس وحده، والمهندس يبنيه في اللعبة.
// الحالات: fulfil (السرد) · over (انقضى الوقت) · reveal (كُشفت القائمة) · done (بعد «وفى» أو «لم يفِ»).
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const css = document.createElement('style');
  css.textContent = `
  /* القائمة المكشوفة في البطاقة: رأس 56 (الموضوع 48 والصفحة)، ثم القائمة 5 أسطر × 48 بخط 32، وتُقلَّب صفحاتها.
     24 + 56 + 8 + 240 + 24 = 352 ارتفاع البطاقة */
  .scr.auc.list { justify-content: flex-start; gap: 8px; padding-block: 24px; box-sizing: border-box; }
  .scr.auc.list .bids, .scr.auc.list .items, .scr.auc.list .tally, .scr.auc.list #aucCtl { display: none; }
  .scr.auc.list .ahead { min-height: 56px; gap: 32px; }
  .scr.auc.list .topic { font-size: 48px; line-height: 56px; }
  .cx-page { flex: none; margin-inline-start: auto; font-size: 32px; font-weight: 700; line-height: 1; color: var(--text); direction: rtl; white-space: nowrap; }
  .cx-list { position: relative; height: 240px; overflow: clip; }
  .cx-pg { position: absolute; inset: 0; display: flex; flex-wrap: wrap; align-content: flex-start; column-gap: 40px; }
  .cx-pg[hidden] { display: none; }
  .cx-it { height: 48px; display: flex; align-items: center; gap: 12px; font-size: 32px; font-weight: 700; color: var(--text); white-space: nowrap; }
  .cx-it::before { content: ""; width: 12px; height: 12px; transform: skewX(calc(-1 * var(--lean))); background: var(--cx-team); }
  .cx-measure { visibility: hidden; }
  .anim .cx-pg:not([hidden]) { animation: in .2s ease-out both; }
  `;
  document.head.append(css);

  const scr = () => document.querySelector('.card .scr.auc');
  const btn = (label, kind = '', cmd = 'cx') => `<button class="cbtn${kind ? ' ' + kind : ''}" data-cmd="${cmd}">${label}</button>`;
  const near = () => document.querySelector('#near .ctl') || $('near');
  // كـ placeNear في audience.html: الصف ينتهي قبل أول شارة بـ 32.
  const setNear = html => {
    const n = near(); n.innerHTML = html;
    const c = canvas.getBoundingClientRect(), k = c.width / 1920 || 1;
    const badges = [...document.querySelectorAll('.badge')].filter(b => b.getClientRects().length);
    if (html && badges.length) n.style.left = Math.floor(Math.min(...badges.map(b => (b.getBoundingClientRect().left - c.left) / k)) - 32 - n.getBoundingClientRect().width / k) + 'px';
  };
  const setAns = html => { const a = $('ansCtl'); a.innerHTML = html ? `<div class="ctl">${html}</div>` : ''; };
  const other = t => (t === 1 ? 2 : 1);

  function stopClock() {
    // الكشف يوقف الوقت، فيغيب إطاره والعدّاد، ويبقى الحقل للملتزم.
    for (const i of [1, 2]) { const c = $('c' + i); if (c) c.textContent = ''; }
    canvas.classList.remove('meta-danger');
    for (const p of document.querySelectorAll('.team')) p.classList.remove('on');
  }

  function pages(items, team) {
    const s = scr();
    s.querySelector('.cx-list')?.remove();
    s.querySelector('.cx-page')?.remove();
    s.classList.add('list');
    const list = document.createElement('div'); list.className = 'cx-list';
    list.style.setProperty('--cx-team', team === 1 ? 'var(--team-1)' : 'var(--team-2-ink)');
    s.append(list);
    const out = []; let pg = null;
    const fresh = () => { pg = document.createElement('div'); pg.className = 'cx-pg cx-measure'; list.append(pg); out.push(pg); };
    fresh();
    for (const name of items) {
      const it = document.createElement('span'); it.className = 'cx-it'; it.textContent = name; pg.append(it);
      if (it.offsetTop + it.offsetHeight > list.clientHeight + 1) { it.remove(); fresh(); pg.append(it); }
    }
    for (const p of out) { p.classList.remove('cx-measure'); p.hidden = true; }
    out[0].hidden = false;
    if (out.length > 1) {
      const n = document.createElement('span'); n.className = 'cx-page';
      s.querySelector('.ahead').append(n);
    }
    return out;
  }

  window.CX = {
    fulfil() {
      setNear(btn('عُدّ · +1'));
      setAns(btn('كشف القائمة'));
    },
    // items: أسماء القائمة المرجعية بترتيبها · team: الملتزم · n: ما التزم به · page: الصفحة المعروضة (من 1)
    reveal({ items, team, n, page = 1 }) {
      stopClock();
      const pgs = pages(items, team);
      pgs.forEach((p, k) => { p.hidden = k !== page - 1; });
      const ind = scr().querySelector('.cx-page'); if (ind) ind.textContent = `${page} من ${pgs.length}`;
      setNear(btn(`وفى · +${n}`, `who t${team}`) + btn('لم يفِ · +2', `who t${other(team)}`));
      setAns('');
      return pgs.length;
    },
    // ok: وفى أو لم يفِ · names: اسما الفريقين
    done({ ok, team, n, names }) {
      const to = ok ? team : other(team), pts = ok ? n : 2;
      const box = $('box');
      // بلا مربع كحكم المزاد المبني (design/auction.md 1.5): الشارة بيضاء بنص صاحبها، والسطر أبيض على الطرف.
      box.hidden = false; box.classList.remove('ans', 'two', 'wrap'); box.classList.add('bare');
      for (const id of ['reveal', 'told', 'faceChip', 'faceWin', 'next']) $(id).hidden = true;
      $('verdict').hidden = false; $('verdict').className = 'chip' + (to === 1 ? ' t1' : '');
      $('vtext').innerHTML = `${names[to - 1]} · <span class="ltr">+${pts}</span>`;
      $('say').hidden = false; $('say').textContent = ok ? `وفى بـ ${n}` : `لم يفِ بـ ${n}`;
      setNear(btn('الموضوع التالي'));
      setAns('');
    },
  };
})();
