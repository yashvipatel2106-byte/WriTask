const { parentPort, workerData } = require("worker_threads");

const {
  sendOtpEmail,
  sendGoogleSignupPasswordEmail,
  sendForgotPasswordEmail,
  sendOrgInviteEmail,
  sendProjectInviteEmail,
  sendWeeklyReportEmail,
} = require("../utils/emailService");

(async () => {
  try {
    switch (workerData.type) {
      case "OTP":
        await sendOtpEmail(workerData.data);
        break;

      case "GOOGLE_SIGNUP_PASSWORD":
        await sendGoogleSignupPasswordEmail(workerData.data);
        break;

      case "FORGOT_PASSWORD":
        await sendForgotPasswordEmail(workerData.data);
        break;

      case "ORG_INVITE":
        await sendOrgInviteEmail(workerData.data);
        break;
        

      case "PROJECT_INVITE":
        await sendProjectInviteEmail(workerData.data);
        break;

      case "WEEKLY_REPORT":
        await sendWeeklyReportEmail(workerData.data);
        break;

      default:
        throw new Error(`Unknown email type: ${workerData.type}`);
    }

    parentPort.postMessage({
      success: true,
      type: workerData.type,
      message: "Email sent successfully",
    });
  } catch (err) {
    console.error("Email Worker Error:", err);

    parentPort.postMessage({
      success: false,
      type: workerData.type,
      error: err.message,
    });
  }
})();
