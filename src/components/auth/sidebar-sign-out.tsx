"use client";

import { useState } from "react";
import { LogOut, AlertTriangle, Loader2 } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";

type Step = "confirm" | "wipe-confirm";

export function SidebarSignOut() {
  const t = useTranslations("signOut");

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("confirm");
  const [wiping, setWiping] = useState(false);

  function handleOpen() {
    setStep("confirm");
    setOpen(true);
  }

  function handleClose() {
    if (wiping) return;
    setOpen(false);
  }

  function handleKeep() {
    window.location.href = "/auth/logout";
  }

  function handleWipeRequest() {
    setStep("wipe-confirm");
  }

  async function handleWipeConfirm() {
    setWiping(true);
    try {
      await db.delete();
    } finally {
      window.location.href = "/auth/logout";
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto gap-1.5 px-0 text-sm font-normal text-muted-foreground hover:text-foreground"
        onClick={handleOpen}
      >
        <LogOut className="h-3.5 w-3.5" />
        {t("button")}
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-sm">
          {step === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <LogOut className="h-4 w-4 shrink-0" />
                  {t("title")}
                </DialogTitle>
                <DialogDescription>{t("subtitle")}</DialogDescription>
              </DialogHeader>
              <div className="mt-2 flex flex-col gap-2">
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleKeep}
                >
                  {t("keep")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                  onClick={handleWipeRequest}
                >
                  {t("wipe")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={handleClose}
                >
                  {t("cancel")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {t("wipeConfirmTitle")}
                </DialogTitle>
                <DialogDescription>{t("wipeConfirmSubtitle")}</DialogDescription>
              </DialogHeader>
              <div className="mt-2 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full gap-2"
                  disabled={wiping}
                  onClick={handleWipeConfirm}
                >
                  {wiping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  {wiping ? t("wiping") : t("wipeConfirmCta")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={wiping}
                  onClick={() => setStep("confirm")}
                >
                  {t("cancel")}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
