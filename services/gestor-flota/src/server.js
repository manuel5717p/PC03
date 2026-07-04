const express = require("express");
const routes = require("./routes");

function createApp() {
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "gestor-flota" });
  });
  app.use(routes);
  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 8000;
  createApp().listen(port, () => {
    console.log(`gestor-flota listening on ${port}`);
  });
}

module.exports = { createApp };
