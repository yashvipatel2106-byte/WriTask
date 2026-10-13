"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import type { ChatMessage, MeetingPeer } from "@/lib/meeting/constants";
import { avatarColor, avatarInitials } from "@/lib/avatarColor";

type Mentionable = { userId: string; username: string };

type Props = {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  peers: MeetingPeer[];
  localUser: Mentionable;
  onSend: (text: string, mentions: string[]) => void;
};

function renderTextWithMentions(text: string) {
  const parts = text.split(/(@[\w.\-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="rounded bg-cyan-500/20 px-1 font-medium text-cyan-300">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function MeetingChat({
  open,
  onClose,
  messages,
  peers,
  localUser,
  onSend,
}: Props) {
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mentionables = useMemo(() => {
    const map = new Map<string, Mentionable>();
    for (const p of peers) {
      if (p.userId && p.userId !== localUser.userId) {
        map.set(p.userId, { userId: p.userId, username: p.username });
      }
    }
    return [...map.values()];
  }, [peers, localUser]);

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionables.filter((m) =>
      m.username.toLowerCase().includes(q)
    );
  }, [mentionables, mentionQuery]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const detectMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match = before.match(/@([\w.\-]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (username: string) => {
    const el = inputRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const after = text.slice(caret);
    const replaced = before.replace(/@([\w.\-]*)$/, `@${username} `);
    const next = replaced + after;
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = replaced.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    const mentions = mentionables
      .filter((m) =>
        trimmed.toLowerCase().includes(`@${m.username.toLowerCase()}`)
      )
      .map((m) => m.userId);

    onSend(trimmed, mentions);
    setText("");
    setMentionQuery(null);
  };

  if (!open) return null;

  return (
    <aside
      className="flex h-full w-full max-w-sm flex-col"
      style={{ background: "#0F172A", color: "#F1F5F9" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid #1E293B" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "#F8FAFC" }}>
            In-meeting chat
          </p>
          <p className="text-[11px]" style={{ color: "#94A3B8" }}>
            Type @ to mention someone currently in the room
            {mentionables.length === 0 ? " (waiting for others…)" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5"
          style={{ color: "#94A3B8" }}
        >
          <X size={16} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="py-8 text-center text-xs" style={{ color: "#64748B" }}>
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((m) => {
          const mentionedMe = m.mentions.includes(localUser.userId);
          return (
            <div
              key={m.id}
              className="rounded-xl px-3 py-2"
              style={{
                background: mentionedMe ? "rgba(8,145,178,0.2)" : "#1E293B",
                border: mentionedMe ? "1px solid rgba(34,211,238,0.35)" : "1px solid transparent",
              }}
            >
              <div className="mb-1 flex items-center gap-2">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarColor(m.from.userId)}`}
                >
                  {avatarInitials(m.from.username)}
                </div>
                <span className="text-xs font-semibold" style={{ color: "#F8FAFC" }}>
                  {m.from.username}
                </span>
                <span className="text-[10px]" style={{ color: "#64748B" }}>
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm" style={{ color: "#E2E8F0" }}>
                {renderTextWithMentions(m.text)}
              </p>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative p-3"
        style={{ borderTop: "1px solid #1E293B" }}
      >
        {filteredMentions.length > 0 && (
          <div
            className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-xl shadow-xl"
            style={{ background: "#1E293B", border: "1px solid #334155" }}
          >
            {filteredMentions.slice(0, 6).map((m, i) => (
              <button
                key={m.userId}
                type="button"
                onClick={() => insertMention(m.username)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                style={{
                  background: i === mentionIndex ? "rgba(8,145,178,0.25)" : "transparent",
                  color: "#F1F5F9",
                }}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${avatarColor(m.userId)}`}
                >
                  {avatarInitials(m.username)}
                </div>
                @{m.username}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={2}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              detectMention(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={(e) => {
              if (mentionQuery !== null && filteredMentions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % filteredMentions.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex(
                    (i) =>
                      (i - 1 + filteredMentions.length) % filteredMentions.length
                  );
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  insertMention(filteredMentions[mentionIndex].username);
                  return;
                }
                if (e.key === "Escape") {
                  setMentionQuery(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Message… use @ to mention"
            className="min-h-[44px] flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: "#1E293B",
              border: "1px solid #334155",
              color: "#F8FAFC",
            }}
          />
          <button
            type="submit"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white"
            style={{ background: "#0891B2" }}
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </aside>
  );
}
