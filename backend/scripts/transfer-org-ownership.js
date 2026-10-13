/**
 * Transfer organization ownership to a member.
 * Usage: node scripts/transfer-org-ownership.js <orgSlugOrName> <newOwnerEmail>
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const User = require("../models/user");

async function main() {
  const orgQuery = process.argv[2];
  const newOwnerEmail = process.argv[3]?.toLowerCase().trim();

  if (!orgQuery || !newOwnerEmail) {
    console.error(
      "Usage: node scripts/transfer-org-ownership.js <orgSlugOrName> <newOwnerEmail>"
    );
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({
    email: newOwnerEmail,
  });
  if (!user) {
    console.error(`User not found: ${newOwnerEmail}`);
    process.exit(1);
  }

  const organization = await Organization.findOne({
    isDeleted: { $ne: true },
    $or: [
      { slug: orgQuery.toLowerCase() },
      { name: new RegExp(`^${orgQuery}$`, "i") },
    ],
  });

  if (!organization) {
    console.error(`Organization not found: ${orgQuery}`);
    process.exit(1);
  }

  if (!organization.isMember(user._id)) {
    console.error(`${newOwnerEmail} is not a member of ${organization.name}`);
    process.exit(1);
  }

  const previousOwnerId = organization.owner?.toString();
  const newOwnerId = user._id.toString();

  if (previousOwnerId === newOwnerId) {
    console.log(`${user.email} is already the owner of ${organization.name}`);
    process.exit(0);
  }

  organization.owner = user._id;

  for (const member of organization.members) {
    const memberId = member.user?.toString();
    if (memberId === newOwnerId) {
      member.role = "owner";
    } else if (memberId === previousOwnerId && member.role === "owner") {
      member.role = "admin";
    }
  }

  const isListed = organization.members.some(
    (member) => member.user?.toString() === newOwnerId
  );
  if (!isListed) {
    organization.members.push({
      user: user._id,
      role: "owner",
    });
  }

  await organization.save();

  const previousOwner = previousOwnerId
    ? await User.findById(previousOwnerId).select("email username")
    : null;


  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
