const express = require("express");
const auth = require("../middleware/authMiddleware");
const {
  listCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
} = require("../controllers/customFieldController");

const router = express.Router();

router.use(auth);

router.get("/", listCustomFields);
router.post("/", createCustomField);
router.patch("/:fieldId", updateCustomField);
router.delete("/:fieldId", deleteCustomField);

module.exports = router;
