export type ProjectPin = {
  type: "folder" | "project";
  id: string;
};

const STORAGE_PREFIX = "writask-project-pins";

export function pinsStorageKey(
  organizationId: string | null,
  workspaceId: string | null
) {
  return `${STORAGE_PREFIX}:${organizationId || "personal"}:${workspaceId || "default"}`;
}

export function readProjectPins(key: string): ProjectPin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ProjectPin =>
        item &&
        typeof item === "object" &&
        (item.type === "folder" || item.type === "project") &&
        typeof item.id === "string" &&
        item.id.length > 0
    );
  } catch {
    return [];
  }
}

export function writeProjectPins(key: string, pins: ProjectPin[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(pins));
}

export function toggleProjectPin(pins: ProjectPin[], entry: ProjectPin): ProjectPin[] {
  const exists = pins.some((p) => p.type === entry.type && p.id === entry.id);
  if (exists) {
    return pins.filter((p) => !(p.type === entry.type && p.id === entry.id));
  }
  return [...pins, entry];
}

export function isPinned(pins: ProjectPin[], entry: ProjectPin) {
  return pins.some((p) => p.type === entry.type && p.id === entry.id);
}
