"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { db } from "@/lib/db/workflow-db";
import { getSiteUrl } from "@/lib/supabase/site-url";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

export function SidebarSignOut() {
  const [open, setOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto px-0 text-sm font-normal underline"
        onClick={() => setOpen(true)}
      >
        Sign out
      </Button>

      <Dialog open={open} onOpenChange={(v) => !wiping && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Sign out
            </DialogTitle>
            <DialogDescription className="text-left">
              Your account session will end. Choose what happens to offline data stored in this
              browser (IndexedDB).
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              variant="default"
              className="w-full"
              disabled={wiping}
              onClick={() => {
                setOpen(false);
                window.location.href = `${getSiteUrl()}/auth/logout`;
              }}
            >
              Keep offline data & sign out
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={wiping}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Delete ALL local WorkFlow data on this device, then sign out? This cannot be undone."
                  )
                ) {
                  return;
                }
                setWiping(true);
                try {
                  await db.delete();
                } finally {
                  window.location.href = `${getSiteUrl()}/auth/logout`;
                }
              }}
            >
              {wiping ? "Wiping…" : "Wipe local data & sign out"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" disabled={wiping} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
