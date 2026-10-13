const {
  resolveProjectManager,
  resolveOrgForProject,
} = require("./projectPerformanceService");

function toId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return value._id.toString();
  return value.toString();
}

class ReportRecipientService {
  /**
   * Resolve who should receive `employee`'s weekly report: the manager of each
   * of their projects, plus the owner of each project's organization. The
   * employee themselves is always excluded.
   *
   * orgLookup: Map<orgId, Organization> — same lookup passed to projectPerformanceService.
   */
  resolve(employee, projects = [], orgLookup = null) {
    const employeeId = toId(employee._id || employee);
    const recipients = new Map();

    projects.forEach((project) => {
      const org = resolveOrgForProject(project, orgLookup);

      const manager = resolveProjectManager(project, org);
      if (manager?.email) {
        const managerId = toId(manager._id);
        if (managerId !== employeeId && !recipients.has(managerId)) {
          recipients.set(managerId, {
            user: manager._id,
            email: manager.email,
            name: manager.username,
            role: "manager",
          });
        }
      }

      const owner = org && typeof org === "object" ? org.owner : null;
      if (owner && typeof owner === "object" && owner.email) {
        const ownerId = toId(owner._id);
        if (ownerId !== employeeId && !recipients.has(ownerId)) {
          recipients.set(ownerId, {
            user: owner._id,
            email: owner.email,
            name: owner.username,
            role: "orgOwner",
          });
        }
      }
    });

    return [...recipients.values()];
  }
}

module.exports = new ReportRecipientService();
