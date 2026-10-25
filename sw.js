// العمل دون إنترنت: يحفظ ملفات اللعبة في المتصفح، فتُفتح من جديد وتعمل إن انقطع الإنترنت.
// الشبكة أولاً دائماً (فيصل كل تحديث فور نشره)، والنسخة المحفوظة عند تعذّر الشبكة فقط.
// ملف الرقم السري لا يمر من هنا أبداً، كي يعرف التحقق المستمر أن الإنترنت منقطع فلا يُغلق اللعبة.
const CACHE = 'big-challenge-v38';
const NETWORK_TIMEOUT_MS = 4000;
const APP_FILES = [
  './', 'index.html', 'audience.html', 'tools/pin.html',
  'css/tokens.css', 'css/base.css', 'css/stage.css',
  'css/fonts/NotoKufiArabic-arabic.woff2', 'css/fonts/NotoKufiArabic-latin.woff2',
  'js/offline.js', 'js/sync.js', 'js/pin.js', 'js/content-check.js', 'js/layout-check.js',
  'css/start.css', 'css/shared.css', 'js/match.js', 'js/content.js', 'js/modes/index.js', 'js/stage-check.js',
  'css/letter.css', 'js/modes/letter.js', 'js/round.js', 'js/play.js', 'js/sound.js',
  'js/modes/word.js', 'js/modes/last-two.js', 'css/auction.css', 'js/modes/auction.js',
  'css/ranking.css', 'js/modes/ranking.js',
  'css/wheel.css', 'js/wheel.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/pin.json')) return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  // المفتاح دون ما بعد «?» حتى تُخدم audience.html?check من نسخة audience.html.
  const key = request.url.split('?')[0];
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}
