import { world, system } from "@minecraft/server";
import { Constants } from "../core/Constants.js";
import { Utils } from "../core/Utils.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { BlockTypeUtils } from "../utils/BlockTypeUtils.js";

export class EnergySystem {
    constructor() {
        this.energyObjective = Constants.SCOREBOARD.ENERGY_OBJECTIVE;
        this.maxEnergyObjective = Constants.SCOREBOARD.MAX_ENERGY_OBJECTIVE;
        this.fuelDataProperty = Constants.PROPERTIES.MACHINE_DATA;
        this.initializeScoreboard();
    }

    initializeScoreboard() {
        ErrorHandler.safeTry(() => {
            // 既存のオブジェクトがあるかチェック
            let energyObj = world.scoreboard.getObjective(this.energyObjective);
            if (!energyObj) {
                world.scoreboard.addObjective(this.energyObjective, this.energyObjective);
            }
            
            let maxEnergyObj = world.scoreboard.getObjective(this.maxEnergyObjective);
            if (!maxEnergyObj) {
                world.scoreboard.addObjective(this.maxEnergyObjective, this.maxEnergyObjective);
            }
        }, "EnergySystem.initializeScoreboard");
    }

    getScoreboard() {
        return world.scoreboard.getObjective(this.energyObjective);
    }

    getLocationKey(location) {
        return Utils.locationToKey(location);
    }

    setEnergy(block, amount) {
        const key = this.getLocationKey(block.location);
        
        return ErrorHandler.safeTry(() => {
            // スコアボードに値を設定
            const result = block.dimension.runCommand(`scoreboard players set "${key}" ${this.energyObjective} ${Math.floor(amount)}`);
            
            // Dynamic Propertyに次元情報を保存
            world.setDynamicProperty(key, block.dimension.id);
            
            // エネルギー値もDynamic Propertyに保存（バックアップ）
            world.setDynamicProperty(`energy_${key}`, Math.floor(amount));
            
            return true;
        }, "EnergySystem.setEnergy", false);
    }

    getEnergy(block) {
        const key = this.getLocationKey(block.location);
        const scoreboard = this.getScoreboard();
        
        return ErrorHandler.safeTry(() => {
            // Bedrock Edition のスコアボードAPI
            const participants = scoreboard.getParticipants();
            for (const participant of participants) {
                if (participant.displayName === key) {
                    const score = scoreboard.getScore(participant) || 0;
                    return score;
                }
            }
            
            // スコアボードに値がない場合、Dynamic Propertyから復元を試みる
            const storedEnergy = world.getDynamicProperty(`energy_${key}`);
            if (storedEnergy !== undefined) {
                // 復元した値をスコアボードに設定
                this.setEnergy(block, storedEnergy);
                return storedEnergy;
            }
            
            return 0;
        }, "EnergySystem.getEnergy", 0);
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
        
        return ErrorHandler.safeTry(() => {
            // スコアボードから削除
            dimension.runCommand(`scoreboard players reset "${key}" ${this.energyObjective}`);
            dimension.runCommand(`scoreboard players reset "${key}" ${this.maxEnergyObjective}`);
            
            // Dynamic Propertyから削除
            world.setDynamicProperty(key, undefined);
            world.setDynamicProperty(`energy_${key}`, undefined);
            this.clearFuelData(location);
            
            return true;
        }, "EnergySystem.clearEnergy", false);
    }

    getMaxCapacity(block) {
        const typeId = block.typeId;
        
        // ブロックタイプごとの最大容量を定義
        const capacities = {
            [Constants.BLOCK_TYPES.GENERATOR]: 4000,  // 内部バッファ (100秒分の発電量)
            [Constants.BLOCK_TYPES.THERMAL_GENERATOR]: 4000,  // 熱発電機
            [Constants.BLOCK_TYPES.SOLAR_GENERATOR]: 10000,  // ソーラー発電機
            [Constants.BLOCK_TYPES.CREATIVE_GENERATOR]: 10000,  // クリエイティブ発電機（大容量バッファ）
            'magisystem:seebeck_generator': Constants.GENERATOR.SEEBECK_CAPACITY,  // ゼーベック発電機
            [Constants.BLOCK_TYPES.BATTERY]: 50000,
            [Constants.BLOCK_TYPES.BATTERY_BASIC]: 50000,
            [Constants.BLOCK_TYPES.BATTERY_ADVANCED]: 200000,
            [Constants.BLOCK_TYPES.BATTERY_ULTIMATE]: 1000000,
            [Constants.BLOCK_TYPES.ELECTRIC_FURNACE]: 10000  // 電気炉（250秒分の使用量）
        };
        
        return capacities[typeId] || 0;
    }

    canInput(block) {
        const typeId = block.typeId;
        
        // 発電機とクリエイティブ発電機は入力不可
        if (BlockTypeUtils.isGenerator(typeId)) return false;
        
        // 入力可能なブロックタイプ
        const inputTypes = [
            Constants.BLOCK_TYPES.BATTERY_BASIC,
            Constants.BLOCK_TYPES.BATTERY_ADVANCED,
            Constants.BLOCK_TYPES.BATTERY_ULTIMATE,
            Constants.BLOCK_TYPES.IRON_FURNACE,
            Constants.BLOCK_TYPES.ELECTRIC_FURNACE
        ];
        
        return inputTypes.includes(typeId) || block.hasTag("energy_input");
    }

    canOutput(block) {
        const typeId = block.typeId;
        
        // 出力可能なブロックタイプ
        const outputTypes = [
            Constants.BLOCK_TYPES.GENERATOR,
            Constants.BLOCK_TYPES.THERMAL_GENERATOR,
            Constants.BLOCK_TYPES.CREATIVE_GENERATOR,
            'magisystem:seebeck_generator',
            Constants.BLOCK_TYPES.BATTERY_BASIC,
            Constants.BLOCK_TYPES.BATTERY_ADVANCED,
            Constants.BLOCK_TYPES.BATTERY_ULTIMATE
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
        
        return Utils.formatEnergy(current, max);
    }

    // 燃料管理機能（shared.jsから移行）
    setFuelData(location, fuelData) {
        const key = this.getLocationKey(location);
        const dataKey = `${this.fuelDataProperty}_${key}`;
        
        return ErrorHandler.safeTry(() => {
            world.setDynamicProperty(dataKey, JSON.stringify(fuelData));
            return true;
        }, "EnergySystem.setFuelData", false);
    }

    getFuelData(location) {
        const key = this.getLocationKey(location);
        const dataKey = `${this.fuelDataProperty}_${key}`;
        
        return ErrorHandler.safeTry(() => {
            const data = world.getDynamicProperty(dataKey);
            return data ? JSON.parse(data) : null;
        }, "EnergySystem.getFuelData", null);
    }

    clearFuelData(location) {
        const key = this.getLocationKey(location);
        const dataKey = `${this.fuelDataProperty}_${key}`;
        
        return ErrorHandler.safeTry(() => {
            world.setDynamicProperty(dataKey, undefined);
            return true;
        }, "EnergySystem.clearFuelData", false);
    }

    // shared.js互換のメソッド
    getBlockEnergy(block) {
        const energy = this.getEnergy(block);
        const maxEnergy = this.getMaxCapacity(block);
        const fuel = this.getFuelData(block.location) || {};
        
        return { energy, maxEnergy, fuel };
    }

    setBlockEnergy(block, energyData) {
        if (energyData.energy !== undefined) {
            this.setEnergy(block, energyData.energy);
        }
        if (energyData.fuel !== undefined) {
            this.setFuelData(block.location, energyData.fuel);
        }
        return true;
    }
}

// シングルトンインスタンスをエクスポート
export const energySystem = new EnergySystem();