const drones = new Map();

function resetDrones() {
  drones.clear();
}

function createDrone(drone) {
  drones.set(drone.id, drone);
  return drone;
}

function getDrone(id) {
  return drones.get(id);
}

function listDrones() {
  return [...drones.values()];
}

function listAvailableDrones() {
  return listDrones().filter((drone) => drone.status === "disponible");
}

module.exports = { resetDrones, createDrone, getDrone, listDrones, listAvailableDrones };
