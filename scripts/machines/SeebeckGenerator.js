import { world, system } from "@minecraft/server";
import { BaseMachine } from "./BaseMachine.js";
import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import { Constants } from "../core/Constants.js";
import { Logger } from "../core/Logger.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import BlockUtils from "../utils/BlockUtils.js";

/**
 * ゼーベック発電機クラス
 * BaseMachineを継承してDRY原則を適用
 */
export class SeebeckGenerator extends BaseMachine {
    constructor() {
        super({
            machineType: "SeebeckGenerator",
            defaultData: {
                isGenerating: false
            },
            capacity: Constants.GENERATOR.SEEBECK_CAPACITY,
            soundOnPlace: Constants.SOUNDS.BLOCK_PLACE
        });
        
        this.generationRate = Constants.GENERATOR.SEEBECK_OUTPUT; // 60 MF/tick
    }
    
    /**
     * ゼーベック発電機を登録（親クラスのregisterメソッドのエイリアス）
     */
    registerSeebeckGenerator(block) {
        return this.register(block);
    }
    
    /**
     * ゼーベック発電機の登録を解除（親クラスのunregisterメソッドのエイリアス）
     */
    unregisterSeebeckGenerator(location, dimension) {
        return this.unregister(location, dimension);
    }
    
    /**
     * ゼーベック発電機の更新処理
     */
    updateSeebeckGenerator(block) {
        const key = energySystem.getLocationKey(block.location);
        let data = this.machines.get(key);
        
        if (!data) {
            this.registerSeebeckGenerator(block);
            data = this.machines.get(key);
        }

        // 溶岩と水の隣接をチェック
        const hasLavaAndWater = this.checkLavaAndWater(block);
        
        if (hasLavaAndWater) {
            // エネルギー生成
            const generated = energySystem.addEnergy(block, this.generationRate);
            
            // エネルギーをネットワークに分配
            this.distributeEnergy(block);
            
            // 視覚効果の更新
            this.updateVisualState(block, true);
            
            // データ更新
            data.isGenerating = true;
            this.machines.set(key, data);
            
            // デバッグ: エネルギー生成をログ出力
            if (system.currentTick % 200 === 0) {
                const energy = energySystem.getEnergy(block);
                const maxCapacity = energySystem.getMaxCapacity(block);
                Logger.debug(`[SeebeckGenerator] Energy: ${energy}/${maxCapacity}, Generated: ${generated}`, this.machineType);
            }
        } else {
            // アイドル状態
            this.updateVisualState(block, false);
            
            // データ更新
            data.isGenerating = false;
            this.machines.set(key, data);
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
            }
        }
    }
    
    /**
     * 視覚的な状態を更新
     * @private
     */
    updateVisualState(block, isActive) {
        return ErrorHandler.safeTry(() => {
            BlockUtils.setBlockState(block, "magisystem:active", isActive ? 1 : 0);
        }, "SeebeckGenerator.updateVisualState");
    }
    
    /**
     * 溶岩と水の隣接をチェック
     * @private
     */
    checkLavaAndWater(block) {
        const { x, y, z } = block.location;
        const dimension = block.dimension;
        
        const adjacentPositions = [
            { x: x + 1, y, z },
            { x: x - 1, y, z },
            { x, y: y + 1, z },
            { x, y: y - 1, z },
            { x, y, z: z + 1 },
            { x, y, z: z - 1 }
        ];
        
        let hasLava = false;
        let hasWater = false;
        
        for (const pos of adjacentPositions) {
            try {
                const adjacentBlock = dimension.getBlock(pos);
                if (!adjacentBlock) continue;
                
                if (adjacentBlock.typeId === "minecraft:lava" || 
                    adjacentBlock.typeId === "minecraft:flowing_lava") {
                    hasLava = true;
                } else if (adjacentBlock.typeId === "minecraft:water" || 
                           adjacentBlock.typeId === "minecraft:flowing_water") {
                    hasWater = true;
                }
                
                if (hasLava && hasWater) {
                    return true;
                }
            } catch (error) {
                // ブロックが読み込まれていない場合は無視
            }
        }
        
        return false;
    }
    
    /**
     * ゼーベック発電機の稼働状態を確認
     */
    isActive(block) {
        const data = this.getMachineInfo(block);
        return data && data.isGenerating;
    }
    
    /**
     * ゼーベック発電機の情報を取得（親クラスのgetMachineInfoメソッドのエイリアス）
     */
    getSeebeckGeneratorInfo(block) {
        const info = this.getMachineInfo(block);
        if (info && block) {
            // 位置情報を追加
            info.location = block.location;
        }
        return info;
    }
}

// シングルトンインスタンスをエクスポート
export const seebeckGenerator = new SeebeckGenerator();