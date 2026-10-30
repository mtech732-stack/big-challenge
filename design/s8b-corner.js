// أزرار الزاوية في النافذة الواحدة (طلب المالك 30 أكتوبر 2026، design/s8b.md 7). تصوّر فوق اللعبة المبنية للتصوير والقياس وحده.
// الأفكار 1–3 عُرضت على المالك، واختار 4 (merged): الأيقونات بالقائمة المطوية، بلا أسماء. والمهندس يبني 4 وحدها.
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const css = document.createElement('style');
  css.textContent = `
  .bx-menu { position: absolute; z-index: 3; display: flex; flex-direction: column; align-items: stretch; gap: 16px; padding: 24px; background: var(--card); box-shadow: 10px 10px 0 var(--stage-3); }
  .bx-menu .cbtn { background: var(--ink); color: var(--card); height: 64px; padding: 0 24px; box-shadow: none; }
  .bx-menu .key, .bx-tip .key { font-size: 20px; opacity: .7; margin-inline-start: 12px; }
  .cbtn.ico { width: 64px; padding: 0; display: grid; place-items: center; }
  .cbtn.ico svg { width: 36px; height: 36px; fill: none; stroke: currentColor; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
  .bx-tip { position: absolute; z-index: 3; height: 64px; padding: 0 24px; display: flex; align-items: center; background: var(--card); color: var(--ink); font-size: 32px; font-weight: 700; white-space: nowrap; }
  .bx-pan { position: absolute; z-index: 3; display: grid; grid-auto-flow: column; grid-auto-columns: 64px; gap: 16px; padding: 24px; min-width: 376px; box-sizing: border-box; background: transparent; box-shadow: inset 0 0 0 3px var(--card); }
  .bx-pan .cbtn { display: grid; place-items: center; width: 64px; height: 64px; padding: 0; background: transparent; color: var(--on-stage); box-shadow: inset 0 0 0 3px var(--card); white-space: nowrap; }
  .bx-pan .cbtn svg { width: 36px; height: 36px; flex: none; fill: none; stroke: currentColor; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
  .bx-pan hr { grid-row: 2; grid-column: 1 / -1; border: 0; height: 3px; background: var(--card); opacity: .4; margin: 0; }
  .bx-pan .cbtn.danger { grid-row: 3; grid-column: 1; }
    .cbtn.ico.open { background: var(--card); color: var(--ink); box-shadow: none; }
  .cbtn.ico .dots { width: 32px; height: 8px; background: radial-gradient(circle, currentColor 0 4px, transparent 4.5px) 0 0 / 12px 8px repeat-x; }
  `;
  document.head.append(css);
  const rows = () => ['cornerA', 'cornerB', 'cornerC'].flatMap(id => [...$(id).querySelectorAll('.cbtn')]);
  const label = b => b.textContent.trim();
  function reset() {
    document.querySelectorAll('.bx').forEach(e => e.remove());
    for (const id of ['cornerA', 'cornerB', 'cornerC']) { $(id).style.display = ''; $(id).style.left = ''; $(id).querySelectorAll('.cbtn').forEach(b => b.style.display = ''); }
    canvas.classList.add('has-a');
  }
  const KEYS = { 'تراجع': 'Z', 'الصوت': 'M', 'ملء الشاشة': 'F', 'الباركود': 'Q', 'الرصيد': 'S', 'مباراة جديدة': '' };

  // 1. قائمة مطوية: «تراجع» و«الصوت» ظاهران، والبقية في «⋯»
  function folded(open) {
    reset();
    const all = rows(), keep = ['تراجع'];
    $('cornerB').style.display = 'none'; $('cornerC').style.display = 'none';
    const row = $('cornerA').querySelector('.ctl');
    row.querySelectorAll('.cbtn').forEach(b => { if (!keep.includes(label(b))) b.style.display = 'none'; });
    const more = document.createElement('button'); more.className = 'cbtn alt opt bx' + (open ? ' open' : ''); more.setAttribute('aria-label', 'المزيد');
    row.append(more);
    if (!open) return;
    const k = canvas.getBoundingClientRect().width / 1920, r = more.getBoundingClientRect(), c0 = canvas.getBoundingClientRect();
    const m = document.createElement('div'); m.className = 'bx bx-menu'; m.dataset.hud = 'قائمة المزيد';
    m.style.left = '127px'; m.style.top = (r.bottom - c0.top) / k + 24 + 'px';
    for (const b of all.filter(b => !keep.includes(label(b)))) {
      const n = document.createElement('button'); n.className = 'cbtn'; n.textContent = label(b); m.append(n);
    }
    canvas.append(m);
  }
  // 2. إخفاء تلقائي: بعد 3 ثوانٍ بلا حركة تختفي أزرار الزاوية كلها ويعود الشعار كاملاً كما في نافذة الجمهور
  function hidden() {
    reset();
    for (const id of ['cornerA', 'cornerB', 'cornerC']) $(id).style.display = 'none';
    canvas.style.cursor = 'none';
  }
  // 3. أيقونات: مربعات 64 بلا نص في صفين قصيرين، والاسم يظهر عند المرور
  const ICON = {
    'تراجع': '<path d="M14 10 6 18l8 8"/><path d="M6 18h16a8 8 0 0 1 0 16h-6"/>',
    'الصوت': '<path d="M5 14h6l8-7v22l-8-7H5z"/><path d="M25 12a9 9 0 0 1 0 12"/><path d="M29 8a14 14 0 0 1 0 20"/>',
    'مكتوم': '<path d="M5 14h6l8-7v22l-8-7H5z"/><path d="m24 13 8 10M32 13l-8 10"/>',
    'ملء الشاشة': '<path d="M5 13V5h8M23 5h8v8M31 23v8h-8M13 31H5v-8"/>',
    'الباركود': '<rect x="5" y="5" width="10" height="10"/><rect x="21" y="5" width="10" height="10"/><rect x="5" y="21" width="10" height="10"/><path d="M21 21h4v4h-4zM29 29h2M25 29v2M29 21v4"/>',
    'الرصيد': '<path d="M8 30V18M18 30V8M28 30V14"/>',
    'مباراة جديدة': '<path d="M18 7v22M7 18h22"/>',
  };
  function icons(tipFor) {
    reset();
    const all = rows();
    const make = b => { const n = document.createElement('button'); n.className = 'cbtn alt ico'; n.title = label(b);
      n.innerHTML = `<svg viewBox="0 0 36 36">${ICON[label(b)] ?? ''}</svg>`; return n; };
    const first = all.filter(b => ['تراجع', 'الصوت', 'مكتوم', 'ملء الشاشة'].includes(label(b)));
    const second = all.filter(b => !first.includes(b));
    for (const id of ['cornerA', 'cornerB', 'cornerC']) $(id).querySelectorAll('.cbtn').forEach(b => b.style.display = 'none');
    const a = document.createElement('div'); a.className = 'ctl bx'; a.append(...first.map(make)); $('cornerA').append(a);
    const bb = document.createElement('div'); bb.className = 'ctl bx'; bb.append(...second.map(make)); $('cornerB').append(bb);
    $('cornerC').style.display = 'none'; $('cornerB').style.left = '213px';
    if (tipFor) {
      const t = [...document.querySelectorAll('.cbtn.ico')].find(n => n.title === tipFor); if (!t) return;
      t.classList.remove('alt'); t.style.background = 'var(--card)'; t.style.color = 'var(--ink)';
      const k = canvas.getBoundingClientRect().width / 1920, r = t.getBoundingClientRect(), c0 = canvas.getBoundingClientRect();
      const tip = document.createElement('div'); tip.className = 'bx bx-tip'; tip.dataset.hud = 'اسم الزر';
      tip.textContent = tipFor;
      tip.style.left = (r.left - c0.left) / k + 'px'; tip.style.top = (r.bottom - c0.top) / k + 24 + 'px';
      canvas.append(tip);
    }
  }
  // 4. المدمج (اختيار المالك): أيقونتا «تراجع» و«⋯» في الزاوية، واللوحة بالأيقونة والاسم، و«مباراة جديدة» آخرها بعد فاصل
  function merged(open, tipFor) {
    reset();
    const all = rows();
    for (const id of ['cornerA', 'cornerB', 'cornerC']) $(id).querySelectorAll('.cbtn').forEach(b => b.style.display = 'none');
    $('cornerB').style.display = 'none'; $('cornerC').style.display = 'none';
    const undo = all.find(b => label(b) === 'تراجع');
    const u = document.createElement('button'); u.className = 'cbtn alt ico'; u.title = 'تراجع'; u.innerHTML = `<svg viewBox="0 0 36 36">${ICON['تراجع']}</svg>`;
    if (undo?.classList.contains('off')) u.classList.add('off');
    const more = document.createElement('button'); more.className = 'cbtn alt ico' + (open ? ' open' : ''); more.title = 'المزيد'; more.innerHTML = '<span class="dots"></span>';
    const row = document.createElement('div'); row.className = 'ctl bx'; row.append(u, more); $('cornerA').append(row);
    const k = canvas.getBoundingClientRect().width / 1920, c0 = canvas.getBoundingClientRect();
    const at = (el, dy) => { const r = el.getBoundingClientRect(); return { left: (r.left - c0.left) / k, top: (r.bottom - c0.top) / k + dy }; };
    if (open) {
      const p = document.createElement('div'); p.className = 'bx bx-pan'; p.dataset.hud = 'لوحة المزيد';
      // «المقدّم» لا يُعرض بعد الوثيقة 1.13 (حُذفت نافذة المقدّم)، وإن بقي في اللعبة المبنية حتى يحذفه المهندس
      const rest = all.filter(b => label(b) !== 'تراجع' && label(b) !== 'المقدّم');
      const item = (b, cls = '') => { const n = document.createElement('button'); n.className = 'cbtn ' + cls; n.title = label(b); n.innerHTML = `<svg viewBox="0 0 36 36">${ICON[label(b)] ?? ''}</svg>`; return n; };
      p.append(...rest.filter(b => label(b) !== 'مباراة جديدة').map(b => Object.assign(item(b), { style: 'grid-row: 1' })));
      const fresh = rest.find(b => label(b) === 'مباراة جديدة');
      if (fresh) { p.append(document.createElement('hr'), item(fresh, 'danger')); }
      const a = at(more, 24); p.style.left = '127px'; p.style.top = a.top + 'px';
      canvas.append(p);
    }
    if (tipFor) {
      const t = [...canvas.querySelectorAll('.bx .cbtn')].find(n => n.title === tipFor) ?? more;
      const tip = document.createElement('div'); tip.className = 'bx bx-tip'; tip.dataset.hud = 'اسم الزر'; tip.textContent = tipFor;
      const pan = canvas.querySelector('.bx-pan');
      // داخل اللوحة: الاسم جزء منها (ابن لها بلا data-hud)، فيُقاس امتدادها معه ولا يُعدّ تداخلاً معها (ملاحظة التدقيق ش8-أ/49)
      if (pan && pan.contains(t)) { delete tip.dataset.hud; pan.append(tip); const r = t.getBoundingClientRect(), pr = pan.getBoundingClientRect();
        tip.style.left = (r.left - pr.left) / k - 16 - tip.getBoundingClientRect().width / k + 'px'; tip.style.top = (r.top - pr.top) / k + 'px'; }
      else { canvas.append(tip); const a = at(t, 24); tip.style.left = a.left + 'px'; tip.style.top = a.top + 'px'; }
    }
  }
  window.BX = { reset, folded, hidden, icons, merged };
})();
