"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isGlobalProcedureAdmin } from "@/lib/procedures/global-procedure-admin";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { Send, MessageCircle, ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── constants ────────────────────────────────────────────────── */

const MAX_MSG_LENGTH = 2000;

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

type UserEmail = { id: string; email: string | null };

/* ─── helpers ──────────────────────────────────────────────────── */

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return fmtTime(iso);
  if (d.toDateString() === yesterday.toDateString()) return "Ieri";
  return d.toLocaleDateString();
}

/* ─── component ────────────────────────────────────────────────── */

export function ChatClient({ initialPartnerId }: { initialPartnerId?: string }) {
  const t = useTranslations();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const isAdmin = isGlobalProcedureAdmin(user);

  // Single memoised Supabase client for the component lifetime.
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    initialPartnerId ?? null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Keep a ref so Realtime callback always sees the current value
  // without rebuilding the subscription every time the user clicks a conversation.
  const selectedPartnerIdRef = useRef<string | null>(selectedPartnerId);
  useEffect(() => {
    selectedPartnerIdRef.current = selectedPartnerId;
  }, [selectedPartnerId]);

  // Map of userId → email for admin partner labels.
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  /* ─── load threads ─────────────────────────────────────────── */

  const loadThreads = useCallback(async () => {
    if (!user || !supabase) return;
    setThreadsLoading(true);

    // For admin: also fetch user emails to label conversations.
    if (isAdmin) {
      const { data: userList } = await supabase.rpc("workflow_admin_list_users");
      if (userList) {
        const map: Record<string, string> = {};
        for (const u of userList as UserEmail[]) {
          if (u.email) map[u.id] = u.email;
        }
        setUserEmails(map);
      }
    }

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
        const isUnread = !msg.read_at && msg.receiver_id === user.id;

        if (isNewer) {
          threadMap.set(partnerId, {
            partnerId,
            lastMessage: msg.content.slice(0, 80),
            lastAt: msg.created_at,
            unread: (existing?.unread ?? 0) + (isUnread ? 1 : 0)
          });
        } else if (isUnread && existing) {
          existing.unread += 1;
        }
      }

      setThreads(
        Array.from(threadMap.values()).sort(
          (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
        )
      );
    }
    setThreadsLoading(false);
  }, [user, isAdmin, supabase]);

  /* ─── load conversation ────────────────────────────────────── */

  const loadMessages = useCallback(async (partnerId: string) => {
    if (!user || !supabase) return;
    setMessagesLoading(true);

    let query;
    if (partnerId === "admin-channel") {
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
      // Mark unread messages as read.
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
  }, [user, t, toast, supabase]);

  /* ─── realtime subscription ────────────────────────────────── */

  // Subscription does NOT depend on selectedPartnerId — we use the ref instead.
  // This prevents the channel from being torn down every time a conversation is selected.
  useEffect(() => {
    if (!user || !supabase) return;
    void loadThreads();

    const channel = supabase
      .channel(`chat-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wf_messages" },
        (payload) => {
          const msg = payload.new as Message;

          // Determine if the message is relevant to this user.
          const isMine = msg.sender_id === user.id;
          const isForMe =
            msg.receiver_id === user.id ||
            (isAdmin && !isMine && msg.receiver_id === null);

          if (!isMine && !isForMe) return;

          const partnerId = isMine
            ? (msg.receiver_id ?? "admin-channel")
            : msg.sender_id;

          // Append to open conversation (use ref — not state — to avoid stale closure).
          if (partnerId === selectedPartnerIdRef.current) {
            setMessages((prev) => {
              // Avoid duplicates (optimistic insert race).
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            // Mark incoming message read immediately.
            if (!isMine) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, supabase]);
  // loadThreads intentionally omitted: stable useCallback but would re-subscribe on every thread refresh.

  useEffect(() => {
    if (selectedPartnerId) void loadMessages(selectedPartnerId);
  }, [selectedPartnerId, loadMessages]);

  // Scroll to bottom whenever messages change or conversation opens.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ─── send ─────────────────────────────────────────────────── */

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !user || sending || !supabase) return;
    if (trimmed.length > MAX_MSG_LENGTH) {
      toast({
        title: t("chat.sendFailed"),
        description: `Massimo ${MAX_MSG_LENGTH} caratteri`,
        variant: "destructive"
      });
      return;
    }
    const receiverId = isAdmin ? selectedPartnerId : null;
    setSending(true);
    const { error } = await supabase.from("wf_messages").insert({
      sender_id: user.id,
      receiver_id: receiverId,
      content: trimmed
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
    return userEmails[partnerId] ?? partnerId.slice(0, 8) + "…";
  }

  /* ─── render ─────────────────────────────────────────────────── */

  const showThreadList = isAdmin;
  const showConversation = selectedPartnerId !== null;
  const showNewChatBtn = !isAdmin && !selectedPartnerId;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-background">
      {/* Thread list — admin only */}
      {showThreadList && (
        <div
          className={cn(
            "flex flex-col border-r",
            showConversation
              ? "hidden sm:flex sm:w-64 lg:w-72"
              : "flex w-full sm:w-64 lg:w-72"
          )}
        >
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="text-sm font-semibold">{t("chat.allConversations")}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7"
              onClick={loadThreads}
              disabled={threadsLoading}
              aria-label="Aggiorna conversazioni"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", threadsLoading && "animate-spin")} />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {threadsLoading && threads.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!threadsLoading && threads.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <MessageCircle className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">{t("chat.noConversations")}</p>
              </div>
            )}
            {threads.map((th) => (
              <button
                key={th.partnerId}
                className={cn(
                  "w-full border-b px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                  selectedPartnerId === th.partnerId && "bg-muted"
                )}
                onClick={() => setSelectedPartnerId(th.partnerId)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {partnerLabel(th.partnerId)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {th.unread > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                        {th.unread > 99 ? "99+" : th.unread}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {fmtDate(th.lastAt)}
                    </span>
                  </div>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {th.lastMessage}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation panel */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          showThreadList && !showConversation && "hidden sm:flex"
        )}
      >
        {/* Empty state: no conversation selected (admin desktop) */}
        {!showConversation && !showNewChatBtn && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t("chat.noConversations")}</p>
          </div>
        )}

        {/* Empty state: user hasn't started a chat yet */}
        {showNewChatBtn && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground/30" />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("chat.page.title")}</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {t("chat.page.subtitle")}
              </p>
            </div>
            <Button
              onClick={() => setSelectedPartnerId("admin-channel")}
              className="gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              {t("chat.startChatWithAdmin")}
            </Button>
          </div>
        )}

        {/* Open conversation */}
        {showConversation && (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "h-8 w-8 shrink-0",
                  isAdmin && "sm:hidden"
                )}
                onClick={() => setSelectedPartnerId(null)}
                aria-label="Torna alle conversazioni"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {partnerLabel(selectedPartnerId)}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => void loadMessages(selectedPartnerId)}
                disabled={messagesLoading}
                aria-label="Aggiorna messaggi"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", messagesLoading && "animate-spin")} />
              </Button>
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {messagesLoading && messages.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!messagesLoading && messages.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("chat.noMessages")}
                </p>
              )}
              <div className="space-y-2">
                {messages.map((msg, i) => {
                  const isMine = msg.sender_id === user?.id;
                  const prevMsg = messages[i - 1];
                  const showDate =
                    !prevMsg ||
                    new Date(msg.created_at).toDateString() !==
                      new Date(prevMsg.created_at).toDateString();

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="my-3 flex items-center gap-2">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(msg.created_at).toLocaleDateString([], {
                              weekday: "short",
                              day: "numeric",
                              month: "short"
                            })}
                          </span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "flex flex-col",
                          isMine ? "items-end" : "items-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                            isMine
                              ? "rounded-br-sm bg-primary text-primary-foreground"
                              : "rounded-bl-sm bg-muted text-foreground"
                          )}
                        >
                          {msg.content}
                        </div>
                        <span className="mt-0.5 text-[11px] text-muted-foreground">
                          {fmtTime(msg.created_at)}
                          {isMine && msg.read_at && (
                            <span className="ml-1 opacity-70">· letto</span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div ref={bottomRef} className="h-1" />
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 border-t p-3">
              <div className="relative min-w-0 flex-1">
                <Textarea
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("chat.messagePlaceholder")}
                  rows={1}
                  maxLength={MAX_MSG_LENGTH}
                  className="min-h-10 resize-none pr-2"
                  disabled={sending}
                />
                {text.length > MAX_MSG_LENGTH * 0.8 && (
                  <span
                    className={cn(
                      "absolute bottom-1.5 right-2 text-[10px]",
                      text.length >= MAX_MSG_LENGTH
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {text.length}/{MAX_MSG_LENGTH}
                  </span>
                )}
              </div>
              <Button
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={handleSend}
                disabled={!text.trim() || sending || text.length > MAX_MSG_LENGTH}
                aria-label={t("chat.send")}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
