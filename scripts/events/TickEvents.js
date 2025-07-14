/**
 * MAGISYSTEM Tickイベントハンドラー
 * BaseEventHandlerを継承した統一的な実装
 */

import { world, system } from "@minecraft/server";
import { BaseEventHandler } from "./BaseEventHandler.js";
import { energySystem } from "../energy/EnergySystem.js";
import { generator } from "../machines/Generator.js";
import { creativeGenerator } from "../machines/CreativeGenerator.js";
import { battery } from "../machines/Battery.js";
import { electricFurnace } from "../machines/ElectricFurnace.js";
import { seebeckGenerator } from "../machines/SeebeckGenerator.js";
import { itemNetwork } from "../items/ItemNetwork.js";
import { itemTransportManager } from "../items/ItemTransportManager.js";
import { Constants } from "../core/Constants.js";
import { Logger } from "../core/Logger.js";
import { Utils } from "../core/Utils.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { BlockTypeUtils } from "../utils/BlockTypeUtils.js";
import { BatchProcessor } from "../utils/BatchProcessor.js";
import { storage } from "../utils/DynamicPropertyStorage.js";

export class TickEvents extends BaseEventHandler {
    constructor() {
        super("TickEvents");
        
        // 更新間隔の定義
        this.intervals = {
            machines: Constants.ENERGY.UPDATE_INTERVAL,         // 20 tick (1秒)
            cableVisuals: Utils.secondsToTicks(5),             // 100 tick (5秒)
            itemTransfer: Constants.ENERGY.UPDATE_INTERVAL,    // 20 tick (1秒)
            debug: Utils.secondsToTicks(2),                    // 40 tick (2秒)
            cleanup: Utils.secondsToTicks(30)                  // 600 tick (30秒)
        };
        
        // ディメンションのリスト
        this.dimensions = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
        
        // アクティブなブロックのキャッシュ
        this.activeBlocksCache = new Map();
        this.cacheUpdateInterval = Utils.secondsToTicks(10); // 10秒ごとに更新
        this.lastCacheUpdate = 0;
    }

    /**
     * イベントハンドラーの設定
     */
    setupEventHandlers() {
        // メインの機械更新ループ
        this.registerInterval(
            () => this.updateMachines(),
            this.intervals.machines,
            "updateMachines"
        );

        // ケーブルの視覚更新
        this.registerInterval(
            () => this.updateCableVisuals(),
            this.intervals.cableVisuals,
            "updateCableVisuals"
        );

        // アイテム転送処理
        this.registerInterval(
            () => this.updateItemTransfer(),
            this.intervals.itemTransfer,
            "updateItemTransfer"
        );

        // 発電機の表示エンティティを管理（必要に応じて更新頻度を調整）
        this.registerInterval(
            () => this.updateGeneratorDisplayItems(),
            5, // 5tickごとに実行（パフォーマンス最適化）
            "updateGeneratorDisplayItems"
        );

        // デバッグ情報の更新（条件付き）
        if (this.hasDebugPlayers()) {
            this.registerInterval(
                () => this.updateDebugInfo(),
                this.intervals.debug,
                "updateDebugInfo"
            );
        }

        // 定期的なクリーンアップ
        this.registerInterval(
            () => this.performCleanup(),
            this.intervals.cleanup,
            "performCleanup"
        );
    }

    /**
     * インターバル登録のヘルパー
     */
    registerInterval(handler, interval, name) {
        const subscription = system.runInterval(() => {
            ErrorHandler.safeTry(() => {
                Logger.startTimer(`TickEvents_${name}`);
                handler();
                Logger.endTimer(`TickEvents_${name}`, this.name);
            }, `TickEvents.${name}`);
        }, interval);

        this.eventSubscriptions.push({
            name: `interval_${name}`,
            subscription,
            eventObject: { unsubscribe: () => system.clearRun(subscription) }
        });
    }

    /**
     * 機械の更新
     */
    async updateMachines() {
        const currentTick = system.currentTick;
        
        // キャッシュの更新が必要かチェック
        if (currentTick - this.lastCacheUpdate > this.cacheUpdateInterval) {
            this.updateActiveBlocksCache();
            this.lastCacheUpdate = currentTick;
        }

        // アクティブなブロックをバッチ処理で更新
        for (const [dimensionId, blocks] of this.activeBlocksCache) {
            const dimension = world.getDimension(dimensionId);
            if (!dimension) continue;

            const blockList = Array.from(blocks);
            
            // 各ブロックを更新
            for (const locationKey of blockList) {
                const location = Utils.keyToLocation(locationKey);
                const block = Utils.getBlockSafe(dimension, location);
                
                if (block) {
                    this.updateBlock(block);
                } else {
                    // ブロックが存在しない場合はキャッシュから削除
                    blocks.delete(locationKey);
                }
            }
        }
    }

    /**
     * アクティブなブロックのキャッシュを更新
     */
    updateActiveBlocksCache() {
        this.activeBlocksCache.clear();
        
        for (const dimensionId of this.dimensions) {
            const dimension = world.getDimension(dimensionId);
            if (!dimension) continue;

            const dimensionBlocks = new Set();
            
            try {
                // 新しいストレージシステムからエネルギーブロックを取得
                const energyBlockKeys = storage.getAllKeys(world, 'energy_block_');
                
                for (const key of energyBlockKeys) {
                    const data = storage.get(key);
                    if (data && data.dimension === dimensionId) {
                        // keyから座標を抽出 (energy_block_X,Y,Z 形式)
                        const locationKey = key.replace('energy_block_', '');
                        dimensionBlocks.add(locationKey);
                    }
                }
                
                if (dimensionBlocks.size > 0) {
                    this.activeBlocksCache.set(dimensionId, dimensionBlocks);
                }
            } catch (error) {
                ErrorHandler.handleError(error, `TickEvents.updateActiveBlocksCache[${dimensionId}]`);
            }
        }
    }

    /**
     * ブロックの更新
     */
    updateBlock(block) {
        const typeId = block.typeId;

        // 発電機の更新
        if (typeId === Constants.BLOCK_TYPES.GENERATOR || typeId === Constants.BLOCK_TYPES.THERMAL_GENERATOR) {
            generator.updateGenerator(block);
        }
        // クリエイティブ発電機の更新
        else if (typeId === Constants.BLOCK_TYPES.CREATIVE_GENERATOR) {
            creativeGenerator.updateGenerator(block);
        }
        // バッテリーの更新
        else if (BlockTypeUtils.isBattery(typeId)) {
            battery.updateBattery(block);
        }
        // 電気炉の更新
        else if (typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE) {
            electricFurnace.update(block);
        }
        // ゼーベック発電機の更新
        else if (typeId === 'magisystem:seebeck_generator') {
            seebeckGenerator.updateSeebeckGenerator(block);
        }
        // その他の機械（将来の実装用）
        else if (typeId === Constants.BLOCK_TYPES.IRON_FURNACE) {
            // TODO: かまどの更新処理
            Logger.debug("Iron furnace update not implemented", this.name);
        }
    }

    /**
     * ケーブルの視覚更新
     */
    updateCableVisuals() {
        try {
            const players = world.getAllPlayers();
            
            for (const player of players) {
                // プレイヤーの周辺のケーブルのみ更新（パフォーマンス最適化）
                const nearbyRadius = 16; // ブロック
                const playerLoc = player.location;
                
                // TODO: 周辺のケーブルにパーティクルエフェクトを追加
                // 現在は実装保留（パフォーマンスへの影響を考慮）
            }
        } catch (error) {
            ErrorHandler.handleError(error, "TickEvents.updateCableVisuals");
        }
    }

    /**
     * アイテム転送の更新
     */
    updateItemTransfer() {
        try {
            // ItemTransportManagerは自身でtick管理をしているため、ここでは呼ばない
            // 2秒ごとに新しくロードされたチャンクをチェックのみ
            if (itemTransportManager.isRunning && system.currentTick % 40 === 0) {
                itemTransportManager.checkNewlyLoadedChunks();
            }
        } catch (error) {
            ErrorHandler.handleError(error, "TickEvents.updateItemTransfer");
        }
    }

    /**
     * 発電機の表示アイテムを固定位置に維持
     */
    updateGeneratorDisplayItems() {
        try {
            for (const dimensionId of this.dimensions) {
                const dimension = world.getDimension(dimensionId);
                if (!dimension) continue;

                // generator_displayタグを持つ表示エンティティを取得
                const displayItems = dimension.getEntities({
                    tags: ["generator_display"],
                    type: "magisystem:generator_display"
                });

                for (const item of displayItems) {
                    // タグから元の位置を取得
                    const posTag = item.getTags().find(tag => tag.startsWith("generator_"));
                    if (!posTag) continue;

                    const parts = posTag.split("_");
                    if (parts.length === 4) {
                        const x = parseFloat(parts[1]);
                        const y = parseFloat(parts[2]);
                        const z = parseFloat(parts[3]);

                        // 正しい位置にテレポート
                        const targetLocation = {
                            x: x + 0.5,
                            y: y + 0.5,
                            z: z + 0.5
                        };

                        // 速度をクリアして位置を固定
                        item.clearVelocity();
                        item.teleport(targetLocation);
                    }
                }
            }
        } catch (error) {
            ErrorHandler.handleError(error, "TickEvents.updateGeneratorDisplayItems");
        }
    }

    /**
     * デバッグ情報の更新
     */
    updateDebugInfo() {
        try {
            const players = world.getAllPlayers();
            const debugPlayers = players.filter(p => this.isDebugMode(p));
            
            if (debugPlayers.length === 0) return;

            // システム統計情報
            const stats = {
                activeBlocks: Array.from(this.activeBlocksCache.values())
                    .reduce((sum, set) => sum + set.size, 0),
                dimensions: this.activeBlocksCache.size,
                logHistory: Logger.getHistory({ limit: 10, level: 'ERROR' }).length
            };

            for (const player of debugPlayers) {
                player.sendMessage(`§7[DEBUG] アクティブブロック: ${stats.activeBlocks}`);
                player.sendMessage(`§7[DEBUG] 監視ディメンション: ${stats.dimensions}`);
                
                if (stats.logHistory > 0) {
                    player.sendMessage(`§7[DEBUG] 最近のエラー: ${stats.logHistory}件`);
                }
            }
        } catch (error) {
            ErrorHandler.handleError(error, "TickEvents.updateDebugInfo");
        }
    }

    /**
     * 定期的なクリーンアップ
     */
    performCleanup() {
        try {
            
            // 存在しないブロックのデータをクリーンアップ
            let cleanedCount = 0;
            
            for (const [dimensionId, blocks] of this.activeBlocksCache) {
                const dimension = world.getDimension(dimensionId);
                if (!dimension) continue;

                const toRemove = [];
                
                for (const locationKey of blocks) {
                    const location = Utils.keyToLocation(locationKey);
                    const block = Utils.getBlockSafe(dimension, location);
                    
                    if (!block || !BlockTypeUtils.isTrackedBlock(block.typeId)) {
                        toRemove.push(locationKey);
                        energySystem.clearEnergy(location, dimension);
                        cleanedCount++;
                    }
                }
                
                // キャッシュから削除
                toRemove.forEach(key => blocks.delete(key));
            }
            
            
            // ログ履歴のクリーンアップ
            if (Logger.getHistory().length > 500) {
                Logger.clearHistory();
            }
        } catch (error) {
            ErrorHandler.handleError(error, "TickEvents.performCleanup");
        }
    }

    // ========== ユーティリティメソッド ==========

    /**
     * デバッグモードのプレイヤーがいるかチェック
     */
    hasDebugPlayers() {
        try {
            const players = world.getAllPlayers();
            return players.some(p => this.isDebugMode(p));
        } catch {
            return false;
        }
    }
}

// シングルトンインスタンスをエクスポート
export const tickEvents = new TickEvents();