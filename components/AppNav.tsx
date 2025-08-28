"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import ButtonAccount from "@/components/ButtonAccount";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/modules", label: "Modules" },
  { href: "/billing", label: "Abonnement" },
];

export default function AppNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
        {/* Logo */}
        <Link href="/dashboard" className="font-bold text-lg">
          Strato
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-6 items-center">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium hover:text-blue-600"
            >
              {l.label}
            </Link>
          ))}
          {/* Bouton compte aligné à droite */}
          <ButtonAccount />
        </nav>

        {/* Mobile burger + compte */}
        <div className="md:hidden flex items-center gap-3">
          <ButtonAccount />
          <button onClick={() => setOpen((prev) => !prev)} className="p-2">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      {open && (
        <nav className="md:hidden border-t bg-white px-4 py-3 space-y-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block text-sm py-1 hover:text-blue-600"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
