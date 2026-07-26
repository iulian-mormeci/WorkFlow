"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, LogIn, LogOut, Share2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { useTranslations } from "next-intl";

const LIMIT = 6;

type ActivityRow = {
  id: string;
  type: "member_joined" | "member_left" | "procedure_shared";
  actorId: string | null;
  entityLabel: string | null;
  createdAt: string;
};

export function WidgetCompanyActivity() {
  const t = useTranslations("dashboard.widgets.companyActivity");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [inCompany, setInCompany] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("wf_company_activity_log")
        .select("id, type, actor_id, entity_label, created_at")
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      const list: ActivityRow[] = (data ?? []).map((r) => ({
        id: r.id as string,
        type: r.type as ActivityRow["type"],
        actorId: (r.actor_id as string | null) ?? null,
        entityLabel: (r.entity_label as string | null) ?? null,
        createdAt: r.created_at as string
      }));
      if (cancelled) return;

      if (list.length === 0) {
        // Distinguish "no company" from "company with no activity yet" (RLS
        // returns zero rows either way) using the same membership lookup as Account.
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (user) {
          const { data: membership } = await supabase
            .from("wf_company_members")
            .select("company_id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cancelled) setInCompany(Boolean(membership));
        }
      }

      setRows(list);

      const actorIds = [...new Set(list.map((r) => r.actorId).filter(Boolean))] as string[];
      if (actorIds.length) {
        const { data: profiles } = await supabase
          .from("wf_profiles")
          .select("id, first_name, last_name")
          .in("id", actorIds);
        const map = new Map<string, string>();
        for (const p of profiles ?? []) {
          const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
          if (name) map.set(p.id as string, name);
        }
        if (!cancelled) setNames(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const describeRow = (row: ActivityRow) => {
    const who = (row.actorId && names.get(row.actorId)) || t("someone");
    if (row.type === "member_joined") return t("memberJoined", { who });
    if (row.type === "member_left") return t("memberLeft", { who });
    return t("procedureShared", { who, title: row.entityLabel ?? "" });
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <IconBubble icon={Building2} />
        </div>
      </CardHeader>
      <div className="px-2 pb-2">
        <div className="divide-y overflow-hidden rounded-xl border">
          {(rows ?? []).map((row) => (
            <div key={row.id} className="flex items-center gap-2.5 px-4 py-3">
              {row.type === "member_joined" ? (
                <LogIn className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : row.type === "member_left" ? (
                <LogOut className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <Share2 className="h-4 w-4 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm">{describeRow(row)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                </div>
              </div>
            </div>
          ))}

          {rows !== null && rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {inCompany ? t("empty") : t("noCompany")}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
