import { world, system, ItemStack } from "@minecraft/server";
import { BaseMachine } from "./BaseMachine.js";
import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import { FuelRegistry } from "../core/FuelRegistry.js";
import { Constants } from "../core/Constants.js";
import { BlockTypeUtils } from "../utils/BlockTypeUtils.js";
import { ParticleEffectManager } from "../effects/ParticleEffectManager.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { Logger } from "../core/Logger.js";
import BlockUtils from "../utils/BlockUtils.js";

/**
 * 発電機クラス
 * BaseMachineを継承してDRY原則を適用
 */
export class Generator extends BaseMachine {
    constructor() {
        super({
            machineType: "Generator",
            defaultData: {
                burnTime: 0,
                maxBurnTime: 0,
                fuelItem: null
            },
            capacity: 4000,
            soundOnPlace: Constants.SOUNDS.BLOCK_PLACE
        });
        
        this.generationRate = 40; // MF/tick
        this.testMode = false; // テストモード無効（デフォルト）
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
        const info = this.getMachineInfo(block);
        if (info && block) {
            // 位置情報を追加
            info.location = block.location;
        }
        return info;
    }

    /**
     * 発電機の更新処理
     */
    updateGenerator(block) {
        const key = energySystem.getLocationKey(block.location);
        let data = this.machines.get(key);
        
        if (!data) {
            this.registerGenerator(block);
            data = this.machines.get(key);
        }

        // テストモード: 無限発電
        if (this.testMode) {
            this.runTestMode(block);
            return;
        }

        // 通常モード（燃料必要）
        this.runNormalMode(block, data);
    }

    /**
     * テストモードでの実行
     * @private
     */
    runTestMode(block) {
        // 常にエネルギーを生成
        const generated = energySystem.addEnergy(block, this.generationRate);
        
        // デバッグ: エネルギー生成をログ出力
        if (system.currentTick % 200 === 0) {
            const energy = energySystem.getEnergy(block);
            const maxCapacity = energySystem.getMaxCapacity(block);
            Logger.debug(`[Generator] Energy: ${energy}/${maxCapacity}, Generated: ${generated}`, this.machineType);
        }
        
        // エネルギーをネットワークに分配
        this.distributeEnergy(block);
        
        // 常に稼働状態
        this.updateVisualState(block, true);
        
        // パーティクルエフェクト（無効化）
        // ParticleEffectManager.spawnGeneratorEffect(block, "test");
    }

    /**
     * 通常モードでの実行
     * @private
     */
    runNormalMode(block, data) {
        if (data.burnTime > 0) {
            // 燃料燃焼中
            data.burnTime--;
            
            // エネルギー生成
            energySystem.addEnergy(block, this.generationRate);
            
            // エネルギーをネットワークに分配
            this.distributeEnergy(block);
            
            // 視覚効果の更新
            this.updateVisualState(block, true);
            
            // 燃焼進行状況をブロックステートに反映
            this.updateBurnProgressState(block, data);
            
            // パーティクルエフェクト（無効化）
            // ParticleEffectManager.spawnGeneratorEffect(block, "normal");
            
            // 燃料が尽きた場合
            if (data.burnTime <= 0) {
                data.fuelItem = null;
                data.maxBurnTime = 0;
                this.machines.set(energySystem.getLocationKey(block.location), data);
                // 進行状況をリセット
                this.updateBurnProgressState(block, { burnTime: 0, maxBurnTime: 0 });
            }
        } else {
            // 新しい燃料を取得
            const newFuel = this.getFuelFromInventory(block);
            if (newFuel) {
                const burnTime = FuelRegistry.getFuelValue(newFuel.typeId);
                if (burnTime > 0) {
                    data.burnTime = burnTime;
                    data.maxBurnTime = burnTime;
                    data.fuelItem = newFuel.typeId;
                    this.machines.set(energySystem.getLocationKey(block.location), data);
                    
                    // 燃料を消費
                    this.consumeFuel(block);
                    
                    // 燃焼エフェクトの開始
                    Logger.info(`燃料燃焼開始: ${newFuel.typeId} (${burnTime}tick)`, "Generator");
                }
            }
            
            // アイドル状態
            this.updateVisualState(block, false);
            // 進行状況を0に
            this.updateBurnProgressState(block, { burnTime: 0, maxBurnTime: 0 });
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
     * 上部のインベントリから燃料を取得
     * @private
     */
    getFuelFromInventory(block) {
        return ErrorHandler.safeTry(() => {
            // 上部のブロックを取得
            const aboveLocation = {
                x: block.location.x,
                y: block.location.y + 1,
                z: block.location.z
            };
            const aboveBlock = block.dimension.getBlock(aboveLocation);
            
            if (!aboveBlock) return null;
            
            // 上部ブロックのインベントリを確認
            const inventory = aboveBlock.getComponent("minecraft:inventory");
            if (!inventory?.container) {
                // チェストやホッパーなどのインベントリがない場合
                Logger.debug(`上部ブロック ${aboveBlock.typeId} にインベントリがありません`, "Generator");
                return null;
            }
            
            const container = inventory.container;
            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (item && FuelRegistry.isFuel(item.typeId)) {
                    Logger.debug(`燃料発見: ${item.typeId} x${item.amount}`, "Generator");
                    return item;
                }
            }
            return null;
        }, "Generator.getFuelFromInventory", null);
    }

    /**
     * 上部のインベントリから燃料を消費
     * @private
     */
    consumeFuel(block) {
        return ErrorHandler.safeTry(() => {
            // 上部のブロックを取得
            const aboveLocation = {
                x: block.location.x,
                y: block.location.y + 1,
                z: block.location.z
            };
            const aboveBlock = block.dimension.getBlock(aboveLocation);
            
            if (!aboveBlock) return false;
            
            const inventory = aboveBlock.getComponent("minecraft:inventory");
            if (!inventory?.container) return false;
            
            const container = inventory.container;
            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (item && FuelRegistry.isFuel(item.typeId)) {
                    if (item.amount > 1) {
                        item.amount--;
                        container.setItem(i, item);
                    } else {
                        container.setItem(i, undefined);
                    }
                    
                    // アイテムがバケツの場合、空のバケツを返す
                    if (item.typeId === "minecraft:lava_bucket") {
                        const emptyBucket = new ItemStack("minecraft:bucket", 1);
                        container.addItem(emptyBucket);
                    }
                    
                    BlockUtils.playSound(block, Constants.SOUNDS.FIZZ, { volume: 0.3 });
                    Logger.debug(`燃料消費: ${item.typeId}`, "Generator");
                    return true;
                }
            }
            return false;
        }, "Generator.consumeFuel", false);
    }

    /**
     * テストモードの切り替え
     */
    setTestMode(enabled) {
        this.testMode = enabled;
        Logger.info(`Generator test mode: ${enabled ? "ON" : "OFF"}`, this.machineType);
    }

    /**
     * 発電機の稼働状態を確認
     */
    isActive(block) {
        const data = this.getMachineInfo(block);
        return data && data.burnTime > 0;
    }

    /**
     * 視覚的な状態を更新
     * @private
     */
    updateVisualState(block, isActive) {
        return ErrorHandler.safeTry(() => {
            BlockUtils.setBlockState(block, "magisystem:active", isActive ? 1 : 0);
        }, "Generator.updateVisualState");
    }

    /**
     * 燃焼進行状況をブロックステートに反映
     * @private
     */
    updateBurnProgressState(block, data) {
        return ErrorHandler.safeTry(() => {
            if (!data || data.maxBurnTime <= 0) {
                BlockUtils.setBlockState(block, "magisystem:burn_progress", 0);
                return;
            }
            
            // 進行状況を0-10の範囲に変換（逆順：満タンが10、空が0）
            const progress = data.burnTime / data.maxBurnTime;
            const progressState = Math.floor(progress * 10);
            
            // ブロックステートを更新
            BlockUtils.setBlockState(block, "magisystem:burn_progress", progressState);
        }, "Generator.updateBurnProgressState");
    }






}

// シングルトンインスタンスをエクスポート
export const generator = new Generator();