// مساحات اللمس في تطبيق آبل (design/app.md 4): يُحقن في نافذة الجمهور، ويعيد مساحة كل ما يُنقر بإحداثيات اللوحة 1920×1080،
// والتداخلات بينها. المساحة = مستطيل العنصر موسّعاً بـ ::after إن كان له (موضع مطلق)، وإلا العنصر نفسه.
function touchAudit() {
  const canvas = document.getElementById('canvas'), c = canvas.getBoundingClientRect(), k = c.width / 1920 || 1;
  const sel = '[data-cmd], .name-in, #cxList';
  const shown = el => { for (let e = el; e && e !== canvas; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; } return true; };
  const items = [];
  for (const el of canvas.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || !shown(el)) continue;
    let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    const a = getComputedStyle(el, '::after');
    if (a.content !== 'none' && a.position === 'absolute' && a.display !== 'none') {
      const px = v => parseFloat(v) * (r.width / el.offsetWidth || k);
      const L = px(a.left), T = px(a.top), R = px(a.right), B = px(a.bottom);
      box = { l: Math.min(box.l, r.left + L), t: Math.min(box.t, r.top + T), r: Math.max(box.r, r.right - R), b: Math.max(box.b, r.bottom - B) };
    }
    // تطبيق: الصف كله للخانة (audience.html)
    if (el.classList.contains('name-in')) { const row = el.closest('.row').getBoundingClientRect(); box = { l: row.left, t: row.top, r: row.right, b: row.bottom }; }
    const z = v => Math.round(v * 10) / 10;
    const toC = b => ({ l: z((b.l - c.left) / k), t: z((b.t - c.top) / k), r: z((b.r - c.left) / k), b: z((b.b - c.top) / k) });
    items.push({ node: el, name: el.dataset.cmd || el.id || el.className, el: toC({ l: r.left, t: r.top, r: r.right, b: r.bottom }), hit: toC(box) });
  }
  // كسور البكسل من التكبير لا تُعدّ تداخلاً: يلزم أن يتجاوز التقاطع نصف بكسل في الاتجاهين.
  const over = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
  const clash = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    if (over(A.hit, B.hit)) clash.push(`${A.name} × ${B.name}`);
  }
  // خانات لوحة الترتيب صفوفها متلاصقة (48 بلا فاصل)، فلا تمتد مساحتها رأسياً (4.5: إلى منتصف الفاصل، وهو 0)؛ تُقاس وحدها.
  const tight = x => /^act:item:/.test(x.name);
  // ولوحة «⋯» بأربع أيقونات فواصلها 16، فمساحة كل أيقونة فيها 112 (design/app.md 5، الملاحظات الصغيرة).
  const four = canvas.querySelector('.ctl-more .cbtn.ico:nth-child(4)')?.closest('.ctl-more');
  const least = x => (four && four.contains(x.node) ? 111.5 : 119.5);
  const small = items.filter(x => !tight(x) && (x.hit.r - x.hit.l < least(x) || x.hit.b - x.hit.t < least(x))).map(x => `${x.name} ${Math.round(x.hit.r - x.hit.l)}×${Math.round(x.hit.b - x.hit.t)}`);
  for (const x of items) delete x.node;
  return { items, clash, small, slots: items.filter(tight) };
}
module.exports = { touchAudit };
