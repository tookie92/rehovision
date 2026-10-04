"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { PanelLeft } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

const SIDEBAR_WIDTH = "16.5rem";
const SIDEBAR_WIDTH_ICON = "4rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";

type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

function useIsMobile(breakpoint = 1024) {
  const [mobile, setMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return mobile;
}

export function SidebarProvider({
  children,
  defaultOpen = true,
  className,
  style,
  ...props
}: React.ComponentProps<"div"> & { defaultOpen?: boolean }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((v) => !v);
    else setOpen((v) => !v);
  }, [isMobile]);

  const state: "expanded" | "collapsed" = open ? "expanded" : "collapsed";

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      state,
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
    }),
    [state, open, openMobile, isMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-wrapper"
        data-state={state}
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-dvh w-full bg-[var(--bg)]",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"aside">) {
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar();

  if (isMobile) {
    return (
      <>
        {openMobile && (
          <button
            type="button"
            aria-label="Fermer le menu"
            className="fixed inset-0 z-40 bg-[var(--ink)]/30 transition-opacity duration-200"
            onClick={() => setOpenMobile(false)}
          />
        )}
        <aside
          data-slot="sidebar"
          data-mobile="true"
          data-state="expanded"
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex h-dvh w-[var(--sidebar-width-mobile)] flex-col border-r border-[var(--line)] bg-[var(--bg-elevated)] shadow-[var(--shadow)] transition-transform duration-200 ease-out",
            openMobile ? "translate-x-0" : "-translate-x-full",
            className,
          )}
          {...props}
        >
          {children}
        </aside>
      </>
    );
  }

  return (
    <aside
      data-slot="sidebar"
      data-state={state}
      data-collapsible={state === "collapsed" ? "icon" : ""}
      className={cn(
        "group peer sticky top-0 z-20 hidden h-dvh shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-elevated)] transition-[width] duration-200 ease-out lg:flex",
        "w-[var(--sidebar-width)] data-[state=collapsed]:w-[var(--sidebar-width-icon)]",
        className,
      )}
      {...props}
    >
      <div className="flex h-full w-full flex-col overflow-hidden">{children}</div>
    </aside>
  );
}

export function SidebarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar, state, isMobile } = useSidebar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("min-h-11 min-w-11 px-0", className)}
      onClick={toggleSidebar}
      aria-label={
        isMobile
          ? "Ouvrir ou fermer la barre latérale"
          : state === "expanded"
            ? "Réduire la barre latérale"
            : "Agrandir la barre latérale"
      }
      aria-expanded={isMobile ? undefined : state === "expanded"}
      {...props}
    >
      <PanelLeft className="size-4" aria-hidden />
    </Button>
  );
}

export function SidebarInset({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex min-h-dvh min-w-0 flex-1 flex-col bg-[var(--bg)]",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn(
        "flex flex-col gap-1 border-b border-[var(--line)] px-4 py-4 group-data-[state=collapsed]:items-center group-data-[state=collapsed]:px-2",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 group-data-[state=collapsed]:px-2",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn(
        "mt-auto border-t border-[var(--line)] px-3 py-3 group-data-[state=collapsed]:px-2",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-opacity duration-200 group-data-[state=collapsed]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn("list-none", className)}
      {...props}
    />
  );
}

export function SidebarMenuButton({
  className,
  asChild = false,
  isActive = false,
  tooltip,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
}) {
  const Comp = asChild ? Slot : "button";
  const { state, isMobile } = useSidebar();
  const showTooltip = !isMobile && state === "collapsed" && tooltip;

  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      title={showTooltip ? tooltip : undefined}
      aria-label={showTooltip ? tooltip : props["aria-label"]}
      className={cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium transition-[colors,padding] duration-200",
        "group-data-[state=collapsed]:justify-center group-data-[state=collapsed]:gap-0 group-data-[state=collapsed]:px-0",
        isActive
          ? "bg-[var(--ink)] font-semibold text-white"
          : "text-[var(--muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink)]",
        className,
      )}
      {...props}
    />
  );
}
