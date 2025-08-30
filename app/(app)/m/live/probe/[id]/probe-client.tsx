"use client";

import Link from "next/link";
import { useMemo } from "react";

export default function ProbeClient({
  id,
  title,
  url,
  probeToken,
  appUrl,
}: {
  id: string;
  title?: string | null;
  url: string;
  probeToken: string;
  appUrl: string;
}) {
  const endpoint = useMemo(() => {
    const base =
      (appUrl && appUrl.trim()) ||
      (typeof window !== "undefined" ? window.location.origin : "");
    return `${base.replace(/\/$/, "")}/api/live/probe-collect`;
  }, [appUrl]);

  // Bookmarklet One-shot (8s sniff)
  const bookmarklet = useMemo(() => {
    const code = `
(function(){
  try{
    var ENDPOINT=${JSON.stringify(endpoint)};
    var ID=${JSON.stringify(id)};
    var TOKEN=${JSON.stringify(probeToken)};
    var found=new Set();
    function looks(u){ return typeof u==='string' && /\\.m3u8(\\?|#|$)/i.test(u) && !/jpeg\\.live\\.mmcdn\\.com/i.test(u); }
    function add(u){ if(looks(u)) found.add(String(u)); }

    // Perf entries déjà présentes
    try{ performance.getEntriesByType('resource').forEach(e=>add(e.name)); }catch(_){}

    // Patch fetch & XHR
    try{ var _fetch=window.fetch; window.fetch=function(){ try{var u=arguments[0]; add(typeof u==='string'?u:(u&&u.url)); }catch(_){} return _fetch.apply(this, arguments); }; }catch(_){}
    try{ var _open=XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open=function(m,u){ try{ add(u); }catch(_){} return _open.apply(this, arguments); }; }catch(_){}

    // Scrute DOM <video>/<source>
    try{
      document.querySelectorAll('video,source').forEach(function(el){
        add(el.src||el.currentSrc);
        ['data-src','data-stream','data-hls','data-url'].forEach(function(a){var v=el.getAttribute && el.getAttribute(a); if(v) add(v);});
      });
      // Hook setter src
      function hook(Proto){
        var d=Object.getOwnPropertyDescriptor(Proto,'src');
        if(d&&d.set){ Object.defineProperty(Proto,'src',{ set:function(v){ try{add(v);}catch(_){} return d.set.call(this,v); }, get:d.get }); }
      }
      hook(HTMLMediaElement.prototype);
      if(window.HTMLSourceElement) hook(HTMLSourceElement.prototype);
    }catch(_){}

    // MutationObserver pour <source> dynamiques
    try{
      var mo=new MutationObserver(function(list){
        list.forEach(function(m){ m.addedNodes && m.addedNodes.forEach(function(n){ if(n&&n.tagName==='SOURCE'){ add(n.src); } }); });
      });
      mo.observe(document.documentElement,{childList:true,subtree:true});
      setTimeout(function(){ try{mo.disconnect();}catch(_){}} ,9000);
    }catch(_){}

    // UI overlay
    try{var box=document.createElement('div'); box.style.cssText='position:fixed;z-index:2147483647;bottom:12px;right:12px;background:#111;color:#fff;padding:10px 12px;border-radius:10px;font:12px/1.3 system-ui'; box.textContent='Probe actif: clique ▶️ si besoin, je sniffe 8s…'; document.body.appendChild(box); setTimeout(function(){box.remove();},9000);}catch(_){}

    function pick(arr){
      if(!arr.length) return null;
      arr.sort(function(a,b){
        function score(u){ var s=0; if(/playlist\\.m3u8/i.test(u)) s+=3; if(/master\\.m3u8/i.test(u)) s+=2; if(/chunklist|index\\.m3u8/i.test(u)) s+=1; if(/^https?:\\/\\//i.test(u)) s+=1; return -s; }
        return score(a)-score(b);
      });
      return arr[0];
    }

    setTimeout(function(){
      var best=pick(Array.from(found));
      var payload={ link_id:ID, probe_token:TOKEN, m3u8:best||null, page_url:location.href };
      var body=JSON.stringify(payload);
      if(navigator.sendBeacon){ var blob=new Blob([body],{type:'application/json'}); navigator.sendBeacon(ENDPOINT, blob); }
      try{ fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body}); }catch(_){}
      alert(best?('✅ Flux capturé\\n'+best):'❓ Pas de .m3u8 vu. Relance Play puis re-Probe.');
    },8000);
  }catch(e){ alert('Probe error: '+e); }
})();`.trim();
    return `javascript:${encodeURIComponent(code)}`;
  }, [endpoint, id, probeToken]);

  // Bookmarklet Live (envoie chaque nouvelle ressource .m3u8)
  const liveBookmarklet = useMemo(() => {
    const code = `
(function(){
  try{
    var ENDPOINT=${JSON.stringify(endpoint)};
    var ID=${JSON.stringify(id)};
    var TOKEN=${JSON.stringify(probeToken)};
    var seen=new Set();
    function post(u){
      if(!u || seen.has(u)) return;
      seen.add(u);
      var body=JSON.stringify({ link_id:ID, probe_token:TOKEN, m3u8:u, page_url:location.href });
      if(navigator.sendBeacon){ var blob=new Blob([body],{type:'application/json'}); navigator.sendBeacon(ENDPOINT, blob); }
      try{ fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body}); }catch(_){}
      console.log('[m3u8][posted]', u);
    }
    function looks(u){ return typeof u==='string' && /\\.m3u8(\\?|#|$)/i.test(u) && !/jpeg\\.live\\.mmcdn\\.com/i.test(u); }

    // Existants
    try{ performance.getEntriesByType('resource').forEach(e=>{ if(looks(e.name)) post(e.name); }); }catch(_){}

    // Live observer
    if('PerformanceObserver' in window){
      var obs=new PerformanceObserver(function(list){ list.getEntries().forEach(function(e){ if(looks(e.name)) post(e.name); }); });
      try{ obs.observe({type:'resource', buffered:true}); alert('Watcher actif: lance/seek la vidéo, les .m3u8 seront envoyés.'); (window).__probeObs=obs; }catch(err){ alert('PerfObserver error: '+err); }
    }else{
      alert('PerformanceObserver non supporté');
    }
  }catch(e){ alert('Probe error: '+e); }
})();`.trim();
    return `javascript:${encodeURIComponent(code)}`;
  }, [endpoint, id, probeToken]);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Probe (client) · {title || url}
        </h1>
        <Link href="/m/live" className="underline">
          ← Retour
        </Link>
      </div>

      <ol className="list-decimal ml-5 space-y-2">
        <li>Glisse un des boutons ci-dessous dans ta barre de favoris.</li>
        <li>
          Ouvre la page du live (même navigateur), clique <b>Play</b> si
          nécessaire.
        </li>
        <li>
          Cliques sur le favori. Le meilleur <code>.m3u8</code> sera envoyé
          automatiquement.
        </li>
      </ol>

      <div className="flex items-center gap-3">
        <a href={bookmarklet} className="px-3 py-2 rounded bg-black text-white">
          🔖 Probe (one-shot)
        </a>
        <a
          href={liveBookmarklet}
          className="px-3 py-2 rounded bg-indigo-600 text-white"
        >
          🔖 Probe (live)
        </a>
      </div>

      <p className="text-sm text-gray-600">
        Si la lecture échoue (CORS / referer), garde l’URL pour debug et utilise
        l’embed officiel si c’est YouTube/Twitch/Vimeo.
      </p>
    </main>
  );
}
