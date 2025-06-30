import { Constants } from "../core/Constants.js";

/**
 * ブロックタイプ判定のユーティリティクラス
 * DRY原則に基づいて統一的なブロックタイプ判定を提供
 */
export class BlockTypeUtils {
    /**
     * バッテリーブロックかどうかを判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean}
     */
    static isBattery(typeId) {
        return typeId?.includes("battery") || false;
    }

    /**
     * 発電機ブロックかどうかを判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean}
     */
    static isGenerator(typeId) {
        return typeId === Constants.BLOCK_TYPES.GENERATOR ||
               typeId === Constants.BLOCK_TYPES.CREATIVE_GENERATOR;
    }

    /**
     * エネルギーケーブルかどうかを判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean}
     */
    static isCable(typeId) {
        return typeId === Constants.BLOCK_TYPES.CABLE ||
               typeId?.includes("cable") || false;
    }

    /**
     * アイテムパイプかどうかを判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean}
     */
    static isPipe(typeId) {
        return typeId === Constants.BLOCK_TYPES.PIPE ||
               typeId?.includes("pipe") || false;
    }

    /**
     * エネルギーブロックかどうかを判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean}
     */
    static isEnergyBlock(typeId) {
        return this.isGenerator(typeId) ||
               this.isBattery(typeId) ||
               typeId?.includes("energy") || false;
    }

    /**
     * 工業系ブロックかどうかを判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean}
     */
    static isIndustrialBlock(typeId) {
        return this.isEnergyBlock(typeId) ||
               this.isCable(typeId) ||
               this.isPipe(typeId);
    }

    /**
     * インベントリを持つブロックかどうかを判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean}
     */
    static hasInventory(typeId) {
        const inventoryBlocks = [
            "minecraft:chest",
            "minecraft:barrel",
            "minecraft:furnace",
            "minecraft:blast_furnace",
            "minecraft:smoker",
            "minecraft:hopper",
            "minecraft:dropper",
            "minecraft:dispenser",
            "minecraft:shulker_box"
        ];
        
        return inventoryBlocks.includes(typeId) ||
               typeId?.includes("shulker_box") || false;
    }

    /**
     * かまど系ブロックかどうかを判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean}
     */
    static isFurnace(typeId) {
        return typeId === "minecraft:furnace" ||
               typeId === "minecraft:blast_furnace" ||
               typeId === "minecraft:smoker" ||
               typeId === "magisystem:iron_furnace";
    }

    /**
     * 追跡対象のブロックかどうかを判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean}
     */
    static isTrackedBlock(typeId) {
        return this.isIndustrialBlock(typeId);
    }
}