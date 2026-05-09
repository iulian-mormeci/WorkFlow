"use client";

import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isCmdSlash = (e.metaKey || e.ctrlKey) && key === "/";
      if (isCmdSlash) {
        e.preventDefault();
        setOpen(true);
      }
      if (open && e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} type="button">
        <Keyboard className="h-4 w-4" />
        Shortcuts
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>

          <div className="mt-3 grid gap-3 text-sm">
            <Row k="⌘K" v="Global search" />
            <Row k="⌘/" v="Open this panel" />
            <Row k="⌘R" v="Reload" />
            <Row k="⌘F" v="Browser find on page" />
            <div className="rounded-xl border bg-muted px-4 py-3 text-xs text-muted-foreground">
              Tip: on iPad, an external keyboard makes field work much faster.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3">
      <div className="font-mono text-sm">{k}</div>
      <div className="text-muted-foreground">{v}</div>
    </div>
  );
}

