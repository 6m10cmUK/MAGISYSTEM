/**
 * MAGISYSTEM ユーティリティ関数
 * 共通で使用される便利な関数群
 */

import { world } from '@minecraft/server';

export class Utils {
    /**
     * ブロック位置を文字列キーに変換
     * @param {Vector3} location 
     * @returns {string}
     */
    static locationToKey(location) {
        return `${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
    }

    /**
     * 文字列キーをブロック位置に変換
     * @param {string} key 
     * @returns {Vector3}
     */
    static keyToLocation(key) {
        const [x, y, z] = key.split(',').map(Number);
        return { x, y, z };
    }

    /**
     * 2つの位置が同じかチェック
     * @param {Vector3} loc1 
     * @param {Vector3} loc2 
     * @returns {boolean}
     */
    static isSameLocation(loc1, loc2) {
        return Math.floor(loc1.x) === Math.floor(loc2.x) &&
               Math.floor(loc1.y) === Math.floor(loc2.y) &&
               Math.floor(loc1.z) === Math.floor(loc2.z);
    }

    /**
     * 位置の加算
     * @param {Vector3} loc 
     * @param {Vector3} offset 
     * @returns {Vector3}
     */
    static addLocation(loc, offset) {
        return {
            x: loc.x + offset.x,
            y: loc.y + offset.y,
            z: loc.z + offset.z
        };
    }

    /**
     ��* 安全なブロック取得
     * @param {Dimension} dimension 
     * @param {Vector3} location 
     * @returns {Block|null}
     */
    static getBlockSafe(dimension, location) {
        try {
            return dimension.getBlock(location);
        } catch (error) {
            return null;
        }
    }

    /**
     * 安全なエンティティ取得
     * @param {string} entityId 
     * @returns {Entity|null}
     */
    static getEntitySafe(entityId) {
        try {
            return world.getEntity(entityId);
        } catch (error) {
            return null;
        }
    }

    /**
     * 数値を指定範囲内に収める
     * @param {number} value 
     * @param {number} min 
     * @param {number} max 
     * @returns {number}
     */
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * 遅延実行（tick単位）
     * @param {Function} callback 
     * @param {number} ticks 
     */
    static delay(callback, ticks) {
        world.afterEvents.tick.subscribe((event) => {
            if (event.currentTick % ticks === 0) {
                callback();
                world.afterEvents.tick.unsubscribe(arguments.callee);
            }
        });
    }

    /**
     * デバウンス処理
     * @param {Function} func 
     * @param {number} wait 
     * @returns {Function}
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * バッチ処理実行
     * @param {Array} items 
     * @param {Function} processor 
     * @param {number} batchSize 
     * @param {number} delayBetweenBatches 
     */
    static async processBatch(items, processor, batchSize, delayBetweenBatches = 1) {
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            await Promise.all(batch.map(processor));
            
            if (i + batchSize < items.length) {
                await new Promise(resolve => this.delay(resolve, delayBetweenBatches));
            }
        }
    }

    /**
     * フォーマット済みエネルギー表示
     * @param {number} energy 
     * @param {number} maxEnergy 
     * @returns {string}
     */
    static formatEnergy(energy, maxEnergy) {
        const percentage = maxEnergy > 0 ? Math.floor((energy / maxEnergy) * 100) : 0;
        return `${energy}/${maxEnergy} MF (${percentage}%)`;
    }

    /**
     * 時間を秒に変換
     * @param {number} ticks 
     * @returns {number}
     */
    static ticksToSeconds(ticks) {
        return ticks / 20;
    }

    /**
     * 秒をtickに変換
     * @param {number} seconds 
     * @returns {number}
     */
    static secondsToTicks(seconds) {
        return Math.floor(seconds * 20);
    }

    /**
     * ランダムな整数を生成
     * @param {number} min 
     * @param {number} max 
     * @returns {number}
     */
    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * 配列をシャッフル
     * @param {Array} array 
     * @returns {Array}
     */
    static shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * オブジェクトのディープコピー
     * @param {Object} obj 
     * @returns {Object}
     */
    static deepCopy(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepCopy(item));
        
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = this.deepCopy(obj[key]);
            }
        }
        return clonedObj;
    }

    /**
     * 安全なJSON���ース
     * @param {string} jsonString 
     * @param {*} defaultValue 
     * @returns {*}
     */
    static parseJsonSafe(jsonString, defaultValue = null) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            return defaultValue;
        }
    }
}