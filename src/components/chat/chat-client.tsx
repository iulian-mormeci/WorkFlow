"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { Send, MessageCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── types ────────────────────────────────────────────────────── */

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  content: string;
  procedure_id: string | null;
  read_at: string | null;
  created_at: string;
};

type Thread = {
  partnerId: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
};

/* ─── helpers ──────────────────────────────────────────────────── */

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

/* ─── component ────────────────────────────────────────────────── */

export function ChatClient({ initialPartnerId }: { initialPartnerId?: string }) {
  const t = useTranslations();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const isAdmin = isGlobalProcedureAdmin(user);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    initialPartnerId ?? null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  /* ─── load threads ─────────────────────────────────────────── */

  const loadThreads = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!user || !supabase) return;
    setThreadsLoading(true);

    const query = supabase
      .from("wf_messages")
      .select("id, sender_id, receiver_id, content, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (!isAdmin) {
      query.or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
    }

    const { data } = await query;

    if (data) {
      const threadMap = new Map<string, Thread>();
      for (const msg of data as Message[]) {
        const partnerId =
          msg.sender_id === user.id
            ? (msg.receiver_id ?? "admin-channel")
            : msg.sender_id;
        if (partnerId === user.id) continue;

        const existing = threadMap.get(partnerId);
        const isNewer = !existing || new Date(msg.created_at) > new Date(existing.lastAt);
        const addUnread = !msg.read_at && msg.receiver_id === user.id ? 1 : 0;

        if (isNewer) {
          threadMap.set(partnerId, {
            partnerId,
            lastMessage: msg.content.slice(0, 80),
            lastAt: msg.created_at,
            unread: (existing?.unread ?? 0) + addUnread
          });
        } else if (addUnread && existing) {
          existing.unread += addUnread;
        }
      }

      setThreads(
        Array.from(threadMap.values()).sort(
          (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
        )
      );
    }
    setThreadsLoading(false);
  }, [user, isAdmin]);

  /* ─── load conversation ────────────────────────────────────── */

  const loadMessages = useCallback(async (partnerId: string) => {
    const supabase = createSupabaseBrowserClient();
    if (!user || !supabase) return;
    setMessagesLoading(true);

    let query;
    if (partnerId === "admin-channel") {
      // Non-admin user talking to admin: receiver_id is null for admin channel
      query = supabase
        .from("wf_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.is.null),and(receiver_id.eq.${user.id},sender_id.neq.${user.id})`
        )
        .order("created_at", { ascending: true });
    } else {
      query = supabase
        .from("wf_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: t("chat.loadFailed"), description: error.message, variant: "destructive" });
    } else {
      setMessages((data as Message[]) ?? []);
      const unreadIds = ((data ?? []) as Message[])
        .filter((m) => !m.read_at && m.receiver_id === user.id)
        .map((m) => m.id);
      if (unreadIds.length) {
        await supabase
          .from("wf_messages")
          .update({ read_at: new Date().toISOString() })
          .in("id", unreadIds);
      }
    }
    setMessagesLoading(false);
  }, [user, t, toast]);

  /* ─── realtime subscription ────────────────────────────────── */

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!user || !supabase) return;
    void loadThreads();

    const channel = supabase
      .channel(`chat-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wf_messages" },
        (payload) => {
          const msg = payload.new as Message;
          const isForMe =
            msg.receiver_id === user.id ||
            (isAdmin && msg.sender_id !== user.id) ||
            (!isAdmin && msg.receiver_id === null && msg.sender_id === user.id);

          if (!isForMe && msg.sender_id !== user.id) return;

          const partnerId =
            msg.sender_id === user.id
              ? (msg.receiver_id ?? "admin-channel")
              : msg.sender_id;

          if (partnerId === selectedPartnerId) {
            setMessages((prev) => [...prev, msg]);
            if (msg.receiver_id === user.id) {
              void supabase
                .from("wf_messages")
                .update({ read_at: new Date().toISOString() })
                .eq("id", msg.id);
            }
          }
          void loadThreads();
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user, isAdmin, selectedPartnerId, loadThreads]);

  useEffect(() => {
    if (selectedPartnerId) void loadMessages(selectedPartnerId);
  }, [selectedPartnerId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ─── send ─────────────────────────────────────────────────── */

  async function handleSend() {
    const supabase = createSupabaseBrowserClient();
    if (!text.trim() || !user || sending || !supabase) return;
    // Admin sends to selected partner; non-admin sends to null (admin channel)
    const receiverId = isAdmin ? selectedPartnerId : null;
    setSending(true);
    const { error } = await supabase.from("wf_messages").insert({
      sender_id: user.id,
      receiver_id: receiverId,
      content: text.trim()
    });
    if (error) {
      toast({ title: t("chat.sendFailed"), description: error.message, variant: "destructive" });
    } else {
      setText("");
      textRef.current?.focus();
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  /* ─── partner display name ─────────────────────────────────── */

  function partnerLabel(partnerId: string) {
    if (partnerId === "admin-channel") return t("chat.adminLabel");
    return partnerId.slice(0, 8) + "…";
  }

  /* ─── render ─────────────────────────────────────────────────── */

  const showThreadList = isAdmin;
  const showConversation = selectedPartnerId !== null;
  const showNewChatBtn = !isAdmin && !selectedPartnerId;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border">
      {/* Thread list — always visible for admin; hidden for users */}
      {showThreadList && (
        <div
          className={cn(
            "flex flex-col border-r",
            showConversation ? "hidden sm:flex sm:w-64 lg:w-72" : "flex w-full sm:w-64 lg:w-72"
          )}
        >
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="text-sm font-semibold">{t("chat.allConversations")}</span>
            <Button size="sm" variant="ghost" onClick={loadThreads} disabled={threadsLoading}>
              <RefreshCw className={cn("h-3.5 w-3.5", threadsLoading && "animate-spin")} />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.length === 0 && !threadsLoading && (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {t("chat.noConversations")}
              </p>
            )}
            {threads.map((th) => (
              <button
                key={th.partnerId}
                className={cn(
                  "w-full border-b px-3 py-3 text-left transition hover:bg-muted/50",
                  selectedPartnerId === th.partnerId && "bg-muted"
                )}
                onClick={() => setSelectedPartnerId(th.partnerId)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {partnerLabel(th.partnerId)}
                  </span>
                  {th.unread > 0 && (
                    <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {th.unread}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="truncate">{th.lastMessage}</span>
                  <span className="shrink-0">· {fmtDate(th.lastAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation / empty state */}
      <div className={cn("flex min-w-0 flex-1 flex-col", showThreadList && !showConversation && "hidden sm:flex")}>
        {/* No conversation selected */}
        {!showConversation && !showNewChatBtn && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("chat.noConversations")}</p>
          </div>
        )}

        {/* Non-admin start button */}
        {showNewChatBtn && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("chat.noConversations")}</p>
            <Button onClick={() => setSelectedPartnerId("admin-channel")} className="gap-2">
              <MessageCircle className="h-4 w-4" />
              {t("chat.startChatWithAdmin")}
            </Button>
          </div>
        )}

        {/* Open conversation */}
        {showConversation && (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-3 py-2.5">
              {isAdmin && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 sm:hidden"
                  onClick={() => setSelectedPartnerId(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {!isAdmin && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setSelectedPartnerId(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <span className="truncate text-sm font-semibold">
                {t("chat.conversationWith", { name: partnerLabel(selectedPartnerId) })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto shrink-0"
                onClick={() => loadMessages(selectedPartnerId)}
                disabled={messagesLoading}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", messagesLoading && "animate-spin")} />
              </Button>
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 overflow-y-auto space-y-3 p-3">
              {messages.length === 0 && !messagesLoading && (
                <p className="text-center text-sm text-muted-foreground">
                  {t("chat.noMessages")}
                </p>
              )}
              {messages.map((msg) => {
                const isMine = msg.sender_id === user?.id;
                return (
                  <div
                    key={msg.id}
                    className={cn("flex flex-col", isMine ? "items-end" : "items-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                        isMine
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm bg-muted"
                      )}
                    >
                      {msg.content}
                    </div>
                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                      {fmtTime(msg.created_at)}
                    </span>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 border-t p-3">
              <Textarea
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("chat.messagePlaceholder")}
                rows={1}
                className="min-h-10 resize-none"
                disabled={sending}
              />
              <Button
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={handleSend}
                disabled={!text.trim() || sending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
