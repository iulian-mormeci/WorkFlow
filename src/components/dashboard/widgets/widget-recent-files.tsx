"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, FolderOpen } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { ViewAllLink } from "@/components/dashboard/clickable-card";
import { useTranslations } from "next-intl";

const LIMIT = 5;

type RecentFile = {
  id: string;
  name: string;
  mime: string | null;
  createdAt: string;
};

export function WidgetRecentFiles() {
  const t = useTranslations("dashboard.widgets.recentFiles");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [files, setFiles] = useState<RecentFile[] | null>(null);

  useEffect(() => {
    if (!supabase) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setFiles([]);
        return;
      }
      const { data } = await supabase
        .from("wf_shared_files")
        .select("id, name, mime, created_at")
        .eq("owner_id", user.id)
        .eq("is_folder", false)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (!cancelled) {
        setFiles(
          (data ?? []).map((r) => ({
            id: r.id as string,
            name: r.name as string,
            mime: (r.mime as string | null) ?? null,
            createdAt: r.created_at as string
          }))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ViewAllLink href="/files" label={t("viewAll")} />
            <IconBubble icon={FolderOpen} />
          </div>
        </div>
      </CardHeader>
      <div className="px-2 pb-2">
        <div className="divide-y overflow-hidden rounded-xl border">
          {(files ?? []).map((f) => (
            <div key={f.id} className="flex items-center gap-2.5 px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{f.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(f.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                </div>
              </div>
            </div>
          ))}

          {files !== null && files.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("empty")}</div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
