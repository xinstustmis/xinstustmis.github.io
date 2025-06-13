/* Manifest version: 3RRjH7Wd */
// ⚠️ 提醒：若要正式部署 PWA，請先了解相關離線快取的注意事項。
// 文件參考：https://aka.ms/blazor-offline-considerations

// 匯入資源清單：Blazor 在建置時會產生此檔，列出所有要快取的資源。
self.importScripts('./service-worker-assets.js');

// 註冊 Service Worker 的事件
self.addEventListener('install', event => event.waitUntil(onInstall(event)));   // 安裝事件
self.addEventListener('activate', event => event.waitUntil(onActivate(event))); // 啟用事件
self.addEventListener('fetch', event => event.respondWith(onFetch(event)));     // 抓取資源事件

// 快取的名稱前綴，後面會加上資源清單的版本號
const cacheNamePrefix = 'offline-cache-';
const cacheName = `${cacheNamePrefix}${self.assetsManifest.version}`;

// 要快取的檔案副檔名（符合以下任一條件才會快取）
const offlineAssetsInclude = [
    /\.dll$/, /\.pdb$/, /\.wasm/, /\.html/, /\.js$/, /\.json$/, /\.css$/,
    /\.woff$/, /\.png$/, /\.jpe?g$/, /\.gif$/, /\.ico$/, /\.blat$/, /\.dat$/
];

// 排除不要快取的檔案（符合以下條件不會快取）
const offlineAssetsExclude = [/^service-worker\.js$/];

// 網站的 base 路徑（通常是根目錄 /）
const base = "/";
const baseUrl = new URL(base, self.origin);

// 建立資源的完整網址清單（會用來判斷請求是否是資源本身）
const manifestUrlList = self.assetsManifest.assets.map(asset => new URL(asset.url, baseUrl).href);

// 安裝階段：把要離線快取的資源加入快取中
async function onInstall(event) {
    console.info('Service worker: Install');

    // 篩選出需要快取的資源，建立 Request 物件（帶有 hash 檢查）
    const assetsRequests = self.assetsManifest.assets
        .filter(asset => offlineAssetsInclude.some(pattern => pattern.test(asset.url))) // 符合要快取的類型
        .filter(asset => !offlineAssetsExclude.some(pattern => pattern.test(asset.url))) // 排除不需快取的檔案
        .map(asset => new Request(asset.url, { integrity: asset.hash, cache: 'no-cache' }));

    // 開啟快取空間並儲存資源
    const cache = await caches.open(cacheName);
    await cache.addAll(assetsRequests);
}

// 啟用階段：刪除舊的快取版本（保留最新版本）
async function onActivate(event) {
    console.info('Service worker: Activate');

    const cacheKeys = await caches.keys(); // 取得所有快取版本的名稱
    await Promise.all(
        cacheKeys
            .filter(key => key.startsWith(cacheNamePrefix) && key !== cacheName) // 找出舊版快取
            .map(key => caches.delete(key)) // 刪除舊的快取
    );
}

// 拿資源階段：攔截所有 GET 請求，優先從快取中回應
async function onFetch(event) {
    let cachedResponse = null;

    if (event.request.method === 'GET') {
        // 判斷是否是 HTML 導覽請求（例如：使用者輸入網址或點連結）
        const shouldServeIndexHtml =
            event.request.mode === 'navigate' && // 是導航請求
            !manifestUrlList.some(url => url === event.request.url); // 又不是在 manifest 資源清單中

        // 導覽請求統一回應 index.html，其餘則正常處理
        const request = shouldServeIndexHtml ? 'index.html' : event.request;

        const cache = await caches.open(cacheName);
        cachedResponse = await cache.match(request); // 優先從快取抓取
    }

    // 若無法從快取取得，就從網路請求資源
    return cachedResponse || fetch(event.request);
}
