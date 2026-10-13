const User = require("../models/User");
const bcrypt = require("bcryptjs");

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(
      req.user.userId
    ).select("-password");

    res.json(user);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      req.body,
      { new: true }
    );

    res.json(user);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

exports.changePassword = async (
  req,
  res
) => {
  try {
    const {
      currentPassword,
      newPassword,
    } = req.body;

    const user = await User.findById(
      req.user.userId
    );

    const isMatch =
      await bcrypt.compare(
        currentPassword,
        user.password
      );

    if (!isMatch) {
      return res.status(400).json({
        message: "Wrong password",
      });
    }

    user.password =
      await bcrypt.hash(
        newPassword,
        10
      );

    await user.save();

    res.json({
      message:
        "Password changed successfully",
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};