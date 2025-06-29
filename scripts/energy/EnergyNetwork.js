import { world, system } from "@minecraft/server";
import { energySystem } from "./EnergySystem.js";

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
        return block?.typeId?.includes("cable") || block?.hasTag("energy_conduit");
    }

    /**
     * エネルギー転送が可能かチェック（ケーブルの入出力制限を考慮）
     * @param {Block} fromBlock - エネルギー源のブロック  
     * @param {Block} toBlock - エネルギー先のブロック
     * @returns {boolean} 転送可能か
     */
    canTransferEnergy(fromBlock, toBlock) {
        // fromBlockが出力専用ケーブルの場合、出力のみ可能
        if (fromBlock?.hasTag("energy_output_only")) {
            return true; // 出力専用なので出力は可能
        }
        
        // fromBlockが入力専用ケーブルの場合、出力不可
        if (fromBlock?.hasTag("energy_input_only")) {
            return false; // 入力専用なので出力は不可
        }
        
        // toBlockが入力専用ケーブルの場合、入力のみ可能
        if (toBlock?.hasTag("energy_input_only")) {
            return true; // 入力専用なので入力は可能
        }
        
        // toBlockが出力専用ケーブルの場合、入力不可
        if (toBlock?.hasTag("energy_output_only")) {
            return false; // 出力専用なので入力は不可
        }
        
        // 通常のケーブルまたはエネルギーブロック同士は双方向
        return true;
    }


    findConnectedNetwork(startBlock, excludeStart = false) {
        const network = new Map();
        const queue = [startBlock];
        const visited = new Set();
        
        while (queue.length > 0 && network.size < this.maxSearchDistance) {
            const current = queue.shift();
            const key = energySystem.getLocationKey(current.location);
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            // 開始ブロックを除外するオプション
            if (!(excludeStart && current === startBlock)) {
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
                        queue.push(adj.block);
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

        // 接続されたネットワークを探索（ソースブロックは除外）
        const network = this.findConnectedNetwork(sourceBlock, true);
        
        // 入力可能なブロックのみをフィルタリング（ケーブルの制限も考慮）
        const receivers = [];
        for (const [key, block] of network) {
            if (energySystem.canInput(block) && this.canTransferEnergy(sourceBlock, block)) {
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
        const energyPerReceiver = Math.floor(energyAmount / receivers.length);
        
        for (const receiver of receivers) {
            const toTransfer = Math.min(energyPerReceiver, receiver.needed, energyAmount - totalDistributed);
            if (toTransfer > 0) {
                const transferred = energySystem.addEnergy(receiver.block, toTransfer);
                totalDistributed += transferred;
                
                if (totalDistributed >= energyAmount) break;
            }
        }
        
        return totalDistributed;
    }

    getReceiverPriority(block) {
        // ブロックタイプによる優先度設定
        const priorities = {
            "magisystem:iron_furnace": 10,
            "magisystem:battery_basic": 5,
            "magisystem:battery_advanced": 4,
            "magisystem:battery_ultimate": 3
        };
        
        return priorities[block.typeId] || 1;
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