// فحص التداخل على شاشة الجمهور، منقول من design/main.html (design/system.md، القسم 8).
// لكل عنصر أبعد حدوده (ومنها الطرف الأدنى المائل ومؤشر الدور)، ثم: داخل الهامش الآمن؟
// وبينه وبين كل عنصر آخر 24 على الأقل؟ ولا نص أصغر من 32؟ ولا أرقام هندية؟ ولا سؤال فوق 3 أسطر؟ ولا نص يفيض؟

function extent(el, scale, origin) {
  let r = null;
  for (const n of [el, ...el.querySelectorAll('*')]) {
    if (n.closest('.check-layer') || n.closest('.ring polygon') || n.hasAttribute('data-overhang')) continue;   // [data-overhang]: كما في js/stage-check.js
    // إطار الوقت (1.3) يُرسم على حدود اللوحة نفسها، ويتبعها بعد تغيّر قياسها بإطار رسم واحد، فيُحسب بالـsvg لا بنقاط المضلع.
    const b = n.getBoundingClientRect(); if (!b.width && !b.height) continue;
    const x1 = (b.left - origin.left) / scale, y1 = (b.top - origin.top) / scale;
    const x2 = (b.right - origin.left) / scale, y2 = (b.bottom - origin.top) / scale;
    r = r ? { x1: Math.min(r.x1, x1), y1: Math.min(r.y1, y1), x2: Math.max(r.x2, x2), y2: Math.max(r.y2, y2) } : { x1, y1, x2, y2 };
  }
  return r;
}

// حدود الرقم العملاق بحسب رسم أرقامه الفعلي لا صندوق السطر، مع ميله.
function glyphExtent(el, scale, origin) {
  const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = ctx.measureText(el.textContent);
  const box = { x1: (b.left - origin.left) / scale, x2: (b.right - origin.left) / scale, y1: (b.top - origin.top) / scale };
  const base = el.offsetHeight / 2 + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
  return { x1: box.x1, x2: box.x2, y1: box.y1 + base - m.actualBoundingBoxAscent, y2: box.y1 + base + m.actualBoundingBoxDescent };
}

export function checkLayout(canvas, layer) {
  const origin = canvas.getBoundingClientRect(), scale = origin.width / 1920;
  layer.querySelectorAll('.box').forEach(n => n.remove());
  const items = [...canvas.querySelectorAll('[data-hud]')]
    .filter(el => el.getClientRects().length)
    .map(el => ({ el, name: el.dataset.hud, r: extent(el, scale, origin) }));
  for (const el of canvas.querySelectorAll('[data-bg]')) {
    if (el.textContent.trim()) items.push({ el, name: 'الرقم العملاق', r: glyphExtent(el, scale, origin) });
  }
  const problems = [], bad = new Set();
  for (const it of items) {
    const { x1, y1, x2, y2 } = it.r;
    // data-edge: الشعار الكبير في شاشات البطل يتجاوز الهامش الآمن عمداً (design/logo/الدمج.md 1.2 و4.1: أعلاه على 40 و24)، ويبقى فحص الفراغ.
    if (it.el.hasAttribute('data-edge')) continue;
    if (x1 < 96 - .5 || y1 < 54 - .5 || x2 > 1824 + .5 || y2 > 1026 + .5) { problems.push(`${it.name} خارج الهامش الآمن`); bad.add(it); }
  }
  let minGap = Infinity;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i].r, b = items[j].r;
    const g = Math.max(Math.max(b.x1 - a.x2, a.x1 - b.x2), Math.max(b.y1 - a.y2, a.y1 - b.y2));
    minGap = Math.min(minGap, g);
    if (g < 24 - .5) { problems.push(`${items[i].name} ↔ ${items[j].name}: ${Math.round(g)}`); bad.add(items[i]); bad.add(items[j]); }
  }
  for (const n of canvas.querySelectorAll('*')) {
    if (![...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim()) || !n.getClientRects().length) continue;   // المخفي خارج الحساب (#timer في 1.3)
    const fs = parseFloat(getComputedStyle(n).fontSize);
    if (fs < 32) problems.push(`نص أصغر من 32: «${n.textContent.trim().slice(0, 20)}» ${fs}`);
    if (/[٠-٩۰-۹]/.test(n.textContent)) problems.push(`أرقام هندية: «${n.textContent.trim().slice(0, 20)}»`);
  }
  const q = canvas.querySelector('.question'), range = document.createRange(); range.selectNodeContents(q);
  const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top / scale / 10))).size;
  if (lines > 3) problems.push(`السؤال ${lines} أسطر، والحد 3`);
  for (const n of canvas.querySelectorAll('.team .name, .team .score, .strip > span, .badge > span, .timer > span')) {
    if (!n.getClientRects().length) continue;
    const box = n.closest('.row, [data-hud]').getBoundingClientRect(), t = n.getBoundingClientRect();
    if (t.left < box.left - 1 || t.right > box.right + 1) problems.push(`نص يفيض: ${n.closest('[data-hud]').dataset.hud}`);
  }
  for (const it of items) {
    const d = document.createElement('div'); d.className = 'box' + (bad.has(it) ? ' bad' : '');
    Object.assign(d.style, { left: it.r.x1 + 'px', top: it.r.y1 + 'px', width: (it.r.x2 - it.r.x1) + 'px', height: (it.r.y2 - it.r.y1) + 'px' });
    layer.appendChild(d);
  }
  return { ok: !problems.length, problems, minGap, lines, count: items.length };
}
