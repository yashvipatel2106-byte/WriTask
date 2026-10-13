const jwt = require("jsonwebtoken");
const User = require("../models/user");

// Same token shape as authMiddleware, but never rejects: attaches req.user
// when a valid Bearer token is present, otherwise lets the request through
// with req.user left unset. Lets a single route (invitation accept) serve
// both an already-logged-in user and a brand-new invitee with no account yet.
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (user) {
      req.user = user;
      req.activeOrganizationId = decoded.organizationId || null;
    }
  } catch {
    // Invalid/expired token: proceed unauthenticated rather than rejecting.
  }
  next();
};

module.exports = optionalAuth;
