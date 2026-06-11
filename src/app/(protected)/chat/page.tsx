import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { ChatClient } from "@/components/chat/chat-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ChatPage() {
  const locale = await getLocale();
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-4 md:h-[calc(100dvh-7rem)]">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("chat.page.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("chat.page.subtitle")}</p>
      </div>
      <ChatClient />
    </div>
  );
}
