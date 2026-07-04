const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/server");
const repository = require("../src/repository");

let server;
let baseUrl;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

test.beforeEach(() => {
  repository.resetDrones();
});

test("healthcheck responde ok", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "gestor-flota" });
});

test("registra dron y lista disponibles", async () => {
  const payload = {
    id: "Drone-Gamma-3",
    model: "DJI-Freight-1",
    battery_level: 95,
    status: "disponible",
    current_location: "almacen-norte"
  };

  const createdResponse = await fetch(`${baseUrl}/api/v1/drones`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  assert.equal(createdResponse.status, 201);
  assert.deepEqual(await createdResponse.json(), payload);

  const availableResponse = await fetch(`${baseUrl}/api/v1/drones/disponibles`);
  assert.equal(availableResponse.status, 200);
  assert.deepEqual(await availableResponse.json(), [payload]);
});

test("rechaza id duplicado", async () => {
  const payload = {
    id: "Drone-Gamma-3",
    model: "DJI-Freight-1",
    battery_level: 95,
    status: "disponible",
    current_location: "almacen-norte"
  };

  await fetch(`${baseUrl}/api/v1/drones`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const secondResponse = await fetch(`${baseUrl}/api/v1/drones`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  assert.equal(secondResponse.status, 409);
  assert.equal((await secondResponse.json()).detail, "El dron con id 'Drone-Gamma-3' ya existe.");
});
