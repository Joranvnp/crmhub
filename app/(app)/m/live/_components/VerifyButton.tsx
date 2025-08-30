"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Saisie manuelle d’un .m3u8 (UI inchangée) */
function AttachM3U8Inline({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [val, setVal] = useState("");

  async function run() {
    const url = val.trim();
    if (!url) return;
    const r = await fetch("/api/modules/live/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, m3u8: url }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert("Erreur attach: " + (j?.error || r.status));
      return;
    }
    onDone();
    // optionnel: router.refresh() à l’appelant
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setVal(t);
    } catch {}
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="https://.../playlist.m3u8"
        className="border rounded px-2 py-1 flex-1"
      />
      <button
        onClick={pasteFromClipboard}
        className="px-2 py-1 rounded border text-sm"
      >
        Coller
      </button>
      <button
        onClick={() => start(run)}
        disabled={pending || !val}
        className="px-3 py-1 rounded bg-black text-white text-sm"
      >
        Attacher
      </button>
    </div>
  );
}

export default function VerifyButton({
  id,
  url,
  probeToken,
}: {
  id: string;
  url: string;
  probeToken: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const endpoint =
    typeof window !== "undefined"
      ? `${location.origin}/api/modules/live/probe-collect`
      : "";

  /**
   * 🔁 SNIPPET (mis à jour) — collecte + analyse "master"
   * - patch fetch/xhr + PerformanceObserver
   * - dérive playlist/master depuis chunklist/index
   * - lit les manifests, choisit la meilleure qualité (height, bandwidth)
   * - copie, affiche, POST → probe-collect (sans fermer la page)
   */
  const QUALITY_AUTOPROBE_SNIPPET = useMemo(() => {
    return `(async () => {
  const LINK_ID = ${JSON.stringify(id)};
  const PROBE_TOKEN = ${JSON.stringify(probeToken)};
  const ENDPOINT = ${JSON.stringify(endpoint)};

  console.log('[CRMHub] probe (master) — démarré', { link: LINK_ID, endpoint: ENDPOINT });

  // ---------- helpers ----------
  function looks(u){ return typeof u==='string' && /\\.m3u8(\\?|#|$)/i.test(u); }
  function deriveMasters(u){
    const s = new Set([u,
      u.replace(/chunklist[^/]*\\.m3u8/i, 'playlist.m3u8'),
      u.replace(/chunklist[^/]*\\.m3u8/i, 'master.m3u8'),
      u.replace(/index[^/]*\\.m3u8/i,    'playlist.m3u8'),
      u.replace(/index[^/]*\\.m3u8/i,    'master.m3u8'),
    ]);
    return [...s].filter(x => /\\.m3u8(\\?|#|$)/i.test(x));
  }
  async function fetchText(u){
    try{
      const r = await fetch(u, { headers: { accept: 'application/vnd.apple.mpegurl,*/*;q=0.8' }, cache: 'no-store' });
      if(!r.ok) return null;
      return await r.text();
    }catch{ return null; }
  }
  function parseMaster(txt){
    const lines = txt.split(/\\r?\\n/);
    const out = [];
    for(let i=0;i<lines.length;i++){
      const L = lines[i];
      if(/^#EXT-X-STREAM-INF:/i.test(L)){
        const bw = /BANDWIDTH=(\\d+)/i.exec(L)?.[1];
        const res = /RESOLUTION=(\\d+)x(\\d+)/i.exec(L);
        const name = /NAME="([^"]+)"/i.exec(L)?.[1] || null;
        const u = lines[i+1] && !lines[i+1].startsWith('#') ? lines[i+1].trim() : null;
        out.push({ bandwidth: bw?parseInt(bw,10):0, height: res?parseInt(res[2],10):0, name, uri:u });
      }
    }
    out.sort((a,b)=> (b.height - a.height) || (b.bandwidth - a.bandwidth));
    return { levels: out, best: out[0] || null };
  }
  function scoreUrl(u){
    let s=0;
    if(/playlist\\.m3u8/i.test(u)) s+=3;
    if(/master\\.m3u8/i.test(u))   s+=2;
    if(/chunklist|index\\.m3u8/i.test(u)) s+=1;
    if(/^https?:\\/\\//i.test(u))   s+=1;
    return s;
  }
  async function analyzeOne(u){
    // 1) essai direct
    const txt = await fetchText(u);
    if(txt && /#EXT-X-STREAM-INF/i.test(txt)){
      const m = parseMaster(txt);
      return { url:u, type:'master', bestHeight:m.best?.height||0, bestBandwidth:m.best?.bandwidth||0, levels:m.levels.length };
    }
    // 2) chunklist/index -> derive playlist/master
    for(const cand of deriveMasters(u)){
      if(cand===u) continue;
      const t2 = await fetchText(cand);
      if(t2 && /#EXT-X-STREAM-INF/i.test(t2)){
        const m = parseMaster(t2);
        return { url:cand, note:'(dérivé)', type:'master', bestHeight:m.best?.height||0, bestBandwidth:m.best?.bandwidth||0, levels:m.levels.length };
      }
    }
    return { url:u, type: txt? 'chunklist':'unreachable' };
  }
  function pickBest(results){
    // priorité master par meilleure height puis bandwidth
    const masters = results.filter(r=>r.type==='master');
    if(masters.length){
      masters.sort((a,b)=> (b.bestHeight - a.bestHeight) || (b.bestBandwidth - a.bestBandwidth));
      return masters[0];
    }
    // fallback: chunklist sinon le premier reachable
    const chunks = results.filter(r=>r.type==='chunklist');
    if(chunks.length) return chunks[0];
    return results[0] || null;
  }
  async function postBest(best){
    const payload = JSON.stringify({ link_id: LINK_ID, probe_token: PROBE_TOKEN, m3u8: best?.url||null, page_url: location.href });
    try{
      if(navigator.sendBeacon){
        const ok = navigator.sendBeacon(ENDPOINT, new Blob([payload], { type:'application/json' }));
        if(!ok) await fetch(ENDPOINT, { method:'POST', headers:{'content-type':'application/json'}, body: payload });
      }else{
        await fetch(ENDPOINT, { method:'POST', headers:{'content-type':'application/json'}, body: payload });
      }
      console.log('[CRMHub] probe-collect : OK');
    }catch(e){ console.warn('[CRMHub] probe-collect : FAIL', e); }
  }
  async function copyRobust(text){
    try{ await navigator.clipboard.writeText(text); console.log('[CRMHub] copié via navigator'); return; }catch{}
    try{
      const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px';
      document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); ta.remove();
      console.log('[CRMHub] copié via execCommand');
      return;
    }catch{}
    try{ prompt('Copie ce lien :', text); }catch{}
  }
  function overlay(html){
    const box = document.createElement('div');
    box.style.cssText='position:fixed;right:12px;bottom:12px;max-width:92vw;z-index:2147483647;background:#111;color:#fff;padding:12px 14px;border-radius:12px;font:12px system-ui;box-shadow:0 6px 24px rgba(0,0,0,.4)';
    box.innerHTML=html;
    document.body.appendChild(box);
    return box;
  }

  // ---------- collecte ----------
  const seen = new Set();
  const add = (u)=>{ try{ if(looks(u)){ const s=String(u); if(!seen.has(s)){ seen.add(s); console.log('[CRMHub] +seen', s); } } }catch{} };

  // déjà chargées
  try{ performance.getEntriesByType('resource').forEach(e=> add(e.name)); }catch{}
  try{ document.querySelectorAll('video').forEach(v=>{ add(v.src); add(v.currentSrc); }); }catch{}

  // patch fetch/xhr
  const _fetch = window.fetch;
  try{ window.fetch = function(){ const u=arguments[0]; add(typeof u==='string'?u:(u&&u.url)); return _fetch.apply(this, arguments); }; }catch{}
  const _open = XMLHttpRequest.prototype.open;
  try{ XMLHttpRequest.prototype.open = function(m,u){ add(u); return _open.apply(this, arguments); }; }catch{}

  // perf observer
  let obs=null;
  if('PerformanceObserver' in window){
    try{
      obs=new PerformanceObserver(list=>{ for(const e of list.getEntries()){ e&&e.name&&add(e.name); } });
      obs.observe({ type:'resource', buffered:true });
      console.log('[CRMHub] PerformanceObserver actif');
    }catch(e){ console.warn('[CRMHub] PO error', e); }
  }

  // ---------- UI ----------
  const box = overlay(
    '<div style="font-weight:600;margin-bottom:6px">Probe .m3u8 (master)</div>'+
    '<div id="__crmhub_timer" style="opacity:.8">En cours…</div>'+
    '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'+
      '<button id="__crmhub_stop" style="padding:6px 10px;border-radius:8px;border:1px solid #fff3;color:#fff;background:#222">Stop & analyser</button>'+
      '<button id="__crmhub_copy" disabled style="padding:6px 10px;border-radius:8px;border:1px solid #fff3;color:#fff;background:#222;opacity:.6">Copier le meilleur</button>'+
      '<button id="__crmhub_close" style="padding:6px 10px;border-radius:8px;border:1px solid #fff3;color:#fff;background:#222">Fermer</button>'+
    '</div>'+
    '<div id="__crmhub_result" style="margin-top:8px;max-width:60ch;word-break:break-all"></div>'
  );

  let running=true, started=Date.now(), bestUrl=null;

  const timer = setInterval(()=> {
    if(!running) return;
    const sec = Math.floor((Date.now()-started)/1000);
    const el = document.getElementById('__crmhub_timer'); if(el) el.textContent = 'En cours… '+sec+'s — '+seen.size+' URL(s)';
  }, 500);

  async function analyze(){
    running=false;
    try{ window.fetch = _fetch; }catch{}
    try{ XMLHttpRequest.prototype.open = _open; }catch{}
    try{ obs && obs.disconnect && obs.disconnect(); }catch{}
    clearInterval(timer);

    // pré-tri (urls plausibles en tête)
    const list = [...seen].sort((a,b)=> scoreUrl(b)-scoreUrl(a));
    if(!list.length){
      const r = document.getElementById('__crmhub_result');
      if(r) r.textContent = '❓ Rien vu. Laisse tourner, clique ▶️, change de qualité, puis relance.';
      return;
    }

    // analyse master/chunklist
    const results = [];
    for(const u of list){
      try { results.push(await analyzeOne(u)); } catch {}
    }
    console.table(results);

    const best = pickBest(results);
    if(best && best.url){
      bestUrl = best.url;
      const r = document.getElementById('__crmhub_result');
      if(r){
        const esc = (s)=> s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
        r.innerHTML = '<div>✅ Meilleur HLS :</div><code>' + esc(best.url) + '</code>' +
          (best.bestHeight ? '<div style="opacity:.8">Qualité max détectée: ' + best.bestHeight + 'p (' + (best.bestBandwidth||0) + ')</div>' : '');
      }
      const copyBtn = document.getElementById('__crmhub_copy');
      if(copyBtn){ copyBtn.removeAttribute('disabled'); copyBtn.style.opacity='1'; }
      await postBest(best);
    }else{
      const r = document.getElementById('__crmhub_result');
      if(r) r.textContent = '❓ Pas de master détecté (essaie le menu qualité du lecteur).';
    }
  }

  document.getElementById('__crmhub_stop')?.addEventListener('click', analyze);
  document.getElementById('__crmhub_copy')?.addEventListener('click', async () => { if(bestUrl) await copyRobust(bestUrl); });
  document.getElementById('__crmhub_close')?.addEventListener('click', () => {
    running=false;
    try{ window.fetch = _fetch; }catch{}
    try{ XMLHttpRequest.prototype.open = _open; }catch{}
    try{ obs && obs.disconnect && obs.disconnect(); }catch{}
    clearInterval(timer);
    box.remove();
  });

  // expose debug
  window.__crmhubProbe = { seen, stop: analyze };
})();`;
  }, [endpoint, id, probeToken]);

  /** Bookmarklet qui lance le snippet (UI inchangée) */
  const bookmarklet = useMemo(
    () => `javascript:${encodeURIComponent(QUALITY_AUTOPROBE_SNIPPET)}`,
    [QUALITY_AUTOPROBE_SNIPPET]
  );

  /** Vérification côté serveur (inchangé) */
  async function verifyAsync() {
    try {
      const r = await fetch(
        `/api/modules/live/check?id=${encodeURIComponent(id)}`,
        { method: "POST" }
      );
      const text = await r.text();
      let j: any = {};
      try {
        j = text ? JSON.parse(text) : {};
      } catch {
        j = { raw: text };
      }

      if (!r.ok) {
        const msg = j?.detail || j?.error || text || `HTTP ${r.status}`;
        alert(`Erreur check (${r.status}): ${msg}`);
        console.error("[/api/modules/live/check] error:", {
          status: r.status,
          body: j,
        });
        return;
      }

      const st = j?.data?.status;
      const m3u8 = j?.data?.last_m3u8 || null;

      if (st === "online" && m3u8) {
        router.refresh();
      } else {
        setOpen(true);
      }
    } catch (e: any) {
      alert("Network error: " + (e?.message || e));
      console.error(e);
    }
  }

  /** Lien Tampermonkey (inchangé) */
  const tmLink = useMemo(() => {
    const cfg = { endpoint, link_id: id, probe_token: probeToken };
    const b64 =
      typeof window === "undefined"
        ? ""
        : btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
    return `${url}#crmhub_probe=${b64}`;
  }, [endpoint, id, probeToken, url]);

  return (
    <>
      <button
        className="px-3 py-1 rounded border"
        onClick={() =>
          start(() => {
            void verifyAsync();
          })
        }
        disabled={pending}
      >
        Vérifier
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-4 w-full max-w-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Récupérer le lien .m3u8</h3>
              <button className="text-sm" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>

            <p className="text-sm text-gray-700">
              Ouvre l’onglet du live{" "}
              <span className="font-mono break-all">{url}</span>, clique ▶️,
              puis :
            </p>

            {/* OPTION A — Bookmarklet (UI inchangée) */}
            <div className="flex items-center gap-2">
              <a
                href={bookmarklet}
                className="px-3 py-1 rounded bg-black text-white text-sm"
                title="Glisse d'abord dans ta barre de favoris, puis clique-le depuis l'onglet du live"
              >
                🔖 Probe (one-shot)
              </a>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(QUALITY_AUTOPROBE_SNIPPET)
                    .then(() => alert("Snippet (probe) copié ✅"))
                }
                className="px-3 py-1 rounded border text-sm"
              >
                Copier le snippet 8s
              </button>
            </div>

            {/* OPTION B — Tampermonkey (UI inchangée) */}
            <div className="text-sm text-gray-700 space-y-2 pt-2 border-t">
              <div className="font-medium">Option (avec Tampermonkey)</div>
              <ol className="list-decimal ml-5 space-y-1 text-xs text-gray-600">
                <li>
                  Installe l’userscript :{" "}
                  <a
                    className="underline"
                    href="/userscript/crmhub-autoprobe.user.js"
                    target="_blank"
                  >
                    /userscript/crmhub-autoprobe.user.js
                  </a>
                </li>
                <li>Ouvre le lien auto-probe (ou copie-le) :</li>
              </ol>
              <div className="flex items-center gap-2">
                <a
                  href={tmLink}
                  target="_blank"
                  className="px-3 py-1 rounded bg-indigo-600 text-white text-sm"
                >
                  Ouvrir le lien auto-probe
                </a>
                <button
                  onClick={() =>
                    navigator.clipboard
                      .writeText(tmLink)
                      .then(() => alert("Lien auto-probe copié ✅"))
                  }
                  className="px-3 py-1 rounded border text-sm"
                >
                  Copier le lien
                </button>
              </div>
            </div>

            <div className="pt-3 border-t">
              <AttachM3U8Inline
                id={id}
                onDone={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            </div>

            <p className="text-xs text-gray-500">
              (Les navigateurs empêchent d’exécuter un script sur un autre site
              sans action explicite.)
            </p>
          </div>
        </div>
      )}
    </>
  );
}
