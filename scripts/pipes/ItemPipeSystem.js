import { world, system, BlockPermutation } from "@minecraft/server";
import BlockUtils from "../utils/BlockUtils.js";

export class ItemPipeSystem {
    constructor() {
        this.carriageType = "item"; // アイテム運送
        this.transporterType = "pipe";
        this.pipeTag = "item_pipe";
    }

    /**
     * パイプパターンを更新（CableSystemと同じ仕組み）
     * @param {Block} block - 更新するパイプブロック
     */
    updatePipePattern(block) {
        if (!block || (!block.typeId?.includes("pipe") && 
            block.typeId !== "magisystem:pipe_input" && 
            block.typeId !== "magisystem:pipe_output")) return;

        // 6方向の接続状態を更新
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
     */
    canConnectToDirection(pipe, adjacent, oppositeDirection) {
        if (!adjacent) return false;

        const pipeType = pipe.typeId;
        const adjacentType = adjacent.typeId;

        // 専用パイプ同士は接続しない
        if ((pipeType === "magisystem:pipe_input" || pipeType === "magisystem:pipe_output") &&
            (adjacentType === "magisystem:pipe_input" || adjacentType === "magisystem:pipe_output")) {
            return false;
        }

        // 通常パイプは他のパイプとのみ接続
        if (pipeType === "magisystem:pipe") {
            return adjacent.hasTag(this.pipeTag);
        }

        // 専用パイプは通常パイプとインベントリブロックに接続
        if (pipeType === "magisystem:pipe_input" || pipeType === "magisystem:pipe_output") {
            // 通常パイプとの接続
            if (adjacentType === "magisystem:pipe") {
                return true;
            }

            // インベントリを持つブロックとの接続
            if (this.hasInventory(adjacent)) {
                return true;
            }
        }

        return false;
    }

    /**
     * ブロックがインベントリを持つかチェック
     */
    hasInventory(block) {
        // チェスト、かまど、ホッパーなど
        const inventoryBlocks = [
            "minecraft:chest",
            "minecraft:furnace", 
            "minecraft:blast_furnace",
            "minecraft:smoker",
            "minecraft:hopper",
            "minecraft:dropper",
            "minecraft:dispenser",
            "minecraft:barrel"
        ];
        
        return inventoryBlocks.includes(block.typeId) || 
               block.hasTag("item_storage") ||
               block.hasTag("item_input") ||
               block.hasTag("item_output");
    }

    /**
     * 特定方向の接続状態を設定
     */
    setDirectionState(block, direction, connected) {
        try {
            let newValue = "none";
            if (connected) {
                const adjacent = this.getAdjacentBlock(block, direction);
                if (adjacent && adjacent.hasTag(this.pipeTag)) {
                    newValue = "pipe";
                } else if (adjacent) {
                    newValue = "block";
                }
            }

            const currentPermutation = block.permutation;
            const newPermutation = currentPermutation.withState(`magisystem:${direction}`, newValue);
            block.setPermutation(newPermutation);
        } catch (error) {
            console.warn(`Failed to set pipe direction state: ${error}`);
        }
    }

    /**
     * 隣接ブロックを取得
     */
    getAdjacentBlock(block, direction) {
        const offsets = {
            above: { x: 0, y: 1, z: 0 },
            below: { x: 0, y: -1, z: 0 },
            north: { x: 0, y: 0, z: -1 },
            south: { x: 0, y: 0, z: 1 },
            east: { x: -1, y: 0, z: 0 },  // 東西逆
            west: { x: 1, y: 0, z: 0 }    // 東西逆
        };

        const offset = offsets[direction];
        if (!offset) return null;

        try {
            return block.dimension.getBlock({
                x: block.location.x + offset.x,
                y: block.location.y + offset.y,
                z: block.location.z + offset.z
            });
        } catch {
            return null;
        }
    }

    /**
     * パイプが直線かどうかを判定
     */
    checkIfStraight(block) {
        const connections = this.getConnectionInfo(block);
        if (!connections || connections.count !== 2) return false;
        
        const connectedDirs = Object.entries(connections.connections)
            .filter(([_, connected]) => connected)
            .map(([dir, _]) => dir);
        
        // 対面する方向のペア
        const opposites = [
            ["above", "below"],
            ["north", "south"],
            ["east", "west"]
        ];
        
        // 接続された2方向が対面しているかチェック
        for (const [dir1, dir2] of opposites) {
            if (connectedDirs.includes(dir1) && connectedDirs.includes(dir2)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * パイプの直線状態を設定
     */
    setStraightState(block, isStraight) {
        try {
            const currentPermutation = block.permutation;
            const newPermutation = currentPermutation.withState("magisystem:is_straight", isStraight);
            block.setPermutation(newPermutation);
        } catch (error) {
            console.warn(`Failed to set straight state: ${error}`);
        }
    }

    /**
     * パイプの接続情報を取得
     */
    getConnectionInfo(block) {
        if (!block) return null;

        const connections = {
            above: block.permutation.getState("magisystem:above") !== "none",
            below: block.permutation.getState("magisystem:below") !== "none",
            north: block.permutation.getState("magisystem:north") !== "none",
            south: block.permutation.getState("magisystem:south") !== "none",
            east: block.permutation.getState("magisystem:east") !== "none",
            west: block.permutation.getState("magisystem:west") !== "none"
        };

        const count = Object.values(connections).filter(connected => connected).length;

        return {
            connections,
            count,
            pattern: this.getConnectionPattern(connections, count)
        };
    }

    /**
     * 接続パターンを取得
     */
    getConnectionPattern(connections, count) {
        switch (count) {
            case 0: return "isolated";
            case 1: return "terminal";
            case 2: {
                if (this.checkIfStraight({ permutation: { getState: (state) => connections[state.split(':')[1]] } })) {
                    return "straight";
                }
                return "corner";
            }
            case 3: return "t-junction";
            case 4: return "cross";
            case 5: return "five-way";
            case 6: return "six-way";
            default: return "unknown";
        }
    }

    /**
     * パイプ配置時の処理
     */
    onPipePlaced(block) {
        this.updatePipePattern(block);
        this.updateAdjacentPipes(block);
    }

    /**
     * パイプ破壊時の処理
     */
    onPipeRemoved(location, dimension) {
        this.updateAdjacentPipesAt(location, dimension);
    }

    /**
     * 隣接するパイプを更新
     */
    updateAdjacentPipes(block) {
        const adjacents = [
            block.above(),
            block.below(),
            block.north(),
            block.south(),
            block.east(),
            block.west()
        ];

        for (const adjacent of adjacents) {
            if (adjacent && adjacent.hasTag(this.pipeTag)) {
                this.updatePipePattern(adjacent);
            }
        }
    }

    /**
     * 指定位置の隣接パイプを更新
     */
    updateAdjacentPipesAt(location, dimension) {
        const offsets = [
            { x: 0, y: 1, z: 0 },   // above
            { x: 0, y: -1, z: 0 },  // below
            { x: 0, y: 0, z: -1 },  // north
            { x: 0, y: 0, z: 1 },   // south
            { x: 1, y: 0, z: 0 },   // east
            { x: -1, y: 0, z: 0 }   // west
        ];

        for (const offset of offsets) {
            try {
                const adjacentBlock = dimension.getBlock({
                    x: location.x + offset.x,
                    y: location.y + offset.y,
                    z: location.z + offset.z
                });

                if (adjacentBlock && adjacentBlock.hasTag(this.pipeTag)) {
                    this.updatePipePattern(adjacentBlock);
                }
            } catch {}
        }
    }
}

// シングルトンインスタンスをエクスポート
export const itemPipeSystem = new ItemPipeSystem();