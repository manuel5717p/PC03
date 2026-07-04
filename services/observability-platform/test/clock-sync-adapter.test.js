const test = require("node:test");
const assert = require("node:assert/strict");
const { listClockSyncModes, runClockSyncLab } = require("../src/adapters/clock-sync-adapter");

const expectedModeIds = [
  "normal",
  "asymmetric-delay",
  "correction-policy",
  "stale-sync",
  "telemetry-impact",
  "scenario-analysis"
];

test("clock sync adapter exposes every supported mode", () => {
  const modes = listClockSyncModes();

  assert.deepEqual(modes.map((mode) => mode.id), expectedModeIds);
});

test("clock sync adapter runs every listed mode through the structured envelope", () => {
  const modes = listClockSyncModes();

  modes.forEach((mode) => {
    const result = runClockSyncLab(mode.id);

    assert.equal(result.labId, "clock-sync");
    assert.equal(result.session, 22);
    assert.equal(result.mode, mode.id);
    assert.equal(typeof result.summary, "string");
    assert.ok(Array.isArray(result.observations));
    assert.equal(typeof result.raw, "object");
    assert.equal(typeof result.learning.objective, "string");
    assert.ok(result.learning.objective.length > 0);
    assert.ok(Array.isArray(result.learning.keyMetrics));
    assert.equal(typeof result.learning.takeaway, "string");
    assert.ok(result.learning.takeaway.length > 0);
  });
});

test("clock sync adapter returns learning key metrics for every listed mode", () => {
  const modes = listClockSyncModes();

  modes.forEach((mode) => {
    const result = runClockSyncLab(mode.id);

    assert.ok(Array.isArray(result.learning.keyMetrics));
    assert.ok(result.learning.keyMetrics.length > 0, `${mode.id} should expose at least one learning key metric`);
    assert.equal(typeof result.learning.takeaway, "string");
    assert.ok(result.learning.takeaway.length > 0);
  });
});

test("clock sync adapter returns a guided learning checklist for every listed mode", () => {
  const modes = listClockSyncModes();

  modes.forEach((mode) => {
    const result = runClockSyncLab(mode.id);

    assert.ok(Array.isArray(result.learning.checklist), `${mode.id} should expose a learning checklist`);
    assert.ok(result.learning.checklist.length >= 2, `${mode.id} should expose at least two checklist items`);
    result.learning.checklist.forEach((item) => {
      assert.equal(typeof item, "string", `${mode.id} checklist item should be a string`);
      assert.ok(item.trim().length > 0, `${mode.id} checklist item should not be empty`);
    });
  });
});

test("clock sync adapter keeps the previous learning contract for every listed mode", () => {
  const modes = listClockSyncModes();

  modes.forEach((mode) => {
    const result = runClockSyncLab(mode.id);

    assert.equal(typeof result.learning.objective, "string");
    assert.ok(result.learning.objective.trim().length > 0);
    assert.ok(Array.isArray(result.learning.keyMetrics));
    assert.ok(result.learning.keyMetrics.length > 0);
    assert.equal(typeof result.learning.takeaway, "string");
    assert.ok(result.learning.takeaway.trim().length > 0);
  });
});

test("clock sync adapter learning key metrics never expose nullish required fields", () => {
  const modes = listClockSyncModes();

  modes.forEach((mode) => {
    const result = runClockSyncLab(mode.id);

    result.learning.keyMetrics.forEach((metric) => {
      assert.notEqual(metric.label, undefined, `${mode.id} metric label should not be undefined`);
      assert.notEqual(metric.label, null, `${mode.id} metric label should not be null`);
      assert.notEqual(metric.value, undefined, `${mode.id} metric value should not be undefined`);
      assert.notEqual(metric.value, null, `${mode.id} metric value should not be null`);
      assert.notEqual(metric.meaning, undefined, `${mode.id} metric meaning should not be undefined`);
      assert.notEqual(metric.meaning, null, `${mode.id} metric meaning should not be null`);
    });
  });
});

test("clock sync adapter consumes scenario analysis structured lab result", () => {
  const result = runClockSyncLab("scenario-analysis");

  assert.equal(result.labId, "clock-sync");
  assert.equal(result.session, 22);
  assert.equal(result.mode, "scenario-analysis");
  assert.equal(result.decisions.length, 5);
  assert.equal(result.raw.lowBatteryVsMission.decision, "uncertain-order");
});

test("clock sync adapter rejects unsupported modes", () => {
  assert.throws(
    () => runClockSyncLab("unknown"),
    (error) => error.statusCode === 400 && /not available/.test(error.message)
  );
});
