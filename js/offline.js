// يسجّل عامل الحفظ (sw.js) كي تُفتح اللعبة من جديد دون إنترنت.
if ('serviceWorker' in navigator) {
  const root = new URL('../', import.meta.url);
  navigator.serviceWorker.register(new URL('sw.js', root), { scope: root.pathname }).catch(() => {});
}
