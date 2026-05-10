"use client";

import { Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openRouteInNavigator, type RouteStopForMaps } from "@/lib/navigation/multi-stop-maps";
import { useToast } from "@/hooks/use-toast";

type Props = {
  stops: RouteStopForMaps[];
  className?: string;
  label?: string;
};

export function OpenRouteInNavigatorButton({
  stops,
  className,
  label = "Apri nel Navigatore"
}: Props) {
  const { toast } = useToast();
  const usable = stops.filter(
    (s) =>
      (typeof s.lat === "number" && typeof s.lng === "number") ||
      Boolean((s.address ?? s.label ?? "").trim())
  );

  return (
    <Button
      type="button"
      size="lg"
      className={`min-h-14 w-full touch-manipulation text-base font-semibold sm:w-auto sm:min-h-12 sm:min-w-[min(100%,22rem)] ${className ?? ""}`}
      disabled={usable.length < 2}
      onClick={() => {
        const ok = openRouteInNavigator(usable);
        if (!ok) {
          toast({
            title: "Percorso incompleto",
            description: "Servono almeno due fermate con indirizzo o coordinate.",
            variant: "destructive"
          });
        }
      }}
    >
      <Navigation className="mr-2 h-5 w-5" />
      {label}
    </Button>
  );
}
