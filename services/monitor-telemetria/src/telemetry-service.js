function buildTelemetryService() {
  return {
    StreamTelemetry(call, callback) {
      let packetCount = 0;

      call.on("data", (packet) => {
        if (!packet || !packet.drone_id) {
          callback(null, { success: false, message: "Packet inválido: drone_id requerido" });
          callback = () => {};
          return;
        }
        packetCount += 1;
      });

      call.on("end", () => {
        callback(null, { success: true, message: `Packets procesados: ${packetCount}` });
      });

      call.on("error", () => {
        callback(null, { success: false, message: "Error procesando stream" });
      });
    }
  };
}

module.exports = { buildTelemetryService };
