"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Send,
  CheckCircle2,
} from "lucide-react";

import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";

import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";

import {
  fetchRequestForm,
  fetchRequestProjects,
  submitRequestForm,
  uploadAnswerImage,
  type RequestForm,
  type RequestFormPage,
  type RequestProject,
  type RequestProjectMember,
  type RequestQuestion,
  type UploadedAnswerImage,
} from "@/lib/requestForms";

import { PRIORITY_OPTIONS } from "@/lib/constants/taskPriority";

import { toast } from "@/components/ui/toast";
import Select from "@/components/ui/Select";

const selectTriggerClass = (open: boolean) =>
  `flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950 dark:text-slate-100 ${
    open
      ? "border-cyan-500 ring-2 ring-cyan-100 dark:border-cyan-500 dark:ring-cyan-500/20"
      : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
  }`;

const LOGO_SIZE_PX: Record<"s" | "m" | "l", number> = {
  s: 28,
  m: 40,
  l: 56,
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

const ALIGN_CLASS: Record<"left" | "center" | "right", string> = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};

export default function SubmitRequestFormPage() {
  const params = useParams<{ formId: string }>();
  const router = useRouter();

  const { currentOrg, orgReady } =
    useOrganization();

  const { can } = useOrgPermission();

  const [form, setForm] =
    useState<RequestForm | null>(null);

  const [projects, setProjects] =
    useState<RequestProject[]>([]);

  const [answers, setAnswers] =
    useState<Record<string, unknown>>({});

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  /** Off by default — the requester decides whether their answers go in the confirmation email. */
  const [includeResponsesInEmail, setIncludeResponsesInEmail] =
    useState(false);

  /*
   * -------------------------------------------------------
   * LOAD FORM + PROJECTS
   * -------------------------------------------------------
   */
  useEffect(() => {
    if (
      !orgReady ||
      !currentOrg?.organizationId ||
      !params.formId
    ) {
      return;
    }

    const load = async () => {
      setLoading(true);

      try {
        const [
          formData,
          projectData,
        ] = await Promise.all([
          fetchRequestForm(
            currentOrg.organizationId,
            params.formId
          ),

          fetchRequestProjects(
            currentOrg.organizationId
          ),
        ]);

        setForm(formData);
        setProjects(projectData);
      } catch (error) {
        console.error(
          "Failed to load request form:",
          error
        );

        setForm(null);
        setProjects([]);

        toast.error(
          "Failed to load request form."
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [
    orgReady,
    currentOrg?.organizationId,
    params.formId,
  ]);

  /*
   * -------------------------------------------------------
   * ANSWERS MAP
   * -------------------------------------------------------
   */
  const answersMap = answers;

  /*
   * -------------------------------------------------------
   * CONDITIONAL QUESTION VISIBILITY
   * -------------------------------------------------------
   */
  const isVisible = useMemo(() => {
    return (
      question: RequestQuestion
    ) => {
      if (
        !question.conditions ||
        question.conditions.length === 0
      ) {
        return true;
      }

      return question.conditions.every(
        (condition) => {
          const actual =
            answersMap[
              condition.questionId
            ];

          if (
            condition.operator ===
            "equals"
          ) {
            return (
              String(actual ?? "") ===
              String(
                condition.value ?? ""
              )
            );
          }

          if (
            condition.operator ===
            "not_equals"
          ) {
            return (
              String(actual ?? "") !==
              String(
                condition.value ?? ""
              )
            );
          }

          if (
            condition.operator ===
            "contains"
          ) {
            if (
              Array.isArray(actual)
            ) {
              return actual
                .map(String)
                .includes(
                  String(
                    condition.value
                  )
                );
            }

            return String(
              actual ?? ""
            )
              .toLowerCase()
              .includes(
                String(
                  condition.value ?? ""
                ).toLowerCase()
              );
          }

          if (
            condition.operator ===
            "not_contains"
          ) {
            if (
              Array.isArray(actual)
            ) {
              return !actual
                .map(String)
                .includes(
                  String(
                    condition.value
                  )
                );
            }

            return !String(
              actual ?? ""
            )
              .toLowerCase()
              .includes(
                String(
                  condition.value ?? ""
                ).toLowerCase()
              );
          }

          return false;
        }
      );
    };
  }, [answersMap]);

  /*
   * -------------------------------------------------------
   * PAGES
   * -------------------------------------------------------
   */
  const saveToProjectId = form?.saveTo?.project || null;

  const sortedPages: RequestFormPage[] = useMemo(() => {
    const pages = (form?.pages || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return pages.length > 0
      ? pages
      : [{ id: "__default__", title: form?.name || "Request" }];
  }, [form]);

  const sortedQuestions = useMemo(
    () =>
      (form?.questions || [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [form]
  );

  /*
   * A question's effective page: its own pageId when that page
   * still exists, otherwise the first page. This guarantees a
   * field can never silently disappear (e.g. because it was never
   * assigned a page, or was assigned to a page that was later
   * renamed/removed/recreated with a different id).
   */
  const effectivePageId = (question: RequestQuestion) => {
    if (sortedPages.length <= 1) return sortedPages[0]?.id;

    const validIds = new Set(sortedPages.map((p) => p.id));

    return question.pageId && validIds.has(question.pageId)
      ? question.pageId
      : sortedPages[0]?.id;
  };

  const questionsForPage = (pageId: string) =>
    sortedQuestions.filter(
      (question) => effectivePageId(question) === pageId
    );

  const currentPage = sortedPages[currentPageIndex] || sortedPages[0];
  const isLastPage = currentPageIndex >= sortedPages.length - 1;
  const currentPageQuestions = currentPage
    ? questionsForPage(currentPage.id)
    : [];

  /*
   * The project this submission is tied to: the form's fixed "Save
   * To" project, or whichever project the requester picked via a
   * "wri_project"-mapped field (there's no separate top-level
   * project picker anymore).
   */
  const projectMappedQuestion = sortedQuestions.find(
    (q) => q.mapping === "project"
  );

  const effectiveProjectId =
    saveToProjectId ||
    (projectMappedQuestion
      ? String(answers[projectMappedQuestion.id] ?? "")
      : "");

  /*
   * Assignee options come from the current project's members +
   * owner (populated by the accessible-projects endpoint).
   */
  const assigneeOptions: RequestProjectMember[] = useMemo(() => {
    const project = projects.find((p) => p._id === effectiveProjectId);
    if (!project) return [];

    const members = (project.members || [])
      .map((m) => m.user)
      .filter((u): u is RequestProjectMember => Boolean(u?._id));

    const withOwner = project.owner?._id
      ? [project.owner, ...members]
      : members;

    const seen = new Set<string>();
    return withOwner.filter((member) => {
      if (seen.has(member._id)) return false;
      seen.add(member._id);
      return true;
    });
  }, [projects, effectiveProjectId]);

  /*
   * -------------------------------------------------------
   * UPDATE ANSWER
   * -------------------------------------------------------
   */
  const updateAnswer = (
    questionId: string,
    value: unknown
  ) => {
    setAnswers((previous) => ({
      ...previous,
      [questionId]: value,
    }));
  };

  /*
   * -------------------------------------------------------
   * SUBMIT
   * -------------------------------------------------------
   */
  const submit = async () => {
    if (
      !currentOrg?.organizationId ||
      !form ||
      submitting
    ) {
      return;
    }

    /*
     * Validate required visible questions.
     */
    for (
      const question of
        form.questions || []
    ) {
      if (!isVisible(question)) {
        continue;
      }

      if (!question.required) {
        continue;
      }

      // Section headers collect no value. Attachment uploads are
      // not wired up yet, so requiring one would block submission
      // for something the requester can't actually fulfill.
      if (
        question.type === "section_header" ||
        question.type === "attachment"
      ) {
        continue;
      }

      const value =
        answers[question.id];

      const empty =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) &&
          value.length === 0);

      if (empty) {
        toast.error(
          `${question.label} is required.`
        );
        return;
      }
    }

    setSubmitting(true);

    try {
      const response =
        await submitRequestForm(
          currentOrg.organizationId,
          form._id,
          {
            includeResponsesInEmail,

            answers:
              Object.entries(
                answers
              ).map(
                ([questionId, value]) => ({
                  questionId,
                  value,
                })
              ),
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        toast.error(
          data.message ||
            "Failed to submit request."
        );

        return;
      }

      /*
       * ---------------------------------------------------
       * SUCCESS
       * ---------------------------------------------------
       */
      toast.success(
        "Request submitted for review."
      );

      /*
       * Go back to the main Request Forms page. Forms stay in
       * Available Forms even after being submitted, so the user
       * can open this same form again for another request.
       */
      router.push(
        "/request-forms"
      );

      router.refresh();
    } catch (error) {
      console.error(
        "Submit request error:",
        error
      );

      toast.error(
        "Something went wrong while submitting."
      );
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * -------------------------------------------------------
   * LOADING STATE
   * -------------------------------------------------------
   */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />
        <Sidebar />

        <main className="ml-0 mt-18 p-8 lg:ml-70">
          <div className="dashboard-widget">
            Loading form...
          </div>
        </main>
      </div>
    );
  }

  /*
   * -------------------------------------------------------
   * NO PERMISSION
   * -------------------------------------------------------
   */
  if (!can("requestForm:submit")) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />
        <Sidebar />

        <main className="ml-0 mt-18 p-8 lg:ml-70">
          <div className="dashboard-widget text-sm text-slate-600 dark:text-slate-300">
            You do not have permission to submit request forms.
          </div>
        </main>
      </div>
    );
  }

  /*
   * -------------------------------------------------------
   * FORM NOT FOUND
   * -------------------------------------------------------
   */
  if (!form) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />
        <Sidebar />

        <main className="ml-0 mt-18 p-8 lg:ml-70">
          <div className="dashboard-widget">
            Request form not found.
          </div>
        </main>
      </div>
    );
  }

  /*
   * -------------------------------------------------------
   * MAIN PAGE
   * -------------------------------------------------------
   */
  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
      <Navbar />

      <div className="flex h-full">
        <Sidebar />

        <main className="ml-0 mt-18 flex h-[calc(100vh-72px)] min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70">
          <div className="flex min-h-full w-full flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:p-8">

            <div className="min-w-0 flex-1">
              <div className="mx-auto max-w-3xl">

                {/* ------------------------------------------------
                    BACK
                ------------------------------------------------ */}
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      "/request-forms"
                    )
                  }
                  className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-cyan-600 dark:text-slate-400"
                >
                  <ArrowLeft
                    size={16}
                  />

                  Back to Request Forms
                </button>

                {/* ------------------------------------------------
                    HEADER (design-configured logo/background)
                ------------------------------------------------ */}
                {(() => {
                  const align = form.design?.logoAlign || "left";
                  const textColor = contrastTextColor(
                    form.design?.backgroundColor
                  );

                  return (
                    <div
                      className={`mb-6 flex flex-col rounded-3xl border border-slate-200 p-6 dark:border-slate-800 ${ALIGN_CLASS[align]}`}
                      style={
                        form.design?.backgroundColor
                          ? { background: form.design.backgroundColor }
                          : undefined
                      }
                    >
                      {form.design?.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={form.design.logoUrl}
                          alt={form.design.logoAltText || "Logo"}
                          style={{
                            height:
                              LOGO_SIZE_PX[form.design.logoSize || "s"],
                          }}
                          className="mb-4 object-contain"
                        />
                      )}

                      <h1
                        className={
                          textColor
                            ? "text-3xl font-bold"
                            : "text-3xl font-bold text-slate-800 dark:text-slate-100"
                        }
                        style={textColor ? { color: textColor } : undefined}
                      >
                        {form.design?.logoAltText || form.name}
                      </h1>

                      <p
                        className={
                          textColor
                            ? "mt-2"
                            : "mt-2 text-slate-500 dark:text-slate-400"
                        }
                        style={
                          textColor
                            ? { color: textColor, opacity: 0.85 }
                            : undefined
                        }
                      >
                        {form.description || "Submit a new request."}
                      </p>
                    </div>
                  );
                })()}


                <div className="space-y-5">

                  {/* ------------------------------------------------
                      FIELDS (current page)
                  ------------------------------------------------ */}
                  {currentPageQuestions.map(
                      (question) => {
                        if (
                          !isVisible(
                            question
                          )
                        ) {
                          return null;
                        }

                        const value =
                          answers[
                            question.id
                          ];

                        return (
                          <QuestionField
                            key={
                              question.id
                            }
                            question={
                              question
                            }
                            value={
                              value
                            }
                            attachment={
                              answers[
                                `${question.id}__attachment`
                              ] as UploadedAnswerImage | undefined
                            }
                            orgId={currentOrg?.organizationId}
                            formId={form._id}
                            projects={projects}
                            assigneeOptions={assigneeOptions}
                            onChange={(
                              nextValue
                            ) =>
                              updateAnswer(
                                question.id,
                                nextValue
                              )
                            }
                            onAttachmentChange={(meta) =>
                              updateAnswer(
                                `${question.id}__attachment`,
                                meta
                              )
                            }
                          />
                        );
                      }
                    )}

                  {isLastPage && (
                    <label className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={includeResponsesInEmail}
                        onChange={(event) =>
                          setIncludeResponsesInEmail(event.target.checked)
                        }
                        className="mt-0.5 accent-cyan-600"
                      />
                      Include my responses in the email
                    </label>
                  )}

                  {/* ------------------------------------------------
                      ACTIONS
                  ------------------------------------------------ */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5 pb-10 dark:border-slate-800">

                    <div className="flex items-center gap-4">
                      {!form.design?.hideBranding && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          Powered by WriTask
                        </span>
                      )}

                      {sortedPages.length > 1 && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            {sortedPages.map((page, index) => (
                              <span
                                key={page.id}
                                title={page.title}
                                className={[
                                  "h-1.5 w-6 rounded-full transition-colors",
                                  index === currentPageIndex
                                    ? "bg-cyan-600"
                                    : index < currentPageIndex
                                      ? "bg-cyan-300 dark:bg-cyan-800"
                                      : "bg-slate-200 dark:bg-slate-700",
                                ].join(" ")}
                              />
                            ))}
                          </div>

                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Page {currentPageIndex + 1} of {sortedPages.length}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">

                    <button
                      type="button"
                      disabled={
                        submitting
                      }
                      onClick={() =>
                        currentPageIndex === 0
                          ? router.push("/request-forms")
                          : setCurrentPageIndex((i) => i - 1)
                      }
                      className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {currentPageIndex === 0 ? "Cancel" : "Back"}
                    </button>

                    {!isLastPage ? (
                      <button
                        type="button"
                        onClick={() => setCurrentPageIndex((i) => i + 1)}
                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700"
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={
                          submit
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting ? (
                          <CheckCircle2
                            size={17}
                            className="animate-pulse"
                          />
                        ) : (
                          <Send
                            size={17}
                          />
                        )}

                        {submitting
                          ? "Submitting..."
                          : "Submit Request"}
                      </button>
                    )}

                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}

/*
 * =========================================================
 * QUESTION FIELD
 * =========================================================
 */

function QuestionField({
  question,
  value,
  attachment,
  orgId,
  formId,
  projects = [],
  assigneeOptions = [],
  onChange,
  onAttachmentChange,
}: {
  question: RequestQuestion;
  value: unknown;
  attachment?: UploadedAnswerImage;
  orgId?: string;
  formId?: string;
  projects?: RequestProject[];
  assigneeOptions?: RequestProjectMember[];
  onChange: (
    value: unknown
  ) => void;
  onAttachmentChange?: (
    meta: UploadedAnswerImage | undefined
  ) => void;
}) {
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageSelect = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !orgId || !formId || !onAttachmentChange) return;

    setUploadingImage(true);
    try {
      const meta = await uploadAnswerImage(orgId, formId, file);
      onAttachmentChange(meta);
    } catch (error) {
      console.error("Failed to upload image:", error);
      toast.error("Failed to upload image.");
    } finally {
      setUploadingImage(false);
    }
  };
  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-cyan-950";

  if (question.type === "section_header") {
    return (
      <div className="pt-2">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {question.label}
        </h2>
        {question.helpText && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {question.helpText}
          </p>
        )}
        <div className="mt-3 border-t border-slate-200 dark:border-slate-800" />
      </div>
    );
  }

  const label = (
    <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
      {question.label}

      {question.required && (
        <span className="ml-1 text-red-500">
          *
        </span>
      )}
    </label>
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">

      {label}

      {question.helpText && (
        <p className="-mt-1 mb-3 text-xs text-slate-500 dark:text-slate-400">
          {question.helpText}
        </p>
      )}

      {/* ------------------------------------------------
          TEXT
      ------------------------------------------------ */}
      {question.type ===
        "text" && (
        <input
          value={String(
            value ?? ""
          )}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={
            question.placeholder
          }
          className={inputClass}
        />
      )}

      {/* ------------------------------------------------
          TEXTAREA
      ------------------------------------------------ */}
      {question.type ===
        "textarea" && (
        <textarea
          rows={5}
          value={String(
            value ?? ""
          )}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={
            question.placeholder
          }
          className={inputClass}
        />
      )}

      {question.type === "textarea" &&
        question.allowImageAttachment && (
          <div className="mt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {uploadingImage ? "Uploading..." : "Attach image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingImage}
                onChange={handleImageSelect}
              />
            </label>

            {attachment && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Attached: {attachment.originalName}
              </p>
            )}
          </div>
        )}

      {/* ------------------------------------------------
          NUMBER
      ------------------------------------------------ */}
      {question.type ===
        "number" && (
        <input
          type="number"
          value={
            value === undefined
              ? ""
              : String(value)
          }
          onChange={(event) =>
            onChange(
              event.target.value ===
                ""
                ? ""
                : Number(
                    event.target.value
                  )
            )
          }
          className={inputClass}
        />
      )}

      {/* ------------------------------------------------
          EMAIL
      ------------------------------------------------ */}
      {question.type ===
        "email" && (
        <input
          type="email"
          value={String(
            value ?? ""
          )}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={
            question.placeholder
          }
          className={inputClass}
        />
      )}

      {/* ------------------------------------------------
          DATE
      ------------------------------------------------ */}
      {question.type ===
        "date" && (
        <input
          type="date"
          value={String(
            value ?? ""
          )}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          className={inputClass}
        />
      )}

      {/* ------------------------------------------------
          SINGLE SELECT
      ------------------------------------------------ */}
      {question.type ===
        "single_select" && (
        <Select
          value={String(value ?? "")}
          onChange={onChange}
          placeholder="Select an option"
          options={(question.options || []).map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          className="w-full"
          triggerClassName={selectTriggerClass}
          ariaLabel={question.label}
        />
      )}

      {/* ------------------------------------------------
          MULTIPLE SELECT
      ------------------------------------------------ */}
      {question.type ===
        "multiple_select" && (
        <div className="space-y-2">
          {(
            question.options || []
          ).map((option) => {
            const selected =
              Array.isArray(
                value
              )
                ? value
                    .map(String)
                    .includes(
                      option.value
                    )
                : false;

            return (
              <label
                key={
                  option.value
                }
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={
                    selected
                  }
                  onChange={(
                    event
                  ) => {
                    const current =
                      Array.isArray(
                        value
                      )
                        ? value.map(
                            String
                          )
                        : [];

                    const next =
                      event.target
                        .checked
                        ? [
                            ...current,
                            option.value,
                          ]
                        : current.filter(
                            (
                              item
                            ) =>
                              item !==
                              option.value
                          );

                    onChange(
                      next
                    );
                  }}
                  className="h-4 w-4 accent-cyan-600"
                />

                <span className="text-sm text-slate-700 dark:text-slate-200">
                  {
                    option.label
                  }
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------
          CHECKBOX
      ------------------------------------------------ */}
      {question.type ===
        "checkbox" && (
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(
              value
            )}
            onChange={(event) =>
              onChange(
                event.target.checked
              )
            }
            className="h-4 w-4 accent-cyan-600"
          />

          <span className="text-sm text-slate-600 dark:text-slate-300">
            Yes
          </span>
        </label>
      )}

      {/* ------------------------------------------------
          PHONE
      ------------------------------------------------ */}
      {question.type === "phone" && (
        <input
          type="tel"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          placeholder={question.placeholder}
          className={inputClass}
        />
      )}

      {/* ------------------------------------------------
          DATE & TIME
      ------------------------------------------------ */}
      {question.type === "datetime" && (
        <input
          type="datetime-local"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      )}

      {/* ------------------------------------------------
          PERCENTAGE
      ------------------------------------------------ */}
      {question.type === "percentage" && (
        <div className="relative">
          <input
            type="number"
            min={0}
            max={100}
            value={value === undefined ? "" : String(value)}
            onChange={(event) =>
              onChange(
                event.target.value === "" ? "" : Number(event.target.value)
              )
            }
            className={`${inputClass} pr-10`}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            %
          </span>
        </div>
      )}

      {/* ------------------------------------------------
          RADIO
      ------------------------------------------------ */}
      {question.type === "radio" && (
        <div className="space-y-2">
          {(question.options || []).map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <input
                type="radio"
                name={question.id}
                checked={String(value ?? "") === option.value}
                onChange={() => onChange(option.value)}
                className="h-4 w-4 accent-cyan-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* ------------------------------------------------
          WRITASK: PROJECT
      ------------------------------------------------ */}
      {question.type === "wri_project" && (
        <Select
          value={String(value ?? "")}
          onChange={onChange}
          placeholder="Select a project"
          options={projects.map((project) => ({
            value: project._id,
            label: project.title,
          }))}
          className="w-full"
          triggerClassName={selectTriggerClass}
          ariaLabel={question.label}
        />
      )}

      {/* ------------------------------------------------
          WRITASK: ASSIGNEE
      ------------------------------------------------ */}
      {question.type === "wri_assignee" && (
        <Select
          value={String(value ?? "")}
          onChange={onChange}
          placeholder="Unassigned"
          options={assigneeOptions.map((member) => ({
            value: member._id,
            label: member.username || member.email || "Member",
          }))}
          className="w-full"
          triggerClassName={selectTriggerClass}
          ariaLabel={question.label}
        />
      )}

      {/* ------------------------------------------------
          WRITASK: PRIORITY
      ------------------------------------------------ */}
      {question.type === "wri_priority" && (
        <Select
          value={String(value ?? "")}
          onChange={onChange}
          placeholder="Select a priority"
          options={PRIORITY_OPTIONS}
          className="w-full"
          triggerClassName={selectTriggerClass}
          ariaLabel={question.label}
        />
      )}

      {/* ------------------------------------------------
          WRITASK: STATUS
      ------------------------------------------------ */}
      {question.type === "wri_status" && (
        <Select
          value={String(value ?? "")}
          onChange={onChange}
          placeholder="Select a status"
          options={[
            { value: "todo", label: "To Do" },
            { value: "in_progress", label: "In Progress" },
            { value: "done", label: "Done" },
          ]}
          className="w-full"
          triggerClassName={selectTriggerClass}
          ariaLabel={question.label}
        />
      )}

      {/* ------------------------------------------------
          WRITASK: DUE DATE / START DATE
      ------------------------------------------------ */}
      {(question.type === "wri_due_date" ||
        question.type === "wri_start_date") && (
        <input
          type="date"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      )}

      {/* ------------------------------------------------
          WRITASK: CUSTOM FIELD (generic text for now)
      ------------------------------------------------ */}
      {question.type === "wri_custom_field" && (
        <input
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          placeholder={question.placeholder}
          className={inputClass}
        />
      )}

      {/* ------------------------------------------------
          ATTACHMENT (file uploads not yet wired to storage)
      ------------------------------------------------ */}
      {question.type === "attachment" && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-400">
          File attachments for request forms are coming soon.
        </div>
      )}
    </section>
  );
}