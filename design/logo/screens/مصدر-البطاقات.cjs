// جولة نماذج 4 لشاشة اختيار الأنماط (moh 10-29 22:23: «الشريط يوحي بأنه شريط عرض فقط لا اختيار، استخدم فنياتك الاحترافية»):
// لكل نمط بطاقة اختيار مستقلة كالزر: مرفوعة بظلّ مدرّج، فيها الشارة كبيرة وسطر يعرّف النمط، وفي أسفلها مفتاح «اختر».
// المختارة تنضغط (يقصر ظلّها وتنزل) وتمتلئ بلون الفريق الذي اختارها، ويُختم عليها رقم الجولة، وتحتها «اختيار …».
// والمتاحة مرفوعة كاملة اللون بإطار نبض أبيض. ومؤشر الدور الأصفر حول لوحة الفريق في جهته (أعلى اليمين للأول).
//   د1 · صف على الشبكة 1.2: أربع بطاقات بعرض 3 أعمدة (414)، مائلة 14°.
//   د2 · يد أوراق: البطاقات مروحة كأوراق لعب في اليد تحت الشعار، والمختارة تُسحب من اليد إلى الأسفل وتُقلب بلون فريقها.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const R = '/home/user/big-challenge/tests/';
const { usePin, unlock, stageFrame } = require(R + 'helpers.cjs');
// يُشغَّل من جذر المستودع وخادمه على 8000: node design/logo/screens/مصدر-البطاقات.cjs مجلد-الإخراج
const base = 'http://localhost:8000/', A = base + 'design/logo/modes/';
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const LOGO = base + 'design/logo/logo.svg', LR = 1036 / 1020, T14 = Math.tan(14 * Math.PI / 180);

// الأنماط بترتيب الشبكة من اليمين، وسطر التعريف من PROJECT.md §5.3–5.6
const MODES = [
  { k: 'letter', svg: 'letter-stack', line: 'كلمة تبدأ بالحرف', pat: 'p-letter' },
  { k: 'last', svg: 'last-two-stack', line: 'كلمة تنتهي بالحرفين', pat: 'p-last' },
  { k: 'auction', svg: 'auction', line: 'زايِد على عدد الإجابات', pat: 'p-auction' },
  { k: 'rank', svg: 'ranking', line: 'اذكر الأبعد في القائمة', pat: 'p-rank' },
];
const INK = { // حدود الرسم داخل ملف كل شارة بوحدة ارتفاعه (measure.cjs)
  'letter-stack': { l: .0133, t: .01, cw: 1.6225, ch: .94 },
  'last-two-stack': { l: .0335, t: .1925, cw: 1.5225, ch: .75 },
  auction: { l: .0022, t: .185, cw: 2.2125, ch: .81 },
  ranking: { l: .021, t: .0325, cw: 1.5975, ch: .9325 },
};
const TEAMS = { 1: { name: 'الصقور', cls: 'tm1' }, 2: { name: 'النسور', cls: 'tm2' } };
// حالة اختيار-2: الجولة 1 للصقور (الفائز بالقرعة) المزاد، والجولة 2 للنسور الحرف المعيّن، والدور للصقور على الجولة 3
const PICK2 = { auction: { n: 1, team: 1 }, letter: { n: 2, team: 2 } };

// الشارة في صندوق BW×BH بحدود رسمها الفعلية
function badge(svg, BW, BH) {
  const m = INK[svg], asp = m.cw / m.ch, H = Math.min(BH, BW / asp), ih = H / m.ch, w = m.cw * ih;
  return `<span class="bdg" style="width:${w}px;height:${H}px"><img src="${A}${svg}.svg" style="left:${-m.l * ih}px;top:${-m.t * ih}px;height:${ih}px"${svg === 'ranking' ? ' class="edge"' : ''}></span>`;
}
function card(m, i, pick, w, h, style = '') {
  const p = pick[m.k], t = p && TEAMS[p.team];
  return `<div class="mc ${m.pat}${p ? ' picked ' + t.cls : ' avail'}" style="width:${w}px;height:${h}px;${style}">`
    + `<div class="face"><div class="in">${badge(m.svg, w - 96, 200)}<p class="line">${m.line}</p></div>`
    + (p ? `<div class="key done"><span>الجولة ${p.n}</span></div>` : `<div class="key"><span><b>${i + 1}</b>اختر</span></div>`) + `</div>`
    + (p ? `<i class="stamp">${p.n}</i><p class="by">اختيار ${t.name}</p>` : '') + `</div>`;
}
const turn = (round) => `<div class="turn"><b><span>الصقور</span></b><p>يختار نمط الجولة ${round}</p></div>`;
function rays(cx, cy, w, h) {
  const r = Math.max(w, h) * 1.05;
  return `<div class="rays" style="left:${cx - r}px;top:${cy - r}px;width:${2 * r}px;height:${2 * r}px"></div><div class="halo" style="left:${cx - r * .62}px;top:${cy - r * .62}px;width:${r * 1.24}px;height:${r * 1.24}px"></div>`;
}
const logo = (cx, top, w) => { const h = w * LR; return rays(cx, top + h / 2, w, h) + `<div class="lg" style="left:${cx - w / 2}px;top:${top}px;width:${w}px;height:${h}px"></div>`; };
const button = (top) => `<div class="btn" style="left:760px;top:${top}px;width:400px;height:80px">قرعة البداية</div>`;

// د1 · الشبكة 1.2: 12 عموداً 122 بفراغ 24 وهامش 96، والبطاقة 3 أعمدة. الميل يزيح أعلى البطاقة يميناً، فتُزاح كلها يساراً بنصف الإزاحة
function d1(pick) {
  const w = 414, h = 470, top = 312;   // الميل حول المركز، فالبطاقة على أعمدتها الثلاثة عند منتصف ارتفاعها
  return logo(960, 24, 264) + turn(3)
    + MODES.map((m, i) => card(m, i, pick, w, h, `left:${96 + (3 - i) * 438}px;top:${top}px`)).join('')
    + button(top + h + 24 + 56 + 24);
}
// د2 · يد أوراق: أربع أوراق مدارة حول نقطة تحت الشاشة كمروحة، والمختارة تنزل من اليد 70 وتنضغط
function d2(pick) {
  const w = 360, h = 460, px = 960, py = 2300, angs = [17.25, 5.75, -5.75, -17.25];   // 11.5° بين الأوراق على نصف قطر 1990 = 400 بين مراكزها
  return logo(960, 24, 250) + turn(3)
    + MODES.map((m, i) => { const p = pick[m.k], drop = p ? 36 : 0;
      return card(m, i, pick, w, h, `left:${px - w / 2}px;top:${310 + drop}px;transform-origin:${w / 2}px ${py - 310 - drop}px;transform:rotate(${angs[i]}deg);z-index:${p ? 2 : 1}`); }).join('')
    + button(960);
}

const CSS = `
 #mock{position:absolute;inset:0;z-index:5;direction:rtl;font-family:'Kufi',sans-serif;color:#0E2C86}
 #mock .lg{position:absolute;background:url(${LOGO}) no-repeat center/contain}
 #mock .rays{position:absolute;border-radius:50%;background:repeating-conic-gradient(from 8deg,rgba(255,255,255,.13) 0 7deg,rgba(255,255,255,0) 7deg 20deg);
   -webkit-mask:radial-gradient(closest-side,#000 30%,transparent 100%);mask:radial-gradient(closest-side,#000 30%,transparent 100%)}
 #mock .halo{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.34),rgba(255,255,255,.1) 55%,rgba(255,255,255,0))}
 #mock .btn{position:absolute;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:44px;color:#0E2C86;z-index:2;isolation:isolate}
 #mock .btn::before{content:'';position:absolute;inset:0;background:#fff;transform:skewX(-14deg);box-shadow:10px 10px 0 #0B1033;z-index:-1}
 /* مؤشر الدور: لوحة الفريق بلونه في جهته، وحولها إطار ‎--hl 6 يبعد 10 (system 15.4) */
 #mock .turn{position:absolute;right:126px;top:64px;display:flex;flex-direction:column;align-items:flex-start;gap:14px}
 #mock .turn b{display:inline-block;background:#E63946;color:#fff;font-size:52px;line-height:84px;padding:0 34px;transform:skewX(-14deg);
   box-shadow:0 0 0 10px transparent,8px 8px 0 #0B1033;outline:6px solid #FFC300;outline-offset:10px}
 #mock .turn b>span{display:inline-block;transform:skewX(14deg)}
 #mock .turn p{margin:0;color:#fff;font-weight:900;font-size:40px;line-height:1.2;margin-right:-6px}
 /* البطاقة */
 #mock .mc{position:absolute}
 #mock .mc .face{position:absolute;inset:0;background:#fff;transform:skewX(-14deg);overflow:hidden;
   box-shadow:6px 6px 0 rgba(11,16,51,.75),12px 12px 0 rgba(11,16,51,.5),18px 18px 0 rgba(11,16,51,.28)}
 #mock .mc .in{position:absolute;inset:0 0 92px 0;transform:skewX(14deg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;z-index:1}
 #mock .bdg{position:relative;display:block}
 #mock .bdg img{position:absolute;display:block;max-width:none}
 #mock .bdg img.edge{filter:drop-shadow(2px 0 0 #0E2C86) drop-shadow(-2px 0 0 #0E2C86) drop-shadow(0 2px 0 #0E2C86) drop-shadow(0 -2px 0 #0E2C86)}
 #mock .line{margin:0;font-weight:800;font-size:34px;line-height:1.3;color:#0E2C86;text-align:center;white-space:nowrap;max-width:100%}
 #mock .line.two{white-space:normal;text-wrap:balance}
 #mock .key{position:absolute;left:0;right:0;bottom:0;height:92px;background:#0E2C86;color:#fff;font-weight:900;font-size:40px;
   display:flex;align-items:center;justify-content:center;gap:20px;z-index:1}
 #mock .key>span{display:inline-flex;align-items:center;gap:20px;transform:skewX(14deg)}
 #mock .key b{display:inline-flex;width:56px;height:56px;align-items:center;justify-content:center;background:#fff;color:#0E2C86;font-size:36px;transform:skewX(0)}
 #mock .key{transform-origin:center}
 #mock .key::after{content:''}
 /* نقش خفيف لكل نمط، بالحبر على 6%، لا لون جديد */
 #mock .p-letter .face{background-image:repeating-linear-gradient(90deg,rgba(14,44,134,.06) 0 26px,transparent 26px 60px)}
 #mock .p-last .face{background-image:linear-gradient(135deg,rgba(14,44,134,.06) 25%,transparent 25%),linear-gradient(225deg,rgba(14,44,134,.06) 25%,transparent 25%);background-size:44px 44px;background-position:0 0,22px 0}
 #mock .p-auction .face{background-image:radial-gradient(rgba(14,44,134,.09) 5px,transparent 6px);background-size:36px 36px}
 #mock .p-rank .face{background-image:repeating-linear-gradient(0deg,rgba(14,44,134,.06) 0 14px,transparent 14px 40px)}
 /* المتاحة: إطار نبض أبيض يبعد 12، كأنه لقطة من نبضة */
 #mock .mc.avail .face::after{content:''}
 #mock .mc.avail::before{content:'';position:absolute;inset:-14px;transform:skewX(-14deg);border:4px solid rgba(255,255,255,.55);box-shadow:0 0 0 8px rgba(255,255,255,.14)}
 /* المختارة: تنضغط وتمتلئ بلون فريقها ويُختم عليها رقم الجولة */
 #mock .mc.picked{margin-top:14px;margin-left:12px}
 #mock .mc.picked .face{box-shadow:4px 4px 0 rgba(11,16,51,.75)}
 #mock .mc.tm1 .face{background-color:#E63946}
 #mock .mc.tm2 .face{background-color:#0E2C86}
 #mock .mc.picked .line{color:#fff}
 #mock .mc.picked .key{background:rgba(11,16,51,.55)}
 #mock .mc.tm2 .key{background:#0B1033}
 #mock .mc.tm2 .bdg img.edge{filter:none}
 #mock .mc.tm1 .face{background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 26px,transparent 26px 60px)}
 #mock .mc.tm1.p-auction .face{background-image:radial-gradient(rgba(255,255,255,.12) 5px,transparent 6px);background-size:36px 36px}
 #mock .mc.tm2.p-letter .face{background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 26px,transparent 26px 60px)}
 #mock .stamp{position:absolute;left:-30px;top:-40px;width:132px;height:132px;border-radius:50%;background:#fff;color:#0E2C86;font-style:normal;font-weight:900;
   font-size:92px;line-height:132px;text-align:center;transform:rotate(-12deg);box-shadow:0 0 0 7px #0E2C86,0 0 0 13px #fff,8px 10px 0 13px #0B1033;z-index:3}
 #mock .mc.tm2 .stamp{box-shadow:0 0 0 7px #E63946,0 0 0 13px #fff,8px 10px 0 13px #0B1033;color:#E63946}
 #mock .by{position:absolute;left:0;right:0;bottom:-52px;margin:0;text-align:center;font-weight:900;font-size:36px;line-height:1.2;color:#fff;transform:translateX(-${0}px)}`;

(async () => {
  const browser = await chromium.launch();
  const c = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' }); await usePin(c);
  const stage = await c.newPage(); await stage.goto(base); await stage.evaluate(() => localStorage.clear()); await stage.reload();
  await unlock(stage); const f = await stageFrame(stage); await wait(800);
  const hide = `.logo,.card-wrap,.team,.badge,.ctl-corner,.ctl-near,#next,.box{display:none!important}`;
  const put = (html) => f.evaluate(([css, html]) => {
    document.getElementById('mock')?.remove(); document.getElementById('mockcss')?.remove();
    const s = document.createElement('style'); s.id = 'mockcss'; s.textContent = css; document.head.append(s);
    document.getElementById('canvas').insertAdjacentHTML('beforeend', `<div id="mock">${html}</div>`);
  }, [CSS + hide, html]);
  const only = process.env.ONLY;
  for (const [n, fn] of [['د1', d1], ['د2', d2]]) for (const [s, pick] of [['0', {}], ['2', PICK2]]) {
    const name = `اختيار-${n}-${s}`; if (only && !name.includes(only)) continue;
    await put(fn(pick)); await wait(500);
    // سطر التعريف (مشرف المصمّمين 29 أكتوبر 23:03): سطر واحد بـ 34، وإن لم يتسع فسطران متوازنان بـ 34 (أدنى نص الشاشة 32)
    // و«اختيار {الفريق}» يصغر إلى 32 إن زاد عن 390، فإن بقي أعرض ظهر الاسم وحده
    await f.evaluate(() => {
      for (const p of document.querySelectorAll('#mock .line')) {
        const room = p.parentElement.clientWidth - 64;
        if (p.scrollWidth > room) { p.classList.add('two'); p.style.maxWidth = room + 'px'; } }
      for (const p of document.querySelectorAll('#mock .by')) {
        const w = () => { const r = document.createRange(); r.selectNodeContents(p); return r.getBoundingClientRect().width / (document.getElementById('canvas').getBoundingClientRect().width / 1920); };
        if (w() > 390) p.style.fontSize = '32px';
        if (w() > 390) p.textContent = p.textContent.replace(/^اختيار /, ''); } });
    await wait(300); await stage.screenshot({ path: path.join(OUT, name + '.png') });
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
