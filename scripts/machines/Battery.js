import { system } from "@minecraft/server";
import { BaseMachine } from "./BaseMachine.js";
import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import { Constants } from "../core/Constants.js";
import { ParticleEffectManager } from "../effects/ParticleEffectManager.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { Logger } from "../core/Logger.js";
import BlockUtils from "../utils/BlockUtils.js";

/**
 * バッテリークラス
 * BaseMachineを継承してDRY原則を適用
 */
export class Battery extends BaseMachine {
    constructor() {
        super({
            machineType: "Battery",
            defaultData: {},
            soundOnPlace: Constants.SOUNDS.BLOCK_PLACE
        });
        
        // バッテリー容量の定義
        this.capacities = {
            [Constants.BLOCK_TYPES.BATTERY_BASIC]: 50000,
            [Constants.BLOCK_TYPES.BATTERY_ADVANCED]: 200000,
            [Constants.BLOCK_TYPES.BATTERY_ULTIMATE]: 1000000
        };
        
        // 転送速度の定義
        this.transferRates = {
            [Constants.BLOCK_TYPES.BATTERY_BASIC]: 100,
            [Constants.BLOCK_TYPES.BATTERY_ADVANCED]: 500,
            [Constants.BLOCK_TYPES.BATTERY_ULTIMATE]: 2000
        };
    }

    /**
     * バッテリーを登録
     */
    registerBattery(block) {
        const capacity = this.capacities[block.typeId] || 10000;
        const transferRate = this.transferRates[block.typeId] || 100;
        
        // エネルギーシステムに登録（Dynamic Propertyに保存）
        energySystem.setEnergy(block, 0);
        
        return this.register(block, {
            typeId: block.typeId,
            capacity: capacity,
            transferRate: transferRate
        });
    }

    /**
     * バッテリーの登録を解除
     */
    unregisterBattery(location, dimension) {
        return this.unregister(location, dimension);
    }

    /**
     * バッテリー情報を取得
     */
    getBatteryInfo(block) {
        const key = energySystem.getLocationKey(block.location);
        const data = this.machines.get(key);
        const energy = energySystem.getEnergy(block);
        
        if (!data) return null;
        
        return {
            energy: energy,
            maxEnergy: data.capacity,
            fillPercentage: Math.round((energy / data.capacity) * 100),
            transferRate: data.transferRate,
            typeId: data.typeId
        };
    }

    /**
     * バッテリーの更新処理
     */
    updateBattery(block) {
        const key = energySystem.getLocationKey(block.location);
        let data = this.machines.get(key);
        
        if (!data) {
            this.registerBattery(block);
            data = this.machines.get(key);
        }

        const currentEnergy = energySystem.getEnergy(block);
        const maxEnergy = data.capacity;
        
        // デバッグ: updateが呼ばれているか確認
        if (system.currentTick % 100 === 0) {
            Logger.debug(`更新: ${block.typeId} at ${key}: ${currentEnergy}/${maxEnergy} MF`, "Battery");
        }
        
        // エネルギーの受け取り（入力）
        if (currentEnergy < maxEnergy) {
            this.receiveEnergy(block, data, currentEnergy, maxEnergy);
        }
        
        // エネルギーの供給（出力）
        if (currentEnergy > 0) {
            this.distributeEnergy(block, data, currentEnergy);
        }
        
        // 視覚的フィードバック
        this.updateBatteryVisuals(block, currentEnergy, maxEnergy);
    }

    /**
     * エネルギーを受け取る
     * @private
     */
    receiveEnergy(block, data, currentEnergy, maxEnergy) {
        // バッテリーへのエネルギー受け取りは自動的に行われる
        // energyNetwork.distributeEnergyによって処理される
        // ここでは何もする必要がない
    }

    /**
     * エネルギーを配布する
     * @private
     */
    distributeEnergy(block, data, currentEnergy) {
        // デバッグ: 転送試行
        const toDistribute = Math.min(currentEnergy, data.transferRate);
        if (toDistribute > 0 && system.currentTick % 20 === 0) {
            Logger.debug(`転送試行: ${toDistribute} MF from ${block.typeId} (現在: ${currentEnergy} MF)`, "Battery");
        }
        
        const distributed = energyNetwork.distributeEnergy(block, toDistribute);
        
        if (distributed > 0) {
            energySystem.removeEnergy(block, distributed);
            // デバッグ: 転送成功
            Logger.debug(`転送成功: ${distributed} MF from ${block.typeId}`, "Battery");
        } else if (toDistribute > 0 && system.currentTick % 20 === 0) {
            Logger.debug(`転送失敗: 0 MF distributed`, "Battery");
        }
    }

    /**
     * バッテリーの視覚効果を更新
     * @private
     */
    updateBatteryVisuals(block, currentEnergy, maxEnergy) {
        // エネルギー残量に応じて光るレベルを変更
        const fillLevel = Math.floor((currentEnergy / maxEnergy) * 15);
        const chargeLevel = (currentEnergy / maxEnergy) * 100;
        
        ErrorHandler.safeTry(() => {
            BlockUtils.setBlockState(block, "magisystem:fill_level", fillLevel);
        }, "Battery.updateBatteryVisuals");
        
        // パーティクル効果
        ParticleEffectManager.spawnBatteryEffect(block, chargeLevel);
    }

    /**
     * バッテリーがアクティブかどうか
     */
    isActive(block) {
        const energy = energySystem.getEnergy(block);
        return energy > 0;
    }

    /**
     * バッテリーの最大容量を取得
     */
    getMaxCapacity(block) {
        return this.capacities[block.typeId] || 10000;
    }

    /**
     * バッテリーの転送速度を取得
     */
    getTransferRate(block) {
        return this.transferRates[block.typeId] || 100;
    }

    /**
     * タイプIDからバッテリー情報を取得
     */
    getBatteryInfoFromType(typeId) {
        const capacity = this.capacities[typeId];
        const transferRate = this.transferRates[typeId];
        
        if (!capacity) return null;
        
        return {
            capacity: capacity,
            transferRate: transferRate,
            typeId: typeId
        };
    }
}

// シングルトンインスタンスをエクスポート
export const battery = new Battery();