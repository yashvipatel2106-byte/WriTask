const sanitizeHtml = require("sanitize-html");

// Task/subtask descriptions are authored with the Jodit rich-text editor —
// this is the server-side half of sanitizing that HTML before it's ever
// persisted (the frontend also sanitizes before rendering, but a client
// bypassing the UI and calling the API directly would skip that check).
// Images are deliberately not allowed here — attachments already have a
// separate, tracked upload system (see uploadMiddleware.js); allowing
// inline <img> would let arbitrary/remote images slip in untracked.
const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s", "strike",
  "ul", "ol", "li", "a", "blockquote",
  "h1", "h2", "h3", "h4", "span",
];

const ALLOWED_ATTRIBUTES = {
  a: ["href", "target", "rel"],
};

function sanitizeDescriptionHtml(html) {
  if (typeof html !== "string" || !html) return "";
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}

module.exports = { sanitizeDescriptionHtml };
