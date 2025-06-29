import { world, system, ItemStack } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import BlockUtils from "../utils/BlockUtils.js";

export class Generator {
    constructor() {
        this.generators = new Map();
        this.fuelValues = {
            "minecraft:coal": 1600,
            "minecraft:charcoal": 1600,
            "minecraft:coal_block": 16000,
            "minecraft:lava_bucket": 20000,
            "minecraft:blaze_rod": 2400,
            "minecraft:dried_kelp_block": 4000,
            "minecraft:bamboo": 200,
            "minecraft:stick": 100,
            "minecraft:planks": 300,
            "minecraft:log": 300,
            "minecraft:stripped_log": 300,
            "minecraft:wood": 300,
            "minecraft:stripped_wood": 300
        };
        
        this.generationRate = 40; // MF/tick
        this.testMode = false; // テストモード無効（デフォルト）
    }

    registerGenerator(block) {
        const key = energySystem.getLocationKey(block.location);
        const data = {
            burnTime: 0,
            maxBurnTime: 0,
            fuelItem: null
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

        // テストモード: 無限発電
        if (this.testMode) {
            // 常にエネルギーを生成
            const beforeEnergy = energySystem.getEnergy(block);
            const maxCapacity = energySystem.getMaxCapacity(block);
            const generated = energySystem.addEnergy(block, this.generationRate);
            const afterEnergy = energySystem.getEnergy(block);
            
            // デバッグ: エネルギー生成をログ出力
            if (system.currentTick % 200 === 0) {
                console.log(`§e[Generator] Before: ${beforeEnergy}/${maxCapacity}, Generated: ${generated}, After: ${afterEnergy}`);
                console.log(`§e[Generator] Location: ${block.location.x},${block.location.y},${block.location.z}`);
            }
            
            // エネルギーをネットワークに分配
            const currentEnergy = energySystem.getEnergy(block);
            if (currentEnergy > 0) {
                const distributed = energyNetwork.distributeEnergy(block, Math.min(currentEnergy, this.generationRate * 2));
                if (distributed > 0) {
                    energySystem.removeEnergy(block, distributed);
                    if (system.currentTick % 100 === 0) {
                        console.log(`§e[Generator] Distributed: ${distributed} MF`);
                    }
                }
            }
            
            // 常に稼働状態
            this.updateVisualState(block, true);
            
            // 燃焼パーティクル
            if (system.currentTick % 5 === 0) {
                // 炎のパーティクル
                BlockUtils.spawnParticle(block, "minecraft:basic_flame_particle", {
                    offset: { x: 0, y: 0.5, z: 0 }
                });
                
                // 電気スパーク（既存のパーティクルを使用）
                BlockUtils.spawnParticle(block, "minecraft:critical_hit_emitter", {
                    offset: { x: 0, y: 0.8, z: 0 }
                });
                
                // 煙パーティクル
                BlockUtils.spawnParticle(block, "minecraft:basic_smoke_particle", {
                    offset: { x: 0, y: 1.0, z: 0 }
                });
                
                // エネルギーパーティクル（ランダムな位置）
                const randomX = (Math.random() - 0.5) * 0.5;
                const randomZ = (Math.random() - 0.5) * 0.5;
                BlockUtils.spawnParticle(block, "minecraft:endrod", {
                    offset: { x: randomX, y: 0.5, z: randomZ }
                });
            }
            
            return;
        }

        // 通常モード（燃料必要）
        if (data.burnTime > 0) {
            data.burnTime--;
            
            // エネルギーを生成
            const generated = energySystem.addEnergy(block, this.generationRate);
            
            // エネルギーをネットワークに分配
            if (generated < this.generationRate) {
                const currentEnergy = energySystem.getEnergy(block);
                const distributed = energyNetwork.distributeEnergy(block, currentEnergy);
                if (distributed > 0) {
                    energySystem.removeEnergy(block, distributed);
                }
            }
            
            // 視覚的フィードバック
            this.updateVisualState(block, true);
            
            // 燃焼パーティクル
            if (system.currentTick % 5 === 0) {
                // 炎のパーティクル
                BlockUtils.spawnParticle(block, "minecraft:basic_flame_particle", {
                    offset: { x: 0, y: 0.5, z: 0 }
                });
                
                // 煙パーティクル
                BlockUtils.spawnParticle(block, "minecraft:basic_smoke_particle", {
                    offset: { x: 0, y: 1.0, z: 0 }
                });
                
                // エネルギーパーティクル（ランダムな位置）
                const randomX = (Math.random() - 0.5) * 0.5;
                const randomZ = (Math.random() - 0.5) * 0.5;
                BlockUtils.spawnParticle(block, "minecraft:villager_happy", {
                    offset: { x: randomX, y: 0.5, z: randomZ }
                });
            }
        } else {
            // 新しい燃料をチェック
            this.checkForFuel(block, data);
            this.updateVisualState(block, false);
        }
        
        // エネルギーがある場合は分配を試みる
        const currentEnergy = energySystem.getEnergy(block);
        if (currentEnergy > 0) {
            const distributed = energyNetwork.distributeEnergy(block, Math.min(currentEnergy, this.generationRate * 2));
            if (distributed > 0) {
                energySystem.removeEnergy(block, distributed);
            }
        }
    }

    checkForFuel(block, data) {
        // インベントリから燃料をチェック
        const inventory = BlockUtils.getBlockInventory(block);
        if (!inventory) {
            // 床に落ちているアイテムをチェック
            this.checkDroppedFuel(block, data);
            return;
        }

        for (let i = 0; i < inventory.size; i++) {
            const item = inventory.getItem(i);
            if (item && this.fuelValues[item.typeId]) {
                // 燃料を消費
                const fuelValue = this.fuelValues[item.typeId];
                data.burnTime = fuelValue;
                data.maxBurnTime = fuelValue;
                data.fuelItem = item.typeId;
                
                if (item.amount > 1) {
                    item.amount--;
                    inventory.setItem(i, item);
                } else {
                    inventory.setItem(i, undefined);
                }
                
                // 燃料消費音
                BlockUtils.playSound(block, "furnace.lit", { volume: 0.5 });
                break;
            }
        }
    }

    checkDroppedFuel(block, data) {
        const location = block.location;
        const dimension = block.dimension;
        
        // 範囲内のアイテムエンティティを取得
        const items = dimension.getEntities({
            location: location,
            maxDistance: 1.5,
            type: "item"
        });

        for (const itemEntity of items) {
            const itemStack = itemEntity.getComponent("item")?.itemStack;
            if (itemStack && this.fuelValues[itemStack.typeId]) {
                const fuelValue = this.fuelValues[itemStack.typeId];
                const consumeAmount = 1;
                
                data.burnTime = fuelValue;
                data.maxBurnTime = fuelValue;
                data.fuelItem = itemStack.typeId;
                
                if (itemStack.amount > consumeAmount) {
                    itemStack.amount -= consumeAmount;
                    itemEntity.getComponent("item").itemStack = itemStack;
                } else {
                    itemEntity.remove();
                }
                
                BlockUtils.playSound(block, "random.pop", { volume: 0.3 });
                break;
            }
        }
    }

    updateVisualState(block, isActive) {
        BlockUtils.setBlockState(block, "magisystem:active", isActive ? 1 : 0);
    }

    getBurnProgress(block) {
        const key = energySystem.getLocationKey(block.location);
        const data = this.generators.get(key);
        
        if (!data || data.maxBurnTime === 0) return 0;
        
        return (data.maxBurnTime - data.burnTime) / data.maxBurnTime;
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
            burnTime: data.burnTime,
            maxBurnTime: data.maxBurnTime,
            fuelItem: data.fuelItem,
            isActive: this.testMode || data.burnTime > 0,
            burnProgress: this.getBurnProgress(block)
        };
    }
}

// シングルトンインスタンスをエクスポート
export const generator = new Generator();