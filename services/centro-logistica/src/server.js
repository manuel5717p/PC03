const express = require("express");
const { createRoutes } = require("./routes");

function createApp(options = {}) {
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "centro-logistica" });
  });
  app.use(createRoutes(options));
  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 8000;
  createApp().listen(port, () => {
    console.log(`centro-logistica listening on ${port}`);
  });
}

module.exports = { createApp };
