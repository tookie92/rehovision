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
        className="font-display text-2xl tracking-tight text-foreground"
      >
        Rehovision
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2">
        <Show when="signed-in">
          <Link
            href="/dashboard"
            className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Atelier
          </Link>
          <UserButton />
        </Show>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm" className="cursor-pointer">
              Connexion
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm" className="cursor-pointer">
              Commencer
            </Button>
          </SignUpButton>
        </Show>
      </nav>
    </header>
  );
}
