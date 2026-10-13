const express = require("express");
const router = express.Router();

const workerManager = require("../workers/workerManager");

router.post("/email", async (req, res) => {
  try {
    console.log("Request Body:", req.body);

    const result = await workerManager.run(
      "emailWorker.js",
      req.body
    );

    res.json(result);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;