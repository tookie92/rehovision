"use client";

import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="relative z-20 flex items-center justify-between px-6 py-5 md:px-10">
      <Link
        href="/"
        className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-foreground"
      >
        Rehovision
      </Link>
      <nav className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/pricing"
          className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
        >
          Tarifs
        </Link>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">
              Connexion
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm">Commencer</Button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/dashboard"
            className="rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <UserButton />
        </Show>
      </nav>
    </header>
  );
}
