/**
 * MAGISYSTEM アイテムパイプシステム
 * BaseTransportSystemを継承した統一的な実装
 */

import { BaseTransportSystem } from "../transport/BaseTransportSystem.js";
import { Constants } from "../core/Constants.js";
import { Logger } from "../core/Logger.js";
import { Utils } from "../core/Utils.js";

export class ItemPipeSystem extends BaseTransportSystem {
    constructor() {
        super({
            systemName: "ItemPipe",
            carriageType: "item",
            transporterType: "pipe",
            blockTag: "item_pipe",
            blockTypes: [
                "magisystem:pipe",
                "magisystem:pipe_input",
                "magisystem:pipe_output"
            ],
            canConnectToBlock: (block, oppositeDirection, pipeBlock) => {
                // 熱発電機は入力パイプからのみ接続可能
                if (block.typeId === "magisystem:thermal_generator") {
                    return pipeBlock && pipeBlock.typeId === "magisystem:pipe_input";
                }
                
                // 電気炉は入力・出力パイプ両方に接続可能
                if (block.typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE) {
                    return pipeBlock && (pipeBlock.typeId === "magisystem:pipe_input" || pipeBlock.typeId === "magisystem:pipe_output");
                }
                
                // ストレージビンは入力・出力パイプ両方に接続可能
                if (block.typeId === Constants.BLOCK_TYPES.STORAGE_BIN) {
                    return pipeBlock && (pipeBlock.typeId === "magisystem:pipe_input" || pipeBlock.typeId === "magisystem:pipe_output");
                }
                
                // インベントリコンポーネントを持つブロックかチェック
                const inventory = block.getComponent("minecraft:inventory");
                if (inventory?.container) {
                    return true;
                }
                
                // タグベースの判定
                if (block.hasTag("item_storage") ||
                    block.hasTag("item_input") ||
                    block.hasTag("item_output") ||
                    block.hasTag("inventory")) {
                    return true;
                }
                
                // MAGISYSTEMの機械
                if (block.typeId.startsWith("magisystem:") && 
                    (block.typeId.includes("machine") || 
                     block.typeId.includes("storage") ||
                     block.typeId.includes("processor"))) {
                    return true;
                }
                
                return false;
            }
        });

        // インベントリを持つブロックのリスト
        this.inventoryBlocks = new Set([
            "minecraft:chest",
            "minecraft:trapped_chest",
            "minecraft:ender_chest",
            "minecraft:furnace",
            "minecraft:blast_furnace",
            "minecraft:smoker",
            "minecraft:hopper",
            "minecraft:dropper",
            "minecraft:dispenser",
            "minecraft:barrel",
            "minecraft:shulker_box",
            "magisystem:storage_bin",
            // 色付きシュルカーボックス
            "minecraft:white_shulker_box",
            "minecraft:orange_shulker_box",
            "minecraft:magenta_shulker_box",
            "minecraft:light_blue_shulker_box",
            "minecraft:yellow_shulker_box",
            "minecraft:lime_shulker_box",
            "minecraft:pink_shulker_box",
            "minecraft:gray_shulker_box",
            "minecraft:light_gray_shulker_box",
            "minecraft:cyan_shulker_box",
            "minecraft:purple_shulker_box",
            "minecraft:blue_shulker_box",
            "minecraft:brown_shulker_box",
            "minecraft:green_shulker_box",
            "minecraft:red_shulker_box",
            "minecraft:black_shulker_box"
        ]);
    }

    /**
     * インベントリブロックへの接続可否を判定
     * @param {Block} block 
     * @param {Block} pipeBlock - 接続元のパイプブロック
     * @returns {boolean}
     */
    static canConnectToInventoryBlock(block, pipeBlock = null) {
        // タグベースの判定
        if (block.hasTag("item_storage") ||
            block.hasTag("item_input") ||
            block.hasTag("item_output") ||
            block.hasTag("inventory")) {
            return true;
        }

        // MAGISYSTEMの機械
        if (block.typeId.startsWith("magisystem:") && 
            (block.typeId.includes("machine") || 
             block.typeId.includes("storage") ||
             block.typeId.includes("processor"))) {
            return true;
        }

        // 熱発電機は入力パイプからのみ接続可能
        if (block.typeId === "magisystem:thermal_generator") {
            return pipeBlock && pipeBlock.typeId === "magisystem:pipe_input";
        }
        
        // 電気炉は入力・出力パイプ両方に接続可能
        if (block.typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE) {
            return pipeBlock && (pipeBlock.typeId === "magisystem:pipe_input" || pipeBlock.typeId === "magisystem:pipe_output");
        }
        
        // ストレージビンは入力・出力パイプ両方に接続可能
        if (block.typeId === Constants.BLOCK_TYPES.STORAGE_BIN) {
            return pipeBlock && (pipeBlock.typeId === "magisystem:pipe_input" || pipeBlock.typeId === "magisystem:pipe_output");
        }

        return false;
    }

    /**
     * ブロックがインベントリを持つかチェック
     * @param {Block} block 
     * @returns {boolean}
     */
    hasInventory(block, pipeBlock = null) {
        // 電気炉は特殊なインベントリを持つ
        if (block.typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE) {
            return true;
        }
        
        // ストレージビンは特殊なインベントリを持つ
        if (block.typeId === Constants.BLOCK_TYPES.STORAGE_BIN) {
            return true;
        }
        
        // インベントリコンポーネントを持つかチェック
        const inventory = block.getComponent("minecraft:inventory");
        if (inventory?.container) {
            return true;
        }
        
        // 既知のインベントリブロックリストをチェック
        return this.inventoryBlocks.has(block.typeId) || 
               ItemPipeSystem.canConnectToInventoryBlock(block, pipeBlock);
    }

    /**
     * パイプ配置時の処理（レガシー互換）
     * @param {Block} block 
     */
    onPipePlaced(block) {
        this.onBlockPlaced(block);
    }

    /**
     * パイプ破壊時の処理（レガシー互換）
     * @param {Vector3} location 
     * @param {Dimension} dimension 
     */
    onPipeRemoved(location, dimension) {
        this.onBlockRemoved(location, dimension);
    }

    /**
     * パイプパターンを更新（レガシー互換）
     * @param {Block} block 
     */
    updatePipePattern(block) {
        this.updatePattern(block);
    }

    /**
     * ネットワークの可視化（アイテム用）
     * @param {Block} startBlock 
     * @returns {Object}
     */
    visualizePipeNetwork(startBlock) {
        Logger.info("パイプネットワークを可視化", this.systemName);
        return this.visualizeNetwork(startBlock, "minecraft:item_slime");
    }

    /**
     * 接続されたインベントリブロックを探索
     * @param {Block} sourceBlock 
     * @param {number} maxDistance 
     * @returns {Array<{block: Block, distance: number, type: string}>}
     */
    findConnectedInventories(sourceBlock, maxDistance = 50) {
        const visited = new Set();
        const queue = [{ block: sourceBlock, distance: 0 }];
        const inventories = [];
        
        Logger.startTimer("findConnectedInventories");

        while (queue.length > 0) {
            const { block, distance } = queue.shift();
            const key = Utils.locationToKey(block.location);
            
            if (visited.has(key) || distance > maxDistance) continue;
            visited.add(key);

            // インベントリブロックの場合は結果に追加
            if (this.hasInventory(block) && block !== sourceBlock) {
                inventories.push({
                    block,
                    distance,
                    type: this.getInventoryType(block)
                });
            }

            // パイプの場合は隣接ブロックを探索
            if (this.isTransportBlock(block)) {
                const adjacents = [
                    block.above(),
                    block.below(),
                    block.north(),
                    block.south(),
                    block.east(),
                    block.west()
                ];

                for (const adjacent of adjacents) {
                    if (adjacent) {
                        const adjKey = Utils.locationToKey(adjacent.location);
                        if (!visited.has(adjKey) && 
                            (this.isTransportBlock(adjacent) || this.hasInventory(adjacent))) {
                            queue.push({ block: adjacent, distance: distance + 1 });
                        }
                    }
                }
            }
        }

        Logger.endTimer("findConnectedInventories", this.systemName);
        Logger.info(`${inventories.length}個のインベントリブロックを発見`, this.systemName);

        return inventories;
    }

    /**
     * インベントリのタイプを取得
     * @param {Block} block 
     * @returns {string}
     */
    getInventoryType(block) {
        if (block.typeId.includes("chest")) return "storage";
        if (block.typeId.includes("furnace") || 
            block.typeId.includes("smoker") || 
            block.typeId.includes("blast_furnace")) return "processor";
        if (block.typeId.includes("hopper")) return "transfer";
        if (block.typeId.includes("dropper") || 
            block.typeId.includes("dispenser")) return "output";
        if (block.typeId.includes("shulker_box")) return "portable_storage";
        if (block.typeId.includes("barrel")) return "storage";
        return "unknown";
    }

    /**
     * パイプネットワークの統計情報を取得
     * @param {Block} startBlock 
     * @returns {Object}
     */
    getNetworkStats(startBlock) {
        const network = this.visualizeNetwork(startBlock);
        const connectedInventories = this.findConnectedInventories(startBlock);
        
        const stats = {
            totalBlocks: network.networkSize,
            pipeBlocks: 0,
            inputBlocks: 0,
            outputBlocks: 0,
            connectedInventories: connectedInventories.length,
            inventoryTypes: {}
        };

        // ブロックタイプ別にカウント
        for (const locationKey of network.blocks) {
            const location = Utils.keyToLocation(locationKey);
            const block = startBlock.dimension.getBlock(location);
            
            if (block) {
                if (block.typeId === "magisystem:pipe_input") {
                    stats.inputBlocks++;
                } else if (block.typeId === "magisystem:pipe_output") {
                    stats.outputBlocks++;
                } else if (block.typeId === "magisystem:pipe") {
                    stats.pipeBlocks++;
                }
            }
        }

        // インベントリタイプ別にカウント
        for (const inv of connectedInventories) {
            stats.inventoryTypes[inv.type] = (stats.inventoryTypes[inv.type] || 0) + 1;
        }

        return stats;
    }

    /**
     * 最短経路を探索
     * @param {Block} fromBlock 
     * @param {Block} toBlock 
     * @param {number} maxDistance 
     * @returns {Array<Block>|null} 経路のブロック配列、見つからない場合はnull
     */
    findPath(fromBlock, toBlock, maxDistance = 100) {
        const visited = new Map();
        const queue = [{ block: fromBlock, path: [fromBlock] }];
        const targetKey = Utils.locationToKey(toBlock.location);
        
        Logger.startTimer("findPath");

        while (queue.length > 0) {
            const { block, path } = queue.shift();
            const key = Utils.locationToKey(block.location);
            
            if (key === targetKey) {
                Logger.endTimer("findPath", this.systemName);
                Logger.info(`経路発見: ${path.length}ブロック`, this.systemName);
                return path;
            }
            
            if (visited.has(key) || path.length > maxDistance) continue;
            visited.set(key, true);

            // 隣接するパイプを探索
            if (this.isTransportBlock(block)) {
                const adjacents = [
                    block.above(),
                    block.below(),
                    block.north(),
                    block.south(),
                    block.east(),
                    block.west()
                ];

                for (const adjacent of adjacents) {
                    if (adjacent && this.isTransportBlock(adjacent)) {
                        const adjKey = Utils.locationToKey(adjacent.location);
                        if (!visited.has(adjKey)) {
                            queue.push({ 
                                block: adjacent, 
                                path: [...path, adjacent] 
                            });
                        }
                    }
                }
            }
        }

        Logger.endTimer("findPath", this.systemName);
        Logger.warn("経路が見つかりませんでした", this.systemName);
        return null;
    }
}

// シングルトンインスタンスをエクスポート
export const itemPipeSystem = new ItemPipeSystem();