/**
 * MAGISYSTEM MFケーブルシステム
 * BaseTransportSystemを継承した統一的な実装
 */

import { BaseTransportSystem } from "../transport/BaseTransportSystem.js";
import { energySystem } from "../energy/EnergySystem.js";
import { Constants } from "../core/Constants.js";
import { Logger } from "../core/Logger.js";
import { Utils } from "../core/Utils.js";

export class MFCableSystem extends BaseTransportSystem {
    constructor() {
        super({
            systemName: "MFCable",
            carriageType: "mf",
            transporterType: "cable",
            blockTag: "mf_cable",
            blockTypes: [
                Constants.BLOCK_TYPES.CABLE,
                "magisystem:cable_input",
                "magisystem:cable_output"
            ],
            canConnectToBlock: (block, oppositeDirection) => {
                return MFCableSystem.canConnectToEnergyBlock(block, oppositeDirection);
            }
        });
    }

    /**
     * エネルギーブロックへの接続可否を判定
     * @param {Block} block 
     * @param {string} oppositeDirection 
     * @returns {boolean}
     */
    static canConnectToEnergyBlock(block, oppositeDirection) {
        // エネルギー出力ブロックとの接続
        if (block.permutation?.getState(`magisystem:${oppositeDirection}`) === "mfOutput" ||
            block.permutation?.getState(`magisystem:${oppositeDirection}`) === "allOutput" ||
            block.hasTag("mf_output")) {
            return true;
        }

        // エネルギー入力ブロックとの接続
        if (block.permutation?.getState(`magisystem:${oppositeDirection}`) === "mfInput" ||
            block.permutation?.getState(`magisystem:${oppositeDirection}`) === "allInput" ||
            block.hasTag("mf_input")) {
            return true;
        }

        // エネルギーシステムのブロック
        if (energySystem.isEnergyBlock(block)) {
            return true;
        }
        
        // エネルギー貯蔵ブロック
        if (block.hasTag("energy_storage")) {
            return true;
        }

        return false;
    }

    /**
     * ネットワークの可視化（エネルギー用）
     * @param {Block} startBlock 
     * @returns {Object}
     */
    visualizeCableNetwork(startBlock) {
        Logger.info("ケーブルネットワークを可視化", this.systemName);
        return this.visualizeNetwork(startBlock, "minecraft:electric_spark_particle");
    }

    /**
     * エネルギー伝送経路を探索
     * @param {Block} sourceBlock - エネルギー源
     * @param {number} maxDistance - 最大探索距離
     * @returns {Array<Block>} 接続されたエネルギーブロック
     */
    findConnectedEnergyBlocks(sourceBlock, maxDistance = 50) {
        const visited = new Set();
        const queue = [{ block: sourceBlock, distance: 0 }];
        const energyBlocks = [];
        
        Logger.startTimer("findConnectedEnergyBlocks");

        while (queue.length > 0) {
            const { block, distance } = queue.shift();
            const key = Utils.locationToKey(block.location);
            
            if (visited.has(key) || distance > maxDistance) continue;
            visited.add(key);

            // エネルギーブロックの場合は結果に追加
            if (energySystem.isEnergyBlock(block) && block !== sourceBlock) {
                energyBlocks.push(block);
            }

            // ケーブルの場合は隣接ブロックを探索
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
                            (this.isTransportBlock(adjacent) || energySystem.isEnergyBlock(adjacent))) {
                            queue.push({ block: adjacent, distance: distance + 1 });
                        }
                    }
                }
            }
        }

        Logger.endTimer("findConnectedEnergyBlocks", this.systemName);
        Logger.info(`${energyBlocks.length}個のエネルギーブロックを発見`, this.systemName);

        return energyBlocks;
    }

    /**
     * ネットワークの統計情報を取得
     * @param {Block} startBlock 
     * @returns {Object}
     */
    getNetworkStats(startBlock) {
        const network = this.visualizeNetwork(startBlock);
        const stats = {
            totalBlocks: network.networkSize,
            cableBlocks: 0,
            inputBlocks: 0,
            outputBlocks: 0,
            connectedEnergyBlocks: 0
        };

        // ブロックタイプ別にカウント
        for (const locationKey of network.blocks) {
            const location = Utils.keyToLocation(locationKey);
            const block = startBlock.dimension.getBlock(location);
            
            if (block) {
                if (block.typeId.includes("cable_input")) {
                    stats.inputBlocks++;
                } else if (block.typeId.includes("cable_output")) {
                    stats.outputBlocks++;
                } else if (block.typeId.includes("cable")) {
                    stats.cableBlocks++;
                }
                
                // 隣接するエネルギーブロックをチェック
                const adjacents = [
                    block.above(),
                    block.below(),
                    block.north(),
                    block.south(),
                    block.east(),
                    block.west()
                ];
                
                for (const adjacent of adjacents) {
                    if (adjacent && energySystem.isEnergyBlock(adjacent)) {
                        stats.connectedEnergyBlocks++;
                    }
                }
            }
        }

        return stats;
    }
}

// シングルトンインスタンスをエクスポート
export const mfCableSystem = new MFCableSystem();