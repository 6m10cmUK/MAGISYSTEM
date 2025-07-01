import { system } from "@minecraft/server";
import { BaseMachine } from "./BaseMachine.js";
import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import { Constants } from "../core/Constants.js";
import { ParticleEffectManager } from "../effects/ParticleEffectManager.js";
import { Logger } from "../core/Logger.js";
import BlockUtils from "../utils/BlockUtils.js";

/**
 * クリエイティブ発電機クラス
 * BaseMachineを継承してDRY原則を適用
 */
export class CreativeGenerator extends BaseMachine {
    constructor() {
        super({
            machineType: "CreativeGenerator",
            defaultData: {
                isActive: true // 常時稼働
            },
            capacity: 10000,
            soundOnPlace: Constants.SOUNDS.BLOCK_PLACE
        });
        
        this.generationRate = Constants.GENERATOR.CREATIVE_OUTPUT; // MF/tick
    }

    /**
     * 発電機を登録（親クラスのregisterメソッドのエイリアス）
     */
    registerGenerator(block) {
        return this.register(block);
    }

    /**
     * 発電機の登録を解除（親クラスのunregisterメソッドのエイリアス）
     */
    unregisterGenerator(location, dimension) {
        return this.unregister(location, dimension);
    }

    /**
     * 発電機の情報を取得（親クラスのgetMachineInfoメソッドのエイリアス）
     */
    getGeneratorInfo(block) {
        const key = energySystem.getLocationKey(block.location);
        const data = this.machines.get(key);
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

    /**
     * クリエイティブ発電機の更新処理
     */
    updateGenerator(block) {
        const key = energySystem.getLocationKey(block.location);
        let data = this.machines.get(key);
        
        if (!data) {
            this.registerGenerator(block);
            data = this.machines.get(key);
        }

        // 常にエネルギーを生成（無限エネルギー）
        const generated = energySystem.addEnergy(block, this.generationRate);
        
        // デバッグ情報（頻度を減らして出力）
        if (system.currentTick % 400 === 0 && generated > 0) {
            const energy = energySystem.getEnergy(block);
            const maxCapacity = energySystem.getMaxCapacity(block);
            Logger.debug(`[CreativeGenerator] Energy: ${energy}/${maxCapacity}, Generated: ${generated}`, this.machineType);
        }
        
        // エネルギーをネットワークに分配
        this.distributeEnergy(block);
        
        // 常に稼働状態
        this.updateVisualState(block, true);
        
        // パーティクルエフェクト
        ParticleEffectManager.spawnGeneratorEffect(block, "creative");
        
        // 追加の派手なエフェクト（低頻度）
        if (system.currentTick % 10 === 0) {
            this.spawnMagicalEffect(block);
        }
    }

    /**
     * エネルギーを周囲に分配
     * @private
     */
    distributeEnergy(block) {
        const currentEnergy = energySystem.getEnergy(block);
        if (currentEnergy > 0) {
            const distributed = energyNetwork.distributeEnergy(
                block, 
                Math.min(currentEnergy, this.generationRate * 2)
            );
            if (distributed > 0) {
                energySystem.removeEnergy(block, distributed);
                
                // デバッグ情報（頻度を減らして出力）
                if (system.currentTick % 400 === 0) {
                    Logger.debug(`[CreativeGenerator] Distributed: ${distributed} MF`, this.machineType);
                }
            }
        }
    }

    /**
     * 魔法のようなエフェクトを生成
     * @private
     */
    spawnMagicalEffect(block) {
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

    /**
     * クリエイティブ発電機は常にアクティブ
     */
    isActive(block) {
        return true;
    }
}

// シングルトンインスタンスをエクスポート
export const creativeGenerator = new CreativeGenerator();