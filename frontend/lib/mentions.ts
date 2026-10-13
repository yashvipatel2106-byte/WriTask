export type MentionMember = {
  user: { _id: string; username: string; avatarColor?: string };
};

export function normalizeMentionMembers(
  raw: Array<{
    user?: { _id?: string; username?: string; avatarColor?: string } | string;
    role?: string;
  }>
): MentionMember[] {
  return raw
    .map((entry) => {
      const user = entry.user;
      if (!user || typeof user === "string") return null;
      if (!user._id || !user.username) return null;
      return { user: { _id: user._id, username: user.username, avatarColor: user.avatarColor } };
    })
    .filter(Boolean) as MentionMember[];
}

export function collectMentionIds(body: string, members: MentionMember[]) {
  const text = body.trim();
  if (!text) return [];

  return members
    .filter((member) => text.includes(`@${member.user.username}`))
    .map((member) => member.user._id);
}

export function splitMentionTokens(text: string) {
  const tokens: Array<{ kind: "text" | "mention"; value: string }> = [];
  const pattern = /(@[A-Za-z0-9_.-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        kind: "text",
        value: text.slice(lastIndex, match.index),
      });
    }
    tokens.push({ kind: "mention", value: match[1] });
    lastIndex = match.index + match[1].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: "text", value: text.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ kind: "text", value: text }];
}
