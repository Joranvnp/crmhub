// app/userscript/crmhub-autoprobe.user.js/route.ts
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;

  const js = `// ==UserScript==
// @name         CRMHub AutoProbe (10s, copy; safe-close)
// @namespace    crmhub
// @version      2.1.0
// @description  Sniffe les .m3u8 ~10s, choisit le meilleur, le copie. Ne ferme JAMAIS si non armé. Ferme uniquement si autorisé.
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @downloadURL  ${base}/userscript/crmhub-autoprobe.user.js
// @updateURL    ${base}/userscript/crmhub-autoprobe.user.js
// ==/UserScript==

(function () {
  "use strict";

  const AUTO_STOP_MS = 10000; // durée d'analyse

  // ---------- ARMING / SAFETY ----------
  const hash = location.hash || "";
  const ARMED = /(?:^|[&#])crmhub_autoprobe=1(?:$|&)/.test(hash) ||
                (sessionStorage.getItem("__crmhub_armed") === "1");
  if (!ARMED) {
    // strictement inactif si non armé
    return;
  }
  const CLOSE_ALLOWED = /(?:^|[&#])crmhub_close=1(?:$|&)/.test(hash) || !!window.opener;

  // ---------- helpers détection ----------
  function looks(u){ return typeof u==="string" && /\\.m3u8(\\?|#|$)/i.test(u); }
  function deriveMasters(u){
    const s = new Set([u,
      u.replace(/chunklist[^/]*\\.m3u8/i, "playlist.m3u8"),
      u.replace(/chunklist[^/]*\\.m3u8/i, "master.m3u8"),
      u.replace(/index[^/]*\\.m3u8/i,    "playlist.m3u8"),
      u.replace(/index[^/]*\\.m3u8/i,    "master.m3u8"),
    ]);
    return Array.from(s).filter(x => /\\.m3u8(\\?|#|$)/i.test(x));
  }
  async function fetchText(u){
    try{
      const r = await fetch(u, { headers:{ accept:"application/vnd.apple.mpegurl,*/*;q=0.8" }, cache:"no-store" });
      if (!r.ok) return null;
      return await r.text();
    }catch{ return null; }
  }
  function parseMaster(txt){
    const lines = txt.split(/\\r?\\n/), out = [];
    for (let i=0;i<lines.length;i++){
      const L = lines[i];
      if (/^#EXT-X-STREAM-INF:/i.test(L)){
        const bwM = /BANDWIDTH=(\\d+)/i.exec(L);
        const res = /RESOLUTION=(\\d+)x(\\d+)/i.exec(L);
        const nameM = /NAME="([^"]+)"/i.exec(L);
        const bw = bwM ? parseInt(bwM[1],10) : 0;
        const h  = res ? parseInt(res[2],10) : 0;
        const name = nameM ? nameM[1] : null;
        const u = lines[i+1] && !lines[i+1].startsWith("#") ? lines[i+1].trim() : null;
        out.push({ bandwidth: bw, height: h, name, uri: u });
      }
    }
    out.sort((a,b)=> (b.height - a.height) || (b.bandwidth - a.bandwidth));
    return { levels: out, best: out[0] || null };
  }
  function scoreUrl(u){ let s=0; if(/playlist\\.m3u8/i.test(u)) s+=3; if(/master\\.m3u8/i.test(u)) s+=2; if(/chunklist|index\\.m3u8/i.test(u)) s+=1; if(/^https?:\\/\\//i.test(u)) s+=1; return s; }
  async function analyzeOne(u){
    const txt = await fetchText(u);
    if (txt && /#EXT-X-STREAM-INF/i.test(txt)){
      const m = parseMaster(txt);
      return { url:u, type:"master", bestHeight:m.best?m.best.height:0, bestBandwidth:m.best?m.best.bandwidth:0, levels:m.levels.length };
    }
    const cands = deriveMasters(u);
    for (let i=0;i<cands.length;i++){
      const cand = cands[i];
      if (cand === u) continue;
      const t2 = await fetchText(cand);
      if (t2 && /#EXT-X-STREAM-INF/i.test(t2)){
        const m = parseMaster(t2);
        return { url:cand, note:"(dérivé)", type:"master", bestHeight:m.best?m.best.height:0, bestBandwidth:m.best?m.best.bandwidth:0, levels:m.levels.length };
      }
    }
    return { url:u, type: txt? "chunklist" : "unreachable" };
  }
  function pickBest(results){
    const masters = results.filter(r=>r.type==="master");
    if (masters.length){
      masters.sort((a,b)=> (b.bestHeight - a.bestHeight) || (b.bestBandwidth - a.bestBandwidth));
      return masters[0];
    }
    const chunks = results.filter(r=>r.type==="chunklist");
    if (chunks.length) return chunks[0];
    return results[0] || null;
  }
  async function copyRobust(text){
    try{ await navigator.clipboard.writeText(text); return true; }catch(e){}
    try{
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position="fixed"; ta.style.left="-9999px";
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand("copy"); ta.remove();
      return true;
    }catch(e){}
    try{ prompt("Copie ce lien :", text); }catch(e){}
    return false;
  }
  function toast(msg, ms=3000){
    const d = document.createElement("div");
    d.textContent = msg;
    d.style.cssText = "position:fixed;top:12px;right:12px;background:#0b6;color:#fff;padding:10px 12px;border-radius:10px;font:13px system-ui;z-index:2147483647;box-shadow:0 6px 24px rgba(0,0,0,.25)";
    document.body.appendChild(d);
    setTimeout(()=> d.remove(), ms);
  }
  function tryCloseTabSafely(didCopy){
    // ne tente la fermeture que si on a copié ET qu'on est autorisé à fermer
    if (!didCopy || !CLOSE_ALLOWED) {
      if (didCopy) toast("✅ Lien copié");
      return;
    }
    setTimeout(() => {
      let closed = false;
      try { window.close(); closed = true; } catch {}
      if (!closed) {
        try { const w = window.open('', '_self'); w?.close(); closed = true; } catch {}
      }
      if (!closed) {
        toast("✅ Lien copié. Ferme l’onglet manuellement (bloqué par le navigateur).", 4000);
      }
    }, 250);
  }

  // ---------- collecte ----------
  const seen = new Set();
  function add(u){
    try {
      if (looks(u)){
        const s = String(u);
        if (!seen.has(s)){ seen.add(s); }
      }
    } catch {}
  }
  try { performance.getEntriesByType("resource").forEach(e=> add(e.name)); } catch {}
  try { document.querySelectorAll("video").forEach(v=> { add(v.src); add(v.currentSrc); }); } catch {}

  const _fetch = window.fetch;
  try { window.fetch = function(){ const u=arguments[0]; add(typeof u==="string"?u:(u&&u.url)); return _fetch.apply(this, arguments); }; } catch {}
  const _open = XMLHttpRequest.prototype.open;
  try { XMLHttpRequest.prototype.open = function(m,u){ add(u); return _open.apply(this, arguments); }; } catch {}

  let obs = null;
  if ("PerformanceObserver" in window) {
    try {
      obs = new PerformanceObserver(list => { for (const e of list.getEntries()){ if (e && e.name) add(e.name); } });
      obs.observe({ type: "resource", buffered: true });
    } catch {}
  }

  // ---------- badge ----------
  const badge = document.createElement("div");
  badge.textContent = "Probe…";
  badge.style.cssText = "position:fixed;right:10px;bottom:10px;background:#111;color:#fff;padding:6px 8px;border-radius:10px;font:12px system-ui;opacity:.85;z-index:2147483647";
  document.body.appendChild(badge);
  const t0 = Date.now();
  const iv = setInterval(()=>{
    const s = Math.floor((Date.now()-t0)/1000);
    badge.textContent = "Probe… " + s + "s — " + seen.size + " URL";
  }, 500);

  // ---------- auto-stop + analyse + copy + safe-close ----------
  setTimeout(async ()=>{
    // stop hooks
    try { window.fetch = _fetch; } catch {}
    try { XMLHttpRequest.prototype.open = _open; } catch {}
    try { obs && obs.disconnect && obs.disconnect(); } catch {}
    clearInterval(iv);

    const list = Array.from(seen).sort((a,b)=> scoreUrl(b)-scoreUrl(a));
    if (!list.length){
      badge.textContent = "❓ Rien détecté";
      // NE PAS fermer si rien détecté
      return;
    }

    const results = [];
    for (let i=0;i<list.length;i++){
      const u = list[i];
      try { results.push(await analyzeOne(u)); } catch {}
    }
    const best = pickBest(results);
    const bestUrl = best && best.url ? best.url : list[0];

    const copied = await copyRobust(bestUrl);
    badge.textContent = copied ? "✅ Lien copié" : "⚠️ Copie impossible";

    tryCloseTabSafely(copied);
  }, AUTO_STOP_MS);

  // bonus: si le bookmarklet t’a "armé" via sessionStorage, on peut le désarmer après usage
  try { sessionStorage.removeItem("__crmhub_armed"); } catch {}
})();
`;

  return new NextResponse(js, {
    status: 200,
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
