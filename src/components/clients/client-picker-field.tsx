"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import type { Client } from "@/lib/db/workflow-db";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type Props = {
  clients: Client[] | undefined;
  clientName: string;
  onClientNameChange: (name: string) => void;
  selectedClientId: string | null;
  onSelectClient: (id: string | null, name: string) => void;
  disabled?: boolean;
};

export function ClientPickerField(props: Props) {
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
        Client
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
          placeholder="Search or type a name"
          className="min-h-12 text-base"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {open && suggestions.length > 0 ? (
          <ul
            className={cn(
              "absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-xl border bg-popover p-1 text-sm shadow-md",
              "touch-manipulation"
            )}
            role="listbox"
          >
            {suggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedClientId === c.id}
                  className={cn(
                    "flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition hover:bg-muted",
                    selectedClientId === c.id && "bg-muted"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectClient(c.id, c.name);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{c.name}</span>
                  {(c.city || c.phone) && (
                    <span className="text-xs text-muted-foreground">
                      {[c.city, c.phone].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Pick a saved client or type a new name — it will be created when you save.
      </p>
    </div>
  );
}
