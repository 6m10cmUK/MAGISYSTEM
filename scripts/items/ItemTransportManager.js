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
        
        // 輸送元ブロックの追跡（出力パイプ自体を追跡）
        this.outputPipes = new Map(); // key: locationKey, value: { block, dimension, location, lastCheck }
        
        // ネットワークごとの輸送制御
        this.networkTransportIndex = new Map(); // key: networkId, value: currentSourceIndex
        this.processedNetworks = new Set(); // このtickで処理済みのネットワーク
        this.pipeInventoryIndex = new Map(); // key: pipeLocationKey, value: currentInventoryIndex
        
        Logger.info("アイテム輸送管理システムを初期化", "ItemTransportManager");
    }

    /**
     * システムを開始
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        Logger.info("アイテム輸送システムを開始", "ItemTransportManager");
        
        // 初回スキャンを3秒後に実行（ワールドが完全に読み込まれるのを待つ）
        system.runTimeout(() => {
            Logger.info("既存の輸送元をスキャン開始...", "ItemTransportManager");
            this.scanForExistingOutputPipes();
            
            // 追加でもう一度5秒後にスキャン（念のため）
            system.runTimeout(() => {
                Logger.info("2回目のスキャンを実行...", "ItemTransportManager");
                this.scanForExistingOutputPipes();
            }, 100);
        }, 60);
        
        // 定期的な更新処理を開始（少し遅延させる）
        system.runTimeout(() => {
            this.intervalId = system.runInterval(() => {
                if (this.isRunning) {
                    this.tick();
                }
            }, this.tickInterval);
        }, 20); // 1秒後に開始
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
        
        // 定期的に出力パイプ数をログ出力（デバッグ用）
        if (this.tickCounter % 100 === 0) {
            Logger.debug(`出力パイプ数: ${this.outputPipes.size}`, "ItemTransportManager");
        }
        
        // チャンクロード検出（2秒ごと）
        if (this.tickCounter % 40 === 0) {
            this.checkNewlyLoadedChunks();
        }
    }

    /**
     * 出力パイプを更新
     */
    updateTransportSources() {
        // 既存の出力パイプが有効かチェック
        for (const [key, pipeData] of this.outputPipes) {
            try {
                const block = pipeData.dimension.getBlock(pipeData.location);
                
                // ブロックが存在しない、または出力パイプでない場合は削除
                if (!block || block.typeId !== "magisystem:pipe_output") {
                    this.outputPipes.delete(key);
                    Logger.debug(`無効な出力パイプを削除: ${key}`, "ItemTransportManager");
                    continue;
                }
                
                // 隣接するインベントリブロックが存在するかチェック
                if (!this.hasAdjacentInventory(block)) {
                    this.outputPipes.delete(key);
                    Logger.debug(`インベントリが接続されていない出力パイプを削除: ${key}`, "ItemTransportManager");
                }
            } catch (error) {
                // エラーが発生した場合は削除
                this.outputPipes.delete(key);
            }
        }
    }

    /**
     * 出力パイプを登録
     */
    registerOutputPipe(block) {
        if (block.typeId !== "magisystem:pipe_output") return;
        
        const key = Utils.locationToKey(block.location);
        
        // 既存のエントリがある場合は更新
        const existingEntry = this.outputPipes.get(key);
        if (existingEntry) {
            existingEntry.lastCheck = Date.now();
            Logger.debug(`出力パイプを更新: ${key}`, "ItemTransportManager");
        } else {
            this.outputPipes.set(key, {
                dimension: block.dimension,
                location: block.location,
                lastCheck: Date.now()
            });
            Logger.debug(`出力パイプを登録: ${key}`, "ItemTransportManager");
            
            // Dynamic Propertyに保存（エネルギーシステムと同様）
            try {
                world.setDynamicProperty(`pipe_output_${key}`, block.dimension.id);
            } catch (error) {
                Logger.warn(`出力パイプの保存に失敗: ${error}`, "ItemTransportManager");
            }
        }
    }

    /**
     * 出力パイプを削除
     */
    unregisterOutputPipe(location) {
        const key = Utils.locationToKey(location);
        this.outputPipes.delete(key);
        
        Logger.debug(`出力パイプを削除: ${key}`, "ItemTransportManager");
        
        // Dynamic Propertyから削除
        try {
            world.setDynamicProperty(`pipe_output_${key}`, undefined);
        } catch (error) {
            // エラーは無視
        }
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
        const networkGroups = this.groupPipesByNetwork();
        
        // 各ネットワークから1個ずつ輸送
        for (const [networkId, pipes] of networkGroups) {
            if (pipes.length === 0) continue;
            
            // このネットワークの現在のインデックスを取得
            let currentIndex = this.networkTransportIndex.get(networkId) || 0;
            
            // 有効な輸送元を探す
            let transported = false;
            for (let i = 0; i < pipes.length && !transported; i++) {
                const pipeIndex = (currentIndex + i) % pipes.length;
                const pipeData = pipes[pipeIndex];
                
                try {
                    // 出力パイプが有効か確認
                    const outputPipe = pipeData.dimension.getBlock(pipeData.location);
                    if (!outputPipe || outputPipe.typeId !== "magisystem:pipe_output") {
                        continue;
                    }
                    
                    // 隣接する全てのインベントリを収集
                    const sourceBlocks = [];
                    const adjacents = [
                        outputPipe.above(),
                        outputPipe.below(),
                        outputPipe.north(),
                        outputPipe.south(),
                        outputPipe.east(),
                        outputPipe.west()
                    ];
                    
                    for (const adj of adjacents) {
                        if (adj && itemPipeSystem.hasInventory(adj)) {
                            sourceBlocks.push(adj);
                        }
                    }
                    
                    // 各インベントリから順番に試行（1つ成功したら終了）
                    for (const sourceBlock of sourceBlocks) {
                        const result = SimpleItemTransport.transferThroughNetwork(sourceBlock, outputPipe);
                        if (result > 0) {
                            transportedItems += result;
                            transported = true;
                            break; // 1個輸送したら次のパイプへ
                        }
                    }
                    
                    if (transported) {
                        // 次回は次の出力パイプから開始
                        this.networkTransportIndex.set(networkId, (pipeIndex + 1) % pipes.length);
                        Logger.debug(`ネットワーク${networkId}の出力パイプ${pipeIndex + 1}/${pipes.length}から輸送`, "ItemTransportManager");
                        
                        // パイプの接続状態を更新
                        this.updatePipeConnections(outputPipe);
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
    groupPipesByNetwork() {
        const groups = new Map();
        
        for (const [key, pipeData] of this.outputPipes) {
            try {
                const block = pipeData.dimension.getBlock(pipeData.location);
                if (!block || block.typeId !== "magisystem:pipe_output") {
                    this.outputPipes.delete(key);
                    continue;
                }
                
                // ネットワークIDを取得
                const networkId = this.getNetworkId(block);
                
                if (networkId) {
                    if (!groups.has(networkId)) {
                        groups.set(networkId, []);
                    }
                    groups.get(networkId).push(pipeData);
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
     * 隣接するインベントリがあるかチェック
     */
    hasAdjacentInventory(outputPipe) {
        const adjacents = [
            outputPipe.above(),
            outputPipe.below(),
            outputPipe.north(),
            outputPipe.south(),
            outputPipe.east(),
            outputPipe.west()
        ];
        
        for (const adjacent of adjacents) {
            if (adjacent && itemPipeSystem.hasInventory(adjacent)) {
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
     * 古い出力パイプを削除
     */
    cleanupOldSources() {
        const now = Date.now();
        const timeout = 5 * 60 * 1000; // 5分
        
        for (const [key, pipeData] of this.outputPipes) {
            if (now - pipeData.lastCheck > timeout) {
                this.outputPipes.delete(key);
                Logger.debug(`古い出力パイプを削除: ${key}`, "ItemTransportManager");
            }
        }
    }

    /**
     * パイプ設置時の処理
     */
    onPipePlaced(pipeBlock) {
        Logger.debug(`パイプ設置: ${pipeBlock.typeId}`, "ItemTransportManager");
        
        // 出力パイプの場合、登録
        if (pipeBlock.typeId === "magisystem:pipe_output") {
            this.registerOutputPipe(pipeBlock);
            
            // 隣接インベントリがあるか確認
            if (this.hasAdjacentInventory(pipeBlock)) {
                Logger.info(`インベントリ付き出力パイプを登録`, "ItemTransportManager");
            }
        }
    }

    /**
     * パイプ破壊時の処理
     */
    onPipeRemoved(location, dimension, pipeTypeId) {
        // 出力パイプの場合、登録を解除
        if (pipeTypeId === "magisystem:pipe_output") {
            this.unregisterOutputPipe(location);
        }
    }

    /**
     * デバッグ情報を取得
     */
    getDebugInfo() {
        return {
            isRunning: this.isRunning,
            transportSources: this.outputPipes.size,
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
        let registeredCount = 0;
        
        try {
            // まず、Dynamic Propertyから保存された出力パイプを復元
            const properties = world.getDynamicPropertyIds();
            for (const prop of properties) {
                if (prop.startsWith("pipe_output_") && prop.match(/^pipe_output_-?\d+,-?\d+,-?\d+$/)) {
                    const locationKey = prop.substring(12); // "pipe_output_"を除去
                    const dimensionId = world.getDynamicProperty(prop);
                    
                    if (dimensionId) {
                        const location = Utils.keyToLocation(locationKey);
                        const dimension = world.getDimension(dimensionId);
                        
                        if (dimension) {
                            try {
                                const block = dimension.getBlock(location);
                                if (block?.typeId === "magisystem:pipe_output") {
                                    this.outputPipes.set(locationKey, {
                                        dimension: dimension,
                                        location: location,
                                        lastCheck: Date.now()
                                    });
                                    registeredCount++;
                                    Logger.debug(`保存された出力パイプを復元: ${locationKey}`, "ItemTransportManager");
                                }
                            } catch (error) {
                                // ブロックが存在しない場合はスキップ
                            }
                        }
                    }
                }
            }
            // 現在のディメンションのプレイヤーを取得
            const players = world.getAllPlayers();
            
            if (players.length === 0) {
                Logger.warn("プレイヤーが見つかりません。スキャンを延期します。", "ItemTransportManager");
                // プレイヤーがいない場合は後で再試行
                system.runTimeout(() => {
                    this.scanForExistingOutputPipes();
                }, 100);
                return;
            }
            
            // プレイヤーごとに非同期でスキャン
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                // プレイヤーごとに遅延を設けてスキャン
                system.runTimeout(() => {
                    this.scanAroundPlayer(player);
                }, i * 10); // プレイヤーごとに0.5秒ずつ遅延
            }
        } catch (error) {
            Logger.error(`スキャンエラー: ${error}`, "ItemTransportManager");
        }
    }
    
    /**
     * プレイヤー周辺をスキャン（バッチ処理）
     */
    scanAroundPlayer(player) {
        const dimension = player.dimension;
        const center = player.location;
        const radius = 20; // 範囲を制限
        
        // スキャンを小さなバッチに分割
        const batchSize = 5; // 5x5x5のブロック
        let x = -radius;
        
        const scanBatch = () => {
            try {
                let scannedInBatch = 0;
                const maxPerBatch = 125; // 5x5x5
                
                for (; x <= radius && scannedInBatch < maxPerBatch; x += 5) {
                    for (let y = -radius; y <= radius && scannedInBatch < maxPerBatch; y += 5) {
                        for (let z = -radius; z <= radius && scannedInBatch < maxPerBatch; z += 5) {
                            scannedInBatch++;
                            try {
                                const location = {
                                    x: Math.floor(center.x) + x,
                                    y: Math.floor(center.y) + y,
                                    z: Math.floor(center.z) + z
                                };
                                
                                const block = dimension.getBlock(location);
                                if (block?.typeId === "magisystem:pipe_output") {
                                    const preSize = this.outputPipes.size;
                                    this.onPipePlaced(block);
                                    const postSize = this.outputPipes.size;
                                    
                                    if (postSize > preSize) {
                                        Logger.info(`出力パイプ発見・登録: ${Utils.locationToKey(location)}`, "ItemTransportManager");
                                    }
                                }
                            } catch (blockError) {
                                // 個別のブロックエラーは無視
                            }
                        }
                    }
                }
                
                // まだスキャンするブロックが残っている場合は次のバッチを予約
                if (x <= radius) {
                    system.runTimeout(() => scanBatch(), 1);
                } else {
                    Logger.debug(`プレイヤー ${player.name} 周辺のスキャン完了`, "ItemTransportManager");
                }
            } catch (error) {
                Logger.error(`バッチスキャンエラー: ${error}`, "ItemTransportManager");
            }
        };
        
        // 最初のバッチを開始
        scanBatch();
    }
    
    /**
     * 新しくロードされたチャンクをチェック
     */
    checkNewlyLoadedChunks() {
        try {
            const players = world.getAllPlayers();
            
            for (const player of players) {
                const dimension = player.dimension;
                const center = player.location;
                
                // プレイヤーの周囲の小さな範囲を定期的にチェック
                const checkRadius = 12; // 12ブロックの範囲
                
                // 既知の輸送元から離れた位置をチェック
                for (let x = -checkRadius; x <= checkRadius; x += 6) {
                    for (let y = -checkRadius; y <= checkRadius; y += 6) {
                        for (let z = -checkRadius; z <= checkRadius; z += 6) {
                            const location = {
                                x: Math.floor(center.x) + x,
                                y: Math.floor(center.y) + y,
                                z: Math.floor(center.z) + z
                            };
                            
                            const block = dimension.getBlock(location);
                            if (block?.typeId === "magisystem:pipe_output") {
                                // この出力パイプに接続されたインベントリが既に登録されているかチェック
                                const adjacents = [
                                    block.above(),
                                    block.below(),
                                    block.north(),
                                    block.south(),
                                    block.east(),
                                    block.west()
                                ];
                                
                                const pipeKey = Utils.locationToKey(block.location);
                                if (!this.outputPipes.has(pipeKey)) {
                                    // 新しい出力パイプを発見
                                    this.registerOutputPipe(block);
                                    
                                    // 隣接インベントリを確認
                                    for (const adj of adjacents) {
                                        if (adj && itemPipeSystem.hasInventory(adj)) {
                                            Logger.info(`新しい出力パイプを検出: ${adj.typeId}に接続 at ${pipeKey}`, "ItemTransportManager");
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            // エラーは無視（頻繁に実行されるため）
        }
    }
}

// シングルトンインスタンスをエクスポート
export const itemTransportManager = new ItemTransportManager();