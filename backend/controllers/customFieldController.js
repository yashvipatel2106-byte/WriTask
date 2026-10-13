const {
  listAccountCustomFields,
  createAccountCustomField,
  updateAccountCustomField,
  deleteAccountCustomField,
} = require("../utils/customFields");

/** GET /api/custom-fields — account-level catalog + manageable spaces */
exports.listCustomFields = async (req, res) => {
  try {
    const data = await listAccountCustomFields(req.user._id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** POST /api/custom-fields */
exports.createCustomField = async (req, res) => {
  try {
    const field = await createAccountCustomField(req.user._id, req.body || {});
    res.status(201).json({ field });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/** PATCH /api/custom-fields/:fieldId */
exports.updateCustomField = async (req, res) => {
  try {
    const field = await updateAccountCustomField(
      req.user._id,
      req.params.fieldId,
      req.body || {}
    );
    res.json({ field });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ message: error.message });
  }
};

/** DELETE /api/custom-fields/:fieldId */
exports.deleteCustomField = async (req, res) => {
  try {
    await deleteAccountCustomField(req.user._id, req.params.fieldId);
    res.json({ message: "Custom field deleted" });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    res.status(status).json({ message: error.message });
  }
};
