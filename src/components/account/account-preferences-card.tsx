"use client";

import { useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IconBubble } from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { getReminderDefaultEmail, setReminderDefaultEmail } from "@/lib/reminders/config";
import { getSupportEmailTo, setSupportEmailTo } from "@/lib/support-email/config";
import { useTranslations } from "next-intl";

export function AccountPreferencesCard() {
  const t = useTranslations("account.preferences");
  const { toast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [techName, setTechName] = useState("");
  const [supportEmail, setSupportEmail] = useState<string>(() => getSupportEmailTo());
  const [reminderEmail, setReminderEmail] = useState<string>(() => getReminderDefaultEmail());
  const [officeAddress, setOfficeAddress] = useState("");

  useEffect(() => {
    try {
      setTechName(localStorage.getItem("workflow:techName") ?? "");
      setOfficeAddress(localStorage.getItem("workflow:officeAddress") ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const metaSupport = user.user_metadata?.support_email_to;
      const cloudSupport = typeof metaSupport === "string" ? metaSupport.trim() : "";
      const localSupport = getSupportEmailTo().trim();
      if (cloudSupport && !localSupport) {
        setSupportEmail(cloudSupport);
        setSupportEmailTo(cloudSupport);
      }
      const meta = user.user_metadata?.office_address;
      const fromCloud = typeof meta === "string" ? meta.trim() : "";
      let local = "";
      try {
        local = (localStorage.getItem("workflow:officeAddress") ?? "").trim();
      } catch {
        /* ignore */
      }
      if (fromCloud && !local) {
        setOfficeAddress(fromCloud);
        try {
          localStorage.setItem("workflow:officeAddress", fromCloud);
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const persistOfficeToCloud = async (value: string) => {
    if (!supabase) return;
    const trimmed = value.trim();
    try {
      await supabase.auth.updateUser({
        data: { office_address: trimmed || undefined }
      });
    } catch {
      /* offline or auth error — local copy still works */
    }
  };

  const persistSupportEmailToCloud = async (value: string) => {
    if (!supabase) return;
    const trimmed = value.trim();
    try {
      await supabase.auth.updateUser({
        data: { support_email_to: trimmed || undefined }
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2 p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <IconBubble icon={Settings2} />
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <div className="text-sm font-medium">{t("techNameLabel")}</div>
          <Input
            value={techName}
            onChange={(e) => {
              setTechName(e.target.value);
              localStorage.setItem("workflow:techName", e.target.value);
            }}
            placeholder={t("techNamePlaceholder")}
            className="min-h-12 touch-manipulation text-base"
          />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <div className="text-sm font-medium">{t("supportEmailLabel")}</div>
          <Input
            value={supportEmail}
            onChange={(e) => {
              const v = e.target.value;
              setSupportEmail(v);
              setSupportEmailTo(v);
            }}
            onBlur={() => void persistSupportEmailToCloud(supportEmail)}
            placeholder={t("supportEmailPlaceholder")}
            inputMode="email"
            className="min-h-12 touch-manipulation text-base"
          />
          <div className="text-xs text-muted-foreground">{t("supportEmailHint")}</div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <div className="text-sm font-medium">{t("reminderEmailLabel")}</div>
          <Input
            value={reminderEmail}
            onChange={(e) => {
              const v = e.target.value;
              setReminderEmail(v);
              setReminderDefaultEmail(v);
            }}
            placeholder={t("reminderEmailPlaceholder")}
            inputMode="email"
            className="min-h-12 touch-manipulation text-base"
          />
          <div className="text-xs text-muted-foreground">{t("reminderEmailHint")}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit min-h-11 touch-manipulation"
            onClick={async () => {
              if (typeof Notification === "undefined") return;
              const p = await Notification.requestPermission();
              toast({
                title:
                  p === "granted"
                    ? t("notificationsEnabledTitle")
                    : t("notificationPermissionTitle", { permission: p }),
                description:
                  p === "granted" ? t("notificationsEnabledBody") : t("notificationPermissionBody")
              });
            }}
          >
            {t("requestNotificationPermission")}
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <div className="text-sm font-medium">{t("officeAddressLabel")}</div>
          <Input
            value={officeAddress}
            onChange={(e) => {
              const v = e.target.value;
              setOfficeAddress(v);
              try {
                localStorage.setItem("workflow:officeAddress", v);
              } catch {
                /* ignore */
              }
            }}
            onBlur={() => void persistOfficeToCloud(officeAddress)}
            placeholder={t("officeAddressPlaceholder")}
            className="min-h-12 touch-manipulation text-base"
          />
          <div className="text-xs text-muted-foreground">{t("officeAddressHint")}</div>
        </div>
      </CardHeader>
    </Card>
  );
}
