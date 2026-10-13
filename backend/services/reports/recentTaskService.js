class RecentTaskService {
    build(tasks, limit = 5) {
        return [...tasks]
            .sort(
                (a, b) =>
                    new Date(b.updatedAt) -
                    new Date(a.updatedAt)
            )
            .slice(0, limit)
            .map((task) => ({
                id: task._id,
                title: task.title,
                project: task.project?.title || "No Project",
                status: task.status,
                priority: task.priority,
                dueDate: task.dueDate,
                updatedAt: task.updatedAt,
            }));
    }
}

module.exports = new RecentTaskService();