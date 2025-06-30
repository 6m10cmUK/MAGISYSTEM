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
        return this.getMachineInfo(block);
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
        
        // パーティクルエフェクト
        ParticleEffectManager.spawnGeneratorEffect(block, "test");
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
            
            // 燃料アイテムの表示を更新
            this.updateFuelDisplay(block, data);
            
            // パーティクルエフェクト
            ParticleEffectManager.spawnGeneratorEffect(block, "normal");
            
            // 燃料が尽きた場合
            if (data.burnTime <= 0) {
                data.fuelItem = null;
                data.maxBurnTime = 0;
                this.machines.set(energySystem.getLocationKey(block.location), data);
                this.removeFuelDisplay(block);
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
                    
                    // 燃料アイテムを表示
                    this.createFuelDisplay(block, newFuel.typeId);
                }
            }
            
            // アイドル状態
            this.updateVisualState(block, false);
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
     * 燃料アイテムを表示
     * @private
     */
    createFuelDisplay(block, itemTypeId) {
        return ErrorHandler.safeTry(() => {
            // 既存の表示アイテムを削除
            this.removeFuelDisplay(block);
            
            // アイテムの中心位置を計算（ブロックの中央、高さ8ピクセル）
            const location = {
                x: block.location.x + 0.5,
                y: block.location.y + 0.5,
                z: block.location.z + 0.5
            };
            
            // アイテムエンティティを生成
            const itemStack = new ItemStack(itemTypeId, 1);
            const item = block.dimension.spawnItem(itemStack, location);
            
            // アイテムを拾えないようにする
            item.addTag("generator_display");
            item.addTag(`generator_${block.location.x}_${block.location.y}_${block.location.z}`);
            
            // アイテムを静止させる（重力を無効化できない場合は定期的に位置をリセット）
            item.teleport(location);
            
            Logger.debug(`燃料アイテム表示: ${itemTypeId}`, "Generator");
        }, "Generator.createFuelDisplay");
    }

    /**
     * 燃料アイテムの表示を更新
     * @private
     */
    updateFuelDisplay(block, data) {
        return ErrorHandler.safeTry(() => {
            const tag = `generator_${block.location.x}_${block.location.y}_${block.location.z}`;
            const entities = block.dimension.getEntities({
                tags: [tag],
                type: "minecraft:item",
                location: block.location,
                maxDistance: 2
            });
            
            // アイテムの位置を固定
            const location = {
                x: block.location.x + 0.5,
                y: block.location.y + 0.5,
                z: block.location.z + 0.5
            };
            
            for (const entity of entities) {
                entity.teleport(location);
                
                // 燃焼の進行度に応じて回転させる
                const rotationSpeed = 2; // 度/tick
                const currentRotation = entity.getRotation();
                entity.setRotation({
                    x: currentRotation.x,
                    y: (currentRotation.y + rotationSpeed) % 360
                });
            }
        }, "Generator.updateFuelDisplay");
    }

    /**
     * 燃料アイテムの表示を削除
     * @private
     */
    removeFuelDisplay(block) {
        return ErrorHandler.safeTry(() => {
            const tag = `generator_${block.location.x}_${block.location.y}_${block.location.z}`;
            const entities = block.dimension.getEntities({
                tags: [tag],
                type: "minecraft:item",
                location: block.location,
                maxDistance: 2
            });
            
            for (const entity of entities) {
                entity.kill();
            }
            
            Logger.debug("燃料アイテム表示を削除", "Generator");
        }, "Generator.removeFuelDisplay");
    }
}

// シングルトンインスタンスをエクスポート
export const generator = new Generator();