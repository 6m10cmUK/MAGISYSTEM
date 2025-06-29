import { world, system } from "@minecraft/server";

export class BlockUtils {
    static isBlockId(block, id) {
        if (!block) return false;
        try {
            const result = block.dimension.runCommand(`testforblock ${block.location.x} ${block.location.y} ${block.location.z} ${id}`);
            return result.successCount > 0;
        } catch {
            return false;
        }
    }

    static setBlockState(block, stateName, stateValue) {
        if (!block) return false;
        try {
            const currentStates = block.permutation.getAllStates();
            if (stateName in currentStates) {
                block.setPermutation(block.permutation.withState(stateName, stateValue));
                return true;
            }
            return false;
        } catch (error) {
            console.warn(`Failed to set block state ${stateName} to ${stateValue}: ${error}`);
            return false;
        }
    }

    static getBlockState(block, stateName) {
        if (!block) return undefined;
        try {
            const states = block.permutation.getAllStates();
            return states[stateName];
        } catch {
            return undefined;
        }
    }

    static hasBlockTag(block, tag) {
        if (!block) return false;
        try {
            return block.hasTag(tag);
        } catch {
            return false;
        }
    }

    static getAdjacentBlock(block, direction) {
        if (!block) return null;
        
        const offsets = {
            up: { x: 0, y: 1, z: 0 },
            down: { x: 0, y: -1, z: 0 },
            north: { x: 0, y: 0, z: -1 },
            south: { x: 0, y: 0, z: 1 },
            east: { x: 1, y: 0, z: 0 },
            west: { x: -1, y: 0, z: 0 }
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

    static getAllAdjacentBlocks(block) {
        const adjacents = {};
        const directions = ["up", "down", "north", "south", "east", "west"];
        
        for (const dir of directions) {
            adjacents[dir] = this.getAdjacentBlock(block, dir);
        }
        
        return adjacents;
    }

    static replaceBlock(block, newTypeId) {
        if (!block || !newTypeId) return false;
        
        try {
            const location = block.location;
            const dimension = block.dimension;
            
            // 現在のブロックの状態を保存
            const states = block.permutation.getAllStates();
            
            // ブロックを置き換え
            dimension.runCommand(`setblock ${location.x} ${location.y} ${location.z} ${newTypeId} replace`);
            
            // 新しいブロックを取得して状態を復元
            const newBlock = dimension.getBlock(location);
            if (newBlock) {
                for (const [key, value] of Object.entries(states)) {
                    try {
                        this.setBlockState(newBlock, key, value);
                    } catch {}
                }
            }
            
            return true;
        } catch (error) {
            console.warn(`Failed to replace block with ${newTypeId}: ${error}`);
            return false;
        }
    }

    static dropItem(block, itemId, amount = 1) {
        if (!block || !itemId || amount <= 0) return false;
        
        try {
            const location = block.location;
            const dimension = block.dimension;
            
            dimension.runCommand(
                `summon item ${location.x + 0.5} ${location.y + 0.5} ${location.z + 0.5} ${itemId} ${amount}`
            );
            
            return true;
        } catch (error) {
            console.warn(`Failed to drop item ${itemId}: ${error}`);
            return false;
        }
    }

    static getBlockInventory(block) {
        if (!block) return null;
        
        try {
            const inventoryComponent = block.getComponent("inventory");
            return inventoryComponent?.container;
        } catch {
            return null;
        }
    }

    static playSound(block, soundId, options = {}) {
        if (!block || !soundId) return false;
        
        try {
            const defaultOptions = {
                pitch: 1.0,
                volume: 1.0,
                ...options
            };
            
            block.dimension.playSound(soundId, block.location, defaultOptions);
            return true;
        } catch (error) {
            console.warn(`Failed to play sound ${soundId}: ${error}`);
            return false;
        }
    }

    static spawnParticle(block, particleId, options = {}) {
        if (!block || !particleId) return false;
        
        try {
            const location = {
                x: block.location.x + 0.5,
                y: block.location.y + 0.5,
                z: block.location.z + 0.5,
                ...options.offset
            };
            
            block.dimension.spawnParticle(particleId, location, options.molangVariables);
            return true;
        } catch (error) {
            console.warn(`Failed to spawn particle ${particleId}: ${error}`);
            return false;
        }
    }
}

export default BlockUtils;