/**
 * シンプルなアイテム輸送実装
 * 複雑なItemNetworkの代わりに、基本的な輸送機能のみを提供
 */

import { ItemStack } from "@minecraft/server";
import { Logger } from "../core/Logger.js";
import { generator } from "../machines/Generator.js";
import { Utils } from "../core/Utils.js";

export class SimpleItemTransport {
    /**
     * アイテムを輸送
     * @param {Block} sourceBlock - 輸送元ブロック
     * @param {Block} targetBlock - 輸送先ブロック
     * @returns {number} 輸送したアイテム数
     */
    static transferItems(sourceBlock, targetBlock) {
        try {
            // 熱発電機への輸送の場合
            if (targetBlock.typeId === "magisystem:thermal_generator") {
                return this.transferToThermalGenerator(sourceBlock, targetBlock);
            }
            
            // インベントリコンポーネントを取得
            const sourceInv = sourceBlock.getComponent("minecraft:inventory");
            const targetInv = targetBlock.getComponent("minecraft:inventory");
            
            if (!sourceInv?.container || !targetInv?.container) {
                return 0;
            }
            
            const sourceContainer = sourceInv.container;
            const targetContainer = targetInv.container;
            
            // 最初の空でないスロットを探す
            for (let i = 0; i < sourceContainer.size; i++) {
                const item = sourceContainer.getItem(i);
                if (!item || item.amount <= 0) continue;
                
                // 1個だけ取り出す
                const transferAmount = 1;
                
                // 同じアイテムのスタックを探す
                let transferred = false;
                for (let j = 0; j < targetContainer.size; j++) {
                    const targetItem = targetContainer.getItem(j);
                    
                    // 空きスロットの場合
                    if (!targetItem) {
                        targetContainer.setItem(j, new ItemStack(item.typeId, transferAmount));
                        transferred = true;
                        break;
                    }
                    
                    // 同じアイテムでスタック可能な場合
                    if (targetItem.typeId === item.typeId && targetItem.amount < (targetItem.maxAmount || 64)) {
                        targetItem.amount += transferAmount;
                        targetContainer.setItem(j, targetItem);
                        transferred = true;
                        break;
                    }
                }
                
                // 転送成功した場合、元のアイテムを減らす
                if (transferred) {
                    if (item.amount > transferAmount) {
                        item.amount -= transferAmount;
                        sourceContainer.setItem(i, item);
                    } else {
                        sourceContainer.setItem(i, undefined);
                    }
                    
                    Logger.debug(`アイテム転送: ${item.typeId} x${transferAmount}`, "SimpleItemTransport");
                    return transferAmount;
                }
            }
            
            return 0;
        } catch (error) {
            Logger.error(`アイテム転送エラー: ${error}`, "SimpleItemTransport");
            return 0;
        }
    }
    
    /**
     * パイプネットワークを通じてアイテムを探索・輸送
     * @param {Block} sourceBlock - 輸送元ブロック
     * @param {Block} outputPipe - 出力パイプ
     * @param {ItemTransportManager} transportManager - 輸送マネージャー（オプション）
     * @returns {number} 輸送したアイテム数
     */
    static transferThroughNetwork(sourceBlock, outputPipe, transportManager = null) {
        try {
            // 利用可能な全ての輸送先を探す
            const destinations = this.findAllDestinations(outputPipe);
            
            if (destinations.length === 0) {
                return 0;
            }
            
            // ラウンドロビン用のインデックスを取得（輸送元の位置をキーとして使用）
            const sourceKey = `${sourceBlock.location.x}_${sourceBlock.location.y}_${sourceBlock.location.z}`;
            if (!this.distributionIndex) {
                this.distributionIndex = new Map();
            }
            
            let currentIndex = this.distributionIndex.get(sourceKey) || 0;
            
            // 現在のインデックスから開始して、輸送可能な先を探す
            for (let i = 0; i < destinations.length; i++) {
                const destIndex = (currentIndex + i) % destinations.length;
                const destination = destinations[destIndex];
                
                // 輸送前にアイテム情報を取得
                let itemInfo = null;
                if (transportManager) {
                    const sourceInv = sourceBlock.getComponent("minecraft:inventory");
                    if (sourceInv?.container) {
                        for (let j = 0; j < sourceInv.container.size; j++) {
                            const item = sourceInv.container.getItem(j);
                            if (item && item.amount > 0) {
                                itemInfo = { typeId: item.typeId, amount: 1 };
                                break;
                            }
                        }
                    }
                }
                
                // アイテムを転送
                const transferred = this.transferItems(sourceBlock, destination);
                if (transferred > 0) {
                    // 次回は次の輸送先から開始
                    this.distributionIndex.set(sourceKey, (destIndex + 1) % destinations.length);
                    Logger.debug(`アイテムを輸送先${destIndex + 1}/${destinations.length}に転送`, "SimpleItemTransport");
                    
                    // 輸送中アイテムを記録
                    if (transportManager && itemInfo) {
                        const destKey = Utils.locationToKey(destination.location);
                        transportManager.recordItemInTransit(itemInfo.typeId, itemInfo.amount, sourceKey, destKey);
                    }
                    
                    return transferred;
                }
            }
            
            return 0;
        } catch (error) {
            Logger.error(`ネットワーク転送エラー: ${error}`, "SimpleItemTransport");
            return 0;
        }
    }
    
    /**
     * ネットワーク内の全ての輸送先を探す
     * @param {Block} outputPipe - 出力パイプ
     * @returns {Array<Block>} 輸送先ブロックの配列
     */
    static findAllDestinations(outputPipe) {
        const destinations = [];
        const visited = new Set();
        const queue = [outputPipe];
        
        Logger.debug(`出力パイプから輸送先を探索開始: ${outputPipe.location.x},${outputPipe.location.y},${outputPipe.location.z}`, "SimpleItemTransport");
        
        while (queue.length > 0) {
            const current = queue.shift();
            const key = `${current.location.x}_${current.location.y}_${current.location.z}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            Logger.debug(`現在のブロック: ${current.typeId} at ${key}`, "SimpleItemTransport");
            
            // 隣接ブロックを確認
            const adjacents = [
                current.above(),
                current.below(),
                current.north(),
                current.south(),
                current.east(),
                current.west()
            ];
            
            for (const adj of adjacents) {
                if (!adj) continue;
                
                const adjKey = `${adj.location.x}_${adj.location.y}_${adj.location.z}`;
                
                // 既に訪問済みならスキップ
                if (visited.has(adjKey)) continue;
                
                Logger.debug(`隣接ブロック確認: ${adj.typeId} at ${adjKey}`, "SimpleItemTransport");
                
                // 通常パイプの場合、探索を続ける
                if (adj.typeId === "magisystem:pipe") {
                    Logger.debug(`通常パイプを探索キューに追加`, "SimpleItemTransport");
                    queue.push(adj);
                }
                // 入力パイプの場合
                else if (adj.typeId === "magisystem:pipe_input") {
                    Logger.debug(`入力パイプを発見`, "SimpleItemTransport");
                    
                    // 入力パイプの隣接ブロックを確認してインベントリを探す
                    const inputAdjacents = [
                        adj.above(),
                        adj.below(),
                        adj.north(),
                        adj.south(),
                        adj.east(),
                        adj.west()
                    ];
                    
                    let hasInventory = false;
                    
                    for (const target of inputAdjacents) {
                        if (!target) continue;
                        
                        // パイプ以外のブロックをチェック
                        if (target.typeId !== "magisystem:pipe" && 
                            target.typeId !== "magisystem:pipe_input" && 
                            target.typeId !== "magisystem:pipe_output") {
                            
                            // 通常のインベントリチェック
                            const inv = target.getComponent("minecraft:inventory");
                            if (inv?.container) {
                                Logger.debug(`輸送先発見: ${target.typeId} at ${target.location.x},${target.location.y},${target.location.z}`, "SimpleItemTransport");
                                destinations.push(target);
                                hasInventory = true;
                            }
                            // 熱発電機の場合も輸送先として追加
                            else if (target.typeId === "magisystem:thermal_generator") {
                                Logger.debug(`熱発電機を輸送先として追加: ${target.location.x},${target.location.y},${target.location.z}`, "SimpleItemTransport");
                                destinations.push(target);
                                hasInventory = true;
                            }
                        }
                    }
                    
                    // 入力パイプ自体も探索を続けるためキューに追加
                    // これにより、入力パイプの先にある他のパイプネットワークも探索される
                    Logger.debug(`入力パイプを探索キューに追加（継続探索）`, "SimpleItemTransport");
                    queue.push(adj);
                }
            }
        }
        
        Logger.debug(`${destinations.length}個の輸送先を発見`, "SimpleItemTransport");
        return destinations;
    }
    
    /**
     * 熱発電機にアイテムを輸送
     * @param {Block} sourceBlock - 輸送元ブロック
     * @param {Block} targetBlock - 熱発電機ブロック
     * @returns {number} 輸送したアイテム数
     */
    static transferToThermalGenerator(sourceBlock, targetBlock) {
        try {
            Logger.debug(`熱発電機への輸送開始: ${targetBlock.typeId}`, "SimpleItemTransport");
            
            // 熱発電機が既に燃料を持っているか確認
            const genInfo = generator.getGeneratorInfo(targetBlock);
            Logger.debug(`発電機情報: ${JSON.stringify(genInfo)}`, "SimpleItemTransport");
            
            if (genInfo && genInfo.burnTime > 0) {
                // 既に燃焼中の場合は輸送しない
                Logger.debug(`既に燃焼中のため輸送スキップ: burnTime=${genInfo.burnTime}`, "SimpleItemTransport");
                return 0;
            }
            
            // 輸送元のインベントリを取得
            const sourceInv = sourceBlock.getComponent("minecraft:inventory");
            if (!sourceInv?.container) {
                return 0;
            }
            
            const sourceContainer = sourceInv.container;
            
            // 燃料となるアイテムを探す
            for (let i = 0; i < sourceContainer.size; i++) {
                const item = sourceContainer.getItem(i);
                if (!item || item.amount <= 0) continue;
                
                // 燃料として使用可能かチェック
                const burnTime = generator.getItemBurnTime(item.typeId);
                Logger.debug(`アイテム ${item.typeId} の燃焼時間: ${burnTime}`, "SimpleItemTransport");
                
                if (burnTime > 0) {
                    // 1個だけ取り出して熱発電機に供給
                    Logger.debug(`燃料追加を試行: ${item.typeId} (元の数量: ${item.amount})`, "SimpleItemTransport");
                    const addResult = generator.tryAddFuel(targetBlock, item.typeId);
                    Logger.debug(`tryAddFuel結果: ${addResult}`, "SimpleItemTransport");
                    
                    if (addResult) {
                        Logger.info(`熱発電機への燃料輸送成功: ${item.typeId}`, "SimpleItemTransport");
                        // 成功したら元のアイテムを減らす
                        if (item.amount > 1) {
                            // 新しいItemStackを作成して数量を減らす
                            const newItem = new ItemStack(item.typeId, item.amount - 1);
                            sourceContainer.setItem(i, newItem);
                            Logger.debug(`アイテム数を減らしました: ${item.typeId} 残り${newItem.amount}`, "SimpleItemTransport");
                        } else {
                            sourceContainer.setItem(i, undefined);
                            Logger.debug(`アイテムを完全に削除しました: ${item.typeId}`, "SimpleItemTransport");
                        }
                        
                        return 1;
                    } else {
                        Logger.debug(`tryAddFuelが失敗しました`, "SimpleItemTransport");
                    }
                }
            }
            
            return 0;
        } catch (error) {
            Logger.error(`熱発電機への輸送エラー: ${error}`, "SimpleItemTransport");
            return 0;
        }
    }
}