// app/(app)/m/live/layout.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="space-y-6">
      {/* Sous-menu LIVE commun à toutes les pages du dossier */}
      <nav className="flex items-center gap-3">
        <span className="font-semibold">Live</span>
        <Link href="/m/live" className="text-sm underline">
          Liens
        </Link>
        <Link href="/m/live/player" className="text-sm underline">
          Player
        </Link>
        <Link href="/m/live/snippet" className="text-sm underline">
          Snippet console
        </Link>
        <Link href="/m/live/players" className="text-sm underline">
          Players (tous)
        </Link>
      </nav>

      {children}
    </main>
  );
}
