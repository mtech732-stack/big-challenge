// سطر «المباريات قبل التكرار» للمقدّم في شاشة البداية (ش8-أ/67، design/s8d.md). تصوّر فوق اللعبة المبنية للتصوير والقياس وحده.
(() => {
  const canvas = document.getElementById('canvas');
  const css = document.createElement('style');
  css.textContent = `
  /* تحت «ملء الشاشة» بـ 24 على (127، 152)، بعرض محتواه: عنوان ثم سطر لكل نمط، الاسم ثم « · » ثم العدد.
     نص أبيض بشفافية 0.75 بلا لوح، فهو تنبيه للمقدّم لا عنوان للجمهور */
  .rp { position: absolute; left: 127px; top: 152px; z-index: 2; margin: 0; display: flex; flex-direction: column; align-items: flex-start;
    color: var(--on-stage); opacity: .75; font-size: 32px; font-weight: 700; line-height: 48px; direction: rtl; white-space: nowrap; }
  .rp p { margin: 0; }
  .rp .h { font-weight: 800; }
  .rp b { font-weight: 900; }
  `;
  document.head.append(css);
  const MODES = [['letter', 'الحرف المعيّن'], ['last-two', 'آخر حرفين'], ['auction', 'المزاد'], ['ranking', 'الترتيب'], ['wheel', 'شريط البونص']];
  window.RP = {
    // left: { letter: 6, ... } عدد المباريات الكاملة الباقية قبل أن يُعاد سؤال في النمط
    show(left) {
      document.querySelector('.rp')?.remove();
      const el = document.createElement('div'); el.className = 'rp'; el.dataset.hud = 'المباريات قبل التكرار'; el.dataset.free = '';
      el.innerHTML = '<p class="h">المباريات قبل التكرار</p>' + MODES.map(([id, name]) =>
        `<p>${name} · <b>${left[id] > 0 ? left[id] : 'تتكرر الآن'}</b></p>`).join('');
      canvas.append(el);
    },
  };
})();
