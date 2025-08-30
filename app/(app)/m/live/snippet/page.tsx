export default function SnippetPage() {
  const watcherAll = `
(function(){
  const log = (u, how) => { try { console.log("[M3U8]["+how+"]", u); } catch {} };

  // fetch
  const _fetch = window.fetch;
  window.fetch = async function(input, init){
    try {
      const url = (typeof input === "string" ? input : input.url) || "";
      if (/\\.m3u8(\\?|$)/i.test(url)) log(url, "fetch");
    } catch {}
    return _fetch.apply(this, arguments);
  };

  // XHR
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url){
    try { if (/\\.m3u8(\\?|$)/i.test(String(url))) log(String(url), "xhr"); } catch {}
    return _open.apply(this, arguments);
  };

  // <video src="...m3u8">
  const _setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    try {
      if (this.tagName === "VIDEO" && name.toLowerCase() === "src" && /\\.m3u8(\\?|$)/i.test(String(value))) {
        log(String(value), "video-attr");
      }
    } catch {}
    return _setAttr.apply(this, arguments);
  };

  // Hls.js (si présent)
  (function(){
    const g = window;
    const tryPatch = () => {
      const H = g.Hls;
      if (H && H.prototype && H.prototype.loadSource && !H.__patched) {
        const _ls = H.prototype.loadSource;
        H.prototype.loadSource = function(u){
          try { if (/\\.m3u8(\\?|$)/i.test(String(u))) log(String(u), "hls.loadSource"); } catch {}
          return _ls.apply(this, arguments);
        };
        H.__patched = true;
        console.log("[M3U8] Hls.js patched");
      }
    };
    tryPatch();
    const id = setInterval(tryPatch, 1000);
    setTimeout(() => clearInterval(id), 15000);
  })();

  console.log("%cM3U8 watcher actif. Navigue/clique Play et surveille la console.", "color: green");
})();`.trim();

  // (2) Ton snippet "video + performance" rapide
  const quickVideoAndPerf = `
document.querySelectorAll('video').forEach((v, i) => {
  console.log('Video', i+1, ':', {
    src: v.src,
    currentSrc: v.currentSrc,
    dataSrc: v.getAttribute('data-src'),
    dataStream: v.getAttribute('data-stream')
  });
});

console.log('Requêtes avec "stream" ou "m3u8":');
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('stream') || r.name.includes('m3u8'))
  .forEach(r => console.log(r.name));`.trim();

  // (3) Ton snippet "scan + copy" instantané
  const perfScanAndCopy = `
(() => {
  const re = /\\.m3u8(\\?|$)|stream/i;
  const urls = Array.from(new Set(
    performance.getEntriesByType('resource')
      .map(e => e && e.name)
      .filter(Boolean)
      .filter(u => re.test(u))
  ));
  console.log('Liens détectés:', urls.length);
  urls.forEach(u => console.log('•', u));

  const first = urls.find(u => /\\.m3u8(\\?|$)/i.test(u));
  if (first) {
    console.log('Première .m3u8:', first);
    try { copy(first); console.log('→ Copié dans le presse-papiers'); } catch {}
  } else {
    console.log('Aucune .m3u8 actuelle (essaie le watcher ou clique Play).');
  }
})();`.trim();

  // (4) NOUVEAU : Watcher "live" par PerformanceObserver (capte dès qu'une ressource arrive)
  const perfObserverLive = `
(() => {
  const re = /\\.m3u8(\\?|$)/i;
  const seen = new Set();

  // 1) prendre déjà ce qui existe
  performance.getEntriesByType('resource')
    .map(e => e && e.name)
    .filter(Boolean)
    .forEach(u => { if (re.test(u) && !seen.has(u)) { seen.add(u); console.log('[M3U8][perf-scan]', u); } });

  // 2) observer les nouvelles entrées en temps réel
  if ('PerformanceObserver' in window) {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const u = e && e.name;
        if (u && re.test(u) && !seen.has(u)) {
          seen.add(u);
          console.log('[M3U8][perf-observer]', u);
          try { copy(u); console.log('→ Copié'); } catch {}
        }
      }
    });
    try {
      obs.observe({ type: 'resource', buffered: true });
      console.log('%cPerformanceObserver actif (resource).', 'color: green');
      // stocker globalement pour pouvoir l'arrêter
      (window as any).__m3u8PerfObs = obs;
    } catch (err) {
      console.warn('PerformanceObserver error:', err);
    }
  } else {
    console.warn('PerformanceObserver non supporté.');
  }
})();`.trim();

  // (5) NOUVEAU : Arrêter le watcher (si besoin)
  const perfObserverStop = `
(() => {
  const obs = (window as any).__m3u8PerfObs;
  if (obs && obs.disconnect) {
    obs.disconnect();
    console.log('PerformanceObserver arrêté.');
    (window as any).__m3u8PerfObs = null;
  } else {
    console.log('Aucun PerformanceObserver actif.');
  }
})();`.trim();

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">
        Snippets console · .m3u8 (Performance)
      </h1>
      <p className="text-gray-700">
        Ouvre le site cible dans <b>ton navigateur</b>, lance la vidéo si
        besoin, puis colle un des snippets ci-dessous dans la console (F12). Ces
        scripts ne font que <i>lister les ressources</i> que la page charge
        (aucun contournement).
      </p>

      {/* 1) Watcher complet (fetch/xhr/video/hls.js) */}
      <section className="space-y-2">
        <h2 className="font-semibold">
          1) Watcher global (fetch / XHR / &lt;video&gt; / Hls.js)
        </h2>
        <p className="text-sm text-gray-600">
          Capture les .m3u8 déclenchés pendant que tu navigues/cliques “Play”.
        </p>
        <pre className="p-4 bg-slate-900 text-slate-100 text-xs rounded overflow-auto">
          {watcherAll}
        </pre>
      </section>

      {/* 2) Inspection rapide vidéo + perf */}
      <section className="space-y-2">
        <h2 className="font-semibold">
          2) Inspection rapide (balises &lt;video&gt; + Performance)
        </h2>
        <pre className="p-4 bg-slate-900 text-slate-100 text-xs rounded overflow-auto">
          {quickVideoAndPerf}
        </pre>
      </section>

      {/* 3) Scan perf instantané (one-shot) */}
      <section className="space-y-2">
        <h2 className="font-semibold">
          3) Scan Performance (instantané) + copie 1ère .m3u8
        </h2>
        <pre className="p-4 bg-slate-900 text-slate-100 text-xs rounded overflow-auto">
          {perfScanAndCopy}
        </pre>
      </section>

      {/* 4) Watcher perf live */}
      <section className="space-y-2">
        <h2 className="font-semibold">4) PerformanceObserver (live)</h2>
        <p className="text-sm text-gray-600">
          Observe en temps réel les nouvelles ressources réseau, loggue et copie
          chaque <code>.m3u8</code> détectée. Relance la vidéo ou navigue dans
          la page si nécessaire.
        </p>
        <pre className="p-4 bg-slate-900 text-slate-100 text-xs rounded overflow-auto">
          {perfObserverLive}
        </pre>
      </section>

      {/* 5) Stop watcher */}
      <section className="space-y-2">
        <h2 className="font-semibold">5) Stopper l’observation</h2>
        <p className="text-sm text-gray-600">
          Si tu veux arrêter le watcher live :
        </p>
        <pre className="p-4 bg-slate-900 text-slate-100 text-xs rounded overflow-auto">
          {perfObserverStop}
        </pre>
      </section>

      <div className="text-xs text-gray-500">
        Astuces : active “Preserve log” dans l’onglet Réseau, clique Play, et
        rafraîchis si besoin. Si rien n’apparaît, c’est peut-être chargé via un
        worker/DRM/anti-bot — dans ce cas, utilise les lecteurs officiels
        (YouTube/Twitch…) ou une source HLS publique.
      </div>
    </main>
  );
}
