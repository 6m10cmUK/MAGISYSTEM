import { world } from "@minecraft/server";
import { storage } from "./DynamicPropertyStorage.js";
import { Logger } from "../core/Logger.js";
import { ErrorHandler } from "../core/ErrorHandler.js";

/**
 * プレイヤーデータ専用のストレージマネージャー
 * プレイヤーのデータを効率的に管理
 */
export class PlayerDataStorage {
    constructor() {
        this.playerCache = new Map(); // プレイヤーIDごとのキャッシュ
    }

    /**
     * プレイヤーデータを保存
     * @param {import("@minecraft/server").Player} player - プレイヤー
     * @param {string} key - データキー
     * @param {any} value - 保存する値
     */
    setPlayerData(player, key, value) {
        return ErrorHandler.safeTry(() => {
            storage.set(key, value, player);
            
            // キャッシュも更新
            const playerId = player.id;
            if (!this.playerCache.has(playerId)) {
                this.playerCache.set(playerId, new Map());
            }
            this.playerCache.get(playerId).set(key, value);
            
            Logger.debug(`プレイヤーデータを保存: ${player.name} - ${key}`, "PlayerDataStorage");
            return true;
        }, "PlayerDataStorage.setPlayerData", false);
    }

    /**
     * プレイヤーデータを取得
     * @param {import("@minecraft/server").Player} player - プレイヤー
     * @param {string} key - データキー
     * @param {any} defaultValue - デフォルト値
     */
    getPlayerData(player, key, defaultValue = undefined) {
        return ErrorHandler.safeTry(() => {
            // キャッシュから取得を試みる
            const playerId = player.id;
            if (this.playerCache.has(playerId)) {
                const cache = this.playerCache.get(playerId);
                if (cache.has(key)) {
                    return cache.get(key);
                }
            }
            
            // ストレージから取得
            return storage.get(key, player, defaultValue);
        }, "PlayerDataStorage.getPlayerData", defaultValue);
    }

    /**
     * プレイヤーデータを削除
     * @param {import("@minecraft/server").Player} player - プレイヤー
     * @param {string} key - データキー
     */
    deletePlayerData(player, key) {
        return ErrorHandler.safeTry(() => {
            storage.delete(key, player);
            
            // キャッシュからも削除
            const playerId = player.id;
            if (this.playerCache.has(playerId)) {
                this.playerCache.get(playerId).delete(key);
            }
            
            Logger.debug(`プレイヤーデータを削除: ${player.name} - ${key}`, "PlayerDataStorage");
            return true;
        }, "PlayerDataStorage.deletePlayerData", false);
    }

    /**
     * プレイヤーの全データキーを取得
     * @param {import("@minecraft/server").Player} player - プレイヤー
     * @param {string} prefix - プレフィックスフィルター
     */
    getPlayerKeys(player, prefix = '') {
        return storage.getAllKeys(player, prefix);
    }

    /**
     * プレイヤーの統計情報を保存
     * @param {import("@minecraft/server").Player} player - プレイヤー
     * @param {string} statName - 統計名
     * @param {number} value - 値
     */
    setPlayerStat(player, statName, value) {
        const stats = this.getPlayerData(player, 'stats', {});
        stats[statName] = value;
        return this.setPlayerData(player, 'stats', stats);
    }

    /**
     * プレイヤーの統計情報を取得
     * @param {import("@minecraft/server").Player} player - プレイヤー
     * @param {string} statName - 統計名
     * @param {number} defaultValue - デフォルト値
     */
    getPlayerStat(player, statName, defaultValue = 0) {
        const stats = this.getPlayerData(player, 'stats', {});
        return stats[statName] || defaultValue;
    }

    /**
     * プレイヤーの統計情報を増加
     * @param {import("@minecraft/server").Player} player - プレイヤー
     * @param {string} statName - 統計名
     * @param {number} amount - 増加量
     */
    incrementPlayerStat(player, statName, amount = 1) {
        const currentValue = this.getPlayerStat(player, statName, 0);
        return this.setPlayerStat(player, statName, currentValue + amount);
    }

    /**
     * プレイヤーの初回参加をチェック
     * @param {import("@minecraft/server").Player} player - プレイヤー
     */
    isFirstJoin(player) {
        return !this.getPlayerData(player, 'hasJoinedBefore', false);
    }

    /**
     * プレイヤーの初回参加を記録
     * @param {import("@minecraft/server").Player} player - プレイヤー
     */
    recordFirstJoin(player) {
        this.setPlayerData(player, 'hasJoinedBefore', true);
        this.setPlayerData(player, 'firstJoinDate', Date.now());
        this.setPlayerData(player, 'lastJoinDate', Date.now());
    }

    /**
     * プレイヤーの最終参加を更新
     * @param {import("@minecraft/server").Player} player - プレイヤー
     */
    updateLastJoin(player) {
        this.setPlayerData(player, 'lastJoinDate', Date.now());
    }

    /**
     * プレイヤーのプレイ時間を取得（ミリ秒）
     * @param {import("@minecraft/server").Player} player - プレイヤー
     */
    getPlayTime(player) {
        const sessionStart = this.getPlayerData(player, 'sessionStart', Date.now());
        const previousPlayTime = this.getPlayerData(player, 'totalPlayTime', 0);
        const currentSessionTime = Date.now() - sessionStart;
        return previousPlayTime + currentSessionTime;
    }

    /**
     * プレイヤーのセッション開始を記録
     * @param {import("@minecraft/server").Player} player - プレイヤー
     */
    startSession(player) {
        this.setPlayerData(player, 'sessionStart', Date.now());
    }

    /**
     * プレイヤーのセッション終了を記録
     * @param {import("@minecraft/server").Player} player - プレイヤー
     */
    endSession(player) {
        const sessionStart = this.getPlayerData(player, 'sessionStart', Date.now());
        const sessionTime = Date.now() - sessionStart;
        const totalPlayTime = this.getPlayerData(player, 'totalPlayTime', 0);
        this.setPlayerData(player, 'totalPlayTime', totalPlayTime + sessionTime);
    }

    /**
     * キャッシュをクリア
     * @param {string} playerId - プレイヤーID（省略時は全クリア）
     */
    clearCache(playerId = null) {
        if (playerId) {
            this.playerCache.delete(playerId);
        } else {
            this.playerCache.clear();
        }
    }
}

// シングルトンインスタンスをエクスポート
export const playerDataStorage = new PlayerDataStorage();