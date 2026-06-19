"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import {
  shareFileWithEmail,
  unshareFile,
  listFileShares,
  type FileShare,
  type SharedFile
} from "@/lib/files/shared-files";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

type Props = {
  file: SharedFile;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function ShareFileDialog({ file, open, onOpenChange }: Props) {
  const t = useTranslations("files");
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [shares, setShares] = useState<FileShare[]>([]);
  const [sharing, setSharing] = useState(false);
  const [loadingShares, setLoadingShares] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPermission("view");
    setLoadingShares(true);
    listFileShares(file.id)
      .then(setShares)
      .finally(() => setLoadingShares(false));
  }, [open, file.id]);

  async function handleShare() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setSharing(true);
    try {
      const result = await shareFileWithEmail(file.id, trimmed, permission);
      if (!result.ok) {
        const msgKey = result.error === "user_not_found"
          ? "share.errors.userNotFound"
          : result.error === "cannot_share_with_self"
          ? "share.errors.cannotShareWithSelf"
          : "share.errors.generic";
        toast({ title: t(msgKey), variant: "destructive" });
        return;
      }
      toast({ title: t("share.toasts.sharedTitle"), description: trimmed });
      setEmail("");
      const updated = await listFileShares(file.id);
      setShares(updated);
    } finally {
      setSharing(false);
    }
  }

  async function handleUnshare(share: FileShare) {
    await unshareFile(share.id, file.id);
    setShares((s) => s.filter((x) => x.id !== share.id));
    toast({ title: t("share.toasts.unsharedTitle") });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("share.title")}</DialogTitle>
          <DialogDescription className="truncate">{file.name}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Add share */}
          <div className="grid gap-2">
            <Label>{t("share.emailLabel")}</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("share.emailPlaceholder")}
                onKeyDown={(e) => { if (e.key === "Enter") void handleShare(); }}
                className="min-h-11"
              />
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as "view" | "edit")}
                className="h-11 rounded-xl border bg-background px-2 text-sm"
              >
                <option value="view">{t("share.permView")}</option>
                <option value="edit">{t("share.permEdit")}</option>
              </select>
            </div>
            <Button
              type="button"
              disabled={!email.trim() || sharing}
              className="min-h-11 gap-1.5"
              onClick={() => void handleShare()}
            >
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {t("share.addButton")}
            </Button>
          </div>

          {/* Existing shares */}
          {loadingShares ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : shares.length > 0 ? (
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">{t("share.currentShares")}</Label>
              <ul className="divide-y rounded-xl border">
                {shares.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.sharedWith}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.permission === "edit" ? t("share.permEdit") : t("share.permView")}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => void handleUnshare(s)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("share.noShares")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
