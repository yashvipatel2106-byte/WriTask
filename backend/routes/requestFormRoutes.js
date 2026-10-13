const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  requireOrgAnyRole,
  requireOrgOwnerOrAdmin,
} = require("../middleware/orgRbacMiddleware");

const {
  getForms,
  createForm,
  getForm,
  updateForm,
  publishForm,
  disableForm,
  archiveForm,
  getAccessibleProjects,
  submitForm,
  getSubmissions,
  getSubmission,
  reviewSubmission,
  uploadAnswerImage,
  downloadAnswerImage,
} = require("../controllers/requestFormController");

const {
  upload,
} = require("../middleware/requestFormUploadMiddleware");

router.use(authMiddleware);

/*
 * Main Request Forms page.
 *
 * Anyone who can submit, manage, or review request
 * forms can access the module.
 */
router.get(
  "/",
  requireOrgAnyRole(
    "requestForm:submit",
    "requestForm:manage",
    "requestForm:review"
  ),
  getForms
);

/*
 * Create a form.
 *
 * Restricted to the organization Owner or a member whose
 * CURRENT role is "admin" — hardcoded by role, not by a
 * configurable permission (see requireOrgOwnerOrAdmin).
 */
router.post(
  "/",
  requireOrgOwnerOrAdmin,
  createForm
);

/*
 * Projects available for request submission.
 */
router.get(
  "/projects",
  getAccessibleProjects
);

/*
 * Request inbox.
 *
 * Submitters can see their own requests.
 * Reviewers can see requests they are allowed to review.
 */
router.get(
  "/submissions",
  requireOrgAnyRole(
    "requestForm:submit",
    "requestForm:review"
  ),
  getSubmissions
);

/*
 * Single request.
 */
router.get(
  "/submissions/:submissionId",
  requireOrgAnyRole(
    "requestForm:submit",
    "requestForm:review"
  ),
  getSubmission
);

/*
 * Only users with explicit review permission can
 * approve/reject requests.
 */
router.post(
  "/submissions/:submissionId/review",
  reviewSubmission
);

/*
 * Get a form.
 */
router.get(
  "/:formId",
  requireOrgAnyRole(
    "requestForm:submit",
    "requestForm:manage",
    "requestForm:review"
  ),
  getForm
);

/*
 * Edit a form. Owner/Admin only (see requireOrgOwnerOrAdmin).
 */
router.put(
  "/:formId",
  requireOrgOwnerOrAdmin,
  updateForm
);

/*
 * Lifecycle transitions. Owner/Admin only.
 */
router.post(
  "/:formId/publish",
  requireOrgOwnerOrAdmin,
  publishForm
);

router.post(
  "/:formId/disable",
  requireOrgOwnerOrAdmin,
  disableForm
);

router.post(
  "/:formId/archive",
  requireOrgOwnerOrAdmin,
  archiveForm
);

/*
 * Submit a published form.
 */
router.post(
  "/:formId/submit",
  requireOrgAnyRole(
    "requestForm:submit",
    "requestForm:manage"
  ),
  submitForm
);

/*
 * Upload an image while filling out a "textarea" answer that has
 * image attachments enabled. Uploaded before final submit — the
 * returned filename/url is stored as that answer's value.
 */
router.post(
  "/:formId/upload-image",
  requireOrgAnyRole(
    "requestForm:submit",
    "requestForm:manage"
  ),
  upload.single("file"),
  uploadAnswerImage
);

/*
 * Serve an uploaded answer image (Request Inbox display).
 */
router.get(
  "/:formId/attachments/:filename",
  requireOrgAnyRole(
    "requestForm:submit",
    "requestForm:manage",
    "requestForm:review"
  ),
  downloadAnswerImage
);

module.exports = router;