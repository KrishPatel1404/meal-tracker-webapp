// Bump the version when this file's caching logic changes: activate drops every other cache.
const CACHE_NAME = "meal-tracker-v2";
const SHELL_URL = "/index.html";
const ASSET_PREFIX = "/assets/";
const SHELL_ASSET_PATTERN = /\/assets\/[^"'\s>]+/g;

function listShellAssets(html) {
  return [...new Set(html.match(SHELL_ASSET_PATTERN))];
}

function isAssetPath(pathname) {
  return pathname.startsWith(ASSET_PREFIX);
}

// Stores a shell together with the assets it links, so the next open also works offline.
// Assets linked by neither the new shell nor the one it replaces (still open in a tab) are
// dropped, so old deploys don't pile up. Unlinked lazy chunks are fetched again when needed.
async function storeShell(cache, response) {
  const html = await response.clone().text();
  const previous = await cache.match(SHELL_URL);
  const previousHtml = previous ? await previous.text() : "";
  if (html === previousHtml) return;
  const shellAssets = listShellAssets(html);
  await cache.addAll(shellAssets);
  await cache.put(SHELL_URL, response);
  const keep = new Set([...shellAssets, ...listShellAssets(previousHtml)]);
  const stale = (await cache.keys()).filter((request) => {
    const { pathname } = new URL(request.url);
    return isAssetPath(pathname) && !keep.has(pathname);
  });
  await Promise.all(stale.map((request) => cache.delete(request)));
}

async function precacheShell() {
  const response = await fetch(new Request(SHELL_URL, { cache: "reload" }));
  if (!response.ok) throw new Error(`Shell precache failed with status ${response.status}`);
  await storeShell(await caches.open(CACHE_NAME), response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

// fetch() rejects with a TypeError only when the network is unreachable.
function ignoreOffline(error) {
  if (!(error instanceof TypeError)) throw error;
}

// Stale-while-revalidate: open instantly from the cached shell, refresh it in the background
// so a new deploy shows on the next open. Hashed assets stay cache-first.
async function staleWhileRevalidateNavigation(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(SHELL_URL);
  const refreshed = fetch(event.request).then((response) => {
    if (response.ok) event.waitUntil(storeShell(cache, response.clone()).catch(ignoreOffline));
    return response;
  });
  if (!cached) return refreshed;
  event.waitUntil(refreshed.catch(ignoreOffline));
  return cached;
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  // Hashed files never change, so a Vary header (e.g. Origin) must not cause a miss.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(staleWhileRevalidateNavigation(event));
  } else if (isAssetPath(url.pathname)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
