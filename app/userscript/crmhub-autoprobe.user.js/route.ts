// app/userscript/crmhub-autoprobe.user.js/route.ts
export const dynamic = "force-static";

/**
 * IMPORTANT:
 * - On renvoie l'userscript comme une STRING (String.raw) — rien n'est exécuté côté serveur.
 * - Tampermonkey reconnaît l'install si:
 *   - content-type = text/javascript (ou text/plain)
 *   - content-disposition = inline
 */
const SCRIPT = String.raw`// ==UserScript==
// @name         CRMHub Live Auto-Probe
// @namespace    https://crmhub
// @version      1.0
// @description  Sniff .m3u8 automatiquement et POST vers CRMHub
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function () {
  'use strict';
  // ⚠️ CE CODE S'EXECUTE DANS LA PAGE DU LIVE (navigateur), PAS SUR TON SERVEUR.
  const m = window.location.hash.match(/crmhub_probe=([^&]+)/);
  if (!m) return;

  let cfg;
  try { cfg = JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch { return; }
  const { endpoint, link_id, probe_token } = cfg || {};
  if (!endpoint || !link_id || !probe_token) return;

  const found = new Set();
  const looks = u => typeof u === 'string' && /\.m3u8(\?|#|$)/i.test(u) && !/jpeg\.live\.mmcdn\.com/i.test(u);
  const add   = u => { try { if (looks(u)) { u=String(u); if(!found.has(u)){ found.add(u); post(u); } } } catch {} };

  function post(u) {
    const payload = JSON.stringify({ link_id, probe_token, m3u8: u, page_url: window.location.href });
    GM_xmlhttpRequest({
      url: endpoint, method: "POST",
      headers: { "content-type": "application/json" },
      data: payload,
      onload: () => console.log("[CRMHub] posted", u),
      onerror: e => console.warn("[CRMHub] post error", e)
    });
  }

  try { performance.getEntriesByType('resource').forEach(e => add(e.name)); } catch {}
  try { const _f = window.fetch; window.fetch = function(){ const u = arguments[0]; add(typeof u==='string'?u:(u&&u.url)); return _f.apply(this, arguments); }; } catch {}
  try { const _o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function(m,u){ add(u); return _o.apply(this, arguments); }; } catch {}
  try { document.querySelectorAll('video,source').forEach(el => { add(el.src||el.currentSrc); }); } catch {}

  if ('PerformanceObserver' in window) {
    try {
      const obs = new PerformanceObserver(list => list.getEntries().forEach(e => add(e.name)));
      obs.observe({ type: 'resource', buffered: true });
      setTimeout(()=>obs.disconnect(), 12000);
    } catch {}
  }

  // petit feedback visuel
  try {
    const box = document.createElement('div');
    box.style.cssText='position:fixed;z-index:2147483647;bottom:10px;right:10px;background:#0a0;color:#fff;padding:6px 10px;border-radius:8px;font:12px system-ui';
    box.textContent='CRMHub: auto-probe (10s)…';
    document.body.appendChild(box);
    setTimeout(()=>box.remove(), 11000);
  } catch {}
})();`;

export async function GET() {
  return new Response(SCRIPT, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "content-disposition": 'inline; filename="crmhub-autoprobe.user.js"',
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=3600",
    },
  });
}
