export function buildTaskUrl(
  projectId: string,
  taskId: string,
  subtaskId?: string | null
) {
  const params = new URLSearchParams();
  params.set("task", taskId);
  if (subtaskId) params.set("subtask", subtaskId);
  return `/projects/${projectId}?${params.toString()}`;
}

export function parseTaskUrl(searchParams: URLSearchParams) {
  return {
    taskId: searchParams.get("task"),
    subtaskId: searchParams.get("subtask"),
  };
}
