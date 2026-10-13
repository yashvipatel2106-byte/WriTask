const EMAIL_MAX_LENGTH = 254;

/** Practical RFC-style check — blocks obvious typos without being overly strict. */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getEmailValidationError(email: string): string | null {
  const trimmed = email.trim();

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

export function isValidInviteEmail(email: string): boolean {
  return getEmailValidationError(email) === null;
}
