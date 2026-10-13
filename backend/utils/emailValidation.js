const EMAIL_MAX_LENGTH = 254;

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function normalizeInviteEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getEmailValidationError(email) {
  const trimmed = String(email || "").trim();

  if (!trimmed) {
    return "Email address is required.";
  }

  if (trimmed.length > EMAIL_MAX_LENGTH) {
    return "Email address is too long.";
  }

  if (/\s/.test(trimmed)) {
    return "Email address cannot contain spaces.";
  }

  const normalized = normalizeInviteEmail(trimmed);

  if (!EMAIL_REGEX.test(normalized)) {
    return "Enter a valid email address (e.g. name@company.com).";
  }

  const domain = normalized.split("@")[1];
  const tld = domain?.split(".").pop();
  if (!domain?.includes(".") || !tld || tld.length < 2) {
    return "Enter a valid email address (e.g. name@company.com).";
  }

  return null;
}

function validateInviteEmail(email) {
  const error = getEmailValidationError(email);
  if (error) {
    return { ok: false, message: error };
  }
  return { ok: true, email: normalizeInviteEmail(email) };
}

module.exports = {
  normalizeInviteEmail,
  getEmailValidationError,
  validateInviteEmail,
  isValidInviteEmail: (email) => !getEmailValidationError(email),
};
