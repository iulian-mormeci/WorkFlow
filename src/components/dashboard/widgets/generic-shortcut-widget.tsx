import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBubble } from "@/components/ui/icon";

/** A single big "go to X" card — for pages that don't have a natural "recent items" list. */
export function GenericShortcutWidget({
  title,
  subtitle,
  icon,
  href,
  ctaLabel
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  href: string;
  ctaLabel: string;
}) {
  return (
    <Card className="rounded-2xl">
      <Link href={href} className="block focus-visible:outline-none">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{subtitle}</CardDescription>
            </div>
            <IconBubble icon={icon} />
          </div>
          <div className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary">
            {ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </div>
        </CardHeader>
      </Link>
    </Card>
  );
}
