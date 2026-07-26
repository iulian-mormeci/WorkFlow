"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarClock, Cloud, Database, Monitor, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { AccountProfileCard } from "@/components/account/account-profile-card";
import { AccountCompanyCard } from "@/components/account/account-company-card";
import { AccountPreferencesCard } from "@/components/account/account-preferences-card";
import { SettingsSecurityCard } from "@/components/settings/settings-security-card";
import { WorkingHoursCard } from "@/components/settings/working-hours-card";
import { CalendarSettingsCard } from "@/components/settings/calendar-settings-card";
import { SettingsSyncCard } from "@/components/settings/settings-sync-card";
import { SettingsAppearanceCard } from "@/components/settings/settings-appearance-card";
import { SettingsDataCard } from "@/components/settings/settings-data-card";

type SectionId = "account" | "security" | "workingHours" | "calendar" | "sync" | "appearance" | "data";

const SECTIONS: { id: SectionId; icon: LucideIcon }[] = [
  { id: "account", icon: UserRound },
  { id: "security", icon: ShieldCheck },
  { id: "workingHours", icon: CalendarClock },
  { id: "calendar", icon: CalendarClock },
  { id: "sync", icon: Cloud },
  { id: "appearance", icon: Monitor },
  { id: "data", icon: Database }
];

export function AccountShell() {
  const t = useTranslations("account.nav");
  const [active, setActive] = useState<SectionId>("account");

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_1fr] lg:items-start">
      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0">
        {SECTIONS.map((section) => {
          const isActive = active === section.id;
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActive(section.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(section.id)}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 space-y-3 md:space-y-4">
        {active === "account" && (
          <div className="grid gap-3 md:gap-4">
            <AccountProfileCard />
            <AccountCompanyCard />
            <AccountPreferencesCard />
          </div>
        )}
        {active === "security" && <SettingsSecurityCard />}
        {active === "workingHours" && <WorkingHoursCard />}
        {active === "calendar" && <CalendarSettingsCard />}
        {active === "sync" && <SettingsSyncCard />}
        {active === "appearance" && <SettingsAppearanceCard />}
        {active === "data" && <SettingsDataCard />}
      </div>
    </div>
  );
}
