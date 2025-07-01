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
        this.intervalId = null;
        
        // 輸送元ブロックの追跡（出力パイプ自体を追跡）
        this.outputPipes = new Map(); // key: locationKey, value: { block, dimension, location, lastCheck }
        
        // ネットワークごとの輸送制御
        this.networkTransportIndex = new Map(); // key: networkId, value: currentSourceIndex
        this.processedNetworks = new Set(); // このtickで処理済みのネットワーク
        this.pipeInventoryIndex = new Map(); // key: pipeLocationKey, value: currentInventoryIndex
        
        // 輸送中アイテムの追跡
        this.itemsInTransit = new Map(); // key: networkId_timestamp, value: { item, source, destination, ticksRemaining }
        
        // チャンクロード検出（改善版）
        this.chunkDetection = {
            // Dynamic Propertiesに登録されたパイプ
            registeredPipes: new Map(), // key: propertyKey, value: {dimensionId, location}
            
            // プレイヤー移動追跡
            playerTracking: {
                positions: new Map(),
                lastScanPositions: new Map(),
                moveThreshold: 32   // 2チャンク分の移動を検出
            },
            
            // 定期的な全体チェック
            periodicCheck: {
                lastCheckTime: 0,
                checkInterval: 60000 // 60秒ごと
            }
        };
        
        Logger.info("アイテム輸送管理システムを初期化", "ItemTransportManager");
    }

    /**
     * システムを開始
     */
    start() {
        if (this.isRunning) {
            Logger.warn("アイテム輸送システムは既に稼働中です", "ItemTransportManager");
            return;
        }
        
        this.isRunning = true;
        Logger.debug("アイテム輸送システムを開始", "ItemTransportManager");
        
        // 即座にDynamic Propertiesを復元
        Logger.debug("Dynamic Propertiesからパイプ情報を復元中...", "ItemTransportManager");
        this.restoreFromDynamicProperties();
        
        // 段階的にスキャンを実行
        // Phase 1: 3秒後に登録済みパイプを確認（チャンクロードを待つ）
        system.runTimeout(() => {
            Logger.debug("Phase 1: 登録済みパイプを確認中...", "ItemTransportManager");
            this.checkAllRegisteredPipes();
        }, 60);
        
        // Phase 2: 5秒後に新規パイプをスキャン
        system.runTimeout(() => {
            Logger.debug("Phase 2: 新規パイプをスキャン中...", "ItemTransportManager");
            this.scanForExistingOutputPipes();
            
            // 輸送中アイテムの復元
            this.restoreItemsInTransit();
        }, 100);
        
        // Phase 3: 10秒後に再スキャン（確実性のため）
        system.runTimeout(() => {
            Logger.debug("Phase 3: 最終確認スキャン...", "ItemTransportManager");
            this.checkAllRegisteredPipes();
            this.scanForExistingOutputPipes();
        }, 200);
        
        // 定期的な更新処理を開始（少し遅延させる）
        system.runTimeout(() => {
            this.intervalId = system.runInterval(() => {
                if (this.isRunning) {
                    this.tick();
                }
            }, 1); // 毎tickで実行（tick()内で頻度を制御）
        }, 20); // 1秒後に開始
    }

    /**
     * システムを停止
     */
    stop() {
        this.isRunning = false;
        
        // intervalをクリア
        if (this.intervalId) {
            system.clearRun(this.intervalId);
            this.intervalId = null;
        }
        
        Logger.info("アイテム輸送システムを停止", "ItemTransportManager");
    }

    /**
     * 毎tick実行される処理
     */
    tick() {
        this.tickCounter++;
        
        // 輸送元ブロックを更新
        this.updateTransportSources();
        
        // アイテム輸送処理（20tickごと）
        if (this.tickCounter % this.tickInterval === 0) {
            Logger.debug(`輸送処理を実行 (tick: ${this.tickCounter})`, "ItemTransportManager");
            this.processItemTransport();
        }
        
        // チャンクロード検出（40tickごと = 2秒）
        if (this.tickCounter % 40 === 0) {
            this.detectChunkLoads();
        }
        
        // 100tickごとにデバッグ情報を出力
        if (this.tickCounter % 100 === 0) {
            const activeCount = this.outputPipes.size;
            const registeredCount = this.chunkDetection.registeredPipes.size;
            Logger.debug(`輸送システム状態: 輸送元=${activeCount}個, 登録済み=${registeredCount}個, tick=${this.tickCounter}`, "ItemTransportManager");
        }
        
        // 定期的な全体チェック（60秒ごと）
        const now = Date.now();
        if (now - this.chunkDetection.periodicCheck.lastCheckTime > this.chunkDetection.periodicCheck.checkInterval) {
            this.performPeriodicCheck();
            this.chunkDetection.periodicCheck.lastCheckTime = now;
        }
        
        // 古い輸送元を削除（5分以上更新されていない）
        if (this.tickCounter % 6000 === 0) { // 5分ごと
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
        const toRemove = [];
        
        for (const [key, pipeData] of this.outputPipes) {
            try {
                const block = pipeData.dimension.getBlock(pipeData.location);
                
                // ブロックが取得できない場合（チャンクアンロード）はスキップ
                if (!block) {
                    // チャンクがアンロードされているだけかもしれないので、すぐには削除しない
                    continue;
                }
                
                // 出力パイプでない場合のみ削除
                if (block.typeId !== "magisystem:pipe_output") {
                    toRemove.push(key);
                    Logger.debug(`無効な出力パイプを削除: ${key}`, "ItemTransportManager");
                    continue;
                }
                
                // 最後の更新時刻を記録
                pipeData.lastCheck = Date.now();
            } catch (error) {
                // エラーが発生してもすぐには削除しない（チャンクアンロードの可能性）
                continue;
            }
        }
        
        // 実際に無効なものだけを削除
        for (const key of toRemove) {
            this.outputPipes.delete(key);
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
        
        // Dynamic Propertyから削除（旧形式）
        try {
            world.setDynamicProperty(`pipe_output_${key}`, undefined);
            // 新形式も削除
            world.setDynamicProperty(`magisystem:outputpipe_${key}`, undefined);
        } catch (error) {
            // エラーは無視
        }
    }

    /**
     * アイテム輸送処理
     */
    processItemTransport() {
        Logger.startTimer("itemTransport");
        
        // デバッグ: 出力パイプ数を確認
        if (this.outputPipes.size === 0) {
            Logger.debug("出力パイプが登録されていません", "ItemTransportManager");
            return;
        }
        
        // このtickで処理済みのネットワークをクリア
        this.processedNetworks.clear();
        
        let processedCount = 0;
        let transportedItems = 0;
        
        // ネットワークごとにグループ化
        const networkGroups = this.groupPipesByNetwork();
        
        Logger.debug(`アクティブなネットワーク: ${networkGroups.size}個`, "ItemTransportManager");
        
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
                            // 熱発電機からは取り出さない
                            if (adj.typeId === "magisystem:thermal_generator") {
                                continue;
                            }
                            sourceBlocks.push(adj);
                        }
                    }
                    
                    // 各インベントリから順番に試行（1つ成功したら終了）
                    for (const sourceBlock of sourceBlocks) {
                        const result = SimpleItemTransport.transferThroughNetwork(sourceBlock, outputPipe, this);
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
        
        // 輸送中アイテムを更新・保存
        this.updateItemsInTransit();
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
            this.registerOutputPipeInternal(pipeBlock);
            Logger.info(`出力パイプを設置・登録`, "ItemTransportManager");
            
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
            const key = Utils.locationToKey(location);
            
            // 内部マップから削除
            this.outputPipes.delete(key);
            
            // Dynamic Propertyから削除
            const propKey = `magisystem:outputpipe_${key}`;
            world.setDynamicProperty(propKey, undefined);
            this.chunkDetection.registeredPipes.delete(propKey);
            
            Logger.info(`出力パイプの登録を解除`, "ItemTransportManager");
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
        Logger.debug("既存の出力パイプをスキャン中...", "ItemTransportManager");
        let scanCount = 0;
        let foundCount = 0;
        let registeredCount = 0;
        
        try {
            // 登録済みパイプをチェック（新しいDynamic Properties形式）
            this.checkAllRegisteredPipes();
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
     * Dynamic Propertiesから復元
     */
    restoreFromDynamicProperties() {
        Logger.debug("Dynamic Propertiesからパイプを復元中...", "ItemTransportManager");
        let restoredCount = 0;
        
        try {
            const properties = world.getDynamicPropertyIds();
            
            for (const prop of properties) {
                if (prop.startsWith("magisystem:outputpipe_")) {
                    const dimensionId = world.getDynamicProperty(prop);
                    if (dimensionId) {
                        // 座標を抽出
                        const coordStr = prop.replace("magisystem:outputpipe_", "");
                        const location = Utils.keyToLocation(coordStr);
                        
                        // 登録
                        this.chunkDetection.registeredPipes.set(prop, {
                            dimensionId,
                            location,
                            lastCheck: 0
                        });
                        
                        restoredCount++;
                    }
                }
            }
            
            Logger.debug(`${restoredCount}個のパイプ位置を復元`, "ItemTransportManager");
        } catch (error) {
            Logger.error(`Dynamic Properties復元エラー: ${error}`, "ItemTransportManager");
        }
    }
    
    /**
     * チャンクロードを検出
     */
    detectChunkLoads() {
        const players = world.getAllPlayers();
        const tracking = this.chunkDetection.playerTracking;
        
        for (const player of players) {
            const playerId = player.id;
            const currentPos = player.location;
            const lastPos = tracking.positions.get(playerId);
            
            if (lastPos) {
                const distance = Math.sqrt(
                    Math.pow(currentPos.x - lastPos.x, 2) +
                    Math.pow(currentPos.y - lastPos.y, 2) +
                    Math.pow(currentPos.z - lastPos.z, 2)
                );
                
                // 大きく移動した場合
                if (distance > tracking.moveThreshold) {
                    Logger.debug(`プレイヤー${player.name}が${Math.floor(distance)}ブロック移動`, "ItemTransportManager");
                    
                    // 移動先周辺の登録済みパイプをチェック
                    this.checkRegisteredPipesNearLocation(currentPos, player.dimension);
                    
                    // 新規パイプも軽くスキャン
                    this.scanAroundLocation(currentPos, player.dimension, 20);
                }
            }
            
            tracking.positions.set(playerId, { ...currentPos });
        }
    }
    
    /**
     * 登録済みパイプの確認
     */
    checkRegisteredPipesNearLocation(location, dimension) {
        const checkRadius = 50; // 50ブロック範囲
        let checkedCount = 0;
        
        for (const [propKey, pipeData] of this.chunkDetection.registeredPipes) {
            if (pipeData.dimensionId !== dimension.id) continue;
            
            const distance = Math.sqrt(
                Math.pow(location.x - pipeData.location.x, 2) +
                Math.pow(location.y - pipeData.location.y, 2) +
                Math.pow(location.z - pipeData.location.z, 2)
            );
            
            if (distance <= checkRadius) {
                try {
                    const block = Utils.getBlockSafe(dimension, pipeData.location);
                    if (block?.typeId === "magisystem:pipe_output") {
                        const key = Utils.locationToKey(block.location);
                        if (!this.outputPipes.has(key)) {
                            this.registerOutputPipeInternal(block);
                            checkedCount++;
                        }
                    }
                } catch (error) {
                    // エラーは無視
                }
            }
        }
        
        if (checkedCount > 0) {
            Logger.debug(`${checkedCount}個の登録済みパイプを確認`, "ItemTransportManager");
        }
    }
    
    /**
     * 特定位置周辺をスキャン
     */
    scanAroundLocation(center, dimension, radius) {
        let foundCount = 0;
        
        // 効率的なスキャン（4ブロックごと）
        for (let x = -radius; x <= radius; x += 4) {
            for (let y = -radius; y <= radius; y += 4) {
                for (let z = -radius; z <= radius; z += 4) {
                    const location = {
                        x: Math.floor(center.x) + x,
                        y: Math.floor(center.y) + y,
                        z: Math.floor(center.z) + z
                    };
                    
                    try {
                        const block = dimension.getBlock(location);
                        if (block?.typeId === "magisystem:pipe_output") {
                            const key = Utils.locationToKey(location);
                            if (!this.outputPipes.has(key)) {
                                this.registerOutputPipeInternal(block);
                                foundCount++;
                            }
                        }
                    } catch (error) {
                        // エラーは無視
                    }
                }
            }
        }
        
        if (foundCount > 0) {
            Logger.debug(`${foundCount}個の新規出力パイプを発見`, "ItemTransportManager");
        }
    }
    
    /**
     * 出力パイプを内部的に登録
     */
    registerOutputPipeInternal(block) {
        const key = Utils.locationToKey(block.location);
        
        // 既に登録されている場合は更新のみ
        if (this.outputPipes.has(key)) {
            const existing = this.outputPipes.get(key);
            existing.lastCheck = Date.now();
            return;
        }
        
        this.outputPipes.set(key, {
            block: block,
            dimension: block.dimension,
            location: block.location,
            lastCheck: Date.now()
        });
        
        // Dynamic Propertyに保存
        const propKey = `magisystem:outputpipe_${key}`;
        try {
            world.setDynamicProperty(propKey, block.dimension.id);
            
            this.chunkDetection.registeredPipes.set(propKey, {
                dimensionId: block.dimension.id,
                location: block.location,
                lastCheck: Date.now()
            });
            
            Logger.debug(`出力パイプを登録: ${key}`, "ItemTransportManager");
        } catch (error) {
            Logger.warn(`Dynamic Property保存エラー: ${error}`, "ItemTransportManager");
        }
    }
    
    /**
     * 定期的な全体チェック
     */
    performPeriodicCheck() {
        Logger.debug("定期的な全体チェックを実行", "ItemTransportManager");
        
        // 非同期的に実行
        system.runTimeout(() => {
            this.checkAllRegisteredPipes();
        }, 1);
    }
    
    /**
     * 全ての登録済みパイプを確認
     * @param {boolean} forceActivate - ブロックが取得できなくてもアクティベートするか
     */
    checkAllRegisteredPipes(forceActivate = false) {
        let checkedCount = 0;
        let removedCount = 0;
        let activatedCount = 0;
        let skippedCount = 0;
        
        Logger.debug(`登録済みパイプをチェック: ${this.chunkDetection.registeredPipes.size}個`, "ItemTransportManager");
        
        for (const [propKey, pipeData] of this.chunkDetection.registeredPipes) {
            try {
                const dimension = world.getDimension(pipeData.dimensionId);
                const block = Utils.getBlockSafe(dimension, pipeData.location);
                
                if (block?.typeId === "magisystem:pipe_output") {
                    const key = Utils.locationToKey(block.location);
                    if (!this.outputPipes.has(key)) {
                        // 新しいパイプとして登録
                        this.outputPipes.set(key, {
                            block: block,
                            dimension: block.dimension,
                            location: block.location,
                            lastCheck: Date.now()
                        });
                        activatedCount++;
                        Logger.debug(`パイプをアクティベート: ${key}`, "ItemTransportManager");
                    }
                    checkedCount++;
                } else if (block && block.typeId !== "magisystem:pipe_output") {
                    // ブロックが存在するがパイプではない場合のみ削除
                    world.setDynamicProperty(propKey, undefined);
                    this.chunkDetection.registeredPipes.delete(propKey);
                    removedCount++;
                    Logger.debug(`無効なパイプを削除: ${propKey}`, "ItemTransportManager");
                }
                // ブロックが取得できない場合（チャンク未ロード）は何もしない
            } catch (error) {
                // チャンクがロードされていない場合はスキップ
                Logger.debug(`パイプ確認スキップ: ${propKey}`, "ItemTransportManager");
            }
        }
        
        Logger.debug(`全体チェック完了: ${checkedCount}個確認、${activatedCount}個アクティベート、${removedCount}個削除`, "ItemTransportManager");
    }
    
    /**
     * 強制的に全パイプを再スキャン
     */
    forceRescanAll() {
        Logger.info("強制的に全パイプを再スキャンします", "ItemTransportManager");
        
        // 現在の出力パイプをクリア
        this.outputPipes.clear();
        
        // 登録済みパイプを再確認
        this.checkAllRegisteredPipes();
        
        // プレイヤー周辺をスキャン
        const players = world.getAllPlayers();
        for (const player of players) {
            this.scanAroundLocation(player.location, player.dimension, 50);
        }
        
        Logger.info(`強制再スキャン完了: ${this.outputPipes.size}個の出力パイプがアクティブ`, "ItemTransportManager");
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
                const playerId = player.id;
                
                // プレイヤーの大きな移動を検出
                const lastPos = this.chunkDetection.playerTracking.positions.get(playerId);
                const currentPos = { x: center.x, y: center.y, z: center.z };
                
                let forceFullScan = false;
                if (lastPos) {
                    const distance = Math.sqrt(
                        Math.pow(currentPos.x - lastPos.x, 2) +
                        Math.pow(currentPos.y - lastPos.y, 2) +
                        Math.pow(currentPos.z - lastPos.z, 2)
                    );
                    
                    // 30ブロック以上移動した場合は強制的にフルスキャン
                    if (distance > 30) {
                        forceFullScan = true;
                        Logger.info(`プレイヤー ${player.name} が大きく移動したため、周囲をスキャン (${Math.floor(distance)}ブロック)`, "ItemTransportManager");
                        
                        // 大移動後は全体を再スキャン
                        this.scanAroundPlayer(player);
                    }
                }
                
                this.chunkDetection.playerTracking.positions.set(playerId, currentPos);
                
                // プレイヤーの周囲の範囲を定期的にチェック
                const checkRadius = forceFullScan ? 48 : 24; // 大移動時は範囲を拡大
                
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
    
    /**
     * 輸送中アイテムを記録
     * @private
     */
    recordItemInTransit(itemTypeId, amount, sourceKey, destKey, ticksToArrive = 20) {
        const transitKey = `${sourceKey}_${destKey}_${Date.now()}`;
        const networkId = this.getNetworkIdFromLocation(sourceKey);
        
        this.itemsInTransit.set(transitKey, {
            itemTypeId: itemTypeId,
            amount: amount,
            sourceKey: sourceKey,
            destKey: destKey,
            ticksRemaining: ticksToArrive,
            networkId: networkId
        });
    }
    
    /**
     * 位置キーからネットワークIDを取得
     * @private
     */
    getNetworkIdFromLocation(locationKey) {
        // 位置からブロックを取得してネットワークIDを計算
        try {
            const location = Utils.keyToLocation(locationKey);
            for (const [key, pipeData] of this.outputPipes) {
                if (pipeData.location.x === location.x && 
                    pipeData.location.y === location.y && 
                    pipeData.location.z === location.z) {
                    const block = pipeData.dimension.getBlock(location);
                    if (block) {
                        return this.getNetworkId(block);
                    }
                }
            }
        } catch (error) {
            // エラーは無視
        }
        return "default";
    }
    
    /**
     * 輸送中アイテムを更新
     * @private
     */
    updateItemsInTransit() {
        const toRemove = [];
        const toSave = [];
        
        for (const [key, transit] of this.itemsInTransit) {
            transit.ticksRemaining--;
            
            if (transit.ticksRemaining <= 0) {
                // 輸送完了
                toRemove.push(key);
            } else {
                // まだ輸送中
                toSave.push({ key, transit });
            }
        }
        
        // 完了したアイテムを削除
        for (const key of toRemove) {
            this.itemsInTransit.delete(key);
        }
        
        // 輸送中アイテムを保存（5tickごと）
        if (this.tickCounter % 5 === 0 && toSave.length > 0) {
            this.saveItemsInTransit();
        }
    }
    
    /**
     * 輸送中アイテムを保存
     * @private
     */
    saveItemsInTransit() {
        try {
            // ネットワークごとにグループ化
            const networkGroups = new Map();
            const priorityItems = new Set(["minecraft:diamond", "minecraft:emerald", "minecraft:ancient_debris", "minecraft:netherite_ingot"]);
            
            for (const [key, transit] of this.itemsInTransit) {
                if (transit.ticksRemaining <= 0) continue;
                
                const networkId = transit.networkId || "default";
                if (!networkGroups.has(networkId)) {
                    networkGroups.set(networkId, []);
                }
                
                networkGroups.get(networkId).push({
                    k: key,
                    i: transit.itemTypeId,
                    a: transit.amount,
                    s: transit.sourceKey,
                    d: transit.destKey,
                    t: transit.ticksRemaining,
                    p: priorityItems.has(transit.itemTypeId) ? 1 : 0  // 優先度フラグ
                });
            }
            
            // 各ネットワークのデータを個別に保存
            let totalSaved = 0;
            let networkCount = 0;
            const maxNetworks = 10;  // 最大10ネットワークまで保存
            const maxItemsPerNetwork = 50;  // 各ネットワーク最大50個
            
            for (const [networkId, items] of networkGroups) {
                if (networkCount >= maxNetworks) {
                    Logger.warn(`ネットワーク数が上限(${maxNetworks})を超過`, "ItemTransportManager");
                    break;
                }
                
                // 優先度でソート
                items.sort((a, b) => b.p - a.p);
                
                // 制限内に収める
                if (items.length > maxItemsPerNetwork) {
                    Logger.debug(`ネットワーク${networkId}: ${items.length}個→${maxItemsPerNetwork}個に制限`, "ItemTransportManager");
                    items.splice(maxItemsPerNetwork);
                }
                
                // プロパティ名にネットワークIDを含める
                const propertyName = `magisystem:transit_${networkId.substring(0, 10)}`;
                world.setDynamicProperty(propertyName, JSON.stringify(items));
                
                totalSaved += items.length;
                networkCount++;
            }
            
            // メインプロパティに保存したネットワークのリストを記録
            const networkList = Array.from(networkGroups.keys()).slice(0, maxNetworks);
            world.setDynamicProperty("magisystem:transitNetworks", JSON.stringify(networkList));
            
            if (totalSaved > 0) {
                Logger.debug(`輸送中アイテム保存: ${totalSaved}個を${networkCount}ネットワークに分割保存`, "ItemTransportManager");
            }
        } catch (error) {
            Logger.warn(`輸送中アイテムの保存に失敗: ${error}`, "ItemTransportManager");
        }
    }
    
    /**
     * 輸送データを圧縮
     * @private
     */
    compressTransitData(transitData) {
        // 現在は圧縮なしで返す（将来的に実装予定）
        return transitData;
    }
    
    /**
     * 圧縮データを展開
     * @private
     */
    decompressTransitData(compressedData) {
        // 現在は圧縮なしで返す（将来的に実装予定）
        return compressedData;
    }
    
    /**
     * 輸送中アイテムを復元
     * @private
     */
    restoreItemsInTransit() {
        try {
            // 旧形式のデータをチェック（互換性のため）
            const oldData = world.getDynamicProperty("magisystem:itemsInTransit");
            if (oldData) {
                this.restoreOldFormatData(oldData);
                world.setDynamicProperty("magisystem:itemsInTransit", undefined);
                return;
            }
            
            // 新形式：ネットワークリストを取得
            const networkListData = world.getDynamicProperty("magisystem:transitNetworks");
            if (!networkListData) return;
            
            const networkList = JSON.parse(networkListData);
            let totalRestored = 0;
            let totalSkipped = 0;
            
            // 各ネットワークのデータを復元
            for (const networkId of networkList) {
                try {
                    const propertyName = `magisystem:transit_${networkId.substring(0, 10)}`;
                    const networkData = world.getDynamicProperty(propertyName);
                    
                    if (!networkData) continue;
                    
                    const items = JSON.parse(networkData);
                    for (const data of items) {
                        // 保存時より少し時間を減らす（リロード中の時間経過を考慮）
                        const adjustedTicks = Math.max(1, data.t - 20);
                        
                        // 時間切れのアイテムはスキップ
                        if (adjustedTicks <= 0) {
                            totalSkipped++;
                            continue;
                        }
                        
                        this.itemsInTransit.set(data.k, {
                            itemTypeId: data.i,
                            amount: data.a,
                            sourceKey: data.s,
                            destKey: data.d,
                            ticksRemaining: adjustedTicks,
                            networkId: networkId
                        });
                        totalRestored++;
                    }
                    
                    // 復元後はクリア
                    world.setDynamicProperty(propertyName, undefined);
                } catch (error) {
                    Logger.warn(`ネットワーク${networkId}の復元に失敗: ${error}`, "ItemTransportManager");
                }
            }
            
            // ネットワークリストもクリア
            world.setDynamicProperty("magisystem:transitNetworks", undefined);
            
            if (totalRestored > 0 || totalSkipped > 0) {
                Logger.debug(`輸送中アイテム復元: ${totalRestored}個復元, ${totalSkipped}個スキップ`, "ItemTransportManager");
            }
        } catch (error) {
            Logger.warn(`輸送中アイテムの復元に失敗: ${error}`, "ItemTransportManager");
        }
    }
    
    /**
     * 旧形式のデータを復元（互換性のため）
     * @private
     */
    restoreOldFormatData(savedData) {
        try {
            const transitData = JSON.parse(savedData);
            let restoredCount = 0;
            
            for (const data of transitData) {
                const adjustedTicks = Math.max(1, data.t - 20);
                if (adjustedTicks <= 0) continue;
                
                this.itemsInTransit.set(data.k, {
                    itemTypeId: data.i,
                    amount: data.a,
                    sourceKey: data.s,
                    destKey: data.d,
                    ticksRemaining: adjustedTicks,
                    networkId: "default"
                });
                restoredCount++;
            }
            
            if (restoredCount > 0) {
                Logger.info(`旧形式データから${restoredCount}個の輸送中アイテムを復元`, "ItemTransportManager");
            }
        } catch (error) {
            Logger.warn(`旧形式データの復元に失敗: ${error}`, "ItemTransportManager");
        }
    }
}

// シングルトンインスタンスをエクスポート
export const itemTransportManager = new ItemTransportManager();