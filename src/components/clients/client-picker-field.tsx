"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import type { Client } from "@/lib/db/workflow-db";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const MOBILE_MAX_WIDTH_PX = 767;
const MOBILE_MIN_QUERY_CHARS = 2;

type Props = {
  clients: Client[] | undefined;
  clientName: string;
  onClientNameChange: (name: string) => void;
  selectedClientId: string | null;
  onSelectClient: (id: string | null, name: string) => void;
  disabled?: boolean;
  /** Parent surface open state — closes suggestions when false (e.g. dialog closed). */
  active?: boolean;
};

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function ClientPickerField(props: Props) {
  const t = useTranslations();
  const {
    clients,
    clientName,
    onClientNameChange,
    selectedClientId,
    onSelectClient,
    disabled,
    active = true
  } = props;
  const isMobile = useIsMobileViewport();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<number | null>(null);

  const query = clientName.trim();
  const minChars = isMobile ? MOBILE_MIN_QUERY_CHARS : 0;
  const queryMeetsMin = query.length >= minChars;

  const suggestions = useMemo(() => {
    const q = query.toLowerCase();
    const list = clients ?? [];
    if (isMobile) {
      if (!queryMeetsMin) return [];
      if (!q) return [];
      return list
        .filter((c) => {
          const hay = [c.name, c.contactPerson, c.city, c.phone]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
        .slice(0, 40);
    }
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
  }, [clients, query, isMobile, queryMeetsMin]);

  const showDropdown = open && suggestions.length > 0 && (isMobile ? queryMeetsMin : true);

  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
    };
  }, []);

  function clearBlurTimer() {
    if (blurTimerRef.current != null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }

  function scheduleCloseOnBlur() {
    clearBlurTimer();
    blurTimerRef.current = window.setTimeout(() => setOpen(false), 180);
  }

  return (
    <div className="grid min-w-0 gap-2" ref={wrapRef}>
      <Label className="flex items-center gap-2">
        <Icon icon={Users} />
        {t("common.client")}
      </Label>
      <div className="relative min-w-0">
        <Input
          value={clientName}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            onClientNameChange(v);
            onSelectClient(null, v);
            setOpen(true);
          }}
          onFocus={() => {
            clearBlurTimer();
            if (!isMobile) setOpen(true);
          }}
          onBlur={scheduleCloseOnBlur}
          placeholder={t("clientPicker.placeholder")}
          className="min-h-12 w-full min-w-0 max-w-full text-base"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
        {showDropdown ? (
          <ul
            className={cn(
              "absolute z-50 mt-2 max-h-60 w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-xl border-2 bg-background p-1.5 text-sm shadow-xl ring-1 ring-black/5 dark:ring-white/10",
              "animate-in fade-in-0",
              "touch-manipulation md:max-h-72 md:rounded-2xl"
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
                      selected && "border-primary/40 bg-primary/15 text-foreground"
                    )}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      clearBlurTimer();
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
        {isMobile ? t("clientPicker.hintMobile") : t("clientPicker.hint")}
      </p>
    </div>
  );
}
