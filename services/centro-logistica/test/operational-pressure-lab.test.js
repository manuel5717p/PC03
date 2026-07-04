const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createOperationalPressurePlan,
  parseArgs,
  runOperationalPressureLab
} = require("../src/operational-pressure-lab");

test("modo normal preserva eventos criticos y no acumula backlog", async () => {
  const report = await runOperationalPressureLab({ mode: "normal" });

  assert.equal(report.telemetry.backlog, 0);
  assert.equal(report.telemetry.dropped, 0);
  assert.equal(report.notifications.backlog, 0);
  assert.equal(report.notifications.rejected, 0);
  assert.equal(report.audit.written, report.orders.planned + report.deliveryEvents.received);
  assert.equal(report.dashboard.updates, report.orders.planned);
  assert.equal(report.deliveryEvents.criticalDropped, 0);
  assert.equal(report.audit.dropped, 0);
});

test("modo concert genera lag y backlog medible", async () => {
  const report = await runOperationalPressureLab({ mode: "concert" });

  assert.ok(report.telemetry.lag > 0);
  assert.ok(report.telemetry.backlog > 0);
  assert.ok(report.notifications.backlog > 0);
  assert.ok(report.timeline.some((entry) => entry.telemetryBacklog > 0));
  assert.equal(report.deliveryEvents.criticalDropped, 0);
  assert.equal(report.audit.dropped, 0);
});

test("modo overload descarta o rechaza trabajo no critico sin perder auditoria ni entregas", async () => {
  const report = await runOperationalPressureLab({ mode: "overload" });

  assert.ok(report.telemetry.dropped > 0);
  assert.ok(report.orders.rejected > 0);
  assert.ok(report.notifications.rejected > 0);
  assert.ok(report.deliveryEvents.duplicatesIgnored > 0);
  assert.equal(report.audit.written, report.orders.planned + report.deliveryEvents.received);
  assert.equal(report.dashboard.degradedPrecision, true);
  assert.equal(report.deliveryEvents.criticalDropped, 0);
  assert.equal(report.audit.dropped, 0);
});

test("modo controlled reduce drops y backlog mediante sampling y reduccion de tasa", async () => {
  const overload = await runOperationalPressureLab({ mode: "overload" });
  const controlled = await runOperationalPressureLab({ mode: "controlled" });

  assert.ok(controlled.telemetry.sampledOut > 0);
  assert.equal(controlled.telemetry.dropped, 0);
  assert.ok(controlled.telemetry.backlog < overload.telemetry.backlog);
  assert.equal(controlled.notifications.backlog, 0);
  assert.equal(controlled.notifications.rejected, 0);
  assert.equal(controlled.notifications.retried, 1);
  assert.ok(controlled.notifications.deferred > 0);
  assert.equal(controlled.deliveryEvents.duplicatesIgnored, 2);
  assert.equal(controlled.audit.written, controlled.orders.planned + controlled.deliveryEvents.received);
  assert.equal(controlled.deliveryEvents.criticalDropped, 0);
  assert.equal(controlled.audit.dropped, 0);
});

test("parsea flags y rechaza modos desconocidos del laboratorio operacional", () => {
  assert.equal(parseArgs(["--concert"]).mode, "concert");
  assert.equal(parseArgs(["--overload"]).mode, "overload");
  assert.equal(parseArgs(["--controlled"]).mode, "controlled");
  assert.equal(parseArgs(["--mode", "normal"]).mode, "normal");
  assert.equal(parseArgs(["concert"]).mode, "concert");

  assert.throws(
    () => createOperationalPressurePlan({ mode: "unknown" }),
    /operational pressure mode 'unknown' is not supported/
  );
});
