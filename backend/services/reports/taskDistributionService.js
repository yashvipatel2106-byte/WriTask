const { isTaskCompleted, getTaskProjectId } = require("../../utils/taskQueries");

const BUILTIN_BUCKETS = {
    todo: "todo",
    "in-progress": "inProgress",
    review: "review",
    completed: "completed",
    "task-done": "completed", // legacy custom status
};

/** Best-effort bucket for a project-defined custom status, from its label. */
function bucketFromCustomLabel(label) {
    const normalized = String(label || "").toLowerCase();
    if (normalized.includes("done") || normalized.includes("complete")) return "completed";
    if (normalized.includes("review")) return "review";
    if (normalized.includes("progress")) return "inProgress";
    return "todo";
}

function resolveBucket(task, project) {
    const builtin = BUILTIN_BUCKETS[task.status];
    if (builtin) return builtin;

    const customStatus = project?.customStatuses?.find((s) => s.id === task.status);
    if (customStatus) return bucketFromCustomLabel(customStatus.label);

    return null;
}

class TaskDistributionService {
    build(tasks, projects = [], referenceDate = new Date()) {
        const distribution = {
            todo: 0,
            inProgress: 0,
            review: 0,
            completed: 0,
            overdue: 0,
        };

        const projectsById = new Map(
            projects.map((project) => [project._id.toString(), project])
        );

        tasks.forEach((task) => {
            const project = projectsById.get(getTaskProjectId(task)) || null;
            const bucket = resolveBucket(task, project);
            if (bucket) distribution[bucket]++;

            if (
                task.dueDate &&
                new Date(task.dueDate) < referenceDate &&
                !isTaskCompleted(task.status, project)
            ) {
                distribution.overdue++;
            }
        });

        return distribution;
    }
}

module.exports = new TaskDistributionService();
