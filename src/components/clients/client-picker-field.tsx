"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import type { Client } from "@/lib/db/workflow-db";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Props = {
  clients: Client[] | undefined;
  clientName: string;
  onClientNameChange: (name: string) => void;
  selectedClientId: string | null;
  onSelectClient: (id: string | null, name: string) => void;
  disabled?: boolean;
};

export function ClientPickerField(props: Props) {
  const t = useTranslations();
  const {
    clients,
    clientName,
    onClientNameChange,
    selectedClientId,
    onSelectClient,
    disabled
  } = props;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = clientName.trim().toLowerCase();
    const list = clients ?? [];
    if (!q) return list.slice(0, 40);
    return list
      .filter((c) => {
        const hay = [c.name, c.contactPerson, c.city, c.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [clients, clientName]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  return (
    <div className="grid gap-2" ref={wrapRef}>
      <Label className="flex items-center gap-2">
        <Icon icon={Users} />
        {t("common.client")}
      </Label>
      <div className="relative">
        <Input
          value={clientName}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            onClientNameChange(v);
            onSelectClient(null, v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("clientPicker.placeholder")}
          className="min-h-12 text-base"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {open && suggestions.length > 0 ? (
          <ul
            className={cn(
              "absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-2xl border-2 bg-background p-1.5 text-sm shadow-xl ring-1 ring-black/5 dark:ring-white/10",
              "animate-in fade-in-0",
              "touch-manipulation"
            )}
            role="listbox"
            aria-label={t("clientPicker.suggestionsAriaLabel")}
          >
            <li
              aria-hidden
              className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {t("clientPicker.suggestionsTitle", { count: suggestions.length })}
            </li>
            {suggestions.map((c) => {
              const selected = selectedClientId === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "group flex w-full min-h-12 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition",
                      "hover:border-primary/30 hover:bg-primary/10",
                      "focus-visible:border-primary/40 focus-visible:bg-primary/10",
                      "active:scale-[0.99]",
                      selected &&
                        "border-primary/40 bg-primary/15 text-foreground"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelectClient(c.id, c.name);
                      setOpen(false);
                    }}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground/80 group-hover:bg-primary/20 group-hover:text-primary"
                      )}
                    >
                      {c.name.trim().charAt(0) || "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {c.name}
                      </span>
                      {(c.city || c.phone) && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {[c.city, c.phone].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("clientPicker.hint")}
      </p>
    </div>
  );
}
