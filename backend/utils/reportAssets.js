const fs = require("fs");
const path = require("path");

let cachedLogoDataUri = null;

function getLogoDataUri() {
  if (cachedLogoDataUri !== null) return cachedLogoDataUri;

  const logoPath =
    process.env.REPORT_LOGO_PATH ||
    path.join(__dirname, "../assets/reports/logo.png");

  try {
    const buffer = fs.readFileSync(logoPath);
    cachedLogoDataUri = `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    cachedLogoDataUri = "";
  }

  return cachedLogoDataUri;
}

module.exports = { getLogoDataUri };
