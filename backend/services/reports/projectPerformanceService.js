const { isTaskCompleted, getTaskProjectId } = require("../../utils/taskQueries");

function resolveMemberUserId(member) {
  if (!member?.user) return null;
  const user = member.user;
  if (typeof user === "object" && user._id) return user._id.toString();
  return user.toString();
}

function formatManagerUser(member) {
  const user = member?.user;
  if (!user || typeof user !== "object") return null;

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    designation: user.designation || null,
    projectRole: member.role,
  };
}

function resolveProjectManager(project, organization = null) {
  const members = project.members || [];
  const ownerId =
    project.owner?._id?.toString() || project.owner?.toString() || null;

  const findByProjectRole = (role) =>
    members.find((member) => member.role === role);

  let member =
    findByProjectRole("manager") ||
    findByProjectRole("admin");

  if (!member && organization?.members?.length) {
    member = members.find((projectMember) => {
      const userId = resolveMemberUserId(projectMember);
      if (!userId) return false;

      const orgMember = organization.members.find((entry) => {
        const orgUserId =
          entry.user?._id?.toString() || entry.user?.toString();
        return orgUserId === userId;
      });

      return orgMember?.role === "manager";
    });
  }

  if (!member && ownerId) {
    member = members.find(
      (projectMember) => resolveMemberUserId(projectMember) === ownerId
    );
  }

  return formatManagerUser(member);
}

function resolveOrgForProject(project, orgLookup) {
  if (!orgLookup) return null;
  const orgId = project.organization?._id?.toString() || project.organization?.toString();
  if (!orgId) return null;
  if (orgLookup instanceof Map) return orgLookup.get(orgId) || null;
  return orgLookup;
}

class ProjectPerformanceService {
  /** orgLookup: Map<orgId, Organization> (preferred) or a single Organization (legacy). */
  build(projects, tasks, orgLookup = null) {
    return projects.map((project) => {
      const projectId = project._id.toString();

      const projectTasks = tasks.filter(
        (task) => getTaskProjectId(task) === projectId
      );

      const assigned = projectTasks.length;
      const completed = projectTasks.filter((task) =>
        isTaskCompleted(task.status, project)
      ).length;
      const pending = Math.max(0, assigned - completed);
      const progress =
        assigned === 0 ? 0 : Math.round((completed / assigned) * 100);

      return {
        projectId: project._id,
        projectName: project.title,
        assigned,
        completed,
        pending,
        progress,
        manager: resolveProjectManager(project, resolveOrgForProject(project, orgLookup)),
      };
    });
  }
}

module.exports = new ProjectPerformanceService();
module.exports.resolveProjectManager = resolveProjectManager;
module.exports.resolveOrgForProject = resolveOrgForProject;
