require("dotenv").config();

const dns = require("node:dns");
const mongoose = require("mongoose");

const Organization = require("../models/Organization");

const {
  ensureOrganizationHolidays,
} = require("../services/holidayService");

// -----------------------------------------------------------------------------
// MongoDB Atlas DNS fix
// -----------------------------------------------------------------------------
// The normal backend connection already configures these DNS servers.
// The migration script connects directly with mongoose, so we must configure
// DNS here as well.
//
// This fixes Node.js SRV lookup issues such as:
// querySrv ECONNREFUSED _mongodb._tcp.cluster0....mongodb.net
// -----------------------------------------------------------------------------

dns.setServers([
  "8.8.8.8",
  "1.1.1.1",
]);

async function run() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error(
        "MONGO_URI is not defined in backend/.env"
      );
    }

    console.log("Connecting to MongoDB...");

    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log(
      "Connected to MongoDB"
    );

    const organizations =
      await Organization.find({})
        .select("_id name")
        .lean();

    console.log(
      `Found ${organizations.length} organizations`
    );

    if (!organizations.length) {
      console.log(
        "No organizations found. Nothing to migrate."
      );

      return;
    }

    let successful = 0;
    let failed = 0;

    for (const organization of organizations) {
      try {
        const holidays =
          await ensureOrganizationHolidays(
            organization._id
          );

        successful += 1;

        console.log(
          `✓ Holidays seeded for: ${
            organization.name
          } (${holidays.length} total holiday records)`
        );
      } catch (error) {
        failed += 1;

        console.error(
          `✗ Failed for ${
            organization.name
          }: ${error.message}`
        );
      }
    }

    console.log("");
    console.log(
      "----------------------------------------"
    );
    console.log(
      "Holiday migration completed."
    );
    console.log(
      `Successful organizations: ${successful}`
    );
    console.log(
      `Failed organizations: ${failed}`
    );
    console.log(
      "----------------------------------------"
    );
  } finally {
    if (
      mongoose.connection.readyState !== 0
    ) {
      await mongoose.disconnect();
    }
  }
}

run().catch((error) => {
  console.error(
    "Holiday migration failed:",
    error.message
  );

  process.exit(1);
});