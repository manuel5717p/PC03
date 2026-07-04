const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/server");
const { planSimpleRoute } = require("../src/planner");

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

test("healthcheck responde ok", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "planificador-rutas" });
});

test("planifica una ruta simple por cercanía", async () => {
  const payload = {
    origin: { x: 0, y: 0 },
    deliveries: [
      { id: "pedido-c", location: { x: 1, y: 1 } },
      { id: "pedido-a", location: { x: 5, y: 0 } },
      { id: "pedido-b", location: { x: 2, y: 0 } }
    ]
  };

  const response = await fetch(`${baseUrl}/api/v1/routes/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.algorithm, "nearest-neighbor-manhattan");
  assert.equal(body.total_stops, 3);
  assert.equal(body.total_distance, 7);
  assert.deepEqual(
    body.route.map((segment) => segment.delivery_id),
    ["pedido-c", "pedido-b", "pedido-a"]
  );
});

test("refleja correlation id y acepta idempotency key sin estado", async () => {
  const payload = {
    origin: { x: 0, y: 0 },
    deliveries: [{ id: "pedido-pc02", location: { x: 1, y: 1 } }]
  };

  const response = await fetch(`${baseUrl}/api/v1/routes/plan`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": "corr-pc02-planner",
      "idempotency-key": "route-plan-intent-001"
    },
    body: JSON.stringify(payload)
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-correlation-id"), "corr-pc02-planner");
  assert.equal((await response.json()).total_stops, 1);
});

test("responde 400 cuando faltan entregas", async () => {
  const response = await fetch(`${baseUrl}/api/v1/routes/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin: { x: 0, y: 0 }, deliveries: [] })
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).detail, "El campo 'deliveries' debe ser una lista con al menos un destino.");
});

test("planner puro valida coordenadas", () => {
  assert.throws(
    () => planSimpleRoute({ origin: { x: "A", y: 1 }, deliveries: [{ location: { x: 1, y: 1 } }] }),
    /coordenadas numéricas/
  );
});
