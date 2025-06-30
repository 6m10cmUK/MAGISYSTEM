/**
 * MAGISYSTEM 燃料レジストリ
 * 燃料アイテムの統一的な管理
 */

import { ErrorHandler } from './ErrorHandler.js';

export class FuelRegistry {
    static fuelValues = new Map();
    static initialized = false;

    /**
     * 燃料レジストリを初期化
     */
    static initialize() {
        if (this.initialized) return;

        ErrorHandler.info("燃料レジストリを初期化中", "FuelRegistry.initialize");

        // バニラ燃料
        this.registerFuel('minecraft:coal', 1600);
        this.registerFuel('minecraft:charcoal', 1600);
        this.registerFuel('minecraft:coal_block', 16000);
        this.registerFuel('minecraft:blaze_rod', 2400);
        this.registerFuel('minecraft:lava_bucket', 20000);
        
        // 木材系
        this.registerFuel('minecraft:oak_log', 300);
        this.registerFuel('minecraft:spruce_log', 300);
        this.registerFuel('minecraft:birch_log', 300);
        this.registerFuel('minecraft:jungle_log', 300);
        this.registerFuel('minecraft:acacia_log', 300);
        this.registerFuel('minecraft:dark_oak_log', 300);
        this.registerFuel('minecraft:mangrove_log', 300);
        this.registerFuel('minecraft:cherry_log', 300);
        
        // 板材
        this.registerFuel('minecraft:oak_planks', 300);
        this.registerFuel('minecraft:spruce_planks', 300);
        this.registerFuel('minecraft:birch_planks', 300);
        this.registerFuel('minecraft:jungle_planks', 300);
        this.registerFuel('minecraft:acacia_planks', 300);
        this.registerFuel('minecraft:dark_oak_planks', 300);
        this.registerFuel('minecraft:mangrove_planks', 300);
        this.registerFuel('minecraft:cherry_planks', 300);
        this.registerFuel('minecraft:bamboo_planks', 300);
        
        // その他の木製品
        this.registerFuel('minecraft:stick', 100);
        this.registerFuel('minecraft:bamboo', 50);
        this.registerFuel('minecraft:scaffolding', 50);
        this.registerFuel('minecraft:bookshelf', 300);
        
        // ブロック系
        this.registerFuel('minecraft:dried_kelp_block', 4000);
        this.registerFuel('minecraft:bamboo_block', 300);
        
        // MAGISYSTEMカスタム燃料
        this.registerFuel('magisystem:compressed_coal', 14400);  // 9x coal
        this.registerFuel('magisystem:energy_crystal', 32000);  // 高効率燃料
        
        this.initialized = true;
        ErrorHandler.info(`${this.fuelValues.size}種類の燃料を登録完了`, "FuelRegistry.initialize");
    }

    /**
     * 燃料を登録
     * @param {string} itemId 
     * @param {number} burnTime tick単位の燃焼時間
     */
    static registerFuel(itemId, burnTime) {
        if (!itemId || burnTime <= 0) {
            ErrorHandler.warn(`無効な燃料登録: ${itemId} (${burnTime} ticks)`, "FuelRegistry.registerFuel");
            return false;
        }

        this.fuelValues.set(itemId, burnTime);
        return true;
    }

    /**
     * アイテムの燃料値を取得
     * @param {string} itemId 
     * @returns {number} 燃焼時間（tick）、燃料でない場合は0
     */
    static getFuelValue(itemId) {
        if (!this.initialized) {
            this.initialize();
        }

        return this.fuelValues.get(itemId) || 0;
    }

    /**
     * アイテムが燃料かどうか確認
     * @param {string} itemId 
     * @returns {boolean}
     */
    static isFuel(itemId) {
        return this.getFuelValue(itemId) > 0;
    }

    /**
     * 燃料値をMFに変換（1秒あたり10MF生成として計算）
     * @param {string} itemId 
     * @returns {number} 生成可能なMF量
     */
    static getFuelMF(itemId) {
        const burnTime = this.getFuelValue(itemId);
        return Math.floor(burnTime / 20) * 10; // tick→秒→MF
    }

    /**
     * すべての登録済み燃料を取得
     * @returns {Map<string, number>}
     */
    static getAllFuels() {
        if (!this.initialized) {
            this.initialize();
        }
        return new Map(this.fuelValues);
    }

    /**
     * カスタム燃料を一括登録
     * @param {Object} fuelMap { itemId: burnTime }形式のオブジェクト
     */
    static registerBulkFuels(fuelMap) {
        let count = 0;
        for (const [itemId, burnTime] of Object.entries(fuelMap)) {
            if (this.registerFuel(itemId, burnTime)) {
                count++;
            }
        }
        ErrorHandler.info(`${count}種類のカスタム燃料を登録`, "FuelRegistry.registerBulkFuels");
        return count;
    }

    /**
     * 燃料情報をフォーマット済み文字列で取得
     * @param {string} itemId 
     * @returns {string}
     */
    static getFuelInfo(itemId) {
        const burnTime = this.getFuelValue(itemId);
        if (burnTime === 0) return "§c燃料ではありません";
        
        const seconds = Math.floor(burnTime / 20);
        const mf = this.getFuelMF(itemId);
        return `§e燃焼時間: ${seconds}秒 (${mf} MF)`;
    }
}

// 初期化
FuelRegistry.initialize();