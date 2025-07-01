import { world, system, EntityInventoryComponent, ItemStack } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { BaseMachine } from "./BaseMachine.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { Constants } from "../core/Constants.js";
import { Logger } from "../core/Logger.js";
import { Utils } from "../core/Utils.js";
import BlockUtils from "../utils/BlockUtils.js";
import { machineDataManager } from "./MachineDataManager.js";

/**
 * 電気炉クラス
 * 電力を使用してアイテムを精錬する
 */
export class ElectricFurnace extends BaseMachine {
    constructor() {
        super({
            machineType: 'electric_furnace',
            defaultData: {
                smeltTime: 0,
                maxSmeltTime: 0,
                inputItem: null,
                outputItem: null,
                active: false
            },
            capacity: 10000, // 10,000 MF
            soundOnPlace: Constants.SOUNDS.BLOCK_PLACE
        });

        // 定数
        this.ENERGY_PER_TICK = 2; // 2 MF/tick (40 MF/s)
        this.SMELT_TIME = 133; // バニラの1.5倍速 (200tick → 133tick)
        this.STACK_LIMIT = 64;
        
        // Dynamic Properties用のキー
        this.SMELT_DATA_KEY = 'magisystem:smelt_data';
        
        // 出力バッファ（パイプ連携用）
        this.outputBuffer = new Map();
    }

    /**
     * 精錬処理を更新
     * @param {Block} block 
     */
    update(block) {
        const self = this;
        return ErrorHandler.safeTry(() => {
            const key = energySystem.getLocationKey(block.location);
            const machineData = self.machines.get(key);
            
            if (!machineData) {
                Logger.debug(`電気炉データが見つかりません: ${key}`, "ElectricFurnace");
                return;
            }
            
            // デバッグ情報を出力（初回のみ）
            if (machineData.smeltTime > 0 && machineData.smeltTime === self.SMELT_TIME) {
                Logger.debug(`電気炉更新開始: active=${machineData.active}, smeltTime=${machineData.smeltTime}, inputItem=${machineData.inputItem}`, "ElectricFurnace");
            }

            // 入力/出力インベントリの取得
            const inputInventory = self.getInputInventory(block);
            const outputInventory = self.getOutputInventory(block);

            // パイプ経由で精錬中の場合は入力インベントリがなくても継続
            if (!inputInventory && machineData.smeltTime === 0) {
                // 入力インベントリがなく、精錬中でもない場合は動作停止
                if (machineData.active) {
                    self.stopSmelting(block, machineData);
                }
                return;
            }

            // 精錬中の処理
            if (machineData.smeltTime > 0) {
                // 精錬中は必ずactiveにする
                if (!machineData.active) {
                    machineData.active = true;
                    Logger.debug(`電気炉のactiveフラグをtrueに修正`, "ElectricFurnace");
                }
                
                const energy = energySystem.getEnergy(block) || 0;
                Logger.debug(`電気炉精錬更新: smeltTime=${machineData.smeltTime}, energy=${energy} MF, active=${machineData.active}`, "ElectricFurnace");
                
                if (energy >= self.ENERGY_PER_TICK * 20) {
                    // エネルギーを消費して精錬を進める（20tick分）
                    energySystem.removeEnergy(block, self.ENERGY_PER_TICK * 20);
                    machineData.smeltTime -= 20;
                    Logger.debug(`精錬進行: 残り${machineData.smeltTime}tick`, "ElectricFurnace");

                    // 進捗の更新
                    self.updateSmeltProgress(block, machineData);

                    // 精錬完了
                    if (machineData.smeltTime <= 0) {
                        Logger.debug(`精錬完了処理を開始`, "ElectricFurnace");
                        self.completeSmelt(block, machineData, outputInventory);
                        // 完了後すぐに次の精錬を試行
                        self.tryStartSmelt(block, machineData, inputInventory, outputInventory);
                    }
                } else {
                    // エネルギー不足で一時停止
                    Logger.debug("電気炉: エネルギー不足で精錬を一時停止", "ElectricFurnace");
                }
            } else {
                // 新しい精錬を開始
                self.tryStartSmelt(block, machineData, inputInventory, outputInventory);
            }

            // 視覚状態の更新
            self.updateVisualState(block, machineData.active);
            
            // データを保存
            self.saveSmeltData(block, machineData);

        }, "ElectricFurnace.update");
    }

    /**
     * 入力インベントリを取得
     * @param {Block} block 
     * @returns {EntityInventoryComponent|null}
     */
    getInputInventory(block) {
        const above = BlockUtils.getAdjacentBlock(block, 'up');
        if (!above) return null;

        const inventory = above.getComponent("minecraft:inventory");
        if (!inventory?.container) return null;

        return inventory;
    }

    /**
     * 出力インベントリを取得
     * @param {Block} block 
     * @returns {EntityInventoryComponent|null}
     */
    getOutputInventory(block) {
        const below = BlockUtils.getAdjacentBlock(block, 'down');
        if (!below) return null;

        const inventory = below.getComponent("minecraft:inventory");
        if (!inventory?.container) return null;

        return inventory;
    }

    /**
     * 隣接する出力パイプがあるかチェック
     * @param {Block} block
     * @returns {boolean}
     */
    hasAdjacentOutputPipe(block) {
        const adjacents = [
            block.above(),
            block.below(),
            block.north(),
            block.south(),
            block.east(),
            block.west()
        ];

        for (const adj of adjacents) {
            if (adj && adj.typeId === "magisystem:pipe_output") {
                Logger.debug(`電気炉に隣接する出力パイプを発見: ${Utils.locationToKey(adj.location)}`, "ElectricFurnace");
                return true;
            }
        }

        return false;
    }

    /**
     * 精錬を開始
     * @param {Block} block 
     * @param {Object} machineData 
     * @param {EntityInventoryComponent} inputInventory 
     * @param {EntityInventoryComponent} outputInventory 
     */
    tryStartSmelt(block, machineData, inputInventory, outputInventory) {
        // 入力インベントリがない場合はスキップ
        if (!inputInventory) return;
        
        const container = inputInventory.container;
        if (!container || container.emptySlotsCount === container.size) return;

        // 精錬可能なアイテムを探す
        for (let i = 0; i < container.size; i++) {
            const item = container.getItem(i);
            if (!item) continue;

            const smeltResult = this.getSmeltResult(item.typeId);
            if (!smeltResult) continue;

            // 出力先の確認
            if (outputInventory && !this.canOutputItem(outputInventory, smeltResult)) {
                continue;
            }

            // 精錬開始
            container.setItem(i, item.amount > 1 ? 
                new ItemStack(item.typeId, item.amount - 1) : undefined);

            machineData.inputItem = item.typeId;
            machineData.outputItem = smeltResult;
            machineData.smeltTime = this.SMELT_TIME;
            machineData.maxSmeltTime = this.SMELT_TIME;
            machineData.active = true;

            Logger.debug(`精錬開始: ${item.typeId} → ${smeltResult}`, "ElectricFurnace");
            
            // すぐにデータを保存
            this.saveSmeltData(block, machineData);
            Logger.debug(`精錬データを保存しました`, "ElectricFurnace");
            return;
        }
    }

    /**
     * 精錬結果を取得
     * @param {string} itemId 
     * @returns {string|null}
     */
    getSmeltResult(itemId) {
        // バニラの精錬レシピ
        const smeltRecipes = {
            // 鉱石
            'minecraft:iron_ore': 'minecraft:iron_ingot',
            'minecraft:deepslate_iron_ore': 'minecraft:iron_ingot',
            'minecraft:gold_ore': 'minecraft:gold_ingot',
            'minecraft:deepslate_gold_ore': 'minecraft:gold_ingot',
            'minecraft:copper_ore': 'minecraft:copper_ingot',
            'minecraft:deepslate_copper_ore': 'minecraft:copper_ingot',
            'minecraft:ancient_debris': 'minecraft:netherite_scrap',
            
            // 原石
            'minecraft:raw_iron': 'minecraft:iron_ingot',
            'minecraft:raw_gold': 'minecraft:gold_ingot',
            'minecraft:raw_copper': 'minecraft:copper_ingot',
            
            // 食料
            'minecraft:porkchop': 'minecraft:cooked_porkchop',
            'minecraft:beef': 'minecraft:cooked_beef',
            'minecraft:chicken': 'minecraft:cooked_chicken',
            'minecraft:cod': 'minecraft:cooked_cod',
            'minecraft:salmon': 'minecraft:cooked_salmon',
            'minecraft:potato': 'minecraft:baked_potato',
            'minecraft:mutton': 'minecraft:cooked_mutton',
            'minecraft:rabbit': 'minecraft:cooked_rabbit',
            'minecraft:kelp': 'minecraft:dried_kelp',
            
            // その他
            'minecraft:sand': 'minecraft:glass',
            'minecraft:red_sand': 'minecraft:glass',
            'minecraft:cobblestone': 'minecraft:stone',
            'minecraft:stone': 'minecraft:smooth_stone',
            'minecraft:clay_ball': 'minecraft:brick',
            'minecraft:netherrack': 'minecraft:nether_brick',
            'minecraft:clay': 'minecraft:terracotta',
            'minecraft:stone_bricks': 'minecraft:cracked_stone_bricks',
            'minecraft:cactus': 'minecraft:green_dye',
            'minecraft:log': 'minecraft:charcoal',
            'minecraft:oak_log': 'minecraft:charcoal',
            'minecraft:spruce_log': 'minecraft:charcoal',
            'minecraft:birch_log': 'minecraft:charcoal',
            'minecraft:jungle_log': 'minecraft:charcoal',
            'minecraft:acacia_log': 'minecraft:charcoal',
            'minecraft:dark_oak_log': 'minecraft:charcoal',
            'minecraft:mangrove_log': 'minecraft:charcoal',
            'minecraft:cherry_log': 'minecraft:charcoal',
            'minecraft:wet_sponge': 'minecraft:sponge',
            'minecraft:sea_pickle': 'minecraft:lime_dye',
            'minecraft:quartz': 'minecraft:smooth_quartz',
            'minecraft:chorus_fruit': 'minecraft:popped_chorus_fruit'
        };

        return smeltRecipes[itemId] || null;
    }

    /**
     * アイテムを出力可能か確認
     * @param {EntityInventoryComponent} outputInventory 
     * @param {string} itemId 
     * @returns {boolean}
     */
    canOutputItem(outputInventory, itemId) {
        // 出力インベントリがない場合はfalse
        if (!outputInventory) return false;
        
        const container = outputInventory.container;
        if (!container) return false;

        // 空きスロットがあるか確認
        if (container.emptySlotsCount > 0) return true;

        // 同じアイテムでスタック可能か確認
        for (let i = 0; i < container.size; i++) {
            const item = container.getItem(i);
            if (item && item.typeId === itemId && item.amount < this.STACK_LIMIT) {
                return true;
            }
        }

        return false;
    }

    /**
     * 出力バッファからアイテムを取得（パイプシステム用）
     * @param {Block} block
     * @returns {ItemStack|null}
     */
    extractFromOutputBuffer(block) {
        const key = Utils.locationToKey(block.location);
        const bufferedItems = this.outputBuffer.get(key) || [];
        
        if (bufferedItems.length > 0) {
            const item = bufferedItems.shift();
            if (bufferedItems.length === 0) {
                this.outputBuffer.delete(key);
            } else {
                this.outputBuffer.set(key, bufferedItems);
            }
            Logger.debug(`バッファからアイテムを取り出し: ${item.typeId}`, "ElectricFurnace");
            return item;
        }
        
        return null;
    }

    /**
     * インベントリコンポーネントを取得（パイプシステム用）
     * @param {Block} block
     * @returns {Object} 仮想インベントリコンポーネント
     */
    getInventoryComponent(block) {
        const self = this;
        const key = Utils.locationToKey(block.location);
        
        return {
            container: {
                size: 2, // 入力1、出力1
                
                // アイテムを取得
                getItem(slot) {
                    if (slot === 0) {
                        // 入力スロット（未実装）
                        return null;
                    } else if (slot === 1) {
                        // 出力スロット（バッファから）
                        const bufferedItems = self.outputBuffer.get(key) || [];
                        if (bufferedItems.length > 0) {
                            return bufferedItems[0];
                        }
                    }
                    return null;
                },
                
                // アイテムを設定（パイプからの入力用）
                setItem(slot, itemStack) {
                    if (slot === 0 && itemStack) {
                        // 入力スロットに設定（精錬可能かチェック）
                        const smeltResult = self.getSmeltResult(itemStack.typeId);
                        if (smeltResult) {
                            // 精錬可能なアイテムなら受け入れる
                            const machineData = self.machines.get(key);
                            if (machineData && !machineData.active) {
                                // 精錬を開始
                                machineData.inputItem = itemStack.typeId;
                                machineData.outputItem = smeltResult;
                                machineData.smeltTime = self.SMELT_TIME;
                                machineData.maxSmeltTime = self.SMELT_TIME;
                                machineData.active = true;
                                Logger.info(`パイプから精錬開始: ${itemStack.typeId} → ${smeltResult}`, "ElectricFurnace");
                                self.saveSmeltData(block, machineData);
                                return true;
                            }
                        }
                    } else if (slot === 1 && !itemStack) {
                        // 出力スロットからアイテムを取り出し
                        return self.extractFromOutputBuffer(block);
                    }
                    return false;
                },
                
                // 空きスロット数
                get emptySlotsCount() {
                    const machineData = self.machines.get(key);
                    return machineData && !machineData.active ? 1 : 0;
                },
                
                // アイテムを追加可能かチェック（パイプシステム用）
                canAddItem(itemStack) {
                    const machineData = self.machines.get(key);
                    // 精錬中の場合は受け入れない
                    if (machineData && machineData.active) {
                        return false;
                    }
                    // 精錬可能なアイテムかチェック
                    const smeltResult = self.getSmeltResult(itemStack.typeId);
                    return smeltResult !== null;
                }
            }
        };
    }

    /**
     * 精錬完了処理
     * @param {Block} block 
     * @param {Object} machineData 
     * @param {EntityInventoryComponent|null} outputInventory 
     */
    completeSmelt(block, machineData, outputInventory) {
        const outputItem = new ItemStack(machineData.outputItem, 1);
        let outputSuccess = false;

        // まず下のチェストに出力を試みる
        if (outputInventory) {
            const container = outputInventory.container;
            if (container) {
                if (this.canOutputItem(outputInventory, machineData.outputItem)) {
                    container.addItem(outputItem);
                    Logger.debug(`精錬完了: ${machineData.outputItem}を出力インベントリに追加`, "ElectricFurnace");
                    outputSuccess = true;
                } else {
                    Logger.debug(`出力インベントリが満杯`, "ElectricFurnace");
                }
            }
        }
        
        // 出力できなかった場合、隣接する出力パイプがあるかチェック
        if (!outputSuccess && this.hasAdjacentOutputPipe(block)) {
            // バッファに追加（アイテムパイプシステムが後で取得）
            const key = Utils.locationToKey(block.location);
            const bufferedItems = this.outputBuffer.get(key) || [];
            bufferedItems.push(outputItem);
            this.outputBuffer.set(key, bufferedItems);
            Logger.debug(`精錬完了: ${machineData.outputItem}を出力バッファに追加`, "ElectricFurnace");
            outputSuccess = true;
        }
        
        // どちらもない場合は正面にドロップ
        if (!outputSuccess) {
            const direction = block.permutation.getState('minecraft:cardinal_direction');
            const oppositeDirections = {
                'north': 'south',
                'south': 'north',
                'east': 'west',
                'west': 'east'
            };
            const frontDirection = oppositeDirections[direction] || direction;
            const dropLocation = Utils.getOffsetLocation(block.location, frontDirection, 1);
            block.dimension.spawnItem(outputItem, dropLocation);
            Logger.debug(`精錬完了: ${machineData.outputItem}を正面にドロップ（${frontDirection}方向）`, "ElectricFurnace");
        }

        // データリセット
        machineData.inputItem = null;
        machineData.outputItem = null;
        machineData.smeltTime = 0;
        machineData.maxSmeltTime = 0;
        machineData.active = false;
        Logger.debug(`電気炉データをリセット: active=${machineData.active}, smeltTime=${machineData.smeltTime}`, "ElectricFurnace");
    }

    /**
     * 精錬を停止
     * @param {Block} block 
     * @param {Object} machineData 
     */
    stopSmelting(block, machineData) {
        machineData.active = false;
        this.updateVisualState(block, false);
        this.updateSmeltProgress(block, machineData);
        Logger.debug("精錬を停止", "ElectricFurnace");
    }

    /**
     * 視覚状態を更新
     * @param {Block} block 
     * @param {boolean} active 
     */
    updateVisualState(block, active) {
        ErrorHandler.safeTry(() => {
            const currentActive = block.permutation.getState('magisystem:active') || 0;
            if (currentActive !== (active ? 1 : 0)) {
                block.setPermutation(block.permutation.withState('magisystem:active', active ? 1 : 0));
            }
        }, "ElectricFurnace.updateVisualState");
    }

    /**
     * 精錬進捗を更新
     * @param {Block} block 
     * @param {Object} machineData 
     */
    updateSmeltProgress(block, machineData) {
        ErrorHandler.safeTry(() => {
            let progress = 0;
            if (machineData.maxSmeltTime > 0) {
                const percentage = (machineData.maxSmeltTime - machineData.smeltTime) / machineData.maxSmeltTime;
                progress = Math.floor(percentage * 10);
            }

            const currentProgress = block.permutation.getState('magisystem:smelt_progress') || 0;
            if (currentProgress !== progress) {
                block.setPermutation(block.permutation.withState('magisystem:smelt_progress', progress));
            }
        }, "ElectricFurnace.updateSmeltProgress");
    }

    /**
     * 精錬データを保存
     * @param {Block} block 
     * @param {Object} machineData 
     */
    saveSmeltData(block, machineData) {
        const self = this;
        ErrorHandler.safeTry(() => {
            const key = energySystem.getLocationKey(block.location);
            
            if (machineData.smeltTime > 0) {
                const smeltData = {
                    smeltTime: machineData.smeltTime,
                    maxSmeltTime: machineData.maxSmeltTime,
                    inputItem: machineData.inputItem,
                    outputItem: machineData.outputItem
                };
                // 統一的なデータ管理システムを使用
                machineDataManager.saveMachineData(key, 'smelt', smeltData);
            } else {
                // データをクリア
                machineDataManager.clearMachineData(key, 'smelt');
            }
        }, "ElectricFurnace.saveSmeltData");
    }

    /**
     * 精錬データを復元
     * @param {Block} block 
     */
    restoreSmeltData(block) {
        const self = this;
        return ErrorHandler.safeTry(() => {
            const key = energySystem.getLocationKey(block.location);
            Logger.debug(`電気炉復元開始: ${key}`, "ElectricFurnace");
            
            const machineData = self.machines.get(key);
            if (!machineData) {
                Logger.warn(`電気炉データが見つからない: ${key}`, "ElectricFurnace");
                return;
            }

            // 統一的なデータ管理システムから取得
            const smeltData = machineDataManager.getMachineData(key, 'smelt');
            
            Logger.debug(`保存データ確認: ${smeltData ? '有り' : '無し'}`, "ElectricFurnace");
            
            if (smeltData) {
                machineData.smeltTime = smeltData.smeltTime;
                machineData.maxSmeltTime = smeltData.maxSmeltTime;
                machineData.inputItem = smeltData.inputItem;
                machineData.outputItem = smeltData.outputItem;
                machineData.active = true;

                Logger.debug(`精錬状態を復元: ${smeltData.inputItem} → ${smeltData.outputItem} (残り${smeltData.smeltTime}tick)`, "ElectricFurnace");

                // 視覚状態も更新
                self.updateVisualState(block, true);
                self.updateSmeltProgress(block, machineData);
            }
        }, "ElectricFurnace.restoreSmeltData");
    }

    /**
     * クリーンアップ処理
     * @param {Location} location 
     * @param {Dimension} dimension 
     */
    /**
     * このブロックを処理できるか判定
     * @param {Block} block 
     * @returns {boolean}
     */
    canHandleBlock(block) {
        return block.typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE;
    }
    
    /**
     * アイテムを精錬として追加を試みる（熱発電機のtryAddFuelと同様）
     * @param {Block} block 
     * @param {string} itemTypeId
     * @returns {boolean} 成功したかどうか
     */
    tryAddSmeltItem(block, itemTypeId) {
        const self = this;
        return ErrorHandler.safeTry(() => {
            const key = energySystem.getLocationKey(block.location);
            const machineData = self.machines.get(key);
            
            if (!machineData) {
                Logger.debug(`電気炉が登録されていません: ${key}`, "ElectricFurnace");
                return false;
            }
            
            // 既に精錬中の場合は追加できない
            if (machineData.active || machineData.smeltTime > 0) {
                Logger.debug(`電気炉は既に精錬中です: active=${machineData.active}, smeltTime=${machineData.smeltTime}`, "ElectricFurnace");
                return false;
            }
            
            // 精錬可能かチェック
            const smeltResult = self.getSmeltResult(itemTypeId);
            if (!smeltResult) {
                Logger.debug(`${itemTypeId}は精錬できません`, "ElectricFurnace");
                return false;
            }
            
            // 精錬開始
            machineData.inputItem = itemTypeId;
            machineData.outputItem = smeltResult;
            machineData.smeltTime = self.SMELT_TIME;
            machineData.maxSmeltTime = self.SMELT_TIME;
            machineData.active = true;
            
            Logger.debug(`精錬開始（パイプ経由）: ${itemTypeId} → ${smeltResult}`, "ElectricFurnace");
            
            // データを保存
            self.saveSmeltData(block, machineData);
            
            // 視覚状態を即座に更新
            self.updateVisualState(block, true);
            self.updateSmeltProgress(block, machineData);
            
            // エネルギーシステムに登録されているか確認
            const currentEnergy = energySystem.getEnergy(block);
            Logger.debug(`電気炉のエネルギー: ${currentEnergy} MF`, "ElectricFurnace");
            
            // machinesマップの確認
            Logger.debug(`電気炉machines確認: key=${key}, active=${machineData.active}, smeltTime=${machineData.smeltTime}`, "ElectricFurnace");
            
            // 即座に更新処理を実行（次のtickを待たずに）
            system.runTimeout(() => {
                const blockExists = block.dimension.getBlock(block.location);
                if (blockExists && blockExists.typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE) {
                    Logger.debug(`電気炉ブロック確認OK、更新を実行`, "ElectricFurnace");
                    self.update(blockExists);
                } else {
                    Logger.error(`電気炉ブロックが見つかりません: ${key}`, "ElectricFurnace");
                }
            }, 1);
            
            return true;
        }, "ElectricFurnace.tryAddSmeltItem", false);
    }

    cleanup(location, dimension) {
        // 精錬中のアイテムをドロップ
        const key = energySystem.getLocationKey(location);
        const machineData = this.machines.get(key);
        
        if (machineData && machineData.inputItem && machineData.smeltTime > 0) {
            try {
                // 未完成のアイテムをドロップ（ブロックの中心位置に）
                const dropLocation = {
                    x: location.x + 0.5,
                    y: location.y + 0.5,
                    z: location.z + 0.5
                };
                const dropItem = new ItemStack(machineData.inputItem, 1);
                dimension.spawnItem(dropItem, dropLocation);
                Logger.info(`精錬中のアイテムをドロップ: ${machineData.inputItem}`, "ElectricFurnace");
            } catch (error) {
                Logger.error(`アイテムドロップエラー: ${error}`, "ElectricFurnace");
            }
        }
        
        // 親クラスのクリーンアップを呼び出す
        super.unregister(location, dimension);
        
        // データをクリア
        machineDataManager.clearMachineData(key, 'smelt');
    }
}

// シングルトンインスタンスをエクスポート
export const electricFurnace = new ElectricFurnace();