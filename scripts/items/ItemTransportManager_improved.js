/**
 * MAGISYSTEM アイテム輸送管理システム（改善版）
 * チャンクロード検出の最適化実装
 */

import { world, system } from "@minecraft/server";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";
import { itemNetwork } from "./ItemNetwork.js";
import { SimpleItemTransport } from "./SimpleItemTransport.js";
import { Logger } from "../core/Logger.js";
import { Utils } from "../core/Utils.js";
import { Constants } from "../core/Constants.js";

export class ItemTransportManagerImproved {
    constructor() {
        this.isRunning = false;
        this.tickInterval = 20; // 20tick = 1秒ごとに処理
        this.tickCounter = 0;
        
        // 輸送元ブロックの追跡
        this.outputPipes = new Map(); // key: locationKey, value: pipe data
        
        // ネットワークごとの輸送制御
        this.networkTransportIndex = new Map();
        this.processedNetworks = new Set();
        this.pipeInventoryIndex = new Map();
        
        // チャンクロード検出（ハイブリッドアプローチ）
        this.chunkLoadDetection = {
            // Dynamic Propertiesに登録されたパイプ
            registeredPipes: new Map(), // key: propertyKey, value: dimensionId
            
            // プレイヤー移動追跡
            playerTracking: {
                positions: new Map(),
                lastScanTime: 0,
                scanInterval: 2000, // 2秒
                moveThreshold: 32   // 2チャンク
            },
            
            // 定期的な全体スキャン
            periodicScan: {
                lastFullScan: 0,
                fullScanInterval: 60000, // 60秒
                isScanning: false
            }
        };
        
        Logger.info("アイテム輸送管理システム（改善版）を初期化", "ItemTransportManager");
    }

    /**
     * システムを開始
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        Logger.info("アイテム輸送システムを開始", "ItemTransportManager");
        
        // Dynamic Propertiesから既存のパイプを復元
        system.runTimeout(() => {
            this.restoreFromDynamicProperties();
            
            // 初回スキャン
            this.performInitialScan();
        }, 60); // 3秒後
        
        // メインループ開始
        this.intervalId = system.runInterval(() => {
            if (this.isRunning) {
                this.tick();
            }
        }, 1);
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
            this.processItemTransport();
        }
        
        // チャンクロード検出（40tickごと）
        if (this.tickCounter % 40 === 0) {
            this.detectChunkLoads();
        }
        
        // 定期的な全体スキャン（設定間隔ごと）
        if (Date.now() - this.chunkLoadDetection.periodicScan.lastFullScan > 
            this.chunkLoadDetection.periodicScan.fullScanInterval) {
            this.performPeriodicFullScan();
        }
    }

    /**
     * Dynamic Propertiesから既存のパイプを復元
     */
    restoreFromDynamicProperties() {
        Logger.info("Dynamic Propertiesからパイプを復元中...", "ItemTransportManager");
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
                        this.chunkLoadDetection.registeredPipes.set(prop, {
                            dimensionId,
                            location,
                            lastCheck: 0
                        });
                        
                        restoredCount++;
                    }
                }
            }
            
            Logger.info(`${restoredCount}個のパイプ位置を復元`, "ItemTransportManager");
        } catch (error) {
            Logger.error(`Dynamic Properties復元エラー: ${error}`, "ItemTransportManager");
        }
    }

    /**
     * 初回スキャン
     */
    performInitialScan() {
        Logger.info("初回スキャンを実行...", "ItemTransportManager");
        
        // 復元されたパイプ位置を確認
        for (const [propKey, pipeData] of this.chunkLoadDetection.registeredPipes) {
            try {
                const dimension = world.getDimension(pipeData.dimensionId);
                const block = Utils.getBlockSafe(dimension, pipeData.location);
                
                if (block?.typeId === "magisystem:pipe_output") {
                    this.registerOutputPipeInternal(block);
                } else {
                    // ブロックが存在しない場合はDynamic Propertyから削除
                    world.setDynamicProperty(propKey, undefined);
                    this.chunkLoadDetection.registeredPipes.delete(propKey);
                }
            } catch (error) {
                // エラーは無視
            }
        }
        
        // プレイヤー周辺もスキャン
        const players = world.getAllPlayers();
        for (const player of players) {
            this.scanAroundLocation(player.location, player.dimension, 30);
        }
    }

    /**
     * チャンクロードを検出
     */
    detectChunkLoads() {
        const players = world.getAllPlayers();
        const tracking = this.chunkLoadDetection.playerTracking;
        
        for (const player of players) {
            const playerId = player.id;
            const currentPos = player.location;
            const lastPos = tracking.positions.get(playerId);
            
            if (lastPos) {
                const distance = Utils.distance3D(currentPos, lastPos);
                
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
        
        for (const [propKey, pipeData] of this.chunkLoadDetection.registeredPipes) {
            if (pipeData.dimensionId !== dimension.id) continue;
            
            const distance = Utils.distance3D(location, pipeData.location);
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
        
        this.outputPipes.set(key, {
            block: block,
            dimension: block.dimension,
            location: block.location,
            lastCheck: Date.now()
        });
        
        // Dynamic Propertyに保存
        const propKey = `magisystem:outputpipe_${key}`;
        world.setDynamicProperty(propKey, block.dimension.id);
        
        this.chunkLoadDetection.registeredPipes.set(propKey, {
            dimensionId: block.dimension.id,
            location: block.location,
            lastCheck: Date.now()
        });
    }

    /**
     * パイプ設置時の処理
     */
    onPipePlaced(pipeBlock) {
        if (pipeBlock.typeId === "magisystem:pipe_output") {
            this.registerOutputPipeInternal(pipeBlock);
            Logger.info(`出力パイプを設置・登録`, "ItemTransportManager");
        }
    }

    /**
     * パイプ破壊時の処理
     */
    onPipeRemoved(location, dimension, pipeTypeId) {
        if (pipeTypeId === "magisystem:pipe_output") {
            const key = Utils.locationToKey(location);
            
            // 内部マップから削除
            this.outputPipes.delete(key);
            
            // Dynamic Propertyから削除
            const propKey = `magisystem:outputpipe_${key}`;
            world.setDynamicProperty(propKey, undefined);
            this.chunkLoadDetection.registeredPipes.delete(propKey);
            
            Logger.info(`出力パイプの登録を解除`, "ItemTransportManager");
        }
    }

    /**
     * 定期的な全体スキャン
     */
    performPeriodicFullScan() {
        // 既に実行中なら終了
        if (this.chunkLoadDetection.periodicScan.isScanning) return;
        
        this.chunkLoadDetection.periodicScan.isScanning = true;
        this.chunkLoadDetection.periodicScan.lastFullScan = Date.now();
        
        Logger.info("定期的な全体スキャンを開始", "ItemTransportManager");
        
        // 非同期的に実行
        system.runTimeout(() => {
            this.checkAllRegisteredPipes();
            this.chunkLoadDetection.periodicScan.isScanning = false;
        }, 1);
    }

    /**
     * 全ての登録済みパイプを確認
     */
    checkAllRegisteredPipes() {
        let checkedCount = 0;
        let removedCount = 0;
        
        for (const [propKey, pipeData] of this.chunkLoadDetection.registeredPipes) {
            try {
                const dimension = world.getDimension(pipeData.dimensionId);
                const block = Utils.getBlockSafe(dimension, pipeData.location);
                
                if (block?.typeId === "magisystem:pipe_output") {
                    const key = Utils.locationToKey(block.location);
                    if (!this.outputPipes.has(key)) {
                        this.registerOutputPipeInternal(block);
                    }
                    checkedCount++;
                } else {
                    // ブロックが存在しない場合は削除
                    world.setDynamicProperty(propKey, undefined);
                    this.chunkLoadDetection.registeredPipes.delete(propKey);
                    removedCount++;
                }
            } catch (error) {
                // エラーは無視
            }
        }
        
        Logger.info(`全体スキャン完了: ${checkedCount}個確認、${removedCount}個削除`, "ItemTransportManager");
    }

    // 以下、既存のメソッドはそのまま使用...
    updateTransportSources() {
        // 既存の実装をそのまま使用
    }
    
    processItemTransport() {
        // 既存の実装をそのまま使用
    }
}

// シングルトンインスタンスをエクスポート
export const itemTransportManagerImproved = new ItemTransportManagerImproved();