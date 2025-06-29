import { world, system } from '@minecraft/server';

const blockEnergyData = new Map();

function getBlockKey(location) {
    return `${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
}

function getBlockEnergy(location) {
    const key = getBlockKey(location);
    return blockEnergyData.get(key) || { energy: 0, maxEnergy: 0, fuel: 0 };
}

function setBlockEnergy(location, data) {
    const key = getBlockKey(location);
    blockEnergyData.set(key, data);
}

export { getBlockEnergy, setBlockEnergy, getBlockKey, blockEnergyData };