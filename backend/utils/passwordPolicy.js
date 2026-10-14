const MIN_PASSWORD_LENGTH = 8;

// Returns an error message when the password is too weak, otherwise null.
function passwordPolicyError(password) {
  const value = String(password ?? "").trim();
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "Password must include at least one letter and one number.";
  }
  return null;
}

module.exports = { MIN_PASSWORD_LENGTH, passwordPolicyError };
