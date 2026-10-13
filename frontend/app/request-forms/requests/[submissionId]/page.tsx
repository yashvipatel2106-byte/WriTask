"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import Navbar from "@/components/navbar/Navbar";
import Sidebar from "@/components/sidebar/sidebar";

import { useOrganization } from "@/components/context/organizationContext";

import {
  fetchAnswerImageUrl,
  fetchRequestSubmission,
  reviewRequestSubmission,
  type RequestSubmission,
  type UploadedAnswerImage,
} from "@/lib/requestForms";

import { toast } from "@/components/ui/toast";

export default function RequestReviewPage() {
  const params = useParams<{
    submissionId: string;
  }>();

  const router = useRouter();

  const {
    currentOrg,
    orgReady,
  } = useOrganization();

  const [request, setRequest] =
    useState<RequestSubmission | null>(null);

  const [reason, setReason] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [processing, setProcessing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  /*
   * Load request
   */
  useEffect(() => {
    if (
      !orgReady ||
      !currentOrg?.organizationId ||
      !params?.submissionId
    ) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const data =
          await fetchRequestSubmission(
            currentOrg.organizationId,
            params.submissionId
          );

        if (cancelled) {
          return;
        }

        if (!data) {
          setRequest(null);
          setError(
            "Unable to load this request."
          );
          return;
        }

        setRequest(data);
      } catch (err) {
        console.error(
          "Failed to load request:",
          err
        );

        if (!cancelled) {
          setRequest(null);
          setError(
            "Failed to load the request."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    orgReady,
    currentOrg?.organizationId,
    params?.submissionId,
  ]);

  /*
   * Approve / Reject request
   */
  const review = async (
    action: "approve" | "reject"
  ) => {
    if (!currentOrg?.organizationId) {
      toast.error(
        "Please select an organization first."
      );
      return;
    }

    if (!params?.submissionId) {
      toast.error(
        "Request ID is missing."
      );
      return;
    }

    if (
      action === "reject" &&
      !reason.trim()
    ) {
      toast.error(
        "Please enter a rejection reason."
      );
      return;
    }

    setProcessing(true);

    try {
      const response =
        await reviewRequestSubmission(
          currentOrg.organizationId,
          params.submissionId,
          action,
          reason.trim()
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        toast.error(
          data?.message ||
            "Unable to review request."
        );
        return;
      }

      toast.success(
        action === "approve"
          ? request?.project
            ? "Request approved and task created."
            : "Request approved."
          : "Request rejected."
      );

      router.push(
        "/request-forms/requests"
      );

      router.refresh();
    } catch (err) {
      console.error(
        "Request review error:",
        err
      );

      toast.error(
        "Something went wrong while reviewing the request."
      );
    } finally {
      setProcessing(false);
    }
  };

  /*
   * Textarea answers with an uploaded image attachment, resolved
   * against the form snapshot so labels stay correct even if the
   * live form has since changed.
   */
  const answerImages = useMemo(() => {
    if (!request?.formSnapshot?.questions || !request.answers) {
      return [];
    }

    const answersByQuestion = new Map(
      request.answers.map((a) => [a.questionId, a.value])
    );

    return request.formSnapshot.questions
      .filter(
        (question) =>
          question.type === "textarea" && question.allowImageAttachment
      )
      .map((question) => ({
        questionId: question.id,
        label: question.label,
        attachment: answersByQuestion.get(
          `${question.id}__attachment`
        ) as UploadedAnswerImage | undefined,
      }))
      .filter(
        (item): item is typeof item & { attachment: UploadedAnswerImage } =>
          Boolean(item.attachment?.filename)
      );
  }, [request]);

  /*
   * Loading state
   */
  if (
    !orgReady ||
    loading
  ) {
    return (
      <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />

        <div className="flex h-full">
          <Sidebar />

          <main className="ml-0 mt-18 flex min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70">
            <div className="w-full p-4 sm:p-6 lg:p-8">
              <div className="mx-auto max-w-5xl">
                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Loading request...
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  /*
   * Request loading error
   */
  if (error && !request) {
    return (
      <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />

        <div className="flex h-full">
          <Sidebar />

          <main className="ml-0 mt-18 flex min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70">
            <div className="w-full p-4 sm:p-6 lg:p-8">
              <div className="mx-auto max-w-5xl">
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      "/request-forms/requests"
                    )
                  }
                  className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
                >
                  <ArrowLeft size={16} />
                  Back to Request Inbox
                </button>

                <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/30">
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  /*
   * Request not found
   */
  if (!request) {
    return (
      <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
        <Navbar />

        <div className="flex h-full">
          <Sidebar />

          <main className="ml-0 mt-18 flex min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70">
            <div className="w-full p-4 sm:p-6 lg:p-8">
              <div className="mx-auto max-w-5xl">
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      "/request-forms/requests"
                    )
                  }
                  className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
                >
                  <ArrowLeft size={16} />
                  Back to Request Inbox
                </button>

                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Request not found.
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const pending =
    request.status === "pending";

  return (
    <div className="h-screen overflow-hidden bg-[#F6F9FC] dark:bg-slate-950">
      <Navbar />

      <div className="flex h-full">
        {/* Main WriTask Sidebar */}
        <Sidebar />

        <main className="ml-0 mt-18 flex min-h-0 flex-1 overflow-y-auto bg-[#F6F9FC] dark:bg-slate-950 lg:ml-70">
          <div className="flex min-h-full w-full flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:p-8">

            {/* Page Content */}
            <div className="min-w-0 flex-1">
              <div className="mx-auto max-w-3xl">

                {/* Back */}
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      "/request-forms/requests"
                    )
                  }
                  className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
                >
                  <ArrowLeft size={16} />
                  Back to Request Inbox
                </button>

                {/* Header */}
                <div className="mb-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                        {request.mapped?.title ||
                          "Request"}
                      </h1>

                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Project:{" "}
                        {request.project?.title ||
                          "Unknown"}
                      </p>
                    </div>

                    <span
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-semibold capitalize",
                        request.status ===
                        "pending"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                          : request.status ===
                              "approved"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
                      ].join(" ")}
                    >
                      {request.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-5">

                  {/* Request Details */}
                  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-400">
                      Request Details
                    </h2>

                    <div className="space-y-5">
                      <Detail
                        label="Submitted by"
                        value={
                          request.submittedBy
                            ?.username ||
                          request.submittedBy
                            ?.email ||
                          "Unknown"
                        }
                      />

                      <Detail
                        label="Form"
                        value={
                          request.form?.name ||
                          "Request Form"
                        }
                      />

                      <Detail
                        label="Project"
                        value={
                          request.project?.title || "None"
                        }
                      />

                      <Detail
                        label="Priority"
                        value={
                          request.mapped
                            ?.priority ||
                          "medium"
                        }
                      />

                      <Detail
                        label="Status"
                        value={
                          request.status
                        }
                      />

                      {request.mapped
                        ?.description && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Description
                          </p>

                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">
                            {
                              request.mapped
                                .description
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Attached Images */}
                  {answerImages.length > 0 && (
                    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-400">
                        Attached Images
                      </h2>

                      <div className="space-y-5">
                        {answerImages.map((item) => (
                          <div key={item.questionId}>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                              {item.label}
                            </p>
                            <AnswerImage
                              orgId={currentOrg?.organizationId}
                              formId={request.form?._id}
                              attachment={item.attachment}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Completed Request */}
                  {!pending && (
                    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
                        Review Result
                      </h2>

                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Status:{" "}
                        <strong className="capitalize">
                          {request.status}
                        </strong>
                      </p>

                      {request.status === "approved" &&
                        !request.reviewedBy && (
                          <p className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-300">
                            Your request was automatically approved
                            because this form does not require approval.
                          </p>
                        )}

                      {request.rejectionReason && (
                        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
                          <p className="text-xs font-semibold uppercase tracking-wide text-red-500 dark:text-red-400">
                            Rejection Reason
                          </p>

                          <p className="mt-1 text-sm leading-6 text-red-700 dark:text-red-300">
                            {
                              request.rejectionReason
                            }
                          </p>
                        </div>
                      )}

                      {request.task && (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              !request.project
                                ?._id ||
                              !request.task
                                ?._id
                            ) {
                              return;
                            }

                            router.push(
                              `/projects/${request.project._id}?task=${request.task._id}`
                            );
                          }}
                          className="mt-5 inline-flex items-center rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
                        >
                          Open Created Task
                        </button>
                      )}
                    </section>
                  )}

                  {/* Review */}
                  {pending && !request.project && (
                    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
                        Review Request
                      </h2>

                      <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                        The task cannot be created because no project is
                        assigned to this form.
                      </p>
                    </section>
                  )}

                  {pending && request.project && (
                    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
                        Review Request
                      </h2>

                      <p className="mb-5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Review this request and approve it to create the
                        corresponding task, or reject it with a reason.
                      </p>

                      <textarea
                        rows={4}
                        value={reason}
                        onChange={(event) =>
                          setReason(
                            event.target.value
                          )
                        }
                        disabled={processing}
                        placeholder="Rejection reason (required when rejecting)"
                        className="mb-4 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />

                      <div className="flex flex-wrap justify-end gap-3">

                        {/* Reject */}
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() =>
                            review(
                              "reject"
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                        >
                          <XCircle
                            size={17}
                          />

                          {processing
                            ? "Processing..."
                            : "Reject"}
                        </button>

                        {/* Approve */}
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() =>
                            review(
                              "approve"
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <CheckCircle2
                            size={17}
                          />

                          {processing
                            ? "Processing..."
                            : "Approve & Create Task"}
                        </button>
                      </div>
                    </section>
                  )}

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
 * Reusable detail row
 */
function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300">
        {value}
      </p>
    </div>
  );
}

function AnswerImage({
  orgId,
  formId,
  attachment,
}: {
  orgId?: string;
  formId?: string;
  attachment: UploadedAnswerImage;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!orgId || !formId || !attachment.filename) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    fetchAnswerImageUrl(orgId, formId, attachment.filename)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [orgId, formId, attachment.filename]);

  if (failed) {
    return (
      <p className="text-sm text-red-500">
        Failed to load {attachment.originalName || "image"}.
      </p>
    );
  }

  if (!imageUrl) {
    return (
      <div className="h-40 w-full max-w-sm animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={attachment.originalName || "Attached image"}
      className="max-h-96 max-w-full rounded-xl border border-slate-200 object-contain dark:border-slate-700"
    />
  );
}