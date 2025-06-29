import { world, system } from "@minecraft/server";

export class EnergySystem {
    constructor() {
        this.energyObjective = "magisystem_energy";
        this.initializeScoreboard();
    }

    initializeScoreboard() {
        try {
            world.scoreboard.addObjective(this.energyObjective, this.energyObjective);
        } catch {
            // オブジェクトが既に存在する場合
        }
    }

    getScoreboard() {
        return world.scoreboard.getObjective(this.energyObjective);
    }

    getLocationKey(location) {
        return `${location.x},${location.y},${location.z}`;
    }

    setEnergy(block, amount) {
        const key = this.getLocationKey(block.location);
        const scoreboard = this.getScoreboard();
        
        try {
            // スコアボードに値を設定
            const result = block.dimension.runCommand(`scoreboard players set "${key}" ${this.energyObjective} ${Math.floor(amount)}`);
            
            // Dynamic Propertyに次元情報を保存
            world.setDynamicProperty(key, block.dimension.id);
            
            // デバッグログ（頻度を下げる）
            if (block.typeId === "magisystem:generator" && system.currentTick % 200 === 0) {
                console.log(`§a[EnergySystem] Set energy for ${key} to ${amount}`);
            }
            
            return true;
        } catch (error) {
            console.warn(`§c[EnergySystem] Failed to set energy at ${key}: ${error}`);
            return false;
        }
    }

    getEnergy(block) {
        const key = this.getLocationKey(block.location);
        const scoreboard = this.getScoreboard();
        
        try {
            // Bedrock Edition のスコアボードAPI
            const participants = scoreboard.getParticipants();
            for (const participant of participants) {
                if (participant.displayName === key) {
                    const score = scoreboard.getScore(participant) || 0;
                    if (block.typeId === "magisystem:generator" && system.currentTick % 200 === 0) {
                        console.log(`§b[EnergySystem] Get energy for ${key}: ${score}`);
                    }
                    return score;
                }
            }
            if (block.typeId === "magisystem:generator" && system.currentTick % 200 === 0) {
                console.log(`§e[EnergySystem] No participant found for ${key}`);
            }
            return 0;
        } catch (error) {
            console.warn(`§c[EnergySystem] Error getting energy for ${key}: ${error}`);
            return 0;
        }
    }

    addEnergy(block, amount) {
        const currentEnergy = this.getEnergy(block);
        const maxCapacity = this.getMaxCapacity(block);
        const newEnergy = Math.min(currentEnergy + amount, maxCapacity);
        
        if (newEnergy > currentEnergy) {
            this.setEnergy(block, newEnergy);
            return newEnergy - currentEnergy; // 実際に追加されたエネルギー量
        }
        return 0;
    }

    removeEnergy(block, amount) {
        const currentEnergy = this.getEnergy(block);
        const energyToRemove = Math.min(currentEnergy, amount);
        
        if (energyToRemove > 0) {
            this.setEnergy(block, currentEnergy - energyToRemove);
            return energyToRemove; // 実際に削除されたエネルギー量
        }
        return 0;
    }

    clearEnergy(location, dimension) {
        const key = this.getLocationKey(location);
        
        try {
            // スコアボードから削除
            dimension.runCommand(`scoreboard players reset "${key}" ${this.energyObjective}`);
            
            // Dynamic Propertyから削除
            world.setDynamicProperty(key, undefined);
            
            return true;
        } catch (error) {
            console.warn(`Failed to clear energy at ${key}: ${error}`);
            return false;
        }
    }

    getMaxCapacity(block) {
        const typeId = block.typeId;
        
        // ブロックタイプごとの最大容量を定義
        const capacities = {
            "magisystem:generator": 4000,  // 内部バッファ (100秒分の発電量)
            "magisystem:creative_generator": 10000,  // クリエイティブ発電機（大容量バッファ）
            "magisystem:battery_basic": 50000,
            "magisystem:battery_advanced": 200000,
            "magisystem:battery_ultimate": 1000000
        };
        
        return capacities[typeId] || 0;
    }

    canInput(block) {
        const typeId = block.typeId;
        
        // 発電機とクリエイティブ発電機は入力不可
        if (typeId === "magisystem:generator" || typeId === "magisystem:creative_generator") return false;
        
        // 入力可能なブロックタイプ
        const inputTypes = [
            "magisystem:battery_basic",
            "magisystem:battery_advanced",
            "magisystem:battery_ultimate",
            "magisystem:iron_furnace"
        ];
        
        return inputTypes.includes(typeId) || block.hasTag("energy_input");
    }

    canOutput(block) {
        const typeId = block.typeId;
        
        // 出力可能なブロックタイプ
        const outputTypes = [
            "magisystem:generator",
            "magisystem:creative_generator",
            "magisystem:battery_basic",
            "magisystem:battery_advanced",
            "magisystem:battery_ultimate"
        ];
        
        return outputTypes.includes(typeId) || block.hasTag("energy_output");
    }

    isEnergyBlock(block) {
        return block?.hasTag("energy_storage") || 
               block?.hasTag("energy_input") || 
               block?.hasTag("energy_output") ||
               this.getMaxCapacity(block) > 0;
    }

    getEnergyDisplay(block) {
        const current = this.getEnergy(block);
        const max = this.getMaxCapacity(block);
        
        if (max === 0) return "";
        
        const percentage = Math.floor((current / max) * 100);
        return `§e${current}§r/§e${max}§r MF (§e${percentage}%§r)`;
    }
}

// シングルトンインスタンスをエクスポート
export const energySystem = new EnergySystem();