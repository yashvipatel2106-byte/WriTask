import { authFetch } from "@/lib/validation/authFetch";
import { readStoredWorkspaceId } from "@/lib/workspaceStorage";

export type RequestQuestionType =
  // Text
  | "text"
  | "textarea"
  | "email"
  | "phone"
  // Selection
  | "single_select"
  | "multiple_select"
  | "radio"
  | "checkbox"
  // Date/time
  | "date"
  | "datetime"
  // Numeric
  | "number"
  | "percentage"
  // WriTask-related
  | "wri_project"
  | "wri_assignee"
  | "wri_priority"
  | "wri_status"
  | "wri_due_date"
  | "wri_start_date"
  | "wri_custom_field"
  // Files
  | "attachment"
  // Structure (not answerable)
  | "section_header";

export type RequestQuestion = {
  id: string;
  label: string;
  type: RequestQuestionType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  /** Only meaningful for "textarea" — lets the requester attach an image. */
  allowImageAttachment?: boolean;
  options?: {
    label: string;
    value: string;
  }[];
  conditions?: {
    questionId: string;
    operator:
      | "equals"
      | "not_equals"
      | "contains"
      | "not_contains";
    value: unknown;
  }[];
  mapping?:
    | "none"
    | "title"
    | "description"
    | "priority"
    | "assignee"
    | "dueDate"
    | "project";
  order?: number;
  /** Which page this field belongs to; undefined/null = the form's single implicit page. */
  pageId?: string | null;
  customFieldId?: string | null;
};

export type RequestFormPage = {
  id: string;
  title: string;
  order?: number;
};

export type RequestForm = {
  _id: string;

  organization: string;

  name: string;

  description?: string;

  status:
    | "draft"
    | "published"
    | "disabled"
    | "archived";

  questions: RequestQuestion[];

  pages?: RequestFormPage[];

  approvalRequired?: boolean;

  saveTo?: {
    project?: string | null;
  };

  assignTo?: {
    mode?: "me" | "specific" | "everyone";
    users?: string[];
  };

  sharing?: {
    visibility?: "organization" | "specific_projects";
    publicEnabled?: boolean;
    publicToken?: string | null;
  };

  design?: {
    logoUrl?: string;
    logoAltText?: string;
    logoSize?: "s" | "m" | "l";
    logoAlign?: "left" | "center" | "right";
    backgroundColor?: string;
    hideBranding?: boolean;
  };

  emailConfig?: {
    senderName?: string;
    greeting?: string;
    message?: string;
    closing?: string;
    useAccountLogo?: boolean;
  };

  createdBy?: {
    _id: string;
    username?: string;
    email?: string;
    avatarColor?: string;
  };

  createdAt?: string;

  updatedAt?: string;
};


export type RequestProjectMember = {
  _id: string;
  username?: string;
  email?: string;
  avatarColor?: string;
};

export type RequestProject = {
  _id: string;
  title: string;
  status: string;
  owner?: RequestProjectMember;
  members?: { user?: RequestProjectMember; role?: string }[];
};

export type RequestSubmission = {
  _id: string;
  status: "pending" | "approved" | "rejected";
  form?: {
    _id: string;
    name: string;
  };
  project?: {
    _id: string;
    title: string;
    owner?: string;
  };
  submittedBy?: {
    _id: string;
    username?: string;
    email?: string;
  };
  mapped?: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
  };
  answers?: { questionId: string; value: unknown }[];
  formSnapshot?: {
    name?: string;
    questions?: RequestQuestion[];
  };
  /** Set only when a human reviewed it; absent/null means auto-approved. */
  reviewedBy?: { _id: string; username?: string } | string | null;
  reviewedAt?: string | null;
  rejectionReason?: string;
  includeResponsesInEmail?: boolean;
  task?: {
    _id: string;
    title: string;
    status: string;
  };
  createdAt: string;
};

function orgQuery(orgId: string) {
  const params = new URLSearchParams({ organizationId: orgId });
  const workspaceId = readStoredWorkspaceId();
  if (workspaceId) params.set("workspaceId", workspaceId);
  return `?${params.toString()}`;
}

/** Adds organizationId + the active workspaceId (if any) to a request body. */
function scopedBody<T extends object>(orgId: string, payload: T) {
  const workspaceId = readStoredWorkspaceId();
  return {
    organizationId: orgId,
    ...(workspaceId ? { workspaceId } : {}),
    ...payload,
  };
}

export async function fetchRequestForms(
  orgId: string
) {
  const res = await authFetch(
    `/request-forms${orgQuery(orgId)}`
  );

  if (!res.ok) return [];

  const data = await res.json();

  return Array.isArray(data)
    ? (data as RequestForm[])
    : [];
}

export async function fetchRequestForm(
  orgId: string,
  formId: string
) {
  const res = await authFetch(
    `/request-forms/${formId}${orgQuery(orgId)}`
  );

  if (!res.ok) return null;

  return (await res.json()) as RequestForm;
}

export type RequestFormSavePayload = {
  name: string;
  description?: string;
  status?: "draft" | "published" | "disabled" | "archived";
  questions: RequestQuestion[];
  pages?: RequestFormPage[];
  approvalRequired?: boolean;
  saveTo?: { project?: string | null };
  assignTo?: { mode?: "me" | "specific" | "everyone"; users?: string[] };
  design?: {
    logoUrl?: string;
    logoAltText?: string;
    logoSize?: "s" | "m" | "l";
    logoAlign?: "left" | "center" | "right";
    backgroundColor?: string;
    hideBranding?: boolean;
  };
  emailConfig?: {
    senderName?: string;
    greeting?: string;
    message?: string;
    closing?: string;
    useAccountLogo?: boolean;
  };
};

export async function createRequestForm(
  orgId: string,
  payload: RequestFormSavePayload
) {
  return authFetch("/request-forms", {
    method: "POST",
    body: JSON.stringify(scopedBody(orgId, payload)),
  });
}

export async function updateRequestForm(
  orgId: string,
  formId: string,
  payload: Partial<RequestFormSavePayload>
) {
  return authFetch(
    `/request-forms/${formId}`,
    {
      method: "PUT",
      body: JSON.stringify(scopedBody(orgId, payload)),
    }
  );
}

function requestFormLifecycleAction(
  orgId: string,
  formId: string,
  action: "publish" | "disable" | "archive"
) {
  return authFetch(`/request-forms/${formId}/${action}`, {
    method: "POST",
    body: JSON.stringify(scopedBody(orgId, {})),
  });
}

export const publishRequestForm = (orgId: string, formId: string) =>
  requestFormLifecycleAction(orgId, formId, "publish");

export const disableRequestForm = (orgId: string, formId: string) =>
  requestFormLifecycleAction(orgId, formId, "disable");

export const archiveRequestForm = (orgId: string, formId: string) =>
  requestFormLifecycleAction(orgId, formId, "archive");


export async function fetchRequestProjects(
  orgId: string
) {
  const res = await authFetch(
    `/request-forms/projects${orgQuery(orgId)}`
  );

  if (!res.ok) return [];

  const data = await res.json();

  return Array.isArray(data)
    ? (data as RequestProject[])
    : [];
}

/**
 * Every member of the organization (not scoped to a single
 * project) — reuses the existing org members endpoint, the same
 * one that powers the Members settings page.
 */
export async function fetchOrganizationMembers(
  orgId: string
): Promise<RequestProjectMember[]> {
  const res = await authFetch(`/organizations/${orgId}/members`);

  if (!res.ok) return [];

  const data = await res.json();

  if (!Array.isArray(data)) return [];

  return data
    .map((entry: { user?: RequestProjectMember }) => entry.user)
    .filter((user): user is RequestProjectMember => Boolean(user?._id));
}

export async function submitRequestForm(
  orgId: string,
  formId: string,
  payload: {
    projectId?: string;
    answers: {
      questionId: string;
      value: unknown;
    }[];
    /** The requester's own choice — include their answers in the confirmation email. */
    includeResponsesInEmail?: boolean;
  }
) {
  return authFetch(
    `/request-forms/${formId}/submit`,
    {
      method: "POST",
      body: JSON.stringify(scopedBody(orgId, payload)),
    }
  );
}

export type UploadedAnswerImage = {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
};

/** Uploads an image for a "textarea" answer with image attachments enabled. */
export async function uploadAnswerImage(
  orgId: string,
  formId: string,
  file: File
): Promise<UploadedAnswerImage> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await authFetch(
    `/request-forms/${formId}/upload-image${orgQuery(orgId)}`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || "Failed to upload image.");
  }

  return data as UploadedAnswerImage;
}

/** Fetches a protected answer image as a blob URL (for <img src>). */
export async function fetchAnswerImageUrl(
  orgId: string,
  formId: string,
  filename: string
): Promise<string> {
  const res = await authFetch(
    `/request-forms/${formId}/attachments/${filename}${orgQuery(orgId)}`
  );

  if (!res.ok) {
    throw new Error("Failed to load image.");
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchRequestSubmissions(
  orgId: string
) {
  const res = await authFetch(
    `/request-forms/submissions${orgQuery(orgId)}`
  );

  if (!res.ok) return [];

  const data = await res.json();

  return Array.isArray(data)
    ? (data as RequestSubmission[])
    : [];
}

export async function fetchRequestSubmission(
  orgId: string,
  submissionId: string
) {
  const res = await authFetch(
    `/request-forms/submissions/${submissionId}${orgQuery(
      orgId
    )}`
  );

  if (!res.ok) return null;

  return (await res.json()) as RequestSubmission;
}

export async function reviewRequestSubmission(
  orgId: string,
  submissionId: string,
  action: "approve" | "reject",
  reason?: string
) {
  return authFetch(
    `/request-forms/submissions/${submissionId}/review`,
    {
      method: "POST",
      body: JSON.stringify(scopedBody(orgId, { action, reason })),
    }
  );
}