import { world, system } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import BlockUtils from "../utils/BlockUtils.js";

export class CreativeGenerator {
    constructor() {
        this.generators = new Map();
        this.generationRate = 100; // MF/tick（通常の発電機より高出力）
    }

    registerGenerator(block) {
        const key = energySystem.getLocationKey(block.location);
        const data = {
            isActive: true // 常時稼働
        };
        
        this.generators.set(key, data);
        energySystem.setEnergy(block, energySystem.getEnergy(block) || 0);
    }

    unregisterGenerator(location, dimension) {
        const key = energySystem.getLocationKey(location);
        this.generators.delete(key);
        energySystem.clearEnergy(location, dimension);
    }

    updateGenerator(block) {
        const key = energySystem.getLocationKey(block.location);
        let data = this.generators.get(key);
        
        if (!data) {
            this.registerGenerator(block);
            data = this.generators.get(key);
        }

        // 常にエネルギーを生成
        const beforeEnergy = energySystem.getEnergy(block);
        const maxCapacity = energySystem.getMaxCapacity(block);
        const generated = energySystem.addEnergy(block, this.generationRate);
        const afterEnergy = energySystem.getEnergy(block);
        
        // エネルギーをネットワークに分配
        const currentEnergy = energySystem.getEnergy(block);
        if (currentEnergy > 0) {
            const distributed = energyNetwork.distributeEnergy(block, Math.min(currentEnergy, this.generationRate * 2));
            if (distributed > 0) {
                energySystem.removeEnergy(block, distributed);
            }
        }
        
        // 常に稼働状態
        this.updateVisualState(block, true);
        
        // クリエイティブ発電機の特別なパーティクル効果
        if (system.currentTick % 3 === 0) {
            // 虹色のパーティクル（エンドロッド）
            const randomX = (Math.random() - 0.5) * 0.8;
            const randomY = Math.random() * 0.5 + 0.3;
            const randomZ = (Math.random() - 0.5) * 0.8;
            
            BlockUtils.spawnParticle(block, "minecraft:endrod", {
                offset: { x: randomX, y: randomY, z: randomZ }
            });
            
            // 電気スパーク
            BlockUtils.spawnParticle(block, "minecraft:critical_hit_emitter", {
                offset: { x: 0, y: 0.8, z: 0 }
            });
        }
        
        // より派手なパーティクル（低頻度）
        if (system.currentTick % 10 === 0) {
            // 炎のパーティクル
            BlockUtils.spawnParticle(block, "minecraft:basic_flame_particle", {
                offset: { x: 0, y: 0.5, z: 0 }
            });
            
            // 魔法のようなパーティクル
            for (let i = 0; i < 3; i++) {
                const angle = (i / 3) * Math.PI * 2;
                const radius = 0.5;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                
                BlockUtils.spawnParticle(block, "minecraft:villager_happy", {
                    offset: { x: x, y: 0.5, z: z }
                });
            }
        }
    }

    updateVisualState(block, isActive) {
        BlockUtils.setBlockState(block, "magisystem:active", isActive ? 1 : 0);
    }

    getGeneratorInfo(block) {
        const key = energySystem.getLocationKey(block.location);
        const data = this.generators.get(key);
        const energy = energySystem.getEnergy(block);
        const maxEnergy = energySystem.getMaxCapacity(block);
        
        if (!data) return null;
        
        return {
            energy: energy,
            maxEnergy: maxEnergy,
            burnTime: -1, // 無限
            maxBurnTime: -1, // 無限
            fuelItem: "creative", // クリエイティブモード
            isActive: true, // 常時稼働
            burnProgress: 1 // 常に100%
        };
    }
}

// シングルトンインスタンスをエクスポート
export const creativeGenerator = new CreativeGenerator();