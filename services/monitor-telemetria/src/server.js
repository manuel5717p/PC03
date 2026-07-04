const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { buildTelemetryService } = require("./telemetry-service");

function loadProto() {
  const protoPath = path.join(__dirname, "..", "proto", "telemetry.proto");
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  return grpc.loadPackageDefinition(packageDefinition).aura.telemetry;
}

function createServer() {
  const telemetryPackage = loadProto();
  const server = new grpc.Server();
  server.addService(telemetryPackage.TelemetryService.service, buildTelemetryService());
  return server;
}

if (require.main === module) {
  const port = process.env.PORT || "50051";
  const server = createServer();
  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    server.start();
    console.log(`monitor-telemetria listening on ${port}`);
  });
}

module.exports = { createServer, loadProto };
