import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;

  const js = `// ==UserScript==
// @name         CRMHub AutoProbe (master, CSP-proof, deferred attach)
// @namespace    crmhub
// @version      1.5.0
// @description  Sniff HLS .m3u8 (master), copie + stocke; puis, sur le CRM, attache automatiquement sans fermer l'onglet.
// @match        *://*/*
// @run-at       document-idle
// @downloadURL  ${base}/userscript/crmhub-autoprobe.user.js
// @updateURL    ${base}/userscript/crmhub-autoprobe.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      *
// ==/UserScript==

(function () {
  "use strict";

  // ---------- stockage clé ----------
  // On stocke les résultats sous la forme: KEY="crmhub_result:<LINK_ID>" -> { endpoint, link_id, probe_token, m3u8, ts }
  function resultKey(linkId){ return "crmhub_result:" + String(linkId); }

  // ---------- MODE A : page live avec #crmhub_probe=... ----------
  const hashMatch = location.hash && location.hash.match(/crmhub_probe=([^&]+)/);
  if (hashMatch) {
    let cfg = null;
    try {
      const raw = hashMatch[1];
      const json = decodeURIComponent(escape(atob(raw)));
      cfg = JSON.parse(json); // { endpoint, link_id, probe_token }
    } catch (e) {
      console.warn("[CRMHub][TM] config decode error", e);
      return;
    }
    if (!cfg || !cfg.endpoint || !cfg.link_id || !cfg.probe_token) return;

    const ENDPOINT = cfg.endpoint;
    const LINK_ID = cfg.link_id;
    const PROBE_TOKEN = cfg.probe_token;

    console.log("[CRMHub][TM] AutoProbe LIVE start", { LINK_ID, ENDPOINT });

    // ----- helpers (JS pur, pas de 'as any') -----
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
          const bw = /BANDWIDTH=(\\d+)/i.exec(L) ? parseInt(/BANDWIDTH=(\\d+)/i.exec(L)[1],10) : 0;
          const res = /RESOLUTION=(\\d+)x(\\d+)/i.exec(L);
          const h = res ? parseInt(res[2],10) : 0;
          const nameM = /NAME="([^"]+)"/i.exec(L);
          const name = nameM ? nameM[1] : null;
          const u = lines[i+1] && !lines[i+1].startsWith("#") ? lines[i+1].trim() : null;
          out.push({ bandwidth: bw, height: h, name: name, uri: u });
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
      try{ await navigator.clipboard.writeText(text); console.log("[CRMHub][TM] copied via navigator"); return true; }catch(e){}
      try{
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position="fixed"; ta.style.left="-9999px";
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand("copy"); ta.remove();
        console.log("[CRMHub][TM] copied via execCommand");
        return true;
      }catch(e){}
      try{ prompt("Copie ce lien :", text); }catch(e){}
      return false;
    }
    function overlay(html){
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;right:12px;bottom:12px;max-width:92vw;z-index:2147483647;background:#111;color:#fff;padding:12px 14px;border-radius:12px;font:12px system-ui;box-shadow:0 6px 24px rgba(0,0,0,.4)";
      box.innerHTML = html;
      document.body.appendChild(box);
      return box;
    }

    // ----- collecte live -----
    const seen = new Set();
    function add(u){
      try {
        if (looks(u)){
          const s = String(u);
          if (!seen.has(s)){ seen.add(s); console.log("[CRMHub][TM] +seen", s); }
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
      } catch (e) { console.warn("[CRMHub][TM] PO error", e); }
    }

    // ----- UI -----
    const box = overlay(
      '<div style="font-weight:600;margin-bottom:6px">Probe .m3u8 (auto, master)</div>'+
      '<div id="__crmhub_timer" style="opacity:.8">En cours…</div>'+
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'+
        '<button id="__crmhub_stop" style="padding:6px 10px;border-radius:8px;border:1px solid #fff3;color:#fff;background:#222">Stop & analyser</button>'+
        '<button id="__crmhub_copy" disabled style="padding:6px 10px;border-radius:8px;border:1px solid #fff3;color:#fff;background:#222;opacity:.6">Copier le meilleur</button>'+
        '<button id="__crmhub_close" style="padding:6px 10px;border-radius:8px;border:1px solid #fff3;color:#fff;background:#222">Fermer</button>'+
      '</div>'+
      '<div id="__crmhub_result" style="margin-top:8px;max-width:60ch;word-break:break-all"></div>'+
      '<div style="margin-top:6px;opacity:.7">Ne ferme pas : retourne sur le CRM, l’attache se fera automatiquement.</div>'
    );
    let running = true, started = Date.now(), bestUrl = null;
    const timer = setInterval(() => {
      if (!running) return;
      const sec = Math.floor((Date.now() - started)/1000);
      const el = document.getElementById("__crmhub_timer");
      if (el) el.textContent = "En cours… " + sec + "s — " + seen.size + " URL(s)";
    }, 500);

    async function analyze(){
      running = false;
      try { window.fetch = _fetch; } catch {}
      try { XMLHttpRequest.prototype.open = _open; } catch {}
      try { obs && obs.disconnect && obs.disconnect(); } catch {}
      clearInterval(timer);

      const list = Array.from(seen).sort((a,b)=> scoreUrl(b)-scoreUrl(a));
      if (!list.length){
        const r = document.getElementById("__crmhub_result");
        if (r) r.textContent = "❓ Rien vu. Laisse tourner, clique ▶️, change de qualité, puis relance.";
        return;
      }

      const results = [];
      for (let i=0;i<list.length;i++){
        const u = list[i];
        try { results.push(await analyzeOne(u)); } catch {}
      }
      try { console.table(results); } catch {}

      const best = pickBest(results);
      if (best && best.url){
        bestUrl = best.url;
        const r = document.getElementById("__crmhub_result");
        if (r) {
          const esc = (s)=> s.replace(/&/g,"&amp;").replace(/</g,"&lt;");
          r.innerHTML = '<div>✅ Meilleur HLS :</div><code>'+esc(bestUrl)+'</code>' +
            (best.bestHeight ? '<div style="opacity:.8">Qualité max: '+best.bestHeight+'p ('+(best.bestBandwidth||0)+')</div>' : '');
        }
        const copyBtn = document.getElementById("__crmhub_copy");
        if (copyBtn){ copyBtn.removeAttribute("disabled"); copyBtn.style.opacity = "1"; }
        // — 1) copie
        try { await copyRobust(bestUrl); } catch {}
        // — 2) stocke pour attache ultérieure côté CRM
        try {
          GM_setValue(resultKey(LINK_ID), {
            endpoint: ENDPOINT,
            link_id: LINK_ID,
            probe_token: PROBE_TOKEN,
            m3u8: bestUrl,
            ts: Date.now()
          });
          console.log("[CRMHub][TM] stored for CRM attach", { LINK_ID, bestUrl });
        } catch (e) {
          console.warn("[CRMHub][TM] GM_setValue failed", e);
        }
      } else {
        const r = document.getElementById("__crmhub_result");
        if (r) r.textContent = "❓ Pas de master détecté (essaie le menu qualité du lecteur).";
      }
    }

    document.getElementById("__crmhub_stop")?.addEventListener("click", analyze);
    document.getElementById("__crmhub_copy")?.addEventListener("click", async () => { if (bestUrl) await copyRobust(bestUrl); });
    document.getElementById("__crmhub_close")?.addEventListener("click", () => {
      running = false;
      try { window.fetch = _fetch; } catch {}
      try { XMLHttpRequest.prototype.open = _open; } catch {}
      try { obs && obs.disconnect && obs.disconnect(); } catch {}
      clearInterval(timer);
      box.remove();
    });

    // expose debug
    (window).__crmhubProbe = { seen: seen, stop: analyze };
    return; // on ne continue pas au mode CRM quand on est sur la page live
  }

  // ---------- MODE B : sur le CRM → attacher automatiquement ce qui a été stocké ----------
  (async function attachOnCRM(){
    let keys = [];
    try { keys = await GM_listValues(); } catch {}
    if (!keys || !keys.length) return;

    // récupère toutes les valeurs candidates pour ce domaine CRM
    for (let i=0;i<keys.length;i++){
      const k = keys[i];
      if (!/^crmhub_result:/.test(k)) continue;
      let rec = null;
      try { rec = await GM_getValue(k); } catch {}
      if (!rec || !rec.endpoint || !rec.link_id || !rec.m3u8) continue;

      // On attache UNIQUEMENT si on est bien sur le même origin que l'endpoint stocké
      let ep;
      try { ep = new URL(rec.endpoint); } catch { continue; }
      if (ep.origin !== location.origin) continue;

      const attachUrl = ep.origin + "/api/modules/live/attach";
      const payload = JSON.stringify({ id: rec.link_id, m3u8: rec.m3u8 });

      // essai GM_xmlhttpRequest (bypass CSP); devrait marcher sur le CRM aussi
      const doPost = () => new Promise(resolve => {
        try {
          GM_xmlhttpRequest({
            method: "POST",
            url: attachUrl,
            headers: { "content-type": "application/json" },
            data: payload,
            onload: (res) => {
              console.log("[CRMHub][TM] attach OK", res.status);
              resolve(true);
            },
            onerror: (e) => {
              console.warn("[CRMHub][TM] attach FAIL (GM)", e);
              resolve(false);
            }
          });
        } catch (e) {
          console.warn("[CRMHub][TM] GM_xmlhttpRequest threw", e);
          // fallback fetch (sur le CRM, normalement OK)
          fetch(attachUrl, { method:"POST", headers:{ "content-type":"application/json" }, body: payload })
            .then(()=>resolve(true))
            .catch(()=>resolve(false));
        }
      });

      const ok = await doPost();
      if (ok) {
        try { await GM_deleteValue(k); } catch {}
        // petit toast visuel sur le CRM
        (function toast(msg){
          const d = document.createElement("div");
          d.textContent = msg;
          d.style.cssText = "position:fixed;top:12px;right:12px;background:#0b6;color:#fff;padding:10px 12px;border-radius:10px;font:13px system-ui;z-index:2147483647;box-shadow:0 6px 24px rgba(0,0,0,.25)";
          document.body.appendChild(d);
          setTimeout(()=> d.remove(), 3500);
        })("✅ Lien HLS attaché automatiquement");
      }
    }
  })();
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
