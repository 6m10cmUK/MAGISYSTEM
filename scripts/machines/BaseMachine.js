import { system } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { BlockUtils } from "../utils/BlockUtils.js";
import { Constants } from "../core/Constants.js";
import { Logger } from "../core/Logger.js";

/**
 * すべての機械の基底クラス
 * DRY原則に基づいて共通処理を集約
 */
export class BaseMachine {
    constructor(config) {
        this.machineType = config.machineType;
        this.machines = new Map();
        this.defaultData = config.defaultData || {};
        this.capacity = config.capacity || Constants.ENERGY.DEFAULT_CAPACITY;
        this.soundOnPlace = config.soundOnPlace || Constants.SOUNDS.BLOCK_PLACE;
    }

    /**
     * 機械を登録
     * @param {Block} block - 登録するブロック
     * @param {Object} additionalData - 追加データ
     */
    register(block, additionalData = {}) {
        return ErrorHandler.safeTry(() => {
            const key = energySystem.getLocationKey(block.location);
            Logger.debug(`[BaseMachine] ${this.machineType}を登録: ${key}`, "BaseMachine");
            
            const data = { ...this.defaultData, ...additionalData };
            
            this.machines.set(key, data);
            Logger.debug(`[BaseMachine] データ登録完了 - machines.size: ${this.machines.size}`, "BaseMachine");
            
            // エネルギーシステムに登録
            const currentEnergy = energySystem.getEnergy(block) || 0;
            energySystem.setEnergy(block, currentEnergy);
            
            
            // サウンド再生
            if (this.soundOnPlace) {
                BlockUtils.playSound(block, this.soundOnPlace, { volume: 0.8 });
            }
            
            return true;
        }, `BaseMachine.register[${this.machineType}]`, false);
    }

    /**
     * 機械の登録を解除
     * @param {Location} location - 場所
     * @param {Dimension} dimension - ディメンション
     */
    unregister(location, dimension) {
        return ErrorHandler.safeTry(() => {
            const key = energySystem.getLocationKey(location);
            this.machines.delete(key);
            energySystem.clearEnergy(location, dimension);
            return true;
        }, `BaseMachine.unregister[${this.machineType}]`, false);
    }

    /**
     * 機械の情報を取得
     * @param {Block} block - ブロック
     * @returns {Object|null}
     */
    getMachineInfo(block) {
        const key = energySystem.getLocationKey(block.location);
        return this.machines.get(key) || null;
    }

    /**
     * すべての機械を更新
     * @param {Function} updateCallback - 各機械に対して実行する更新関数
     */
    updateAll(updateCallback) {
        for (const [key, data] of this.machines) {
            ErrorHandler.safeTry(() => {
                updateCallback(key, data);
            }, `BaseMachine.updateAll[${this.machineType}]`);
        }
    }

    /**
     * 視覚的状態を更新
     * @param {Block} block - ブロック
     * @param {boolean} isActive - アクティブ状態
     */
    updateVisualState(block, isActive) {
        return ErrorHandler.safeTry(() => {
            BlockUtils.setBlockState(block, "magisystem:active", isActive ? 1 : 0);
        }, `BaseMachine.updateVisualState[${this.machineType}]`);
    }

    /**
     * パーティクルエフェクトを生成
     * @param {Block} block - ブロック
     * @param {string} effectType - エフェクトタイプ
     */
    spawnParticleEffect(block, effectType = "normal") {
        if (system.currentTick % 5 !== 0) return;
        
        return ErrorHandler.safeTry(() => {
            switch (effectType) {
                case "flame":
                    BlockUtils.spawnParticle(block, Constants.PARTICLES.FLAME, {
                        offset: { x: 0, y: 0.5, z: 0 }
                    });
                    BlockUtils.spawnParticle(block, Constants.PARTICLES.SMOKE, {
                        offset: { x: 0, y: 1.0, z: 0 }
                    });
                    break;
                    
                case "electric":
                    BlockUtils.spawnParticle(block, Constants.PARTICLES.ELECTRIC_SPARK, {
                        offset: { x: 0, y: 0.8, z: 0 }
                    });
                    break;
                    
                case "energy":
                    const randomX = (Math.random() - 0.5) * 0.5;
                    const randomZ = (Math.random() - 0.5) * 0.5;
                    BlockUtils.spawnParticle(block, Constants.PARTICLES.ENERGY, {
                        offset: { x: randomX, y: 0.5, z: randomZ }
                    });
                    break;
                    
                case "creative":
                    BlockUtils.spawnParticle(block, Constants.PARTICLES.ENERGY, {
                        offset: { x: 0, y: 0.5, z: 0 }
                    });
                    BlockUtils.spawnParticle(block, Constants.PARTICLES.ELECTRIC_SPARK, {
                        offset: { x: 0, y: 0.8, z: 0 }
                    });
                    break;
            }
        }, `BaseMachine.spawnParticleEffect[${this.machineType}]`);
    }

    /**
     * 登録されている機械の数を取得
     * @returns {number}
     */
    getMachineCount() {
        return this.machines.size;
    }

    /**
     * すべての機械をクリア
     */
    clearAll() {
        this.machines.clear();
    }
}