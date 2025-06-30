import { world, system } from "@minecraft/server";
import { energySystem } from "./EnergySystem.js";
import { Logger } from "../core/Logger.js";

export class EnergyNetwork {
    constructor() {
        this.maxSearchDistance = 90; // 最大探索距離
        this.transferRate = 1000; // デフォルトの転送レート (MF/tick)
    }

    getAdjacentBlocks(block) {
        const adjacents = [];
        const directions = [
            { offset: { x: 0, y: 1, z: 0 }, face: "above" },
            { offset: { x: 0, y: -1, z: 0 }, face: "below" },
            { offset: { x: 1, y: 0, z: 0 }, face: "east" },
            { offset: { x: -1, y: 0, z: 0 }, face: "west" },
            { offset: { x: 0, y: 0, z: 1 }, face: "south" },
            { offset: { x: 0, y: 0, z: -1 }, face: "north" }
        ];

        for (const dir of directions) {
            try {
                const adjBlock = block.dimension.getBlock({
                    x: block.location.x + dir.offset.x,
                    y: block.location.y + dir.offset.y,
                    z: block.location.z + dir.offset.z
                });
                
                if (adjBlock) {
                    adjacents.push({ block: adjBlock, face: dir.face });
                }
            } catch {}
        }

        return adjacents;
    }

    isEnergyConduit(block) {
        return block?.typeId?.includes("cable") || 
               block?.hasTag("energy_conduit") ||
               block?.hasTag("mf_cable");
    }

    /**
     * エネルギー転送が可能かチェック（ケーブルの入出力制限を考慮）
     * @param {Block} fromBlock - エネルギー源のブロック  
     * @param {Block} toBlock - エネルギー先のブロック
     * @param {Block} pathBlock - 経路上のブロック（ケーブル）
     * @returns {boolean} 転送可能か
     */
    canTransferEnergy(fromBlock, toBlock, pathBlock = null) {
        // 経路上のブロックがある場合（ケーブル経由）
        if (pathBlock) {
            // 入力専用ケーブルはエネルギーを受け取れるが、出力できない
            if (pathBlock.hasTag("energy_input_only")) {
                return false; // 入力専用ケーブルからは出力できない
            }
            // 出力専用ケーブルはエネルギーを出力できるが、受け取れない
            if (pathBlock.hasTag("energy_output_only")) {
                return true; // 出力専用ケーブルからは出力可能
            }
        }
        
        // バッテリー同士の直接転送は禁止（ケーブル経由必須）
        // デバッグ用に一時的に無効化
        /*
        if (fromBlock.hasTag("energy_storage") && toBlock.hasTag("energy_storage")) {
            return false;
        }
        */
        
        // その他の場合は転送可能
        return true;
    }


    findConnectedNetwork(startBlock, excludeStart = false) {
        const network = new Map();
        const queue = [{block: startBlock, prevCable: null}];
        const visited = new Set();
        const startKey = energySystem.getLocationKey(startBlock.location);
        
        while (queue.length > 0 && network.size < this.maxSearchDistance) {
            const {block: current, prevCable} = queue.shift();
            const key = energySystem.getLocationKey(current.location);
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            // 入力・出力ケーブルの直接接続をチェック
            if (this.isEnergyConduit(current) && prevCable && this.isEnergyConduit(prevCable)) {
                // 両方が入力専用または出力専用の場合、接続不可
                if ((current.hasTag("energy_input_only") && prevCable.hasTag("energy_output_only")) ||
                    (current.hasTag("energy_output_only") && prevCable.hasTag("energy_input_only"))) {
                    continue; // この経路は無効
                }
            }
            
            // 開始ブロックを除外するオプション
            if (!(excludeStart && key === startKey)) {
                if (energySystem.isEnergyBlock(current) && !this.isEnergyConduit(current)) {
                    network.set(key, current);
                }
            }
            
            // ケーブルまたはエネルギーブロックの場合、隣接ブロックを探索
            if (this.isEnergyConduit(current) || energySystem.isEnergyBlock(current)) {
                const adjacents = this.getAdjacentBlocks(current);
                
                for (const adj of adjacents) {
                    const adjKey = energySystem.getLocationKey(adj.block.location);
                    if (!visited.has(adjKey)) {
                        queue.push({block: adj.block, prevCable: this.isEnergyConduit(current) ? current : null});
                    }
                }
            }
        }
        
        return network;
    }

    distributeEnergy(sourceBlock, energyAmount) {
        if (!energySystem.canOutput(sourceBlock) || energyAmount <= 0) {
            return 0;
        }

        // エネルギー出力ブロック（発電機、バッテリー）の場合、出力ケーブルが隣接しているかチェック
        if (energySystem.canOutput(sourceBlock)) {
            const adjacents = this.getAdjacentBlocks(sourceBlock);
            let hasOutputCable = false;
            
            for (const adj of adjacents) {
                // 出力専用ケーブルのみが有効
                if (adj.block.hasTag("energy_output_only")) {
                    hasOutputCable = true;
                    break;
                }
            }
            
            // 出力ケーブルがない場合は転送しない
            if (!hasOutputCable) {
                if (system.currentTick % 100 === 0) {
                    Logger.debug(`${sourceBlock.typeId}: 出力ケーブルが見つかりません - 転送中止`, "EnergyNetwork");
                }
                return 0;
            }
        }

        // 接続されたネットワークを探索（ソースブロックは除外）
        const network = this.findConnectedNetwork(sourceBlock, true);
        
        // デバッグ: 転送試行時のネットワーク情報
        if (energyAmount > 0 && system.currentTick % 20 === 0) {
            Logger.debug(`転送開始: ${energyAmount} MF, ネットワークサイズ: ${network.size}, ソース: ${sourceBlock.typeId}`, "EnergyNetwork");
        }
        
        // 入力可能なブロックのみをフィルタリング（ケーブルの制限も考慮）
        const receivers = [];
        for (const [key, block] of network) {
            if (energySystem.canInput(block)) {
                // エネルギー入力ブロック（バッテリー、機械）の場合、入力ケーブルが隣接しているかチェック
                const adjacents = this.getAdjacentBlocks(block);
                let hasInputCable = false;
                
                for (const adj of adjacents) {
                    // 入力専用ケーブルのみが有効
                    if (adj.block.hasTag("energy_input_only")) {
                        hasInputCable = true;
                        break;
                    }
                }
                
                // 入力ケーブルがない場合はスキップ
                if (!hasInputCable) {
                    continue;
                }
                
                const current = energySystem.getEnergy(block);
                const max = energySystem.getMaxCapacity(block);
                const needed = max - current;
                
                if (needed > 0) {
                    receivers.push({ block, needed, priority: this.getReceiverPriority(block) });
                }
            }
        }
        
        if (receivers.length === 0) return 0;
        
        // 優先度順にソート（高い優先度が先）
        receivers.sort((a, b) => b.priority - a.priority);
        
        // エネルギーを分配
        let totalDistributed = 0;
        
        // バッテリーからの送信で、レシーバーが1つだけの場合は全量送信
        if (sourceBlock.hasTag("energy_storage") && receivers.length === 1) {
            const receiver = receivers[0];
            const toTransfer = Math.min(energyAmount, receiver.needed);
            if (toTransfer > 0) {
                const transferred = energySystem.addEnergy(receiver.block, toTransfer);
                totalDistributed += transferred;
            }
        } else {
            // 複数のレシーバーがある場合は均等分配
            const energyPerReceiver = Math.floor(energyAmount / receivers.length);
            
            for (const receiver of receivers) {
                const toTransfer = Math.min(energyPerReceiver, receiver.needed, energyAmount - totalDistributed);
                if (toTransfer > 0) {
                    const transferred = energySystem.addEnergy(receiver.block, toTransfer);
                    totalDistributed += transferred;
                    
                    if (totalDistributed >= energyAmount) break;
                }
            }
            
            // バッテリーの場合、残りのエネルギーも最初のレシーバーに送信
            if (sourceBlock.hasTag("energy_storage") && totalDistributed < energyAmount && receivers.length > 0) {
                const remainingEnergy = energyAmount - totalDistributed;
                for (const receiver of receivers) {
                    const additionalTransfer = Math.min(remainingEnergy, receiver.needed - energyPerReceiver);
                    if (additionalTransfer > 0) {
                        const transferred = energySystem.addEnergy(receiver.block, additionalTransfer);
                        totalDistributed += transferred;
                        break; // 最初の受信可能なレシーバーにのみ送信
                    }
                }
            }
        }
        
        return totalDistributed;
    }

    getReceiverPriority(block) {
        // ブロックタイプによる優先度設定
        const priorities = {
            "magisystem:iron_furnace": 10,
            "magisystem:battery_basic": 7,     // バッテリーの優先度を上げる
            "magisystem:battery_advanced": 8,   // 高度なバッテリーほど優先度を高く
            "magisystem:battery_ultimate": 9    // 究極バッテリーが最優先
        };
        
        // 現在のエネルギー充電率も考慮（空に近いほど優先）
        const current = energySystem.getEnergy(block);
        const max = energySystem.getMaxCapacity(block);
        const fillRate = current / max;
        
        // 基本優先度 - (充電率 * 2) で、空のバッテリーを優先
        const basePriority = priorities[block.typeId] || 1;
        return basePriority - (fillRate * 2);
    }

    transferEnergy(fromBlock, toBlock, maxAmount) {
        if (!energySystem.canOutput(fromBlock) || !energySystem.canInput(toBlock)) {
            return 0;
        }
        
        const available = energySystem.getEnergy(fromBlock);
        const toCapacity = energySystem.getMaxCapacity(toBlock);
        const toCurrent = energySystem.getEnergy(toBlock);
        const toNeeded = toCapacity - toCurrent;
        
        const transferAmount = Math.min(available, toNeeded, maxAmount);
        
        if (transferAmount > 0) {
            const removed = energySystem.removeEnergy(fromBlock, transferAmount);
            const added = energySystem.addEnergy(toBlock, removed);
            return added;
        }
        
        return 0;
    }

    visualizeConnection(block, connected) {
        // ケーブルの視覚的な接続状態を更新
        if (this.isEnergyConduit(block)) {
            try {
                const states = block.permutation.getAllStates();
                if (states["magisystem:connected"]) {
                    block.setPermutation(block.permutation.withState("magisystem:connected", connected ? 1 : 0));
                }
            } catch {}
        }
    }

    analyzeNetwork(startBlock) {
        const network = this.findConnectedNetwork(startBlock, false);
        const generators = [];
        const storages = [];
        const consumers = [];
        const cables = [];
        
        // 開始ブロックも含めて分析
        const allBlocks = new Map(network);
        if (this.isEnergyConduit(startBlock) || energySystem.isEnergyBlock(startBlock)) {
            const key = energySystem.getLocationKey(startBlock.location);
            allBlocks.set(key, startBlock);
        }
        
        // ケーブルも含めた完全なネットワークを探索
        const visited = new Set();
        const queue = [startBlock];
        
        while (queue.length > 0) {
            const current = queue.shift();
            const key = energySystem.getLocationKey(current.location);
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            // ブロックタイプごとに分類
            if (current.hasTag("energy_generator")) {
                generators.push(current);
            } else if (current.hasTag("energy_storage")) {
                storages.push(current);
            } else if (current.hasTag("energy_consumer")) {
                consumers.push(current);
            } else if (this.isEnergyConduit(current)) {
                cables.push(current);
            }
            
            // 隣接ブロックを探索
            if (this.isEnergyConduit(current) || energySystem.isEnergyBlock(current)) {
                const adjacents = this.getAdjacentBlocks(current);
                for (const adj of adjacents) {
                    const adjKey = energySystem.getLocationKey(adj.block.location);
                    if (!visited.has(adjKey) && (this.isEnergyConduit(adj.block) || energySystem.isEnergyBlock(adj.block))) {
                        queue.push(adj.block);
                    }
                }
            }
        }
        
        return {
            generators,
            storages,
            consumers,
            cables,
            totalBlocks: generators.length + storages.length + consumers.length + cables.length
        };
    }
}

// シングルトンインスタンスをエクスポート
export const energyNetwork = new EnergyNetwork();