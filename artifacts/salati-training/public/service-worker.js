const CACHE_NAME = 'salati-training-offline-v5';
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URL = new URL('index.html', SCOPE_URL).toString();

async function cacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(INDEX_URL, { cache: 'reload' });
  if (!response.ok) throw new Error('Could not load the app shell.');
  await cache.put(INDEX_URL, response.clone());
  const html = await response.text();
  const assetPaths = [...html.matchAll(/(?:src|href)="([^"]+)"/gu)]
    .map((match) => match[1])
    .filter((path) => !path.startsWith('http') && !path.startsWith('data:'))
    .map((path) => new URL(path, SCOPE_URL).toString());
  await Promise.all(assetPaths.map(async (url) => {
    try {
      const asset = await fetch(url, { cache: 'reload' });
      if (asset.ok && asset.status === 200) await cache.put(url, asset);
    } catch {
      // The app shell stays available even if one optional asset cannot be fetched.
    }
  }));
}

async function loadSplitAsset(request, cache) {
  const manifestUrl = `${request.url}.parts.json`;
  const savedManifest = await cache.match(manifestUrl);
  const manifestResponse = savedManifest ?? await fetch(manifestUrl);
  if (manifestResponse.status === 404) return null;
  if (!manifestResponse.ok) throw new Error('Could not load asset parts.');

  // Some static hosts return the app shell with status 200 for missing paths.
  // Treat that HTML fallback as an ordinary, unchunked asset instead of trying
  // to parse it as a parts manifest.
  const contentType = manifestResponse.headers.get('Content-Type') ?? '';
  if (contentType.toLowerCase().includes('text/html')) return null;
  let manifest;
  try {
    manifest = await manifestResponse.clone().json();
  } catch (error) {
    if (!contentType.toLowerCase().includes('json')) return null;
    throw error;
  }
  if (!Array.isArray(manifest.parts) || manifest.parts.length === 0) return null;
  const chunks = [];
  for (const partName of manifest.parts) {
    const partUrl = new URL(partName, request.url).toString();
    const savedPart = await cache.match(partUrl);
    const partResponse = savedPart ?? await fetch(partUrl);
    if (!partResponse.ok) throw new Error(`Could not load ${partName}.`);
    chunks.push(await partResponse.arrayBuffer());
  }

  const response = new Response(new Blob(chunks, { type: manifest.contentType }), {
    status: 200,
    headers: { 'Content-Type': manifest.contentType },
  });
  await cache.put(request, response.clone()).catch(() => undefined);
  if (!savedManifest) await cache.put(manifestUrl, manifestResponse.clone()).catch(() => undefined);
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name.startsWith('salati-training-offline-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_CACHE_NAME') {
    event.ports?.[0]?.postMessage(CACHE_NAME);
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';
  const isRuntimeAsset =
    url.pathname.includes('/models/') ||
    url.pathname.includes('/wasm/') ||
    url.pathname.endsWith('.wasm') ||
    ['script', 'style', 'worker', 'font', 'image'].includes(request.destination);
  if (!isNavigation && !isRuntimeAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    if (url.pathname.endsWith('.onnx') || url.pathname.endsWith('.wasm')) {
      try {
        const splitAsset = await loadSplitAsset(request, cache);
        if (splitAsset) return splitAsset;
      } catch {
        return new Response('تعذّر تجهيز ملف النموذج. تحققي من اتصال الإنترنت ثم أعيدي المحاولة.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    }

    if (isNavigation) {
      try {
        const response = await fetch(request);
        if (response.ok && response.status === 200) await cache.put(request, response.clone());
        return response;
      } catch {
        return cached
          ?? await cache.match(INDEX_URL)
          ?? new Response('افتحي صلاتي مرة واحدة مع الاتصال بالإنترنت ليُحفظ التطبيق على هذا الجهاز.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
      }
    }

    try {
      const response = await fetch(request);
      if (response.ok && response.status === 200) await cache.put(request, response.clone());
      return response;
    } catch {
      return new Response('هذا الملف لم يُحفظ على هذا الجهاز بعد. اتصلي بالإنترنت وجهّزي النموذج أولًا.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
