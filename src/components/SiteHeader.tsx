"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const pathname = usePathname();
  const inAtelier = pathname.startsWith("/dashboard");

  return (
    <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 md:px-6 lg:px-8">
        <Link
          href={inAtelier ? "/dashboard" : "/"}
          className="font-display text-xl tracking-tight text-foreground"
        >
          Rehovision
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className={
                inAtelier
                  ? "rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-foreground"
                  : "rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              }
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
      </div>
    </header>
  );
}
