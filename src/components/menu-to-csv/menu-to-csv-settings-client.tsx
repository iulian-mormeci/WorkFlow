"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth";
import { getUserPreferences, saveUserPreferences } from "@/lib/user-settings/user-preferences";

const DEFAULTS = {
  pluStart: 1,
  duplicateDesc: false,
  separator: ";",
  encoding: "utf8bom" as "utf8bom" | "utf8"
};

export function MenuToCsvSettingsClient() {
  const t = useTranslations("menuToCsv.settings");
  const user = useAuthStore((s) => s.user);

  const [pluStart, setPluStart] = useState(DEFAULTS.pluStart);
  const [duplicateDesc, setDuplicateDesc] = useState(DEFAULTS.duplicateDesc);
  const [separator, setSeparator] = useState(DEFAULTS.separator);
  const [encoding, setEncoding] = useState<"utf8bom" | "utf8">(DEFAULTS.encoding);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    getUserPreferences(user.id).then((prefs) => {
      if (typeof prefs.menuToCsvPluStart === "number") setPluStart(prefs.menuToCsvPluStart);
      if (prefs.menuToCsvDuplicateDesc !== undefined) setDuplicateDesc(prefs.menuToCsvDuplicateDesc);
      if (typeof prefs.menuToCsvSeparator === "string") setSeparator(prefs.menuToCsvSeparator);
      if (prefs.menuToCsvEncoding) setEncoding(prefs.menuToCsvEncoding);
      setLoading(false);
    });
  }, [user?.id]);

  async function handleSave() {
    if (!user?.id) return;
    await saveUserPreferences(user.id, {
      menuToCsvPluStart: pluStart,
      menuToCsvDuplicateDesc: duplicateDesc,
      menuToCsvSeparator: separator,
      menuToCsvEncoding: encoding
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Caricamento…</div>;
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* PLU di partenza */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="pluStart">
          {t("pluStart")}
        </label>
        <p className="text-xs text-muted-foreground">{t("pluStartHint")}</p>
        <input
          id="pluStart"
          type="number"
          min={1}
          value={pluStart}
          onChange={(e) => setPluStart(Math.max(1, parseInt(e.target.value) || 1))}
          className="flex h-9 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Duplica descrizione */}
      <div className="flex items-start gap-3">
        <input
          id="duplicateDesc"
          type="checkbox"
          checked={duplicateDesc}
          onChange={(e) => setDuplicateDesc(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
        />
        <div>
          <label className="text-sm font-medium cursor-pointer" htmlFor="duplicateDesc">
            {t("duplicateDesc")}
          </label>
          <p className="text-xs text-muted-foreground">{t("duplicateDescHint")}</p>
        </div>
      </div>

      {/* Separatore CSV */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="separator">
          {t("separator")}
        </label>
        <p className="text-xs text-muted-foreground">{t("separatorHint")}</p>
        <input
          id="separator"
          type="text"
          maxLength={3}
          value={separator}
          onChange={(e) => setSeparator(e.target.value || ";")}
          className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Encoding */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("encoding")}</p>
        <div className="space-y-1.5">
          {(["utf8bom", "utf8"] as const).map((enc) => (
            <label key={enc} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="encoding"
                value={enc}
                checked={encoding === enc}
                onChange={() => setEncoding(enc)}
                className="h-4 w-4 accent-primary"
              />
              {enc === "utf8bom" ? t("encodingUtf8bom") : t("encodingUtf8")}
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {saved ? t("saved") : t("save")}
      </button>
    </div>
  );
}
