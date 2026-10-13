const bcrypt =
require("bcryptjs");

const User =
require("../models/user");

exports.changePassword =
async(req,res)=>{
 try {

 const {
  currentPassword,
  newPassword
 } = req.body;

 if (!currentPassword || !newPassword) {
  return res.status(400).json({
   message: "Current and new password are required",
  });
 }

 const user =
 await User.findById(
  req.user._id
 );

 if (!user) {
  return res.status(404).json({ message: "User not found" });
 }

 if (!user.password) {
  return res.status(400).json({
   message: "This account uses Google Sign-In and has no password to compare against. Use forgot password to set one.",
  });
 }

 const valid =
 await bcrypt.compare(
  currentPassword,
  user.password
 );

 if(!valid){

  return res.status(400)
  .json({
   message:
   "Wrong Password"
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
  "Password Updated"
 });

 } catch (error) {
  res.status(500).json({ message: error.message });
 }

};

/** First-time password for Google (or passwordless) accounts during onboarding. */
exports.setInitialPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.password) {
      return res.status(400).json({
        message: "Password already set. Use change password instead.",
      });
    }

    user.password = await bcrypt.hash(String(password), 10);
    await user.save();

    res.json({ message: "Password created successfully", hasPassword: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};