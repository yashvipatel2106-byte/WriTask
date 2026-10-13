"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import Select from "@/components/ui/Select";

import type {
  RequestFormPage,
  RequestQuestion,
  RequestQuestionType,
} from "@/lib/requestForms";

type ProjectOption = {
  _id: string;
  title?: string;
  name?: string;
};

type MemberOption = {
  _id: string;
  username?: string;
  email?: string;
};

type Props = {
  initialName?: string;

  initialDescription?: string;

  initialStatus?: "draft" | "published";

  initialQuestions?: RequestQuestion[];

  initialPages?: RequestFormPage[];

  initialApprovalRequired?: boolean;

  initialSaveToProjectId?: string | null;

  initialAssignToMode?: "me" | "specific" | "everyone";

  initialAssignToUserIds?: string[];

  initialDesign?: {
    logoUrl?: string;
    logoAltText?: string;
    logoSize?: "s" | "m" | "l";
    logoAlign?: "left" | "center" | "right";
    backgroundColor?: string;
    hideBranding?: boolean;
  };

  /** Accessible projects for the "Save To" picker. Omit to hide that setting. */
  projects?: ProjectOption[];

  /** Organization members for the "Assign To" picker. */
  members?: MemberOption[];

  saving?: boolean;

  saveLabel?: string;

  onSave: (payload: {
    name: string;

    description: string;

    status:
      | "draft"
      | "published";

    questions: RequestQuestion[];

    pages: RequestFormPage[];

    approvalRequired: boolean;

    saveTo: { project: string | null };

    assignTo: {
      mode: "me" | "specific" | "everyone";
      users: string[];
    };

    design: {
      logoUrl: string;
      logoAltText: string;
      logoSize: "s" | "m" | "l";
      logoAlign: "left" | "center" | "right";
      backgroundColor: string;
      hideBranding: boolean;
    };
  }) => Promise<void> | void;
};


/* ============================================================
   FIELD TYPE CATALOG (grouped for the Add Field menu)
   ============================================================ */

type TypeDef = {
  value: RequestQuestionType;
  label: string;
};

const TYPE_GROUPS: { group: string; types: TypeDef[] }[] = [
  {
    group: "Text",
    types: [
      { value: "text", label: "Single Line Text" },
      { value: "textarea", label: "Paragraph" },
      { value: "email", label: "Email" },
      { value: "phone", label: "Phone" },
    ],
  },
  {
    group: "Selection",
    types: [
      { value: "single_select", label: "Single Select" },
      { value: "multiple_select", label: "Multiple Select" },
      { value: "radio", label: "Radio" },
      { value: "checkbox", label: "Checkbox" },
    ],
  },
  {
    group: "Date/Time",
    types: [
      { value: "date", label: "Date" },
      { value: "datetime", label: "Date & Time" },
    ],
  },
  {
    group: "Numeric",
    types: [
      { value: "number", label: "Number" },
      { value: "percentage", label: "Percentage" },
    ],
  },
  {
    group: "WriTask",
    types: [
      { value: "wri_project", label: "Project" },
      { value: "wri_assignee", label: "Assignee" },
      { value: "wri_priority", label: "Priority" },
      { value: "wri_status", label: "Status" },
      { value: "wri_due_date", label: "Due Date" },
      { value: "wri_start_date", label: "Start Date" },
      { value: "wri_custom_field", label: "Custom Field" },
    ],
  },
  {
    group: "Files",
    types: [{ value: "attachment", label: "Attachment" }],
  },
  {
    group: "Structure",
    types: [{ value: "section_header", label: "Section Header" }],
  },
];

const ALL_TYPES = TYPE_GROUPS.flatMap((g) => g.types);

const OPTION_TYPES: RequestQuestionType[] = [
  "single_select",
  "multiple_select",
  "radio",
];

const TEXT_LIKE_TYPES: RequestQuestionType[] = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "percentage",
];

const STRUCTURE_TYPES: RequestQuestionType[] = ["section_header"];

const DEFAULT_MAPPING_FOR_TYPE: Partial<
  Record<RequestQuestionType, NonNullable<RequestQuestion["mapping"]>>
> = {
  wri_project: "project",
  wri_assignee: "assignee",
  wri_priority: "priority",
  wri_due_date: "dueDate",
};


/**
 * Derives an option's internal value from its label (e.g.
 * "Bug Report" -> "bug_report"), so the option editor only needs
 * to ask for one piece of text instead of a confusing label+value
 * pair. Falls back to a positional slug if the label has no
 * usable characters (e.g. it's empty, or emoji-only).
 */
function slugifyOptionValue(label: string, index: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || `option_${index + 1}`;
}

/** Same as slugifyOptionValue, but disambiguates against this question's other options (e.g. two options both labeled "Yes"). */
function uniqueOptionValue(
  question: RequestQuestion,
  label: string,
  index: number
): string {
  const base = slugifyOptionValue(label, index);
  const siblingValues = new Set(
    (question.options ?? [])
      .filter((_, i) => i !== index)
      .map((o) => o.value)
  );

  if (!siblingValues.has(base)) return base;

  let suffix = 2;
  while (siblingValues.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}


/* ============================================================
   CREATE NEW QUESTION / PAGE
   ============================================================ */

function createQuestion(
  order: number,
  type: RequestQuestionType = "text",
  pageId: string | null = null
): RequestQuestion {
  const typeDef = ALL_TYPES.find((t) => t.value === type);

  return {
    id: crypto.randomUUID(),

    label:
      type === "section_header"
        ? "Section"
        : typeDef?.label || `Question ${order + 1}`,

    type,

    required: false,

    placeholder: "",

    helpText: "",

    options: OPTION_TYPES.includes(type)
      ? [{ label: "Option 1", value: "option_1" }]
      : [],

    conditions: [],

    mapping: DEFAULT_MAPPING_FOR_TYPE[type] || "none",

    order,

    pageId,
  };
}

function createPage(order: number): RequestFormPage {
  return {
    id: crypto.randomUUID(),
    title: `Page ${order + 1}`,
    order,
  };
}


/* ============================================================
   DESIGN PANEL
   ============================================================ */

type DesignState = {
  logoUrl: string;
  logoAltText: string;
  logoSize: "s" | "m" | "l";
  logoAlign: "left" | "center" | "right";
  backgroundColor: string;
  hideBranding: boolean;
};

const LOGO_SIZE_PX: Record<DesignState["logoSize"], number> = {
  s: 28,
  m: 40,
  l: 56,
};

const ALIGN_CLASS: Record<DesignState["logoAlign"], string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

/** Picks black or white text for readability against an arbitrary background color. */
function contrastTextColor(hex?: string): string | undefined {
  if (!hex) return undefined;

  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return undefined;

  const [r, g, b] = match.slice(1).map((h) => parseInt(h, 16));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.6 ? "#0f172a" : "#ffffff";
}

function DesignPanel({
  design,
  setDesign,
  formName,
}: {
  design: DesignState;
  setDesign: (updater: (previous: DesignState) => DesignState) => void;
  formName: string;
}) {
  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  const selectTriggerClass = (open: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors dark:bg-slate-950 dark:text-slate-100 ${
      open
        ? "border-cyan-500 ring-2 ring-cyan-100 dark:border-cyan-500 dark:ring-cyan-500/20"
        : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
    }`;

  const handleLogoFile = (file: File | null) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setDesign((previous) => ({
        ...previous,
        logoUrl: String(reader.result || ""),
      }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label className="mb-2 block text-sm font-semibold">Logo</label>

          <div className="flex items-center gap-3">
            {design.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={design.logoUrl}
                alt={design.logoAltText}
                className="h-10 max-w-[120px] object-contain"
              />
            ) : (
              <div className="flex h-10 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400 dark:border-slate-700">
                No logo
              </div>
            )}

            <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleLogoFile(e.target.files?.[0] || null)}
              />
            </label>

            {design.logoUrl && (
              <button
                type="button"
                onClick={() =>
                  setDesign((previous) => ({ ...previous, logoUrl: "" }))
                }
                className="text-xs font-semibold text-red-500 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold">Alt text</label>
          <input
            value={design.logoAltText}
            onChange={(e) =>
              setDesign((previous) => ({
                ...previous,
                logoAltText: e.target.value,
              }))
            }
            className={inputClass}
            placeholder="Logo"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block text-sm font-semibold">Size</label>
            <div className="flex gap-1">
              {(["s", "m", "l"] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() =>
                    setDesign((previous) => ({ ...previous, logoSize: size }))
                  }
                  className={[
                    "flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold uppercase",
                    design.logoSize === size
                      ? "border-cyan-400 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300"
                      : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400",
                  ].join(" ")}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Align</label>
            <Select
              value={design.logoAlign}
              onChange={(value) =>
                setDesign((previous) => ({
                  ...previous,
                  logoAlign: value as DesignState["logoAlign"],
                }))
              }
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
                { value: "right", label: "Right" },
              ]}
              className="w-full"
              triggerClassName={selectTriggerClass}
              ariaLabel="Logo alignment"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold">
            Background colour
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={design.backgroundColor || "#f6f9fc"}
              onChange={(e) =>
                setDesign((previous) => ({
                  ...previous,
                  backgroundColor: e.target.value,
                }))
              }
              className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700"
            />
            <input
              value={design.backgroundColor}
              onChange={(e) =>
                setDesign((previous) => ({
                  ...previous,
                  backgroundColor: e.target.value,
                }))
              }
              placeholder="Matches WriTask theme"
              className={inputClass}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={design.hideBranding}
            onChange={(e) =>
              setDesign((previous) => ({
                ...previous,
                hideBranding: e.target.checked,
              }))
            }
            className="accent-cyan-600"
          />
          Hide WriTask branding
        </label>
      </section>

      {/* LIVE PREVIEW */}
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-slate-100 p-10 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Preview only — not interactive. The logo/background/branding shown
          here appear on the actual submission page once saved.
        </p>

        <div
          className={`pointer-events-none flex w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${ALIGN_CLASS[design.logoAlign]}`}
          style={
            design.backgroundColor
              ? { background: design.backgroundColor }
              : undefined
          }
        >
          {design.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={design.logoUrl}
              alt={design.logoAltText}
              style={{ height: LOGO_SIZE_PX[design.logoSize] }}
              className="object-contain"
            />
          )}

          <h3
            className={
              design.backgroundColor
                ? "mt-4 text-lg font-bold"
                : "mt-4 text-lg font-bold text-slate-800 dark:text-slate-100"
            }
            style={
              design.backgroundColor
                ? { color: contrastTextColor(design.backgroundColor) }
                : undefined
            }
          >
            {design.logoAltText || formName || "Untitled form"}
          </h3>

          <div className="mt-4 h-9 w-full rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="mt-3 h-20 w-full rounded-lg bg-slate-100 dark:bg-slate-800" />

          <div className="mt-5 flex w-full items-center justify-end gap-2">
            {!design.hideBranding && (
              <span className="text-[11px] text-slate-400">
                Powered by WriTask
              </span>
            )}
            <span className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white">
              Submit
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   MULTI-USER SELECT (searchable, checkbox list)
   ============================================================ */

function MultiUserSelect({
  members,
  selectedIds,
  onChange,
}: {
  members: MemberOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return members;

    return members.filter(
      (member) =>
        (member.username || "").toLowerCase().includes(query) ||
        (member.email || "").toLowerCase().includes(query)
    );
  }, [members, search]);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((existing) => existing !== id)
        : [...selectedIds, id]
    );
  };

  const nameFor = (id: string) => {
    const member = members.find((m) => m._id === id);
    return member?.username || member?.email || "Member";
  };

  const triggerLabel =
    selectedIds.length === 0
      ? "Select people"
      : selectedIds.length === 1
        ? nameFor(selectedIds[0])
        : `${selectedIds.length} people selected`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors dark:bg-slate-950 dark:text-slate-100 ${
          open
            ? "border-cyan-500 ring-2 ring-cyan-100 dark:border-cyan-500 dark:ring-cyan-500/20"
            : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
        }`}
      >
        <span
          className={`truncate ${selectedIds.length === 0 ? "text-slate-400 dark:text-slate-500" : ""}`}
        >
          {triggerLabel}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180 text-cyan-500" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-2 text-sm outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-slate-400 dark:text-slate-500">
                No matches
              </p>
            ) : (
              filtered.map((member) => {
                const checked = selectedIds.includes(member._id);

                return (
                  <button
                    key={member._id}
                    type="button"
                    onClick={() => toggle(member._id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                      checked
                        ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                        : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-cyan-500 bg-cyan-500"
                          : "border-slate-300 dark:border-slate-600"
                      }`}
                    >
                      {checked && <Check size={11} className="text-white" />}
                    </span>
                    <span className="truncate">
                      {member.username || member.email || "Member"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}


/* ============================================================
   BUILDER
   ============================================================ */

export default function RequestFormBuilder({
  initialName = "",

  initialDescription = "",

  initialStatus = "draft",

  initialQuestions = [],

  initialPages = [],

  initialApprovalRequired = true,

  initialSaveToProjectId = null,

  initialAssignToMode = "me",

  initialAssignToUserIds = [],

  initialDesign,

  projects = [],

  members = [],

  saving = false,

  saveLabel = "Save Form",

  onSave,
}: Props) {
  const [name, setName] =
    useState(initialName);

  const [description, setDescription] =
    useState(
      initialDescription
    );

  const [status, setStatus] =
    useState<
      "draft" | "published"
    >(initialStatus);

  const [approvalRequired, setApprovalRequired] = useState(
    initialApprovalRequired
  );

  const [saveToProjectId, setSaveToProjectId] = useState(
    initialSaveToProjectId || ""
  );

  const [assignToMode, setAssignToMode] = useState(initialAssignToMode);

  const [assignToUserIds, setAssignToUserIds] = useState<string[]>(
    initialAssignToUserIds
  );

  const [activeView, setActiveView] = useState<"build" | "design">("build");

  const [design, setDesign] = useState({
    logoUrl: initialDesign?.logoUrl || "",
    logoAltText: initialDesign?.logoAltText || "",
    logoSize: initialDesign?.logoSize || "s",
    logoAlign: initialDesign?.logoAlign || "left",
    backgroundColor: initialDesign?.backgroundColor || "",
    hideBranding: initialDesign?.hideBranding || false,
  });

  const [pages, setPages] = useState<RequestFormPage[]>(
    initialPages
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );

  const [activePageId, setActivePageId] = useState<string | null>(
    pages[0]?.id ?? null
  );

  const [questions, setQuestions] =
    useState<RequestQuestion[]>(
      initialQuestions
        .slice()
        .sort(
          (a, b) =>
            (a.order ?? 0) -
            (b.order ?? 0)
        )
        .map(
          (
            question,
            index
          ) => ({
            ...question,
            order: index,
          })
        )
    );

  const [error, setError] =
    useState("");

  const [addFieldMenuOpen, setAddFieldMenuOpen] = useState(false);


  /* ==========================================================
     CHECK TITLE MAPPING
     ========================================================== */

  const hasTitleMapping =
    useMemo(
      () =>
        questions.some(
          (question) =>
            question.mapping ===
            "title"
        ),
      [questions]
    );

  const visibleQuestions = useMemo(() => {
    if (pages.length === 0) return questions;

    /*
     * A question's effective page: its own pageId when that page
     * still exists, otherwise the first page. This guarantees a
     * field never silently disappears — e.g. fields created
     * before any page existed (pageId is null) always show up
     * under the first page instead of only under whichever page
     * happens to be active right now.
     */
    const validIds = new Set(pages.map((p) => p.id));

    const effectivePageId = (question: RequestQuestion) =>
      question.pageId && validIds.has(question.pageId)
        ? question.pageId
        : (pages[0]?.id ?? null);

    return questions.filter(
      (question) => effectivePageId(question) === activePageId
    );
  }, [questions, pages, activePageId]);


  /* ==========================================================
     UPDATE QUESTION
     ========================================================== */

  const updateQuestion = (
    id: string,

    patch: Partial<RequestQuestion>
  ) => {
    setQuestions(
      (previous) =>
        previous.map(
          (question) =>
            question.id === id
              ? {
                  ...question,
                  ...patch,
                }
              : question
        )
    );
  };


  /* ==========================================================
     ADD QUESTION
     ========================================================== */

  const addQuestion = (type: RequestQuestionType = "text") => {
    setQuestions(
      (previous) => [
        ...previous,

        createQuestion(
          previous.length,
          type,
          pages.length > 0 ? activePageId : null
        ),
      ]
    );

    setAddFieldMenuOpen(false);
  };


  /* ==========================================================
     DUPLICATE QUESTION
     ========================================================== */

  const duplicateQuestion = (question: RequestQuestion) => {
    setQuestions((previous) => {
      const index = previous.findIndex((q) => q.id === question.id);
      const clone: RequestQuestion = {
        ...question,
        id: crypto.randomUUID(),
        label: `${question.label} (copy)`,
      };
      const next = [...previous];
      next.splice(index + 1, 0, clone);
      return next.map((q, i) => ({ ...q, order: i }));
    });
  };


  /* ==========================================================
     MOVE QUESTION (within its page)
     ========================================================== */

  const moveQuestion = (id: string, direction: -1 | 1) => {
    setQuestions((previous) => {
      const ids = previous
        .filter(
          (q) => pages.length === 0 || (q.pageId ?? null) === (previous.find((p) => p.id === id)?.pageId ?? null)
        )
        .map((q) => q.id);

      const from = ids.indexOf(id);
      const to = from + direction;

      if (from === -1 || to < 0 || to >= ids.length) {
        return previous;
      }

      const reorderedIds = [...ids];
      [reorderedIds[from], reorderedIds[to]] = [
        reorderedIds[to],
        reorderedIds[from],
      ];

      const positionOf = new Map(
        reorderedIds.map((qid, idx) => [qid, idx])
      );

      return previous
        .slice()
        .sort((a, b) => {
          const aPos = positionOf.has(a.id)
            ? positionOf.get(a.id)!
            : previous.indexOf(a);
          const bPos = positionOf.has(b.id)
            ? positionOf.get(b.id)!
            : previous.indexOf(b);
          return aPos - bPos;
        })
        .map((q, i) => ({ ...q, order: i }));
    });
  };


  /* ==========================================================
     DELETE QUESTION
     ========================================================== */

  const removeQuestion = (
    id: string
  ) => {
    setQuestions(
      (previous) =>
        previous
          .filter(
            (question) =>
              question.id !== id
          )
          .map(
            (
              question,
              index
            ) => ({
              ...question,
              order: index,
            })
          )
    );
  };


  /* ==========================================================
     PAGES
     ========================================================== */

  const addPage = () => {
    setPages((previous) => {
      const newPage = createPage(previous.length);
      const next = [...previous, newPage];
      setActivePageId(newPage.id);
      return next;
    });
  };

  const renamePage = (id: string, title: string) => {
    setPages((previous) =>
      previous.map((page) => (page.id === id ? { ...page, title } : page))
    );
  };

  const movePage = (id: string, direction: -1 | 1) => {
    setPages((previous) => {
      const index = previous.findIndex((p) => p.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= previous.length) {
        return previous;
      }
      const next = previous.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((p, i) => ({ ...p, order: i }));
    });
  };

  const removePage = (id: string) => {
    if (pages.length <= 1) {
      setError("A form must have at least one page.");
      return;
    }

    const remaining = pages.filter((page) => page.id !== id);
    const fallbackPageId = remaining[0]?.id ?? null;

    setPages(remaining.map((page, i) => ({ ...page, order: i })));

    setQuestions((previous) =>
      previous.map((question) =>
        question.pageId === id
          ? { ...question, pageId: fallbackPageId }
          : question
      )
    );

    if (activePageId === id) {
      setActivePageId(fallbackPageId);
    }
  };


  /* ==========================================================
     ADD / UPDATE / DELETE OPTION
     ========================================================== */

  const addOption = (
    question: RequestQuestion
  ) => {
    const optionNumber =
      (question.options
        ?.length ?? 0) + 1;

    updateQuestion(
      question.id,
      {
        options: [
          ...(question.options ??
            []),

          {
            label:
              `Option ${optionNumber}`,

            value:
              `option_${optionNumber}`,
          },
        ],
      }
    );
  };

  const updateOption = (
    question: RequestQuestion,

    index: number,

    patch: {
      label?: string;

      value?: string;
    }
  ) => {
    updateQuestion(
      question.id,
      {
        options: (
          question.options ??
          []
        ).map(
          (
            option,
            optionIndex
          ) =>
            optionIndex ===
            index
              ? {
                  ...option,
                  ...patch,
                }
              : option
        ),
      }
    );
  };

  const removeOption = (
    question: RequestQuestion,

    index: number
  ) => {
    updateQuestion(
      question.id,
      {
        options: (
          question.options ??
          []
        ).filter(
          (
            _,
            optionIndex
          ) =>
            optionIndex !==
            index
        ),
      }
    );
  };


  /* ==========================================================
     ADD / UPDATE / DELETE CONDITION
     ========================================================== */

  const addCondition = (
    question: RequestQuestion
  ) => {
    const sourceQuestion =
      questions.find(
        (candidate) =>
          candidate.id !==
          question.id
      );

    if (!sourceQuestion) {
      return;
    }

    updateQuestion(
      question.id,
      {
        conditions: [
          ...(question.conditions ??
            []),

          {
            questionId:
              sourceQuestion.id,

            operator:
              "equals",

            value: "",
          },
        ],
      }
    );
  };

  const updateCondition = (
    question: RequestQuestion,

    index: number,

    patch: Partial<
      NonNullable<
        RequestQuestion["conditions"]
      >[number]
    >
  ) => {
    updateQuestion(
      question.id,
      {
        conditions: (
          question.conditions ??
          []
        ).map(
          (
            condition,
            conditionIndex
          ) =>
            conditionIndex ===
            index
              ? {
                  ...condition,
                  ...patch,
                }
              : condition
        ),
      }
    );
  };

  const removeCondition = (
    question: RequestQuestion,

    index: number
  ) => {
    updateQuestion(
      question.id,
      {
        conditions: (
          question.conditions ??
          []
        ).filter(
          (
            _,
            conditionIndex
          ) =>
            conditionIndex !==
            index
        ),
      }
    );
  };


  /* ==========================================================
     SAVE
     ========================================================== */

  const save = async (
    requestedStatus:
      | "draft"
      | "published" = status
  ) => {
    setError("");

    if (!name.trim()) {
      setError(
        "Form name is required."
      );

      return;
    }

    if (questions.length === 0) {
      setError(
        "Add at least one field."
      );

      return;
    }

    for (
      const question
      of questions
    ) {
      if (
        !question.label.trim()
      ) {
        setError(
          "Every field must have a label."
        );

        return;
      }

      if (
        OPTION_TYPES.includes(
          question.type
        ) &&
        !(
          question.options ??
          []
        ).length
      ) {
        setError(
          `Add at least one option to "${question.label}".`
        );

        return;
      }
    }

    const titleMappings =
      questions.filter(
        (question) =>
          question.mapping ===
          "title"
      );

    if (
      titleMappings.length > 1
    ) {
      setError(
        "Only one field can be mapped to Task Title."
      );

      return;
    }

    await onSave({
      name:
        name.trim(),

      description:
        description.trim(),

      status:
        requestedStatus,

      questions:
        questions.map(
          (
            question,
            index
          ) => ({
            ...question,
            order: index,
          })
        ),

      pages,

      approvalRequired,

      saveTo: {
        project: saveToProjectId || null,
      },

      assignTo: {
        mode: assignToMode,
        users: assignToMode === "specific" ? assignToUserIds : [],
      },

      design,
    });
  };


  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  const selectTriggerClass = (open: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors dark:bg-slate-950 dark:text-slate-100 ${
      open
        ? "border-cyan-500 ring-2 ring-cyan-100 dark:border-cyan-500 dark:ring-cyan-500/20"
        : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
    }`;


  return (
    <div className="relative space-y-6 pb-24">

    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

      {/* ======================================================
          SIDEBAR
         ====================================================== */}

      <aside className="w-full shrink-0 space-y-5 lg:sticky lg:top-0 lg:w-80">

      {/* ======================================================
          FORM SETTINGS
         ====================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">

        <label className="mb-2 block text-sm font-semibold">
          Form name *
        </label>

        <input
          value={name}
          onChange={(event) =>
            setName(
              event.target.value
            )
          }
          className={inputClass}
          placeholder="e.g. New Development Request"
        />


        <label className="mb-2 mt-5 block text-sm font-semibold">
          Description
        </label>

        <textarea
          value={description}
          onChange={(event) =>
            setDescription(
              event.target.value
            )
          }
          rows={3}
          className={inputClass}
          placeholder="Explain when this request form should be used."
        />


        <label className="mb-2 mt-5 block text-sm font-semibold">
          Status
        </label>

        <Select
  value={status}
  onChange={(value) =>
    setStatus(
      value as "draft" | "published"
    )
  }
  options={[
    {
      value: "draft",
      label: "Draft",
    },
    {
      value: "published",
      label: "Published",
    },
  ]}
  className="w-full"
  triggerClassName={selectTriggerClass}
  ariaLabel="Form status"
/>

      </section>


      {/* ======================================================
          APPROVAL & SAVE TO
         ====================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
          Response settings
        </h2>

        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold">
              Approval required
            </label>

            <Select
              value={approvalRequired ? "yes" : "no"}
              onChange={(value) => setApprovalRequired(value === "yes")}
              options={[
                { value: "yes", label: "Yes — require approval before a task is created" },
                { value: "no", label: "No — create the task immediately on submit" },
              ]}
              className="w-full"
              triggerClassName={selectTriggerClass}
              ariaLabel="Approval required"
            />

            {approvalRequired && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Approver: the destination project&apos;s owner or the
                organization owner.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Save to
            </label>

            <Select
              value={saveToProjectId}
              onChange={(value) => setSaveToProjectId(value)}
              options={[
                { value: "", label: "None" },
                ...projects.map((project) => ({
                  value: project._id,
                  label: project.title || project.name || "Untitled project",
                })),
              ]}
              className="w-full"
              triggerClassName={selectTriggerClass}
              ariaLabel="Save to project"
            />

            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {saveToProjectId
                ? "Approved requests create a task in this project."
                : "No project — approved requests are simply marked Approved, with no task created."}
            </p>
          </div>
        </div>
      </section>


      {/* ======================================================
          ASSIGN TO
         ====================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
          Who can see and submit this form
        </h2>

        <Select
          value={assignToMode}
          onChange={(value) =>
            setAssignToMode(value as "me" | "specific" | "everyone")
          }
          options={[
            { value: "me", label: "Me" },
            { value: "specific", label: "Specific people" },
            { value: "everyone", label: "Everyone" },
          ]}
          className="w-full"
          triggerClassName={selectTriggerClass}
          ariaLabel="Who can see and submit this form"
        />

        {assignToMode === "specific" && (
          <div className="mt-3">
            <MultiUserSelect
              members={members}
              selectedIds={assignToUserIds}
              onChange={setAssignToUserIds}
            />
          </div>
        )}

        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {assignToMode === "me" &&
            "Only you, the form's creator, can see and submit this form."}
          {assignToMode === "specific" &&
            "Only the selected people can see and submit this form."}
          {assignToMode === "everyone" &&
            "Every eligible member of the organization can see and submit this form."}
          {" "}Also used as the default task assignee when no field is
          mapped to Task Assignee.
        </p>
      </section>


      {/* ======================================================
          FORM SHARING
         ====================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
          Form sharing
        </h2>

        <p className="text-sm text-slate-600 dark:text-slate-300">
          Visible to everyone in the organization.
        </p>

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
          <input type="checkbox" disabled className="h-4 w-4" />
          Enable public link (coming soon)
        </label>
      </section>

      </aside>

      {/* ======================================================
          MAIN — BUILD / DESIGN
         ====================================================== */}

      <div className="min-w-0 flex-1 space-y-6">

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setActiveView("build")}
          className={[
            "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
            activeView === "build"
              ? "bg-cyan-600 text-white"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100",
          ].join(" ")}
        >
          Build
        </button>
        <button
          type="button"
          onClick={() => setActiveView("design")}
          className={[
            "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
            activeView === "design"
              ? "bg-cyan-600 text-white"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100",
          ].join(" ")}
        >
          Design
        </button>
      </div>

      {activeView === "design" ? (
        <DesignPanel design={design} setDesign={setDesign} formName={name} />
      ) : (
      <>

      {/* ======================================================
          PAGES
         ====================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Pages
          </h2>

          <button
            type="button"
            onClick={addPage}
            className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-600"
          >
            <Plus size={15} />
            Add Page
          </button>
        </div>

        {pages.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This form has a single page. Add a page to split fields across
            multiple steps.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pages.map((page, index) => (
              <div
                key={page.id}
                className={[
                  "flex items-center gap-1 rounded-xl border px-2 py-1.5",
                  activePageId === page.id
                    ? "border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/30"
                    : "border-slate-200 dark:border-slate-700",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => movePage(page.id, -1)}
                  disabled={index === 0}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"
                  aria-label={`Move ${page.title} left`}
                >
                  <ChevronUp size={13} className="-rotate-90" />
                </button>

                <input
                  value={page.title}
                  onChange={(e) => renamePage(page.id, e.target.value)}
                  onFocus={() => setActivePageId(page.id)}
                  className="w-28 bg-transparent text-sm font-medium outline-none"
                />

                <button
                  type="button"
                  onClick={() => movePage(page.id, 1)}
                  disabled={index === pages.length - 1}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-slate-200"
                  aria-label={`Move ${page.title} right`}
                >
                  <ChevronDown size={13} className="-rotate-90" />
                </button>

                <button
                  type="button"
                  onClick={() => removePage(page.id)}
                  className="text-red-400 hover:text-red-600"
                  aria-label={`Delete ${page.title}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>


      {/* ======================================================
          FIELDS
         ====================================================== */}

      {visibleQuestions.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 dark:bg-cyan-500/10">
            <Plus size={22} className="text-cyan-600 dark:text-cyan-400" />
          </div>

          <h3 className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
            No fields yet
          </h3>

          <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
            Add your first field to start building this{" "}
            {pages.length > 0 ? "page" : "form"} — use{" "}
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Add Field
            </span>{" "}
            below.
          </p>
        </div>
      )}

      {visibleQuestions.map(
        (
          question,
          index
        ) => (
          <section
            key={
              question.id
            }
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >

            <div className="mb-5 flex items-center justify-between">

              <div className="flex items-center gap-2">

                <GripVertical
                  size={18}
                  className="text-slate-400"
                />

                <span className="text-sm font-semibold text-slate-500">
                  {STRUCTURE_TYPES.includes(question.type)
                    ? "Section"
                    : `Field ${index + 1}`}
                </span>

              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveQuestion(question.id, -1)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  aria-label="Move up"
                >
                  <ChevronUp size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => moveQuestion(question.id, 1)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  aria-label="Move down"
                >
                  <ChevronDown size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => duplicateQuestion(question)}
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Duplicate
                </button>

                <button
                  type="button"
                  onClick={() =>
                    removeQuestion(
                      question.id
                    )
                  }
                  className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <Trash2
                    size={17}
                  />
                </button>
              </div>

            </div>


            {/* LABEL */}

            <label className="mb-2 block text-sm font-semibold">
              {STRUCTURE_TYPES.includes(question.type)
                ? "Section title *"
                : "Field label *"}
            </label>

            <input
              value={
                question.label
              }
              onChange={(
                event
              ) =>
                updateQuestion(
                  question.id,
                  {
                    label:
                      event.target
                        .value,
                  }
                )
              }
              className={
                inputClass
              }
            />

            {STRUCTURE_TYPES.includes(question.type) ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Section headers organize the form visually and are not
                answerable — no value is collected for them.
              </p>
            ) : (
              <>
                {/* TYPE + MAPPING */}

                <div className="mt-4 grid gap-4 md:grid-cols-2">

                  <div>

                    <label className="mb-2 block text-sm font-semibold">
                      Field type
                    </label>

                    <Select
      value={question.type}
      onChange={(value) => {
        const type =
          value as RequestQuestionType;

        updateQuestion(
          question.id,
          {
            type,
            options: OPTION_TYPES.includes(type)
              ? question.options?.length
                ? question.options
                : [
                    {
                      label: "Option 1",
                      value: "option_1",
                    },
                  ]
              : [],
            mapping:
              DEFAULT_MAPPING_FOR_TYPE[type] ||
              (question.mapping === "none" ? "none" : question.mapping),
          }
        );
      }}
      options={ALL_TYPES.filter(
        (t) => !STRUCTURE_TYPES.includes(t.value)
      ).map((type) => ({
        value: type.value,
        label: type.label,
      }))}
      className="w-full"
      triggerClassName={selectTriggerClass}
      ariaLabel={`Field ${index + 1} type`}
    />

                  </div>


                  <div>

                    <label className="mb-2 block text-sm font-semibold">
                      Task mapping
                    </label>

                    <Select
      value={question.mapping ?? "none"}
      onChange={(value) => {
        const mapping =
          value as NonNullable<
            RequestQuestion["mapping"]
          >;

        if (
          mapping === "title" &&
          hasTitleMapping &&
          question.mapping !== "title"
        ) {
          setError(
            "Only one field can be mapped to Task Title."
          );
          return;
        }

        updateQuestion(
          question.id,
          { mapping }
        );
      }}
      options={[
        {
          value: "none",
          label: "Do not map",
        },
        {
          value: "title",
          label: "Task Title",
        },
        {
          value: "description",
          label: "Task Description",
        },
        {
          value: "priority",
          label: "Task Priority",
        },
        {
          value: "assignee",
          label: "Task Assignee",
        },
        {
          value: "dueDate",
          label: "Task Due Date",
        },
        {
          value: "project",
          label: "Task Project",
        },
      ]}
      className="w-full"
      triggerClassName={selectTriggerClass}
      ariaLabel={`Field ${index + 1} task mapping`}
    />

                  </div>

                </div>


                {/* PLACEHOLDER */}

                {TEXT_LIKE_TYPES.includes(question.type) && (
                  <div className="mt-4">

                    <label className="mb-2 block text-sm font-semibold">
                      Placeholder
                    </label>

                    <input
                      value={
                        question.placeholder ??
                        ""
                      }
                      onChange={(
                        event
                      ) =>
                        updateQuestion(
                          question.id,
                          {
                            placeholder:
                              event.target
                                .value,
                          }
                        )
                      }
                      className={
                        inputClass
                      }
                    />

                  </div>
                )}


                {/* IMAGE ATTACHMENT (paragraph only) */}

                {question.type === "textarea" && (
                  <label className="mt-4 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(question.allowImageAttachment)}
                      onChange={(event) =>
                        updateQuestion(question.id, {
                          allowImageAttachment: event.target.checked,
                        })
                      }
                      className="accent-cyan-600"
                    />
                    Allow image attachment
                  </label>
                )}


                {/* HELP TEXT */}

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold">
                    Help text
                  </label>

                  <input
                    value={question.helpText ?? ""}
                    onChange={(event) =>
                      updateQuestion(question.id, {
                        helpText: event.target.value,
                      })
                    }
                    className={inputClass}
                    placeholder="Optional guidance shown under the field"
                  />
                </div>


                {/* PAGE ASSIGNMENT */}

                {pages.length > 0 && (
                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">
                      Page
                    </label>

                    <Select
                      value={question.pageId ?? pages[0].id}
                      onChange={(value) =>
                        updateQuestion(question.id, { pageId: value })
                      }
                      options={pages.map((page) => ({
                        value: page.id,
                        label: page.title,
                      }))}
                      className="w-full"
                      triggerClassName={selectTriggerClass}
                      ariaLabel={`Field ${index + 1} page`}
                    />
                  </div>
                )}


                {/* REQUIRED */}

                <label className="mt-4 flex items-center gap-2 text-sm">

                  <input
                    type="checkbox"
                    checked={
                      question.required
                    }
                    onChange={(
                      event
                    ) =>
                      updateQuestion(
                        question.id,
                        {
                          required:
                            event.target
                              .checked,
                        }
                      )
                    }
                    className="accent-cyan-600"
                  />

                  Required field

                </label>


                {/* OPTIONS */}

                {OPTION_TYPES.includes(
                  question.type
                ) && (

                  <div className="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/60">

                    <div className="mb-3 flex items-center justify-between">

                      <span className="text-sm font-semibold">
                        Options
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          addOption(
                            question
                          )
                        }
                        className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-600"
                      >
                        <Plus
                          size={15}
                        />

                        Add option

                      </button>

                    </div>


                    <div className="space-y-2">

                      {(
                        question.options ??
                        []
                      ).map(
                        (
                          option,
                          optionIndex
                        ) => (

                          <div
                            key={`${question.id}-${optionIndex}`}
                            className="flex gap-2"
                          >

                            <input
                              value={
                                option.label
                              }
                              onChange={(
                                event
                              ) => {
                                const label =
                                  event.target
                                    .value;

                                updateOption(
                                  question,
                                  optionIndex,
                                  {
                                    label,
                                    value:
                                      uniqueOptionValue(
                                        question,
                                        label,
                                        optionIndex
                                      ),
                                  }
                                );
                              }}
                              className={
                                inputClass
                              }
                              placeholder={`Option ${optionIndex + 1}`}
                            />

                            <button
                              type="button"
                              onClick={() =>
                                removeOption(
                                  question,
                                  optionIndex
                                )
                              }
                              className="rounded-lg px-2 text-red-500"
                            >
                              <Trash2
                                size={16}
                              />
                            </button>

                          </div>

                        )
                      )}

                    </div>

                  </div>

                )}


                {/* CONDITIONS */}

                {questions.findIndex((q) => q.id === question.id) > 0 && (

                  <div className="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/60">

                    <div className="mb-3 flex items-center justify-between">

                      <span className="text-sm font-semibold">
                        Conditional visibility
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          addCondition(
                            question
                          )
                        }
                        className="text-sm font-semibold text-cyan-600"
                      >
                        + Add condition
                      </button>

                    </div>


                    {(
                      question.conditions ??
                      []
                    ).map(
                      (
                        condition,
                        conditionIndex
                      ) => (

                        <div
                          key={
                            conditionIndex
                          }
                          className="mb-2 grid gap-2 md:grid-cols-[1.4fr_1fr_1fr_auto]"
                        >

                          <Select
      value={condition.questionId}
      onChange={(value) =>
        updateCondition(
          question,
          conditionIndex,
          {
            questionId: value,
          }
        )
      }
      options={questions
        .filter(
          (candidate) =>
            candidate.id !== question.id
        )
        .map((candidate) => ({
          value: candidate.id,
          label: candidate.label,
        }))}
      className="w-full"
      triggerClassName={selectTriggerClass}
      ariaLabel="Condition question"
    />


                          <Select
      value={condition.operator}
      onChange={(value) =>
        updateCondition(
          question,
          conditionIndex,
          {
            operator:
              value as NonNullable<
                RequestQuestion["conditions"]
              >[number]["operator"],
          }
        )
      }
      options={[
        {
          value: "equals",
          label: "Equals",
        },
        {
          value: "not_equals",
          label: "Not equals",
        },
        {
          value: "contains",
          label: "Contains",
        },
        {
          value: "not_contains",
          label: "Does not contain",
        },
      ]}
      className="w-full"
      triggerClassName={selectTriggerClass}
      ariaLabel="Condition operator"
    />


                          <input
                            value={String(
                              condition.value ??
                                ""
                            )}
                            onChange={(
                              event
                            ) =>
                              updateCondition(
                                question,
                                conditionIndex,
                                {
                                  value:
                                    event
                                      .target
                                      .value,
                                }
                              )
                            }
                            className={
                              inputClass
                            }
                            placeholder="Value"
                          />


                          <button
                            type="button"
                            onClick={() =>
                              removeCondition(
                                question,
                                conditionIndex
                              )
                            }
                            className="rounded-lg px-2 text-red-500"
                          >
                            <Trash2
                              size={16}
                            />
                          </button>

                        </div>

                      )
                    )}

                  </div>

                )}
              </>
            )}

          </section>
        )
      )}


      {/* ADD FIELD */}

      <div className="relative">
        <button
          type="button"
          onClick={() => setAddFieldMenuOpen((open) => !open)}
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-700 hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300"
        >
          <Plus size={17} />
          Add Field
        </button>

        {addFieldMenuOpen && (
          <div className="absolute z-10 mt-2 w-72 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {TYPE_GROUPS.map((group) => (
              <div key={group.group} className="mb-3 last:mb-0">
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {group.group}
                </p>

                {group.types.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => addQuestion(type.value)}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      </>
      )}

      </div>

    </div>

      {/* ERROR */}

      {error && (

        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>

      )}


      {/* ACTIONS */}

      <div className="sticky bottom-0 z-30 -mx-2 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-2 py-4 shadow-[0_-4px_12px_-4px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">

        <button
          type="button"
          disabled={
            saving
          }
          onClick={() =>
            save("draft")
          }
          className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
        >
          Save Draft
        </button>


        <button
          type="button"
          disabled={
            saving
          }
          onClick={() =>
            save(
              "published"
            )
          }
          className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : saveLabel}
        </button>

      </div>

    </div>
  );
}
