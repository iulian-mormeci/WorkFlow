"use client";

import Link from "next/link";
import { ClipboardList, Package, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InterventionFormDialog } from "@/components/interventions/intervention-form-dialog";
import { useState } from "react";

export function DashboardQuickActions() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">Quick actions</CardTitle>
        <CardDescription>Fast entry optimized for field work.</CardDescription>
      </CardHeader>

      <div className="px-5 pb-5">
        <div className="grid gap-2">
          <Button size="lg" onClick={() => setOpen(true)}>
            <Plus className="h-5 w-5" />
            New intervention
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/interventions">
              <ClipboardList className="h-5 w-5" />
              View interventions
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/spare-parts">
              <Package className="h-5 w-5" />
              Manage spare parts
            </Link>
          </Button>
        </div>
      </div>

      <InterventionFormDialog open={open} onOpenChange={setOpen} mode="new" />
    </Card>
  );
}

