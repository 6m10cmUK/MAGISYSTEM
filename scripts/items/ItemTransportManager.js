/**
 * MAGISYSTEM アイテム輸送管理システム
 * エネルギーシステムと同様の設計で実装
 */

import { world, system } from "@minecraft/server";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";
import { itemNetwork } from "./ItemNetwork.js";
import { SimpleItemTransport } from "./SimpleItemTransport.js";
import { Logger } from "../core/Logger.js";
import { Utils } from "../core/Utils.js";
import { Constants } from "../core/Constants.js";

export class ItemTransportManager {
    constructor() {
        this.isRunning = false;
        this.tickInterval = 20; // 20tick = 1秒ごとに処理
        this.tickCounter = 0;
        
        // 輸送元ブロックの追跡（出力パイプに接続されたインベントリ）
        this.transportSources = new Map(); // key: locationKey, value: { block, lastCheck }
        
        // ネットワークごとの輸送制御
        this.networkTransportIndex = new Map(); // key: networkId, value: currentSourceIndex
        this.processedNetworks = new Set(); // このtickで処理済みのネットワーク
        
        Logger.info("アイテム輸送管理システムを初期化", "ItemTransportManager");
    }

    /**
     * システムを開始
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        Logger.info("アイテム輸送システムを開始", "ItemTransportManager");
        
        // 初回スキャンを1秒後に実行
        system.runTimeout(() => {
            this.scanForExistingOutputPipes();
        }, 20);
        
        // 定期的な更新処理を開始
        system.runInterval(() => {
            if (this.isRunning) {
                this.tick();
            }
        }, this.tickInterval);
    }

    /**
     * システムを停止
     */
    stop() {
        this.isRunning = false;
        Logger.info("アイテム輸送システムを停止", "ItemTransportManager");
    }

    /**
     * 毎tick実行される処理
     */
    tick() {
        this.tickCounter++;
        
        // 輸送元ブロックを更新
        this.updateTransportSources();
        
        // アイテム輸送処理
        this.processItemTransport();
        
        // 古い輸送元を削除（5分以上更新されていない）
        if (this.tickCounter % 300 === 0) { // 5分ごと
            this.cleanupOldSources();
        }
    }

    /**
     * 輸送元ブロックを更新
     */
    updateTransportSources() {
        // 既存の輸送元が有効かチェック
        for (const [key, sourceData] of this.transportSources) {
            try {
                const block = sourceData.dimension.getBlock(sourceData.location);
                
                // ブロックが存在しない、またはインベントリを持たない場合は削除
                if (!block || !itemPipeSystem.hasInventory(block)) {
                    this.transportSources.delete(key);
                    Logger.debug(`無効な輸送元を削除: ${key}`, "ItemTransportManager");
                    continue;
                }
                
                // 出力パイプが接続されているかチェック
                if (!this.hasConnectedOutputPipe(block)) {
                    this.transportSources.delete(key);
                    Logger.debug(`出力パイプが接続されていない輸送元を削除: ${key}`, "ItemTransportManager");
                }
            } catch (error) {
                // エラーが発生した場合は削除
                this.transportSources.delete(key);
            }
        }
    }

    /**
     * 輸送元を登録
     */
    registerTransportSource(block) {
        const key = Utils.locationToKey(block.location);
        
        // 既存のエントリがある場合は更新
        const existingEntry = this.transportSources.get(key);
        if (existingEntry) {
            existingEntry.lastCheck = Date.now();
            existingEntry.errorCount = 0; // エラーカウントをリセット
            Logger.debug(`輸送元を更新: ${key}`, "ItemTransportManager");
        } else {
            this.transportSources.set(key, {
                block: block,
                dimension: block.dimension,
                location: block.location,
                lastCheck: Date.now(),
                errorCount: 0
            });
            Logger.debug(`輸送元を登録: ${key}`, "ItemTransportManager");
        }
    }

    /**
     * 輸送元を削除
     */
    unregisterTransportSource(location, dimension) {
        const key = Utils.locationToKey(location);
        this.transportSources.delete(key);
        
        Logger.debug(`輸送元を削除: ${key}`, "ItemTransportManager");
    }

    /**
     * アイテム輸送処理
     */
    processItemTransport() {
        Logger.startTimer("itemTransport");
        
        // このtickで処理済みのネットワークをクリア
        this.processedNetworks.clear();
        
        let processedCount = 0;
        let transportedItems = 0;
        
        // ネットワークごとにグループ化
        const networkGroups = this.groupSourcesByNetwork();
        
        // 各ネットワークから1個ずつ輸送
        for (const [networkId, sources] of networkGroups) {
            if (sources.length === 0) continue;
            
            // このネットワークの現在のインデックスを取得
            let currentIndex = this.networkTransportIndex.get(networkId) || 0;
            
            // 有効な輸送元を探す
            let transported = false;
            for (let i = 0; i < sources.length && !transported; i++) {
                const sourceIndex = (currentIndex + i) % sources.length;
                const sourceData = sources[sourceIndex];
                
                try {
                    // ブロックが有効か確認
                    const block = sourceData.dimension.getBlock(sourceData.location);
                    if (!block) {
                        continue;
                    }
                    
                    // 出力パイプを探す
                    let outputPipe = null;
                    const adjacents = [
                        block.above(),
                        block.below(),
                        block.north(),
                        block.south(),
                        block.east(),
                        block.west()
                    ];
                    
                    for (const adj of adjacents) {
                        if (adj?.typeId === "magisystem:pipe_output") {
                            outputPipe = adj;
                            break;
                        }
                    }
                    
                    if (outputPipe) {
                        const result = SimpleItemTransport.transferThroughNetwork(block, outputPipe);
                        if (result > 0) {
                            transportedItems += result;
                            transported = true;
                            
                            // 次回は次の輸送元から開始
                            this.networkTransportIndex.set(networkId, (sourceIndex + 1) % sources.length);
                            
                            Logger.debug(`ネットワーク${networkId}の輸送元${sourceIndex + 1}/${sources.length}から輸送`, "ItemTransportManager");
                            
                            // パイプの接続状態を更新
                            this.updatePipeConnections(outputPipe);
                        }
                    }
                } catch (error) {
                    Logger.error(`アイテム輸送エラー: ${error}`, "ItemTransportManager");
                }
            }
            
            processedCount++;
        }
        
        Logger.endTimer("itemTransport", "ItemTransportManager");
        
        if (transportedItems > 0) {
            Logger.debug(`${processedCount}個のネットワークから合計${transportedItems}個のアイテムを輸送`, "ItemTransportManager");
        }
    }
    
    /**
     * 輸送元をネットワークごとにグループ化
     */
    groupSourcesByNetwork() {
        const groups = new Map();
        
        for (const [key, sourceData] of this.transportSources) {
            try {
                const block = sourceData.dimension.getBlock(sourceData.location);
                if (!block) {
                    this.transportSources.delete(key);
                    continue;
                }
                
                // 出力パイプを探してネットワークIDを取得
                const adjacents = [
                    block.above(),
                    block.below(),
                    block.north(),
                    block.south(),
                    block.east(),
                    block.west()
                ];
                
                let networkId = null;
                for (const adj of adjacents) {
                    if (adj?.typeId === "magisystem:pipe_output") {
                        // ネットワークIDとして出力パイプの位置を使用
                        networkId = this.getNetworkId(adj);
                        break;
                    }
                }
                
                if (networkId) {
                    if (!groups.has(networkId)) {
                        groups.set(networkId, []);
                    }
                    groups.get(networkId).push(sourceData);
                }
            } catch (error) {
                // エラーは無視
            }
        }
        
        return groups;
    }
    
    /**
     * パイプからネットワークIDを取得（簡易版）
     */
    getNetworkId(pipe) {
        // 接続されているパイプネットワークの最小座標をIDとして使用
        const visited = new Set();
        const queue = [pipe];
        let minX = pipe.location.x;
        let minY = pipe.location.y;
        let minZ = pipe.location.z;
        
        while (queue.length > 0) {
            const current = queue.shift();
            const key = Utils.locationToKey(current.location);
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            // 最小座標を更新
            minX = Math.min(minX, current.location.x);
            minY = Math.min(minY, current.location.y);
            minZ = Math.min(minZ, current.location.z);
            
            // 隣接するパイプを探索
            const adjacents = [
                current.above(),
                current.below(),
                current.north(),
                current.south(),
                current.east(),
                current.west()
            ];
            
            for (const adj of adjacents) {
                if (adj && itemPipeSystem.isTransportBlock(adj)) {
                    const adjKey = Utils.locationToKey(adj.location);
                    if (!visited.has(adjKey)) {
                        queue.push(adj);
                    }
                }
            }
            
            // 探索数を制限（パフォーマンスのため）
            if (visited.size > 100) break;
        }
        
        return `${minX}_${minY}_${minZ}`;
    }
    
    /**
     * パイプの接続状態を更新
     */
    updatePipeConnections(outputPipe) {
        itemPipeSystem.clearLocationCache(outputPipe.location);
        itemPipeSystem.updatePattern(outputPipe);
        
        const adjacents = [
            outputPipe.above(),
            outputPipe.below(),
            outputPipe.north(),
            outputPipe.south(),
            outputPipe.east(),
            outputPipe.west()
        ];
        
        for (const adj of adjacents) {
            if (adj && itemPipeSystem.isTransportBlock(adj)) {
                itemPipeSystem.clearLocationCache(adj.location);
                itemPipeSystem.updatePattern(adj);
            }
        }
    }

    /**
     * 出力パイプが接続されているかチェック
     */
    hasConnectedOutputPipe(block) {
        const adjacents = [
            block.above(),
            block.below(),
            block.north(),
            block.south(),
            block.east(),
            block.west()
        ];
        
        for (const adjacent of adjacents) {
            if (adjacent?.typeId === "magisystem:pipe_output") {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 入力パイプが接続されているかチェック  
     */
    hasConnectedInputPipe(block) {
        const adjacents = [
            block.above(),
            block.below(),
            block.north(),
            block.south(),
            block.east(),
            block.west()
        ];
        
        for (const adjacent of adjacents) {
            if (adjacent?.typeId === "magisystem:pipe_input") {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 古い輸送元を削除
     */
    cleanupOldSources() {
        const now = Date.now();
        const timeout = 5 * 60 * 1000; // 5分
        
        for (const [key, sourceData] of this.transportSources) {
            if (now - sourceData.lastCheck > timeout) {
                this.transportSources.delete(key);
                Logger.debug(`古い輸送元を削除: ${key}`, "ItemTransportManager");
            }
        }
    }

    /**
     * パイプ設置時の処理
     */
    onPipePlaced(pipeBlock) {
        Logger.debug(`パイプ設置: ${pipeBlock.typeId}`, "ItemTransportManager");
        
        // 出力パイプの場合、隣接するインベントリを輸送元として登録
        if (pipeBlock.typeId === "magisystem:pipe_output") {
            Logger.debug("出力パイプを検知、隣接ブロックをチェック", "ItemTransportManager");
            
            const adjacents = [
                pipeBlock.above(),
                pipeBlock.below(), 
                pipeBlock.north(),
                pipeBlock.south(),
                pipeBlock.east(),
                pipeBlock.west()
            ];
            
            let registeredCount = 0;
            for (const adjacent of adjacents) {
                if (adjacent) {
                    Logger.debug(`隣接ブロック: ${adjacent.typeId}`, "ItemTransportManager");
                    
                    if (itemPipeSystem.hasInventory(adjacent)) {
                        Logger.debug(`インベントリブロックを発見: ${adjacent.typeId}`, "ItemTransportManager");
                        this.registerTransportSource(adjacent);
                        registeredCount++;
                    }
                }
            }
            
            Logger.info(`${registeredCount}個の輸送元を登録`, "ItemTransportManager");
        }
    }

    /**
     * パイプ破壊時の処理
     */
    onPipeRemoved(location, dimension, pipeTypeId) {
        // 出力パイプの場合、隣接するインベントリの登録を解除
        if (pipeTypeId === "magisystem:pipe_output") {
            const offsets = Object.values(Constants.DIRECTIONS);
            
            for (const offset of offsets) {
                const adjacentLocation = Utils.addLocation(location, offset);
                const adjacentBlock = Utils.getBlockSafe(dimension, adjacentLocation);
                
                if (adjacentBlock && itemPipeSystem.hasInventory(adjacentBlock)) {
                    // まだ他の出力パイプが接続されているか確認
                    if (!this.hasConnectedOutputPipe(adjacentBlock)) {
                        this.unregisterTransportSource(adjacentLocation, dimension);
                    }
                }
            }
        }
    }

    /**
     * デバッグ情報を取得
     */
    getDebugInfo() {
        return {
            isRunning: this.isRunning,
            transportSources: this.transportSources.size,
            tickCounter: this.tickCounter
        };
    }
    
    /**
     * 既存の出力パイプをスキャン
     */
    scanForExistingOutputPipes() {
        Logger.info("既存の出力パイプをスキャン中...", "ItemTransportManager");
        let scanCount = 0;
        let foundCount = 0;
        
        try {
            // 現在のディメンションのプレイヤーを取得
            const players = world.getAllPlayers();
            
            for (const player of players) {
                const dimension = player.dimension;
                const center = player.location;
                const radius = 30; // 30ブロックの範囲に縮小
                
                Logger.debug(`プレイヤー ${player.name} の周囲をスキャン`, "ItemTransportManager");
                
                for (let x = -radius; x <= radius; x += 2) {
                    for (let y = -radius; y <= radius; y += 2) {
                        for (let z = -radius; z <= radius; z += 2) {
                            try {
                                const location = {
                                    x: Math.floor(center.x) + x,
                                    y: Math.floor(center.y) + y,
                                    z: Math.floor(center.z) + z
                                };
                                
                                const block = dimension.getBlock(location);
                                if (block) {
                                    scanCount++;
                                    
                                    if (block.typeId === "magisystem:pipe_output") {
                                        foundCount++;
                                        Logger.debug(`出力パイプ発見: ${Utils.locationToKey(location)}`, "ItemTransportManager");
                                        this.onPipePlaced(block);
                                    }
                                }
                            } catch (blockError) {
                                // 個別のブロックエラーは無視
                            }
                        }
                    }
                }
            }
        } catch (error) {
            Logger.error(`スキャンエラー: ${error}`, "ItemTransportManager");
        }
        
        Logger.info(`スキャン完了: ${scanCount}ブロック中${foundCount}個の出力パイプを発見`, "ItemTransportManager");
    }
}

// シングルトンインスタンスをエクスポート
export const itemTransportManager = new ItemTransportManager();