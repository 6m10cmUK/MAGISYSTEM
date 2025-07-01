import { world, system, ItemStack } from "@minecraft/server";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";

export class ItemNetwork {
    constructor() {
        this.maxSearchDistance = 50; // 最大探索距離
        this.transferRate = 1; // デフォルトの転送レート (アイテム/tick)
        this.itemQueue = new Map(); // パイプ内のアイテムキュー
    }

    /**
     * 隣接ブロックを取得
     */
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

    /**
     * パイプかどうかチェック
     */
    isItemConduit(block) {
        return block?.typeId?.includes("pipe") || block?.hasTag("item_conduit");
    }

    /**
     * アイテム転送が可能かチェック
     */
    canTransferItems(fromBlock, toBlock) {
        // fromBlockが出力専用パイプの場合、出力のみ可能
        if (fromBlock?.hasTag("item_output_only")) {
            return true;
        }
        
        // fromBlockが入力専用パイプの場合、出力不可
        if (fromBlock?.hasTag("item_input_only")) {
            return false;
        }
        
        // toBlockが入力専用パイプの場合、入力のみ可能
        if (toBlock?.hasTag("item_input_only")) {
            return true;
        }
        
        // toBlockが出力専用パイプの場合、入力不可
        if (toBlock?.hasTag("item_output_only")) {
            return false;
        }
        
        // 通常のパイプまたはインベントリブロック同士は双方向
        return true;
    }

    /**
     * ブロックのインベントリを取得
     */
    getInventory(block) {
        try {
            // インベントリコンポーネントを取得
            const inventory = block.getComponent("minecraft:inventory");
            return inventory?.container || null;
        } catch {
            return null;
        }
    }

    /**
     * インベントリからアイテムを取得
     */
    extractItems(sourceBlock, maxItems = 1) {
        try {
            const inventory = this.getInventory(sourceBlock);
            if (!inventory) return null;

            // 最初の空でないスロットからアイテムを取得
            for (let i = 0; i < inventory.size; i++) {
                const item = inventory.getItem(i);
                if (item && item.amount > 0) {
                    const extractAmount = Math.min(maxItems, item.amount);
                    
                    // 安全性チェック
                    if (extractAmount <= 0 || extractAmount > 255) {
                        console.warn(`[ItemNetwork] 無効な抽出量: ${extractAmount}`);
                        continue;
                    }
                    
                    const extractedItem = new ItemStack(item.typeId, extractAmount);
                    
                    // 元のアイテムから減らす
                    if (item.amount > extractAmount) {
                        item.amount -= extractAmount;
                        inventory.setItem(i, item);
                    } else {
                        inventory.setItem(i, undefined);
                    }
                    
                    return extractedItem;
                }
            }
            
            return null;
        } catch (error) {
            console.error(`[ItemNetwork] extractItems エラー: ${error}`);
            return null;
        }
    }

    /**
     * インベントリにアイテムを挿入
     */
    insertItems(targetBlock, itemStack) {
        try {
            const inventory = this.getInventory(targetBlock);
            if (!inventory || !itemStack) return false;
            
            // 安全性チェック
            if (itemStack.amount <= 0 || itemStack.amount > 255) {
                console.warn(`[ItemNetwork] 無効な挿入量: ${itemStack.amount}`);
                return false;
            }

            // 同じアイテムタイプのスロットを探す
            for (let i = 0; i < inventory.size; i++) {
                const existingItem = inventory.getItem(i);
                if (existingItem && existingItem.typeId === itemStack.typeId) {
                    const maxStack = existingItem.maxAmount || 64;
                    const canAdd = maxStack - existingItem.amount;
                    
                    if (canAdd > 0 && itemStack.amount > 0) {
                        const addAmount = Math.min(canAdd, itemStack.amount);
                        
                        // 新しいItemStackを作成して設定
                        const newStack = new ItemStack(existingItem.typeId, existingItem.amount + addAmount);
                        inventory.setItem(i, newStack);
                        
                        itemStack.amount -= addAmount;
                        if (itemStack.amount <= 0) return true;
                    }
                }
            }

            // 空のスロットを探す
            for (let i = 0; i < inventory.size; i++) {
                const existingItem = inventory.getItem(i);
                if (!existingItem && itemStack.amount > 0) {
                    // 安全な量でItemStackを作成
                    const safeAmount = Math.min(itemStack.amount, 255);
                    const newItem = new ItemStack(itemStack.typeId, safeAmount);
                    inventory.setItem(i, newItem);
                    itemStack.amount -= safeAmount;
                    return true;
                }
            }

            return false; // インベントリが満杯
        } catch (error) {
            console.error(`[ItemNetwork] insertItems エラー: ${error}`);
            return false;
        }
    }

    /**
     * 接続されたネットワークを探索
     */
    findConnectedNetwork(startBlock, excludeStart = false) {
        const network = new Map();
        const queue = [startBlock];
        const visited = new Set();
        
        console.log(`[ItemNetwork] ネットワーク探索開始: ${startBlock.typeId} at ${this.getLocationKey(startBlock.location)}`);
        
        while (queue.length > 0 && network.size < this.maxSearchDistance) {
            const current = queue.shift();
            const key = this.getLocationKey(current.location);
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            // 開始ブロックを除外するオプション
            if (!(excludeStart && current === startBlock)) {
                // インベントリを持つブロック（パイプ以外）をネットワークに追加
                if (itemPipeSystem.hasInventory(current) && !this.isItemConduit(current)) {
                    console.log(`[ItemNetwork] インベントリブロック発見: ${current.typeId}`);
                    network.set(key, current);
                }
            }
            
            // パイプまたはインベントリブロックの場合、隣接ブロックを探索
            if (this.isItemConduit(current) || itemPipeSystem.hasInventory(current)) {
                const adjacents = this.getAdjacentBlocks(current);
                console.log(`[ItemNetwork] ${current.typeId}の隣接ブロックを探索 (${adjacents.length}個)`);
                
                for (const adj of adjacents) {
                    const adjKey = this.getLocationKey(adj.block.location);
                    
                    // 既に訪問済みならスキップ
                    if (visited.has(adjKey)) continue;
                    
                    // パイプの場合
                    if (this.isItemConduit(adj.block)) {
                        console.log(`[ItemNetwork] パイプ発見: ${adj.block.typeId}`);
                        queue.push(adj.block);
                    }
                    // インベントリブロックの場合
                    else if (itemPipeSystem.hasInventory(adj.block)) {
                        console.log(`[ItemNetwork] インベントリブロック候補: ${adj.block.typeId}`);
                        queue.push(adj.block);
                    }
                }
            }
        }
        
        return network;
    }

    /**
     * アイテムを配布
     */
    distributeItems(sourceBlock, maxItems = 1) {
        try {
            // アイテムを抽出
            const extractedItem = this.extractItems(sourceBlock, maxItems);
            if (!extractedItem) return 0;
            
            console.log(`[ItemNetwork] 抽出アイテム: ${extractedItem.typeId} x${extractedItem.amount}`);
            
            const originalAmount = extractedItem.amount; // 元の数量を保存

            // 出力パイプを探す
            let outputPipe = null;
            const adjacents = this.getAdjacentBlocks(sourceBlock);
            for (const adj of adjacents) {
                if (adj.block.typeId === "magisystem:pipe_output") {
                    outputPipe = adj.block;
                    console.log(`[ItemNetwork] 出力パイプ発見`);
                    break;
                }
            }
            
            if (!outputPipe) {
                console.log(`[ItemNetwork] 出力パイプが見つかりません`);
                if (extractedItem.amount > 0) {
                    this.insertItems(sourceBlock, extractedItem);
                }
                return 0;
            }

            // 出力パイプから接続されたネットワークを探索
            const network = this.findConnectedNetwork(outputPipe, true);
            console.log(`[ItemNetwork] ネットワークサイズ: ${network.size}`);
        
        // 受け入れ可能なインベントリを探す
        const receivers = [];
        for (const [key, block] of network) {
            if (this.canAcceptItems(block, extractedItem)) {
                receivers.push({ block, priority: this.getReceiverPriority(block) });
            }
        }
        
        if (receivers.length === 0) {
            // 受け入れ先がない場合、アイテムを元に戻す
            console.log(`[ItemNetwork] 受け入れ先なし。アイテムを元に戻す: ${extractedItem.typeId} x${extractedItem.amount}`);
            if (extractedItem.amount > 0) {
                this.insertItems(sourceBlock, extractedItem);
            }
            return 0;
        }
        
        // 優先度順にソート
        receivers.sort((a, b) => b.priority - a.priority);
        
        // 最初の受け入れ可能なインベントリに挿入
        let insertedAmount = 0;
        for (const receiver of receivers) {
            const beforeAmount = extractedItem.amount;
            if (this.insertItems(receiver.block, extractedItem)) {
                insertedAmount = originalAmount - extractedItem.amount;
                this.updatePipeVisuals(sourceBlock, receiver.block);
                break;
            }
        }
        
        // 残りのアイテムを元に戻す
        if (extractedItem.amount > 0) {
            this.insertItems(sourceBlock, extractedItem);
        }
        
        return insertedAmount;
        } catch (error) {
            console.error(`[ItemNetwork] distributeItems エラー: ${error}`);
            console.error(error.stack);
            return 0;
        }
    }

    /**
     * アイテムを受け入れ可能かチェック
     */
    canAcceptItems(block, itemStack) {
        const inventory = this.getInventory(block);
        if (!inventory) return false;

        // 空のスロットがあるかチェック
        for (let i = 0; i < inventory.size; i++) {
            const existingItem = inventory.getItem(i);
            if (!existingItem) return true;
            
            // 同じアイテムで容量に余裕があるかチェック
            if (existingItem.typeId === itemStack.typeId) {
                const maxStack = existingItem.maxAmount || 64;
                if (existingItem.amount < maxStack) return true;
            }
        }
        
        return false;
    }

    /**
     * 受け入れ優先度を取得
     */
    getReceiverPriority(block) {
        const priorities = {
            "minecraft:chest": 5,
            "minecraft:barrel": 5,
            "minecraft:furnace": 10,
            "minecraft:blast_furnace": 10,
            "minecraft:smoker": 10,
            "minecraft:hopper": 8
        };
        
        return priorities[block.typeId] || 1;
    }

    /**
     * パイプの視覚更新
     */
    updatePipeVisuals(sourceBlock, targetBlock) {
        // アイテムが流れている視覚効果
        try {
            // ソースとターゲット間のパイプを光らせる
            const network = this.findPipePath(sourceBlock, targetBlock);
            for (const pipeBlock of network) {
                if (this.isItemConduit(pipeBlock)) {
                    const currentState = pipeBlock.permutation.getState("magisystem:item_type");
                    if (currentState !== "item") {
                        pipeBlock.setPermutation(
                            pipeBlock.permutation.withState("magisystem:item_type", "item")
                        );
                        
                        // 一定時間後に元に戻す
                        system.runTimeout(() => {
                            try {
                                pipeBlock.setPermutation(
                                    pipeBlock.permutation.withState("magisystem:item_type", "none")
                                );
                            } catch {}
                        }, 20); // 1秒後
                    }
                }
            }
        } catch {}
    }

    /**
     * パイプのパスを探索
     */
    findPipePath(startBlock, endBlock) {
        // 簡単な実装：直接接続されたパイプのみ
        const pipes = [];
        const adjacents = this.getAdjacentBlocks(startBlock);
        
        for (const adj of adjacents) {
            if (this.isItemConduit(adj.block)) {
                pipes.push(adj.block);
            }
        }
        
        return pipes;
    }

    /**
     * 位置キーを取得
     */
    getLocationKey(location) {
        return `${location.x},${location.y},${location.z}`;
    }

    /**
     * アイテムネットワークの定期更新
     */
    update() {
        // 現在は何もしない - 将来の実装用
        // アイテムパイプシステムが必要に応じて個別に処理を行う
    }
}

// シングルトンインスタンスをエクスポート
export const itemNetwork = new ItemNetwork();