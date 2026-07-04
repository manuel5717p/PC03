#!/usr/bin/env node

const { parseArgs, printPressureReport, simulateTelemetryPressure } = require("./telemetry-stream-simulator");

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = simulateTelemetryPressure(options);
  printPressureReport(report);
}

if (require.main === module) {
  main();
}

module.exports = { main };
