const Member = require("../models/Member");

// GET /api/members
// Returns all users (excluding sensitive fields), supports ?search=&role=&status=&department=
const getMembers = async (req, res) => {
  try {
    const { search, role, status, department } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { username:    { $regex: search, $options: "i" } },
        { email:       { $regex: search, $options: "i" } },
        { designation: { $regex: search, $options: "i" } },
      ];
    }

    if (role && role !== "All")       filter.role       = role;
    if (status && status !== "All")   filter.status     = status;
    if (department && department !== "All") filter.department = department;

    const members = await Member
      .find(filter)
      .sort({ createdAt: -1 });

    res.json(members);
  } catch (error) {
    console.error("getMembers error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/members
// Creates a new team member (no password — invite flow)
const createMember = async (req, res) => {
  try {
    const {
      username, email, role, status,
      designation, department, location, phone,
    } = req.body;

    if (!username || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    const exists = await Member.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "A member with this email already exists" });
    }

   const member = await Member.create({
  username,
  email,
  role: role || "Developer",
  status: status || "Active",
  designation: designation || "",
  department: department || "",
  location: location || "",
  phone: phone || "",
});


    res.status(201).json(member);
  } catch (error) {
    console.error("createMember error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// PUT /api/members/:id
// Updates an existing member's profile fields
const updateMember = async (req, res) => {
  try {
    const {
      username, role, status,
      designation, department, location, phone,
    } = req.body;

    const member = await Member.findByIdAndUpdate(
      req.params.id,
      {
        ...(username    && { username    }),
        ...(role        && { role        }),
        ...(status      && { status      }),
        ...(designation !== undefined && { designation }),
        ...(department  !== undefined && { department  }),
        ...(location    !== undefined && { location    }),
        ...(phone       !== undefined && { phone       }),
      },
      { new: true, select: "-password -otp -otpExpiry -resetToken -resetTokenExpiry -settings" }
    );

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    res.json(member);
  } catch (error) {
    console.error("updateMember error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE /api/members/:id
const deleteMember = async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot remove yourself" });
    }

    const member = await Member.findByIdAndDelete(req.params.id);

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    res.json({ message: "Member removed successfully" });
  } catch (error) {
    console.error("deleteMember error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/members/stats
const getMemberStats = async (req, res) => {
  try {
    const total       = await Member.countDocuments();
    const active      = await Member.countDocuments({ status: "Active" });
   const verified = 0;
    const departments = await Member.distinct("department");

    res.json({
      total,
      active,
      verified,
      departments: departments.filter(Boolean).length,
    });
  } catch (error) {
    console.error("getMemberStats error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getMembers,
  createMember,
  updateMember,
  deleteMember,
  getMemberStats,
};
