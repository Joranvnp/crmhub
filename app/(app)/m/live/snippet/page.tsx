"use client";

import Link from "next/link";
import { useState } from "react";

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  return (
    <section className="space-y-2 border rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <button
          onClick={copy}
          className="px-3 py-1 text-sm rounded bg-black text-white"
        >
          {copied ? "Copié ✔" : "Copier"}
        </button>
      </div>
      <pre className="p-4 bg-slate-900 text-slate-100 text-xs rounded overflow-auto">
        <code>{code}</code>
      </pre>
    </section>
  );
}

/** 1) Watcher global (fetch/xhr/video/Hls.js) */
const watcherAll = `(function(){
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
})();`;

/** 2) Inspection rapide vidéo + perf */
const quickVideoAndPerf = `document.querySelectorAll('video').forEach((v, i) => {
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
  .forEach(r => console.log(r.name));`;

/** 3) Scan perf instantané + copie 1ère .m3u8 */
const perfScanAndCopy = `(() => {
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
    try { navigator.clipboard.writeText(first); console.log('→ Copié dans le presse-papiers'); } catch {}
  } else {
    console.log('Aucune .m3u8 actuelle (essaie le watcher ou clique Play).');
  }
})();`;

/** 4) Sniff .m3u8 (8s) — version qui copie le meilleur lien */
const sniff8s = `(() => {
  const found = new Set();
  const looks = u => typeof u === 'string' && /\\.m3u8(\\?|$)/i.test(u) && !/jpeg\\.live\\.mmcdn\\.com/i.test(u);
  const add   = u => { try { if (looks(u)) found.add(String(u)); } catch {} };

  // 1) Ressources déjà chargées
  try { performance.getEntriesByType('resource').forEach(e => add(e.name)); } catch {}

  // 2) Patch fetch / XHR pour 8s
  const _fetch = window.fetch;
  try { window.fetch = function (...a) { const u = a[0]; add(typeof u==='string' ? u : (u && u.url)); return _fetch.apply(this, a); }; } catch {}
  const _open = XMLHttpRequest.prototype.open;
  try { XMLHttpRequest.prototype.open = function (m, u) { add(u); return _open.apply(this, arguments); }; } catch {}

  // 3) Petit overlay
  try {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;z-index:2147483647;bottom:12px;right:12px;background:#111;color:#fff;padding:10px 12px;border-radius:10px;font:12px/1.3 system-ui';
    box.textContent = 'Sniff .m3u8 en cours (8s). Clique ▶️ si besoin…';
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 9000);
  } catch {}

  // 4) Score/pick
  const pick = () => {
    const arr = [...found];
    if (!arr.length) return null;
    arr.sort((a, b) => {
      const score = u => {
        let s = 0;
        if (/playlist\\.m3u8/i.test(u)) s += 3;
        if (/master\\.m3u8/i.test(u))   s += 2;
        if (/chunklist|index\\.m3u8/i.test(u)) s += 1;
        if (/^https?:\\/\\//i.test(u))   s += 1;
        return -s;
      };
      return score(a) - score(b);
    });
    return arr[0];
  };

  setTimeout(async () => {
    try { window.fetch = _fetch; } catch {}
    try { XMLHttpRequest.prototype.open = _open; } catch {}

    const best = pick();
    if (best) {
      console.log('✅ BEST M3U8:', best);
      try { await navigator.clipboard.writeText(best); console.log('📋 Copié'); } catch {}
      alert('✅ Flux capturé (copié) :\\n' + best);
    } else {
      alert('❓ Pas de .m3u8 vu. Relance Play, change la qualité, puis réessaie.');
    }
  }, 8000);
})();`;

/** 5) NEW — Analyse qualité (master) : sélectionne/upgrade vers un master et copie le meilleur */
const qualityMasterPicker = `(async () => { 
  const seen = new Set();
  const looks = u => typeof u === 'string' && /\\.m3u8(\\?|#|$)/i.test(u);
  const add   = u => { if (looks(u)) seen.add(String(u)); };

  // 1) collecte rapide
  try { performance.getEntriesByType('resource').forEach(e => add(e.name)); } catch {}
  document.querySelectorAll('video').forEach(v => { add(v.src); add(v.currentSrc); });

  // si tu as déjà des URLs copiées, colle-les ici (optionnel) :
  // ["https://...chunklist.m3u8", "https://...playlist.m3u8"].forEach(add);

  const uniq = [...seen];

  // helpers
  const deriveMasters = (u) => {
    const s = new Set([u,
      u.replace(/chunklist[^/]*\\.m3u8/i, "playlist.m3u8"),
      u.replace(/chunklist[^/]*\\.m3u8/i, "master.m3u8"),
      u.replace(/index[^/]*\\.m3u8/i,    "playlist.m3u8"),
      u.replace(/index[^/]*\\.m3u8/i,    "master.m3u8"),
    ]);
    return [...s].filter(x => /\\.m3u8(\\?|#|$)/i.test(x));
  };

  const fetchText = async (u) => {
    try {
      const r = await fetch(u, { headers: { accept: "application/vnd.apple.mpegurl,*/*;q=0.8" }, cache: "no-store" });
      if (!r.ok) return null;
      return await r.text();
    } catch { return null; }
  };

  const parseMaster = (txt) => {
    // retourne la meilleure variante (max height / bandwidth)
    const lines = txt.split(/\\r?\\n/);
    const out = [];
    for (let i=0;i<lines.length;i++){
      const L = lines[i];
      if (/^#EXT-X-STREAM-INF:/i.test(L)) {
        const bw = /BANDWIDTH=(\\d+)/i.exec(L)?.[1];
        const res = /RESOLUTION=(\\d+)x(\\d+)/i.exec(L);
        const name = /NAME="([^"]+)"/i.exec(L)?.[1] || null;
        const u = lines[i+1] && !lines[i+1].startsWith("#") ? lines[i+1].trim() : null;
        out.push({
          bandwidth: bw ? parseInt(bw,10) : 0,
          height: res ? parseInt(res[2],10) : 0,
          name, uri: u
        });
      }
    }
    out.sort((a,b)=> (b.height - a.height) || (b.bandwidth - a.bandwidth));
    return { levels: out, best: out[0] || null };
  };

  const analyze = async (u) => {
    const txt = await fetchText(u);
    if (!txt) return { url: u, type: "unreachable" };
    const isMaster = /#EXT-X-STREAM-INF/i.test(txt);
    if (isMaster) {
      const m = parseMaster(txt);
      return {
        url: u, type: "master",
        bestHeight: m.best?.height || 0,
        bestBandwidth: m.best?.bandwidth || 0,
        levels: m.levels.length
      };
    }
    // chunklist → tente de dériver un master voisin
    for (const cand of deriveMasters(u)) {
      if (cand === u) continue;
      const t2 = await fetchText(cand);
      if (t2 && /#EXT-X-STREAM-INF/i.test(t2)) {
        const m = parseMaster(t2);
        return {
          url: cand, note: "(dérivé de chunklist)",
          type: "master",
          bestHeight: m.best?.height || 0,
          bestBandwidth: m.best?.bandwidth || 0,
          levels: m.levels.length
        };
      }
    }
    return { url: u, type: "chunklist" };
  };

  const results = await Promise.all(uniq.map(analyze));
  results.sort((a,b)=>{
    const rank = (r) => r.type==="master" ? (r.bestHeight||0)*1e9 + (r.bestBandwidth||0) : (r.type==="chunklist"? 1 : 0);
    return rank(b) - rank(a);
  });

  console.table(results);
  const best = results.find(r => r.type==="master") || results[0];
  if (best && best.url) {
    try { await navigator.clipboard.writeText(best.url); } catch {}
    console.log("✅ Meilleur HLS :", best.url);
    alert("✅ Meilleur HLS :\\n" + best.url);
  } else {
    alert("❓ Pas de master détecté (utilise le menu qualité du player si possible).");
  }
})();`;

export default function SnippetPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Snippets console · .m3u8</h1>
        <Link href="/m/live" className="underline">
          ← Retour
        </Link>
      </div>

      <p className="text-gray-700">
        Ouvre la page du live, clique <b>Play</b> si besoin, puis colle un des
        snippets dans la console (F12).
      </p>

      <CodeBlock
        title="Watcher global (fetch/xhr/video/Hls.js)"
        code={watcherAll}
      />
      <CodeBlock
        title="Inspection rapide (balises <video> + Performance)"
        code={quickVideoAndPerf}
      />
      <CodeBlock
        title="Scan Performance (instantané) + copie 1ère .m3u8"
        code={perfScanAndCopy}
      />
      <CodeBlock
        title="Sniff .m3u8 (8s) — copie le meilleur lien"
        code={sniff8s}
      />
      <CodeBlock
        title="Analyse qualité (master) — copie le meilleur HLS"
        code={qualityMasterPicker}
      />

      <div className="text-xs text-gray-500">
        Astuce: beaucoup d’URLs .m3u8 sont signées et expirent. Re-scanne quand
        ça 403.
      </div>
    </main>
  );
}
