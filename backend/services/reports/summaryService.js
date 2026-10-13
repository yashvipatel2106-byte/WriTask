const { isTaskCompleted, getTaskProjectId } = require("../../utils/taskQueries");

class SummaryService {
  build(tasks, projects, referenceDate = new Date()) {
    const projectsById = new Map(
      (projects || []).map((project) => [project._id.toString(), project])
    );
    const projectFor = (task) => projectsById.get(getTaskProjectId(task)) || null;

    const assigned = tasks.length;

    const completed = tasks.filter((task) =>
      isTaskCompleted(task.status, projectFor(task))
    ).length;

    const pending = tasks.filter(
      (task) => !isTaskCompleted(task.status, projectFor(task))
    ).length;

    const overdue = tasks.filter((task) => {
      if (!task.dueDate) return false;
      return (
        !isTaskCompleted(task.status, projectFor(task)) &&
        new Date(task.dueDate) < referenceDate
      );
    }).length;

    const completionRate =
      assigned === 0 ? 0 : Math.round((completed / assigned) * 100);

    return {
      totalProjects: projects.length,
      assigned,
      completed,
      pending,
      overdue,
      completionRate,
    };
  }
}

module.exports = new SummaryService();
