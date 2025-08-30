"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Snippet “8s” : sniff .m3u8 et copie le meilleur lien dans le presse-papiers */
const SNIPPET_8S = `(() => {
  const found = new Set();
  const looks = u => typeof u === 'string' && \\/\\.m3u8(\\?|#|$)\\/i.test(u) && !\\/jpeg\\.live\\.mmcdn\\.com\\/i.test(u);
  const add   = u => { try { if (looks(u)) found.add(String(u)); } catch {} };

  try { performance.getEntriesByType('resource').forEach(e => add(e.name)); } catch {}

  const _fetch = window.fetch;
  try { window.fetch = function (...a) { const u = a[0]; add(typeof u==='string' ? u : (u && u.url)); return _fetch.apply(this, a); }; } catch {}

  const _open = XMLHttpRequest.prototype.open;
  try { XMLHttpRequest.prototype.open = function (m, u) { add(u); return _open.apply(this, arguments); }; } catch {}

  const pick = () => {
    const arr=[...found];
    if(!arr.length) return null;
    arr.sort((a,b)=>{
      const score = u => {
        let s=0;
        if(/playlist\\.m3u8/i.test(u)) s+=3;
        if(/master\\.m3u8/i.test(u))   s+=2;
        if(/chunklist|index\\.m3u8/i.test(u)) s+=1;
        if(/^https?:\\/\\//i.test(u))  s+=1;
        return -s;
      };
      return score(a)-score(b);
    });
    return arr[0];
  };

  setTimeout(async () => {
    try { window.fetch = _fetch; } catch {}
    try { XMLHttpRequest.prototype.open = _open; } catch {}
    const best = pick();
    if (best) {
      try { await navigator.clipboard.writeText(best); } catch {}
      alert('✅ Flux capturé (copié) :\\n' + best);
    } else {
      alert('❓ Pas de .m3u8. Clique ▶️ puis réessaie.');
    }
  }, 8000);
})();`;

/** ==== NOUVEAU: mini UI d’attache sans prompt() ==== */
function AttachM3U8Inline({ id, onDone }: { id: string; onDone: () => void }) {
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ATTACH_URL = "/api/modules/live/attach";

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setVal(t.trim());
    } catch {
      setMsg("Impossible de lire le presse-papiers (autorisation navigateur).");
    }
  }

  function attach() {
    start(async () => {
      setMsg(null);
      const url = (val || "").trim();
      if (!url) {
        setMsg("Colle d’abord une URL .m3u8.");
        return;
      }
      try {
        const res = await fetch(ATTACH_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, m3u8: url }),
        });
        const ct = res.headers.get("content-type") || "";
        const data = ct.includes("application/json")
          ? await res.json()
          : { _raw: await res.text() };
        if (!res.ok) {
          setMsg(
            `Erreur (${res.status}) : ${data?.error || data?._raw || "unknown"}`
          );
          return;
        }
        onDone();
        location.reload();
      } catch (e: any) {
        setMsg("Network error: " + (e?.message || e));
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="font-medium mb-1">Attacher manuellement</div>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="https://…/playlist.m3u8"
          className="flex-1 border rounded px-3 py-2"
          inputMode="url"
          autoFocus
        />
        <button
          onClick={pasteFromClipboard}
          type="button"
          className="px-3 py-2 rounded border"
        >
          Coller
        </button>
        <button
          onClick={attach}
          type="button"
          disabled={pending}
          className="px-3 py-2 rounded bg-black text-white disabled:opacity-60"
        >
          {pending ? "Attache…" : "Attacher"}
        </button>
      </div>
      {msg && <div className="text-xs text-gray-600">{msg}</div>}
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

  /** OPTION A — Bookmarklet (sans extension) */
  const bookmarklet = useMemo(() => {
    const code = `(function(){try{
      var END=${JSON.stringify(endpoint)};
      var ID=${JSON.stringify(id)};
      var TOK=${JSON.stringify(probeToken)};
      var F=new Set();
      function looks(u){return typeof u==='string'&&/\\.m3u8(\\?|#|$)/i.test(u)&&!/jpeg\\.live\\.mmcdn\\.com/i.test(u);}
      function add(u){try{if(looks(u))F.add(String(u));}catch{}}

      try{performance.getEntriesByType('resource').forEach(e=>add(e.name));}catch{}
      try{var _f=window.fetch; window.fetch=function(){var u=arguments[0]; add(typeof u==='string'?u:(u&&u.url)); return _f.apply(this,arguments);};}catch{}
      try{var _o=XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open=function(m,u){ add(u); return _o.apply(this,arguments); };}catch{}

      function pick(arr){
        if(!arr.length)return null;
        arr.sort(function(a,b){
          function score(u){var s=0;if(/playlist\\.m3u8/i.test(u))s+=3;if(/master\\.m3u8/i.test(u))s+=2;if(/chunklist|index\\.m3u8/i.test(u))s+=1;if(/^https?:\\/\\//i.test(u))s+=1;return -s;}
          return score(a)-score(b);
        });
        return arr[0];
      }

      setTimeout(function(){
        var best=pick(Array.from(F));
        var body=JSON.stringify({ link_id: ID, probe_token: TOK, m3u8: best||null, page_url: location.href });
        try{ if(navigator.sendBeacon){ var b=new Blob([body],{type:'application/json'}); navigator.sendBeacon(END,b); } }catch{}
        try{ fetch(END,{method:'POST',headers:{'content-type':'application/json'},body}); }catch{}
        alert(best?('✅ Flux capturé\\n'+best):'❓ Pas de .m3u8. Clique ▶️ puis re-Probe.');
      },8000);
    }catch(e){ alert('Probe error: '+e); }})();`;
    return `javascript:${encodeURIComponent(code)}`;
  }, [endpoint, id, probeToken]);

  /** OPTION B — Tampermonkey auto-probe */
  const tmLink = useMemo(() => {
    const cfg = { endpoint, link_id: id, probe_token: probeToken };
    const b64 =
      typeof window === "undefined"
        ? ""
        : btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
    return `${url}#crmhub_probe=${b64}`;
  }, [endpoint, id, probeToken, url]);

  /** Vérification côté serveur : si online+m3u8 => refresh ; sinon, ouvrir le modal */
  function verifyAsync() {
    start(async () => {
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
        const last = j?.data?.last_m3u8 || null;

        if (st === "online" && last) {
          router.refresh();
        } else {
          setOpen(true);
        }
      } catch (e: any) {
        alert("Network error: " + (e?.message || e));
        console.error(e);
      }
    });
  }

  return (
    <>
      <button
        className="px-3 py-1 rounded border"
        onClick={verifyAsync}
        disabled={pending}
      >
        {pending ? "Vérif…" : "Vérifier"}
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

            {/* OPTION A : sans extension */}
            <div className="flex items-center gap-2">
              <a
                href={bookmarklet}
                className="px-3 py-1 rounded bg-black text-white text-sm"
              >
                🔖 Probe (one-shot)
              </a>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(SNIPPET_8S)
                    .then(() => alert("Snippet 8s copié ✅"))
                }
                className="px-3 py-1 rounded border text-sm"
              >
                Copier le snippet 8s
              </button>
            </div>

            {/* OPTION B : avec Tampermonkey */}
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

            {/* ==== Zone d’attache sans prompt() ==== */}
            <div className="pt-3 border-t">
              <AttachM3U8Inline id={id} onDone={() => setOpen(false)} />
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
