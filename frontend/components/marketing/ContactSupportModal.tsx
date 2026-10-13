"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";
import { toast } from "@/components/ui/toast";
import { fetchAPI } from "@/lib/validation/api";

const inputCls =
  "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 outline-none focus:ring-4 focus:ring-cyan-100 focus:border-cyan-400 focus:bg-white transition text-sm";

export default function ContactSupportModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const valid = name.trim() && email.trim() && subject.trim() && message.trim();

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    try {
      const res = await fetchAPI("/contact", {
        method: "POST",
        body: JSON.stringify({ name, email, subject, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Your message has been sent — we'll get back to you soon.");
        onClose();
      } else {
        toast.error(data.message || "Failed to send your message.");
      }
    } catch {
      toast.error("Unable to reach the server. Please try again later.");
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell onClose={onClose} maxWidth="md">
      <div className="p-6">
        <ModalHeader
          title="Contact Support"
          subtitle="Send us a message and we'll respond by email."
          onClose={onClose}
        />

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                Name
              </label>
              <input
                className={inputCls}
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                Email
              </label>
              <input
                type="email"
                className={inputCls}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Subject
            </label>
            <input
              className={inputCls}
              placeholder="What's this about?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
              Message
            </label>
            <textarea
              className={inputCls + " min-h-[120px] resize-y"}
              placeholder="How can we help?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!valid || sending}
              className="btn btn-primary flex-1"
            >
              <Send size={14} />
              {sending ? "Sending..." : "Send message"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
