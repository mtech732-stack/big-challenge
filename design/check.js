/* فحص التداخل للصفحات المرجعية (من ش1). هو فحص design/main.html نفسه، مفصولاً ليُستعمل في كل شاشة.
   المرجع: design/system.md، القسم 8.

   layoutCheck({ canvas, layer, lines }) يعيد { ok, problems, minGap, items }:
   - [data-hud]: مكوّن يُحسب امتداده (أبعد أطرافه المائلة، ومعه المؤشر والصفيحة)، ولا يخرج عن الهامش الآمن،
     ولا يقل بينه وبين غيره عن 24.
   - [data-bg]: رقم عملاق يُحسب برسم أرقامه الفعلي.
   - [data-fit]: وعاء مستقيم لا يفيض عنه نصه أفقياً (اسم في لوحة، نمط في خانة، ...).
   - lines: { el, max } عنصر لا تتجاوز أسطره الحد.
   - كل نص ظاهر: لا أصغر من 32، ولا أرقام هندية.
   - grid: true (من الإصدار 1.2): يرسم الأعمدة الـ 12، ويعدّ حواف المكوّنات قرب حافتي الشاشة، فكل حافة ليست على
     الهامش (96 أو 1824) ولا على حواف 1.3 (system.md 15.3: منتصف ارتفاع المائل على وجه البطاقة 127 و1793، فيقع
     امتداده المائل على 109 و1811، و213 أزرار الزاوية بعد الأيقونة) خطأ. ويعيد edges: { right, left } بخطوط الحافة في كل جانب.
   - مقاسات مقصودة في design/logo/الدمج.md، مطابقة لـ js/stage-check.js: [data-overhang] رسم يتجاوز صندوقه بظلّه وهامشه
     (الصندوق امتداد أصفره المرسوم، 2.2)، فلا يُحسب في الامتداد · [data-free] صندوق موضعه من جدول المصمّم لا من الشبكة،
     فلا يُعدّ في حواف الشبكة · [data-edge] الشعار الكبير يتجاوز الهامش الآمن أعلاه عمداً (1.2 و4.1)، فلا يُعدّ في الهامش ولا في الحواف.
   العناصر المخفية (display:none أو visibility:hidden) خارج الحساب. */
(function () {
  const SAFE = { x1: 96, y1: 54, x2: 1824, y2: 1026 };
  const visible = n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden';

  function extent(el, scale, origin) {
    let r = null;
    for (const n of [el, ...el.querySelectorAll('*')]) {
      if (n.closest('.check-layer') || n.closest('.ring polygon') || n.hasAttribute('data-overhang') || !n.getClientRects().length) continue; // المؤشر المخفي يُحسب دائماً (system.md 6.2)
      const b = n.getBoundingClientRect(); if (!b.width && !b.height) continue;
      const x1 = (b.left - origin.left) / scale, y1 = (b.top - origin.top) / scale;
      const x2 = (b.right - origin.left) / scale, y2 = (b.bottom - origin.top) / scale;
      r = r ? { x1: Math.min(r.x1, x1), y1: Math.min(r.y1, y1), x2: Math.max(r.x2, x2), y2: Math.max(r.y2, y2) } : { x1, y1, x2, y2 };
    }
    return r;
  }

  function glyphExtent(el, scale, origin) {
    const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText(el.textContent);
    const y0 = (b.top - origin.top) / scale;
    const base = el.offsetHeight / 2 + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
    return { x1: (b.left - origin.left) / scale, x2: (b.right - origin.left) / scale,
      y1: y0 + base - m.actualBoundingBoxAscent, y2: y0 + base + m.actualBoundingBoxDescent };
  }

  const ownText = n => [...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());

  window.layoutCheck = function ({ canvas, layer, lines = [], scope = [canvas], grid = false }) {
    const origin = canvas.getBoundingClientRect(), scale = origin.width / 1920;
    layer?.querySelectorAll('.box').forEach(n => n.remove());

    const items = [...canvas.querySelectorAll('[data-hud]')].filter(visible)
      .map(el => ({ el, name: el.dataset.hud, r: extent(el, scale, origin) })).filter(i => i.r);
    for (const el of canvas.querySelectorAll('[data-bg]')) if (visible(el) && el.textContent.trim())
      items.push({ el, name: 'الرقم العملاق', r: glyphExtent(el, scale, origin) });

    const problems = [], bad = new Set();
    for (const it of items) {
      const { x1, y1, x2, y2 } = it.r;
      if (it.el.hasAttribute?.('data-edge')) continue;
      if (x1 < SAFE.x1 - .5 || y1 < SAFE.y1 - .5 || x2 > SAFE.x2 + .5 || y2 > SAFE.y2 + .5) { problems.push(`${it.name} خارج الهامش الآمن`); bad.add(it); }
    }
    let minGap = Infinity;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i].r, b = items[j].r;
      const g = Math.max(b.x1 - a.x2, a.x1 - b.x2, b.y1 - a.y2, a.y1 - b.y2);
      minGap = Math.min(minGap, g);
      if (g < 24 - .5) { problems.push(`${items[i].name} ↔ ${items[j].name}: ${Math.round(g)}`); bad.add(items[i]); bad.add(items[j]); }
    }

    for (const root of scope) for (const n of root.querySelectorAll('*')) {
      if (!ownText(n) || !visible(n) || n.closest('.check-layer')) continue;
      const fs = parseFloat(getComputedStyle(n).fontSize);
      if (fs < 32 - .01) problems.push(`نص أصغر من 32: «${n.textContent.trim().slice(0, 20)}» ${fs}`);
      if (/[٠-٩۰-۹]/.test(n.textContent)) problems.push(`أرقام هندية: «${n.textContent.trim().slice(0, 20)}»`);
    }

    for (const root of scope) for (const box of root.querySelectorAll('[data-fit]')) {
      if (!visible(box)) continue;
      const b = box.getBoundingClientRect();
      for (const t of box.querySelectorAll('*')) {
        if (!ownText(t) || !visible(t)) continue;
        const r = t.getBoundingClientRect();
        if (r.left < b.left - 1 || r.right > b.right + 1)
          problems.push(`نص يفيض: ${box.dataset.fit} «${t.textContent.trim().slice(0, 20)}»`);
      }
    }

    const lineCounts = lines.filter(l => l.el && visible(l.el)).map(({ el, max }) => {
      const range = document.createRange(); range.selectNodeContents(el);
      const n = new Set([...range.getClientRects()].map(r => Math.round(r.top / scale / 10))).size;
      if (n > max) problems.push(`${el.dataset.fit || 'النص'} ${n} أسطر، والحد ${max}`);
      return n;
    });

    // الشبكة (system.md 4): الحافة الخارجية لكل مكوّن قرب حافة الشاشة على الهامش نفسه، فتبقى حافة واحدة في كل جانب.
    // «قرب الحافة» = امتداده يبدأ قبل 256 أو ينتهي بعد 1664. والمكوّنات بينها (تتلو غيرها بفراغ 24) خارج هذا الحساب.
    const edges = { right: new Set(), left: new Set() };
    for (const it of items) {
      if (it.name === 'الرقم العملاق' || it.el.hasAttribute('data-free') || it.el.hasAttribute('data-edge')) continue;
      if (it.r.x2 > 1664) edges.right.add(Math.round(it.r.x2));
      if (it.r.x1 < 256) edges.left.add(Math.round(it.r.x1));
    }
    // حواف 1.3 المقبولة (system.md 15.3) مع الهامش.
    const OK = { right: [SAFE.x2, 1811, 1793], left: [SAFE.x1, 109, 127, 213] };   // 213: أزرار الزاوية بعد الأيقونة (design/logo/الدمج.md 1.3 ب)
    const offSide = side => [...edges[side]].filter(x => !OK[side].some(e => Math.abs(x - e) <= 1.5));
    const off = offSide('right').concat(offSide('left'));
    if (grid && off.length) problems.push(`حواف خارج الشبكة: ${off.join('، ')}`);

    if (layer && grid) for (let i = 0; i < 12; i++) {
      const d = document.createElement('div'); d.className = 'box col';
      Object.assign(d.style, { left: (96 + i * 146) + 'px', top: '0px', width: '122px', height: '1080px', outline: 'none', background: 'rgba(255,255,255,.06)' });
      layer.appendChild(d);
    }
    if (layer) for (const it of items) {
      const d = document.createElement('div'); d.className = 'box' + (bad.has(it) ? ' bad' : '');
      Object.assign(d.style, { left: it.r.x1 + 'px', top: it.r.y1 + 'px', width: (it.r.x2 - it.r.x1) + 'px', height: (it.r.y2 - it.r.y1) + 'px' });
      layer.appendChild(d);
    }
    return { ok: !problems.length, problems, minGap, lines: lineCounts, edges: { right: [...edges.right], left: [...edges.left] },
      items: items.map(i => ({ name: i.name, ...i.r })) };
  };
})();
