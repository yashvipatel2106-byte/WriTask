const { sendContactSupportEmail } = require("../utils/emailService");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const submitContactSupport = async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const email = (req.body.email || "").trim();
    const subject = (req.body.subject || "").trim();
    const message = (req.body.message || "").trim();

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    await sendContactSupportEmail({ name, email, subject, message });
    res.status(200).json({ message: "Your message has been sent." });
  } catch (error) {
    console.error("submitContactSupport error:", error);
    res.status(500).json({ message: "Failed to send your message. Please try again later." });
  }
};

module.exports = { submitContactSupport };
