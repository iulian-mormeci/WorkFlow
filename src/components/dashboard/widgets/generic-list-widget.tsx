import type { LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";
import { ViewAllLink } from "@/components/dashboard/clickable-card";

export type GenericListItem = {
  id: string;
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  href?: string;
};

/**
 * Shared "small card with a compact list of recent things" shell used by most
 * dashboard widgets, so each widget file only has to supply data + labels.
 */
export function GenericListWidget({
  title,
  subtitle,
  icon,
  viewAllHref,
  viewAllLabel,
  items,
  emptyLabel,
  loading
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  viewAllHref?: string;
  viewAllLabel?: string;
  items: GenericListItem[];
  emptyLabel: string;
  loading?: boolean;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{subtitle}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {viewAllHref && viewAllLabel ? <ViewAllLink href={viewAllHref} label={viewAllLabel} /> : null}
            <IconBubble icon={icon} />
          </div>
        </div>
      </CardHeader>
      <div className="px-2 pb-2">
        <div className="divide-y overflow-hidden rounded-xl border">
          {items.map((item) => {
            const Icon = item.icon;
            const content = (
              <div className="flex items-center gap-2.5 px-4 py-3">
                {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{item.title}</div>
                  {item.subtitle ? (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{item.subtitle}</div>
                  ) : null}
                </div>
              </div>
            );
            return item.href ? (
              <Link key={item.id} href={item.href} className="block hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                {content}
              </Link>
            ) : (
              <div key={item.id}>{content}</div>
            );
          })}

          {!loading && items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
