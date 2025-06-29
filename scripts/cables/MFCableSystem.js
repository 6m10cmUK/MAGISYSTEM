import { world, system, BlockPermutation } from "@minecraft/server";
import BlockUtils from "../utils/BlockUtils.js";
import { energySystem } from "../energy/EnergySystem.js";

export class MFCableSystem {
    constructor() {
        this.carriageType = "mf"; // MegaFlux energy
        this.transporterType = "cable";
        this.cableTag = "mf_cable";
    }

    /**
     * ケーブルパターンを更新（BasicMachinery方式）
     * @param {Block} block - 更新するケーブルブロック
     */
    updateCablePattern(block) {
        if (!block || (!block.typeId?.includes("cable") && 
            block.typeId !== "magisystem:cable_input" && 
            block.typeId !== "magisystem:cable_output")) return;

        // 6方向の接続状態を更新
        // 注意: Minecraft APIの東西は実際の方向と逆
        this.setDirectionState(block, "above", this.canConnectToDirection(block, block.above(), "below"));
        this.setDirectionState(block, "below", this.canConnectToDirection(block, block.below(), "above"));
        this.setDirectionState(block, "north", this.canConnectToDirection(block, block.north(), "south"));
        this.setDirectionState(block, "south", this.canConnectToDirection(block, block.south(), "north"));
        this.setDirectionState(block, "east", this.canConnectToDirection(block, block.west(), "east"));    // 東西逆
        this.setDirectionState(block, "west", this.canConnectToDirection(block, block.east(), "west"));    // 東西逆
        
        // 直線かどうかを判定してstateを設定
        const isStraight = this.checkIfStraight(block);
        this.setStraightState(block, isStraight);
    }

    /**
     * 特定方向への接続可否を判定
     * @param {Block} cable - ケーブルブロック
     * @param {Block} adjacent - 隣接ブロック
     * @param {string} oppositeDirection - 隣接ブロックから見た方向
     * @returns {boolean} 接続可能かどうか
     */
    canConnectToDirection(cable, adjacent, oppositeDirection) {
        if (!adjacent) return false;

        const cableType = cable.typeId;
        const adjacentType = adjacent.typeId;

        // 専用ケーブル同士は接続しない
        if ((cableType === "magisystem:cable_input" || cableType === "magisystem:cable_output") &&
            (adjacentType === "magisystem:cable_input" || adjacentType === "magisystem:cable_output")) {
            return false;
        }

        // 通常ケーブルは他のケーブルとのみ接続
        if (cableType === "magisystem:cable") {
            return adjacent.hasTag(this.cableTag);
        }

        // 専用ケーブルは通常ケーブルとエネルギーブロックに接続
        if (cableType === "magisystem:cable_input" || cableType === "magisystem:cable_output") {
            // 通常ケーブルとの接続
            if (adjacentType === "magisystem:cable") {
                return true;
            }

            // エネルギーブロックとの接続
            if (adjacent.permutation?.getState(`magisystem:${oppositeDirection}`) === "mfOutput" ||
                adjacent.permutation?.getState(`magisystem:${oppositeDirection}`) === "allOutput" ||
                adjacent.hasTag("mf_output")) {
                return true;
            }

            if (adjacent.permutation?.getState(`magisystem:${oppositeDirection}`) === "mfInput" ||
                adjacent.permutation?.getState(`magisystem:${oppositeDirection}`) === "allInput" ||
                adjacent.hasTag("mf_input")) {
                return true;
            }

            if (energySystem.isEnergyBlock(adjacent)) {
                return true;
            }
            
            if (adjacent.hasTag("energy_storage")) {
                return true;
            }
        }

        return false;
    }

    /**
     * 特定方向の接続状態を設定
     * @param {Block} block - ケーブルブロック
     * @param {string} direction - 方向
     * @param {boolean} connected - 接続状態
     */
    setDirectionState(block, direction, connected) {
        try {
            const stateName = `magisystem:${direction}`;
            const currentStates = block.permutation.getAllStates();
            
            if (stateName in currentStates) {
                let newValue = "none";
                
                if (connected) {
                    // 隣接ブロックを取得
                    let adjacent = null;
                    switch (direction) {
                        case "above": adjacent = block.above(); break;
                        case "below": adjacent = block.below(); break;
                        case "north": adjacent = block.north(); break;
                        case "south": adjacent = block.south(); break;
                        case "east": adjacent = block.west(); break; // 東西逆
                        case "west": adjacent = block.east(); break; // 東西逆
                    }
                    
                    // ケーブルかそれ以外のブロックかを判定
                    if (adjacent && adjacent.hasTag(this.cableTag)) {
                        newValue = "cable";
                    } else if (adjacent) {
                        newValue = "block";
                    }
                }
                
                if (currentStates[stateName] !== newValue) {
                    currentStates[stateName] = newValue;
                    block.setPermutation(BlockPermutation.resolve(block.typeId, currentStates));
                }
            }
        } catch (error) {
            console.warn(`Failed to set cable state for ${direction}: ${error}`);
        }
    }

    /**
     * ケーブル設置時の処理
     * @param {Block} block - 設置されたケーブル
     */
    onCablePlaced(block) {
        // ケーブル自身のパターンを更新
        this.updateCablePattern(block);
        
        // 隣接するケーブルも更新
        this.updateAdjacentCables(block);
    }

    /**
     * ケーブル破壊時の処理
     * @param {Vector3} location - 破壊された位置
     * @param {Dimension} dimension - ディメンション
     */
    onCableRemoved(location, dimension) {
        // 隣接する6方向のケーブルを更新
        const offsets = [
            { x: 0, y: 1, z: 0 },
            { x: 0, y: -1, z: 0 },
            { x: 0, y: 0, z: -1 },
            { x: 0, y: 0, z: 1 },
            { x: 1, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 }
        ];

        for (const offset of offsets) {
            try {
                const adjacentBlock = dimension.getBlock({
                    x: location.x + offset.x,
                    y: location.y + offset.y,
                    z: location.z + offset.z
                });
                
                if (adjacentBlock && adjacentBlock.hasTag(this.cableTag)) {
                    this.updateCablePattern(adjacentBlock);
                }
            } catch {}
        }
    }

    /**
     * 隣接するケーブルを更新
     * @param {Block} block - 中心となるブロック
     */
    updateAdjacentCables(block) {
        const adjacents = [
            block.above(),
            block.below(),
            block.north(),
            block.south(),
            block.east(),
            block.west()
        ];

        for (const adjacent of adjacents) {
            if (adjacent && adjacent.hasTag(this.cableTag)) {
                this.updateCablePattern(adjacent);
            }
        }
    }

    /**
     * ケーブルネットワークの可視化（デバッグ用）
     * @param {Block} startBlock - 開始点のケーブル
     */
    visualizeCableNetwork(startBlock) {
        const visited = new Set();
        const queue = [startBlock];
        let count = 0;
        const maxCount = 90; // BasicMachinery同様の制限

        while (queue.length > 0 && count < maxCount) {
            const current = queue.shift();
            const key = `${current.location.x},${current.location.y},${current.location.z}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            count++;

            // エネルギーの流れを示すパーティクル
            BlockUtils.spawnParticle(current, "minecraft:electric_spark_particle", {
                offset: { x: 0, y: 0.5, z: 0 }
            });

            // 隣接するケーブルを探索
            const adjacents = [
                current.above(),
                current.below(),
                current.north(),
                current.south(),
                current.east(),
                current.west()
            ];

            for (const adjacent of adjacents) {
                if (adjacent && adjacent.hasTag(this.cableTag)) {
                    const adjKey = `${adjacent.location.x},${adjacent.location.y},${adjacent.location.z}`;
                    if (!visited.has(adjKey)) {
                        queue.push(adjacent);
                    }
                }
            }
        }

        return { networkSize: count, blocks: visited };
    }

    /**
     * ケーブルの接続数を取得
     * @param {Block} block - ケーブルブロック
     * @returns {number} 接続数
     */
    getConnectionCount(block) {
        if (!block) return 0;

        let count = 0;
        const states = block.permutation.getAllStates();
        const directions = ["above", "below", "north", "south", "east", "west"];

        for (const dir of directions) {
            const stateName = `magisystem:${dir}`;
            if (states[stateName] && states[stateName] !== "none") {
                count++;
            }
        }

        return count;
    }

    /**
     * ケーブルの接続情報を取得
     * @param {Block} block - ケーブルブロック
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
        if (info.count === 0) {
            info.pattern = "isolated";
        } else if (info.count === 1) {
            info.pattern = "terminal";
        } else if (info.count === 2) {
            // 直線か角かを判定
            if ((info.connections.above && info.connections.below) ||
                (info.connections.north && info.connections.south) ||
                (info.connections.east && info.connections.west)) {
                info.pattern = "straight";
            } else {
                info.pattern = "corner";
            }
        } else if (info.count === 3) {
            info.pattern = "t-junction";
        } else if (info.count === 4) {
            info.pattern = "cross";
        } else if (info.count === 5) {
            info.pattern = "five-way";
        } else if (info.count === 6) {
            info.pattern = "six-way";
        }

        return info;
    }

    /**
     * ケーブルが直線かどうかをチェック
     * @param {Block} block - ケーブルブロック
     * @returns {boolean} 直線かどうか
     */
    checkIfStraight(block) {
        if (!block) return false;
        
        const states = block.permutation.getAllStates();
        let connections = 0;
        const connectedDirs = [];
        
        const directions = ["above", "below", "north", "south", "east", "west"];
        for (const dir of directions) {
            const stateName = `magisystem:${dir}`;
            if (states[stateName] && states[stateName] !== "none") {
                connections++;
                connectedDirs.push(dir);
            }
        }
        
        // 2方向にのみ接続している場合
        if (connections === 2) {
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
     * @param {Block} block - ケーブルブロック
     * @param {boolean} isStraight - 直線かどうか
     */
    setStraightState(block, isStraight) {
        try {
            const currentStates = block.permutation.getAllStates();
            if ("magisystem:is_straight" in currentStates) {
                currentStates["magisystem:is_straight"] = isStraight;
                block.setPermutation(BlockPermutation.resolve(block.typeId, currentStates));
            }
        } catch (error) {
            console.warn(`Failed to set straight state: ${error}`);
        }
    }
}

// シングルトンインスタンスをエクスポート
export const mfCableSystem = new MFCableSystem();