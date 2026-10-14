// Never send internal error details to clients: any 5xx JSON body has its
// message/error text replaced with a generic one, and the original is logged.
const GENERIC = "Internal Server Error";

module.exports = function sanitizeServerErrors(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === "object" && !Array.isArray(body)) {
      const hasDetail =
        (typeof body.message === "string" && body.message !== GENERIC) ||
        typeof body.error === "string";
      if (hasDetail) {
        console.error(
          `[${res.statusCode}] ${req.method} ${req.originalUrl}:`,
          body.message || body.error
        );
        const safe = { ...body };
        if (typeof safe.message === "string") safe.message = GENERIC;
        if (typeof safe.error === "string") safe.error = GENERIC;
        return originalJson(safe);
      }
    }
    return originalJson(body);
  };

  next();
};
