"use client";

import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function KeyboardShortcutsDialog() {
  const t = useTranslations();
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
        {t("shortcuts.button")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          </DialogHeader>

          <div className="mt-3 grid gap-3 text-sm">
            <Row k="⌘K" v={t("shortcuts.items.globalSearch")} />
            <Row k="⌘/" v={t("shortcuts.items.openPanel")} />
            <Row k="⌘R" v={t("shortcuts.items.reload")} />
            <Row k="⌘F" v={t("shortcuts.items.browserFind")} />
            <div className="rounded-xl border bg-muted px-4 py-3 text-xs text-muted-foreground">
              {t("shortcuts.ipadTip")}
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

