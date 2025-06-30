/**
 * MAGISYSTEM 基底輸送システム
 * ケーブル、パイプなどの共通機能を提供する抽象基底クラス
 */

import { world, system, BlockPermutation } from "@minecraft/server";
import { Constants } from "../core/Constants.js";
import { Utils } from "../core/Utils.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { Logger } from "../core/Logger.js";
import BlockUtils from "../utils/BlockUtils.js";

export class BaseTransportSystem {
    /**
     * コンストラクタ
     * @param {Object} config - システム設定
     * @param {string} config.systemName - システム名（例: "MFCable", "ItemPipe"）
     * @param {string} config.carriageType - 輸送対象（例: "mf", "item", "fluid"）
     * @param {string} config.transporterType - 輸送ブロックタイプ（例: "cable", "pipe"）
     * @param {string} config.blockTag - ブロックタグ（例: "mf_cable", "item_pipe"）
     * @param {Array<string>} config.blockTypes - ブロックタイプID配列
     * @param {Function} config.canConnectToBlock - ブロックへの接続可否判定関数
     */
    constructor(config) {
        this.systemName = config.systemName;
        this.carriageType = config.carriageType;
        this.transporterType = config.transporterType;
        this.blockTag = config.blockTag;
        this.blockTypes = config.blockTypes || [];
        this.canConnectToBlock = config.canConnectToBlock || (() => false);
        
        // キャッシュ
        this.connectionCache = new Map();
        // アイテムパイプの場合はキャッシュを短くする
        this.cacheTimeout = this.transporterType === "pipe" ? 500 : Constants.PERFORMANCE.CACHE_DURATION;
        
        Logger.info(`${this.systemName}システムを初期化`, this.systemName);
    }

    /**
     * 輸送ブロックのパターンを更新
     * @param {Block} block - 更新するブロック
     * @param {boolean} forceUpdate - 強制的に更新するか
     */
    updatePattern(block, forceUpdate = false) {
        if (!this.isTransportBlock(block)) return;

        ErrorHandler.safeTry(() => {
            Logger.startTimer(`${this.systemName}_updatePattern`);
            
            // 強制更新の場合はキャッシュをクリア
            if (forceUpdate) {
                this.clearLocationCache(block.location);
            }
            
            // 6方向の接続状態を更新
            this.updateDirectionStates(block);
            
            // 直線かどうかを判定してstateを設定
            const isStraight = this.checkIfStraight(block);
            this.setStraightState(block, isStraight);
            
            Logger.endTimer(`${this.systemName}_updatePattern`, this.systemName);
        }, `${this.systemName}.updatePattern`);
    }

    /**
     * 全方向の接続状態を更新
     * @param {Block} block 
     */
    updateDirectionStates(block) {
        // 全ての方向の状態を収集
        const newStates = {};
        const currentStates = block.permutation.getAllStates();
        
        // 注意: Minecraft APIの東西は実際の方向と逆
        const directions = [
            { dir: "above", adjacent: block.above(), opposite: "below" },
            { dir: "below", adjacent: block.below(), opposite: "above" },
            { dir: "north", adjacent: block.north(), opposite: "south" },
            { dir: "south", adjacent: block.south(), opposite: "north" },
            { dir: "east", adjacent: block.west(), opposite: "east" },    // 東西逆
            { dir: "west", adjacent: block.east(), opposite: "west" }     // 東西逆
        ];
        
        let hasChanges = false;
        
        // 各方向の状態を計算
        for (const { dir, adjacent, opposite } of directions) {
            const connected = this.canConnectToDirection(block, adjacent, opposite);
            const stateName = `magisystem:${dir}`;
            
            let newValue = "none";
            if (connected) {
                // 隣接ブロックが輸送ブロックかそれ以外かを判定
                if (adjacent && adjacent.hasTag(this.blockTag)) {
                    newValue = this.transporterType;
                } else if (adjacent) {
                    newValue = "block";
                }
            }
            
            newStates[stateName] = newValue;
            if (currentStates[stateName] !== newValue) {
                hasChanges = true;
                Logger.debug(`${dir}: ${currentStates[stateName]} -> ${newValue}`, this.systemName);
            }
        }
        
        // 変更がある場合のみPermutationを更新
        if (hasChanges) {
            ErrorHandler.safeTry(() => {
                // 全ての状態を含む新しいオブジェクトを作成
                const allStates = { ...currentStates, ...newStates };
                const newPermutation = BlockPermutation.resolve(block.typeId, allStates);
                block.setPermutation(newPermutation);
                Logger.debug(`全方向の接続状態を更新: ${block.typeId}`, this.systemName);
            }, `${this.systemName}.updateDirectionStates`);
        }
    }

    /**
     * 輸送ブロックかどうか判定
     * @param {Block} block 
     * @returns {boolean}
     */
    isTransportBlock(block) {
        if (!block) return false;
        return this.blockTypes.some(type => block.typeId === type) || 
               block.hasTag(this.blockTag);
    }

    /**
     * 特定方向への接続可否を判定
     * @param {Block} transportBlock - 輸送ブロック
     * @param {Block} adjacent - 隣接ブロック
     * @param {string} oppositeDirection - 隣接ブロックから見た方向
     * @returns {boolean} 接続可能かどうか
     */
    canConnectToDirection(transportBlock, adjacent, oppositeDirection) {
        if (!adjacent) return false;

        const transportType = transportBlock.typeId;
        const adjacentType = adjacent.typeId;

        // キャッシュチェック
        const cacheKey = `${Utils.locationToKey(transportBlock.location)}_${oppositeDirection}`;
        const cached = this.connectionCache.get(cacheKey);
        if (cached && cached.timestamp > Date.now() - this.cacheTimeout) {
            return cached.result;
        }

        let result = false;

        // 専用ブロック同士は接続しない
        if (this.isDedicatedBlock(transportType) && this.isDedicatedBlock(adjacentType)) {
            result = false;
        }
        // 通常ブロックは他の輸送ブロックとのみ接続
        else if (this.isNormalBlock(transportType)) {
            result = adjacent.hasTag(this.blockTag);
        }
        // 専用ブロックは通常ブロックと対象ブロックに接続
        else if (this.isDedicatedBlock(transportType)) {
            // 通常輸送ブロックとの接続
            if (this.isNormalBlock(adjacentType)) {
                result = true;
            }
            // 対象ブロックとの接続（カスタム判定関数を使用）
            else {
                result = this.canConnectToBlock(adjacent, oppositeDirection);
                if (result) {
                    Logger.debug(`${transportType}が${adjacentType}に接続可能`, this.systemName);
                }
            }
        }

        // キャッシュに保存
        this.connectionCache.set(cacheKey, { result, timestamp: Date.now() });
        
        return result;
    }

    /**
     * 専用ブロック（input/output）かどうか判定
     * @param {string} typeId 
     * @returns {boolean}
     */
    isDedicatedBlock(typeId) {
        return typeId.includes(`${this.transporterType}_input`) || 
               typeId.includes(`${this.transporterType}_output`);
    }

    /**
     * 通常ブロックかどうか判定
     * @param {string} typeId 
     * @returns {boolean}
     */
    isNormalBlock(typeId) {
        return typeId.endsWith(`:${this.transporterType}`) && !this.isDedicatedBlock(typeId);
    }

    /**
     * 特定方向の接続状態を設定
     * @param {Block} block - 輸送ブロック
     * @param {string} direction - 方向
     * @param {boolean} connected - 接続状態
     */
    setDirectionState(block, direction, connected) {
        ErrorHandler.safeTry(() => {
            const stateName = `magisystem:${direction}`;
            const currentStates = block.permutation.getAllStates();
            
            if (stateName in currentStates) {
                let newValue = "none";
                
                if (connected) {
                    // 隣接ブロックを取得
                    const adjacent = this.getAdjacentBlock(block, direction);
                    
                    // 輸送ブロックかそれ以外のブロックかを判定
                    if (adjacent && adjacent.hasTag(this.blockTag)) {
                        newValue = this.transporterType;
                    } else if (adjacent) {
                        newValue = "block";
                    }
                }
                
                if (currentStates[stateName] !== newValue) {
                    Logger.debug(`接続状態変更 ${block.typeId} ${direction}: ${currentStates[stateName]} -> ${newValue}`, this.systemName);
                    currentStates[stateName] = newValue;
                    
                    try {
                        // BlockPermutationを作成して設定
                        const newPermutation = BlockPermutation.resolve(block.typeId, currentStates);
                        block.setPermutation(newPermutation);
                        
                        // 変更が反映されたか確認
                        const updatedStates = block.permutation.getAllStates();
                        if (updatedStates[stateName] !== newValue) {
                            Logger.warn(`状態更新失敗: ${stateName} は ${newValue} に設定されませんでした`, this.systemName);
                        }
                    } catch (error) {
                        Logger.error(`Permutation設定エラー: ${error}`, this.systemName);
                    }
                }
            }
        }, `${this.systemName}.setDirectionState[${direction}]`);
    }

    /**
     * 隣接ブロックを取得
     * @param {Block} block 
     * @param {string} direction 
     * @returns {Block|null}
     */
    getAdjacentBlock(block, direction) {
        switch (direction) {
            case "above": return block.above();
            case "below": return block.below();
            case "north": return block.north();
            case "south": return block.south();
            case "east": return block.west(); // 東西逆
            case "west": return block.east(); // 東西逆
            default: return null;
        }
    }

    /**
     * ブロック設置時の処理
     * @param {Block} block - 設置されたブロック
     */
    onBlockPlaced(block) {
        
        // 自身のパターンを更新
        this.updatePattern(block);
        
        // 隣接するブロックも更新
        this.updateAdjacentBlocks(block);
    }

    /**
     * ブロック破壊時の処理
     * @param {Vector3} location - 破壊された位置
     * @param {Dimension} dimension - ディメンション
     */
    onBlockRemoved(location, dimension) {
        
        // キャッシュクリア
        this.clearLocationCache(location);
        
        // 隣接する6方向のブロックを更新
        const offsets = Object.values(Constants.DIRECTIONS);

        for (const offset of offsets) {
            const adjacentBlock = Utils.getBlockSafe(dimension, Utils.addLocation(location, offset));
            
            if (adjacentBlock && this.isTransportBlock(adjacentBlock)) {
                this.updatePattern(adjacentBlock);
            }
        }
    }

    /**
     * 隣接するブロックを更新
     * @param {Block} block - 中心となるブロック
     */
    updateAdjacentBlocks(block) {
        const adjacents = [
            block.above(),
            block.below(),
            block.north(),
            block.south(),
            block.east(),
            block.west()
        ];

        for (const adjacent of adjacents) {
            if (adjacent && this.isTransportBlock(adjacent)) {
                // 隣接ブロックのキャッシュをクリアして強制更新
                this.clearLocationCache(adjacent.location);
                this.updatePattern(adjacent, true);
            }
        }
    }

    /**
     * ブロックが直線かどうかをチェック
     * @param {Block} block - ブロック
     * @returns {boolean} 直線かどうか
     */
    checkIfStraight(block) {
        if (!block) return false;
        
        const connectionInfo = this.getConnectionInfo(block);
        
        // 2方向にのみ接続している場合
        if (connectionInfo.count === 2) {
            const connectedDirs = Object.entries(connectionInfo.connections)
                .filter(([_, connected]) => connected)
                .map(([dir, _]) => dir);
            
            // 直線の組み合わせ
            const straightPairs = [
                ["above", "below"],
                ["north", "south"],
                ["east", "west"]
            ];
            
            for (const pair of straightPairs) {
                if (connectedDirs.includes(pair[0]) && connectedDirs.includes(pair[1])) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * 直線状態を設定
     * @param {Block} block - ブロック
     * @param {boolean} isStraight - 直線かどうか
     */
    setStraightState(block, isStraight) {
        ErrorHandler.safeTry(() => {
            const currentStates = block.permutation.getAllStates();
            if ("magisystem:is_straight" in currentStates) {
                currentStates["magisystem:is_straight"] = isStraight;
                block.setPermutation(BlockPermutation.resolve(block.typeId, currentStates));
            }
        }, `${this.systemName}.setStraightState`);
    }

    /**
     * 接続情報を取得
     * @param {Block} block - ブロック
     * @returns {Object} 接続情報
     */
    getConnectionInfo(block) {
        if (!block) return null;

        const states = block.permutation.getAllStates();
        const info = {
            connections: {},
            count: 0,
            pattern: "isolated"
        };

        const directions = ["above", "below", "north", "south", "east", "west"];
        for (const dir of directions) {
            const stateName = `magisystem:${dir}`;
            const connected = states[stateName] && states[stateName] !== "none";
            info.connections[dir] = connected;
            if (connected) info.count++;
        }

        // パターンを判定
        info.pattern = this.getConnectionPattern(info.count);

        return info;
    }

    /**
     * 接続数から接続パターンを取得
     * @param {number} count 
     * @returns {string}
     */
    getConnectionPattern(count) {
        const patterns = {
            0: "isolated",
            1: "terminal",
            2: "straight_or_corner",
            3: "t-junction",
            4: "cross",
            5: "five-way",
            6: "six-way"
        };
        return patterns[count] || "unknown";
    }

    /**
     * ネットワークの可視化（デバッグ用）
     * @param {Block} startBlock - 開始点のブロック
     * @param {string} particleType - パーティクルタイプ
     * @returns {Object} ネットワーク情報
     */
    visualizeNetwork(startBlock, particleType = "minecraft:villager_happy") {
        const visited = new Set();
        const queue = [startBlock];
        let count = 0;
        const maxCount = Constants.PERFORMANCE.MAX_BLOCKS_PER_TICK;

        Logger.startTimer(`${this.systemName}_visualizeNetwork`);

        while (queue.length > 0 && count < maxCount) {
            const current = queue.shift();
            const key = Utils.locationToKey(current.location);
            
            if (visited.has(key)) continue;
            visited.add(key);
            count++;

            // パーティクル表示
            BlockUtils.spawnParticle(current, particleType, {
                offset: { x: 0, y: 0.5, z: 0 }
            });

            // 隣接するブロックを探索
            const adjacents = [
                current.above(),
                current.below(),
                current.north(),
                current.south(),
                current.east(),
                current.west()
            ];

            for (const adjacent of adjacents) {
                if (adjacent && this.isTransportBlock(adjacent)) {
                    const adjKey = Utils.locationToKey(adjacent.location);
                    if (!visited.has(adjKey)) {
                        queue.push(adjacent);
                    }
                }
            }
        }

        Logger.endTimer(`${this.systemName}_visualizeNetwork`, this.systemName);
        Logger.info(`ネットワークサイズ: ${count}ブロック`, this.systemName);

        return { networkSize: count, blocks: visited };
    }

    /**
     * 特定位置のキャッシュをクリア
     * @param {Vector3} location 
     */
    clearLocationCache(location) {
        const locationKey = Utils.locationToKey(location);
        const keysToDelete = [];
        
        for (const [key, _] of this.connectionCache) {
            if (key.startsWith(locationKey)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.connectionCache.delete(key));
    }

    /**
     * 全キャッシュをクリア
     */
    clearAllCache() {
        this.connectionCache.clear();
        Logger.debug("接続キャッシュをクリア", this.systemName);
    }
}