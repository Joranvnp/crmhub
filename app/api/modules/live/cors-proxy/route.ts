import { NextRequest, NextResponse } from "next/server";

// Très simple proxy GET → passe une URL cible ?url=...
// Limites:
// - pas de réécriture de manifest .m3u8 (donc les segments peuvent échouer si off-origin)
// - à réserver à des ressources que TU contrôles (ouvrir CORS côté origine reste la bonne solution)

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return new NextResponse("Missing url", { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept:
          "application/vnd.apple.mpegurl,application/x-mpegURL;q=0.9,*/*;q=0.8",
        // ajoute un referer si ton origine l'exige
      },
      redirect: "follow",
      cache: "no-store",
    });

    // On stream la réponse telle quelle et on ajoute CORS permissif
    const res = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: new Headers(upstream.headers),
    });
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("Access-Control-Expose-Headers", "*");
    return res;
  } catch (e) {
    return new NextResponse("Proxy error", { status: 502 });
  }
}
