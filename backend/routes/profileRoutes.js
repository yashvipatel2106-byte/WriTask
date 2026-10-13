const express =
    require("express");

const router =
    express.Router();

const auth =
    require("../middleware/authMiddleware");

const {
    getProfile,
    updateProfile,
    updateAppearance,
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

router.patch(
    "/appearance",
    auth,
    updateAppearance
);

router.delete(
    "/",
    auth,
    deleteAccount
);

module.exports =
    router;
