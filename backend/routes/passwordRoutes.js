const express =
require("express");

const router =
express.Router();

const auth =
require("../middleware/authMiddleware");

const {
 changePassword,
 setInitialPassword,
}
=
require(
 "../controllers/passwordController"
);

router.put(
 "/",
 auth,
 changePassword
);

router.post(
 "/initial",
 auth,
 setInitialPassword
);

module.exports=
router;