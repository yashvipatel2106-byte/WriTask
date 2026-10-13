const client = require("./index");

// Login Requests
const loginRequests = new client.Counter({
    name: "login_requests_total",
    help: "Total Login Requests",
});

// Failed Login
const failedLogins = new client.Counter({
    name: "failed_login_total",
    help: "Total Failed Login Attempts",
});

// OTP Failures
const otpFailures = new client.Counter({
    name: "otp_verification_failed_total",
    help: "Total Failed OTP Verifications",
});

// Active Sessions
const activeSessions = new client.Gauge({
    name: "active_sessions",
    help: "Currently Active Sessions",
});

module.exports = {
    loginRequests,
    failedLogins,
    otpFailures,
    activeSessions,
};