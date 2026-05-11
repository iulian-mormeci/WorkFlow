"use client";

import { Link } from "@/i18n/navigation";
import { Plus, Scan, Search, StickyNote } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";
import { DocumentScannerDialog } from "@/components/documents/document-scanner-dialog";
import { useState } from "react";
import { IconBubble } from "@/components/ui/icon";
import { useTranslations } from "next-intl";

export function TodaysQuickActions() {
  const t = useTranslations();
  const [newOpen, setNewOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("dashboard.todayQuickActions.title")}</CardTitle>
            <CardDescription>{t("dashboard.todayQuickActions.subtitle")}</CardDescription>
          </div>
          <IconBubble icon={StickyNote} />
        </div>
      </CardHeader>

      <div className="px-5 pb-5 md:px-6 md:pb-6">
        <div className="grid gap-2">
          <Button size="lg" onClick={() => setNewOpen(true)}>
            <Plus className="h-5 w-5" />
            {t("dashboard.todayQuickActions.newIntervention")}
          </Button>
          <Button size="lg" variant="outline" onClick={() => setScanOpen(true)}>
            <Scan className="h-5 w-5" />
            {t("dashboard.todayQuickActions.scanDocument")}
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/documents">
              <Search className="h-5 w-5" />
              {t("dashboard.todayQuickActions.findDocument")}
            </Link>
          </Button>
        </div>
      </div>

      <InterventionFormDialog open={newOpen} onOpenChange={setNewOpen} mode="new" />
      <DocumentScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        defaultTitle={t("documents.scan.defaultTitle", { date: new Date().toLocaleDateString() })}
      />
    </Card>
  );
}

