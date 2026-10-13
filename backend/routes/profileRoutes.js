const express =
    require("express");

const router =
    express.Router();

const auth =
    require("../middleware/authMiddleware");

const {
    getProfile,
    updateProfile,
    deleteAccount,
}
    =
    require(
        "../controllers/profileController"
    );

router.get(
    "/",
    auth,
    getProfile
);

router.put(
    "/",
    auth,
    updateProfile
);

router.delete(
    "/",
    auth,
    deleteAccount
);

module.exports =
    router;