"use client";

import { Link } from "@/i18n/navigation";
import { ClipboardList, Package, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function DashboardQuickActions() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">{t("dashboard.quickActions.title")}</CardTitle>
        <CardDescription>{t("dashboard.quickActions.subtitle")}</CardDescription>
      </CardHeader>

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <div className="grid gap-2">
          <Button size="lg" onClick={() => setOpen(true)}>
            <Plus className="h-5 w-5" />
            {t("dashboard.quickActions.newIntervention")}
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/interventions">
              <ClipboardList className="h-5 w-5" />
              {t("dashboard.quickActions.viewInterventions")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/spare-parts">
              <Package className="h-5 w-5" />
              {t("dashboard.quickActions.manageSpareParts")}
            </Link>
          </Button>
        </div>
      </div>

      <InterventionFormDialog open={open} onOpenChange={setOpen} mode="new" />
    </Card>
  );
}

