import { world } from "@minecraft/server";

/**
 * 効率的なダイナミックプロパティストレージシステム
 * 
 * 対応ターゲット:
 * - World: グローバルなデータ保存
 * - Entity/Player: エンティティごとのデータ保存
 * - ItemStack: アイテムごとのデータ保存
 * 
 * 制限事項:
 * - 文字列プロパティ: 最大32,767文字
 * - 数値プロパティ: 64ビット浮動小数点の範囲  
 * - プロパティはビヘイビアパックのUUIDに紐付けられる
 */
export class DynamicPropertyStorage {
    constructor() {
        this.cache = new Map();
        this.compressionThreshold = 1000; // 1000文字以上で圧縮を検討
    }

    /**
     * データを保存
     * @param {string} key - プロパティキー
     * @param {any} value - 保存する値
     * @param {import("@minecraft/server").World | import("@minecraft/server").Entity | import("@minecraft/server").Player | import("@minecraft/server").ItemStack} target - 保存先
     */
    set(key, value, target = world) {
        try {
            // キャッシュに保存
            const cacheKey = this._getCacheKey(target, key);
            this.cache.set(cacheKey, value);

            // 値の型を判定して適切に保存
            if (typeof value === 'object') {
                // オブジェクトはJSON文字列化
                const jsonString = JSON.stringify(value);
                
                // 大きなデータは分割して保存
                if (jsonString.length > 30000) {
                    this._setChunkedData(key, jsonString, target);
                } else {
                    target.setDynamicProperty(key, jsonString);
                    target.setDynamicProperty(`${key}_type`, 'json');
                }
            } else if (typeof value === 'boolean') {
                // ブール値は数値として保存
                target.setDynamicProperty(key, value ? 1 : 0);
                target.setDynamicProperty(`${key}_type`, 'boolean');
            } else {
                // その他（文字列、数値）はそのまま保存
                target.setDynamicProperty(key, value);
                target.setDynamicProperty(`${key}_type`, typeof value);
            }
        } catch (error) {
            console.error(`Failed to set dynamic property ${key}:`, error);
            throw error;
        }
    }

    /**
     * データを取得
     * @param {string} key - プロパティキー
     * @param {import("@minecraft/server").World | import("@minecraft/server").Entity | import("@minecraft/server").Player | import("@minecraft/server").ItemStack} target - 取得元
     * @param {any} defaultValue - デフォルト値
     */
    get(key, target = world, defaultValue = undefined) {
        try {
            // キャッシュから取得を試みる
            const cacheKey = this._getCacheKey(target, key);
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            // 型情報を取得
            const type = target.getDynamicProperty(`${key}_type`);
            
            if (!type) {
                // 型情報がない場合は通常の取得
                const value = target.getDynamicProperty(key);
                return value !== undefined ? value : defaultValue;
            }

            // 型に応じた処理
            switch (type) {
                case 'json':
                    // チャンクされたデータかチェック
                    const chunkCount = target.getDynamicProperty(`${key}_chunks`);
                    if (chunkCount) {
                        const jsonString = this._getChunkedData(key, chunkCount, target);
                        const value = JSON.parse(jsonString);
                        this.cache.set(cacheKey, value);
                        return value;
                    } else {
                        const jsonString = target.getDynamicProperty(key);
                        const value = JSON.parse(jsonString);
                        this.cache.set(cacheKey, value);
                        return value;
                    }
                
                case 'boolean':
                    const boolValue = target.getDynamicProperty(key) === 1;
                    this.cache.set(cacheKey, boolValue);
                    return boolValue;
                
                default:
                    const value = target.getDynamicProperty(key);
                    if (value !== undefined) {
                        this.cache.set(cacheKey, value);
                    }
                    return value !== undefined ? value : defaultValue;
            }
        } catch (error) {
            console.error(`Failed to get dynamic property ${key}:`, error);
            return defaultValue;
        }
    }

    /**
     * データを削除
     * @param {string} key - プロパティキー
     * @param {import("@minecraft/server").World | import("@minecraft/server").Entity | import("@minecraft/server").Player | import("@minecraft/server").ItemStack} target - 削除元
     */
    delete(key, target = world) {
        try {
            // キャッシュから削除
            const cacheKey = this._getCacheKey(target, key);
            this.cache.delete(cacheKey);

            // チャンクされたデータかチェック
            const chunkCount = target.getDynamicProperty(`${key}_chunks`);
            if (chunkCount) {
                // チャンクされたデータをすべて削除
                for (let i = 0; i < chunkCount; i++) {
                    target.setDynamicProperty(`${key}_${i}`, undefined);
                }
                target.setDynamicProperty(`${key}_chunks`, undefined);
            }

            // メインキーと型情報を削除
            target.setDynamicProperty(key, undefined);
            target.setDynamicProperty(`${key}_type`, undefined);
        } catch (error) {
            console.error(`Failed to delete dynamic property ${key}:`, error);
        }
    }

    /**
     * 存在チェック
     * @param {string} key - プロパティキー
     * @param {import("@minecraft/server").World | import("@minecraft/server").Entity | import("@minecraft/server").Player | import("@minecraft/server").ItemStack} target - チェック対象
     */
    has(key, target = world) {
        return target.getDynamicProperty(key) !== undefined;
    }

    /**
     * すべてのキーを取得
     * @param {import("@minecraft/server").World | import("@minecraft/server").Entity | import("@minecraft/server").Player | import("@minecraft/server").ItemStack} target - 対象
     * @param {string} prefix - キーのプレフィックスフィルター
     */
    getAllKeys(target = world, prefix = '') {
        const keys = [];
        
        // ItemStackはgetDynamicPropertyIdsメソッドを持たない
        if (this._isItemStack(target)) {
            // ItemStackの場合は特殊処理が必要
            return keys;
        }
        
        const propertyIds = target.getDynamicPropertyIds();
        
        for (const id of propertyIds) {
            // 型情報やチャンク情報のキーは除外
            if (!id.endsWith('_type') && !id.endsWith('_chunks') && !id.match(/_\d+$/)) {
                if (!prefix || id.startsWith(prefix)) {
                    keys.push(id);
                }
            }
        }
        
        return keys;
    }

    /**
     * メモリ使用量を取得
     * @param {import("@minecraft/server").World | import("@minecraft/server").Entity | import("@minecraft/server").Player} target - 対象
     */
    getMemoryUsage(target = world) {
        // ItemStackはgetDynamicPropertyTotalByteCountメソッドを持たない
        if (this._isItemStack(target)) {
            return -1;
        }
        
        if (target.getDynamicPropertyTotalByteCount) {
            return target.getDynamicPropertyTotalByteCount();
        }
        return -1; // サポートされていない場合
    }

    /**
     * キャッシュをクリア
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * 大きなデータを分割して保存
     */
    _setChunkedData(key, data, target) {
        const chunkSize = 30000; // 安全のため32767より小さくする
        const chunks = Math.ceil(data.length / chunkSize);
        
        // チャンク数を保存
        target.setDynamicProperty(`${key}_chunks`, chunks);
        target.setDynamicProperty(`${key}_type`, 'json');
        
        // 各チャンクを保存
        for (let i = 0; i < chunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, data.length);
            const chunk = data.substring(start, end);
            target.setDynamicProperty(`${key}_${i}`, chunk);
        }
    }

    /**
     * 分割されたデータを結合して取得
     */
    _getChunkedData(key, chunkCount, target) {
        let data = '';
        for (let i = 0; i < chunkCount; i++) {
            const chunk = target.getDynamicProperty(`${key}_${i}`);
            if (chunk) {
                data += chunk;
            }
        }
        return data;
    }

    /**
     * キャッシュキーを生成
     */
    _getCacheKey(target, key) {
        // targetのIDまたはタイプを使用してユニークなキーを生成
        if (target === world) {
            return `world:${key}`;
        } else if (target.id) {
            // Entity/Playerの場合
            return `${target.typeId || 'entity'}:${target.id}:${key}`;
        } else if (this._isItemStack(target)) {
            // ItemStackの場合
            const itemId = target.typeId || 'unknown_item';
            const nameTag = target.nameTag || '';
            return `item:${itemId}:${nameTag}:${key}`;
        } else {
            return `unknown:${key}`;
        }
    }
    
    /**
     * ItemStackかどうかを判定
     * @private
     */
    _isItemStack(target) {
        // ItemStackは amount プロパティを持つ
        return target && typeof target.amount !== 'undefined';
    }
}

// シングルトンインスタンスをエクスポート
export const storage = new DynamicPropertyStorage();