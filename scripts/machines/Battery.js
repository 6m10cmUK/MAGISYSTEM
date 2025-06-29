import { world, system } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import BlockUtils from "../utils/BlockUtils.js";

export class Battery {
    constructor() {
        this.batteries = new Map();
        this.capacities = {
            "magisystem:battery_basic": 50000,
            "magisystem:battery_advanced": 200000,
            "magisystem:battery_ultimate": 1000000
        };
        
        this.transferRate = {
            "magisystem:battery_basic": 100,
            "magisystem:battery_advanced": 500,
            "magisystem:battery_ultimate": 2000
        };
    }

    registerBattery(block) {
        const key = energySystem.getLocationKey(block.location);
        const capacity = this.capacities[block.typeId] || 10000;
        
        this.batteries.set(key, {
            typeId: block.typeId,
            capacity: capacity,
            transferRate: this.transferRate[block.typeId] || 100
        });
        
        // 初期エネルギーを設定
        const currentEnergy = energySystem.getEnergy(block);
        if (currentEnergy === 0) {
            energySystem.setEnergy(block, 0);
        }
    }

    unregisterBattery(location, dimension) {
        const key = energySystem.getLocationKey(location);
        this.batteries.delete(key);
        energySystem.clearEnergy(location, dimension);
    }

    updateBattery(block) {
        const key = energySystem.getLocationKey(block.location);
        let data = this.batteries.get(key);
        
        if (!data) {
            this.registerBattery(block);
            data = this.batteries.get(key);
        }

        const currentEnergy = energySystem.getEnergy(block);
        const maxEnergy = data.capacity;
        
        // エネルギーの受け取り（入力）
        if (currentEnergy < maxEnergy) {
            // 隣接するエネルギー源から受け取り
            const received = energyNetwork.receiveEnergy(block, Math.min(data.transferRate, maxEnergy - currentEnergy));
            if (received > 0) {
                energySystem.addEnergy(block, received);
            }
        }
        
        // エネルギーの供給（出力）
        if (currentEnergy > 0) {
            // 隣接する機械に供給
            const distributed = energyNetwork.distributeEnergy(block, Math.min(currentEnergy, data.transferRate));
            if (distributed > 0) {
                energySystem.removeEnergy(block, distributed);
            }
        }
        
        // 視覚的フィードバック
        this.updateVisualState(block, currentEnergy, maxEnergy);
    }

    updateVisualState(block, currentEnergy, maxEnergy) {
        // エネルギー残量に応じて光るレベルを変更
        const fillLevel = Math.floor((currentEnergy / maxEnergy) * 15);
        BlockUtils.setBlockState(block, "magisystem:fill_level", fillLevel);
        
        // パーティクル効果（エネルギーが多い時）
        if (fillLevel > 10 && system.currentTick % 20 === 0) {
            BlockUtils.spawnParticle(block, "minecraft:electric_spark_particle", {
                offset: { x: 0, y: 0.5, z: 0 }
            });
        }
    }

    getBatteryInfo(block) {
        const key = energySystem.getLocationKey(block.location);
        const data = this.batteries.get(key);
        const energy = energySystem.getEnergy(block);
        
        if (!data) return null;
        
        return {
            energy: energy,
            maxEnergy: data.capacity,
            transferRate: data.transferRate,
            fillPercentage: Math.floor((energy / data.capacity) * 100)
        };
    }
}

// シングルトンインスタンスをエクスポート
export const battery = new Battery();