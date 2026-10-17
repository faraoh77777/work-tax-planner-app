/*
 * sw.js — 휴대폰 '공유하기'로 받은 카드내역 파일 수신 + 앱 파일 오프라인 사본
 * 공유(POST ./share-target)는 서버가 없으므로 여기서 받아 'share-inbox' 캐시에 넣고 앱 화면으로 보낸다.
 * 파일은 이 기기 안에만 두며 어디에도 보내지 않는다. 앱 파일은 네트워크 우선(업데이트 즉시 반영), 오프라인일 때만 사본 사용.
 */
var INBOX = 'share-inbox';
var SHELL = 'app-shell-v1';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (ev) { ev.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (ev) {
  var req = ev.request, url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    ev.respondWith((async function () {
      var form = await req.formData();
      var files = form.getAll('file').filter(function (f) { return f && typeof f === 'object' && f.size > 0; });
      var cache = await caches.open(INBOX);
      var stamp = Date.now();
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        await cache.put(new Request('./share-inbox/' + stamp + '-' + i), new Response(f, { headers: { 'X-File-Name': encodeURIComponent(f.name || ('공유파일-' + stamp + '.xlsx')), 'Content-Type': f.type || 'application/octet-stream' } }));
      }
      return Response.redirect('./index.html#/input/cards', 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  ev.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req, { ignoreSearch: true }); }));
});
