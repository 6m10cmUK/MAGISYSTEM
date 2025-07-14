import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import { generator } from "../machines/Generator.js";
import { creativeGenerator } from "../machines/CreativeGenerator.js";
import { battery } from "../machines/Battery.js";
import { electricFurnace } from "../machines/ElectricFurnace.js";
import { itemNetwork } from "../items/ItemNetwork.js";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";
import { Constants } from "../core/Constants.js";
import { BlockTypeUtils } from "../utils/BlockTypeUtils.js";
import { DisplayNameRegistry } from "../core/DisplayNameRegistry.js";

/**
 * ブロック情報収集クラス
 * WrenchSidebarとDisplaySystemの重複処理を統合
 */
export class InfoGatherer {
    /**
     * エネルギーブロックの情報を収集
     * @param {Block} block - 対象ブロック
     * @returns {Object} 情報オブジェクト
     */
    static async gatherEnergyInfo(block) {
        const typeId = block.typeId;
        const info = {
            type: "energy",
            typeId: typeId,
            data: {
                displayName: this.getBlockDisplayName(typeId)
            }
        };

        // 基本エネルギー情報
        const energy = energySystem.getEnergy(block);
        const maxEnergy = energySystem.getMaxCapacity(block);
        const percent = Math.round((energy / maxEnergy) * 100);

        info.data.energy = energy;
        info.data.maxEnergy = maxEnergy;
        info.data.percent = percent;
        info.data.canInput = energySystem.canInput(block);
        info.data.canOutput = energySystem.canOutput(block);

        // 発電機固有情報（通常発電機・熱発電機）
        if (typeId === Constants.BLOCK_TYPES.GENERATOR || typeId === Constants.BLOCK_TYPES.THERMAL_GENERATOR) {
            const genInfo = generator.getGeneratorInfo(block);
            if (genInfo) {
                info.data.isActive = genInfo.burnTime > 0;
                info.data.generationRate = generator.generationRate;
                info.data.burnTime = genInfo.burnTime;
                info.data.maxBurnTime = genInfo.maxBurnTime;
                info.data.fuelItem = genInfo.fuelItem;
            }
        }
        // クリエイティブ発電機
        else if (typeId === Constants.BLOCK_TYPES.CREATIVE_GENERATOR) {
            info.data.isActive = true;
            info.data.generationRate = creativeGenerator.generationRate;
            info.data.isCreative = true;
        }
        // バッテリー
        else if (BlockTypeUtils.isBattery(typeId)) {
            const batteryInfo = battery.getBatteryInfo(block);
            if (batteryInfo) {
                info.data.transferRate = batteryInfo.transferRate;
            }
        }
        // 電気炉
        else if (typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE) {
            const key = energySystem.getLocationKey(block.location);
            const machineData = electricFurnace.machines.get(key);
            if (machineData) {
                info.data.isActive = machineData.active;
                info.data.energyPerTick = electricFurnace.ENERGY_PER_TICK;
                info.data.smeltTime = machineData.smeltTime;
                info.data.maxSmeltTime = machineData.maxSmeltTime;
                info.data.inputItem = machineData.inputItem;
                info.data.outputItem = machineData.outputItem;
                info.data.smeltProgress = machineData.maxSmeltTime > 0 
                    ? Math.round((machineData.maxSmeltTime - machineData.smeltTime) / machineData.maxSmeltTime * 100)
                    : 0;
            }
        }

        return info;
    }

    /**
     * ケーブル情報を収集
     * @param {Block} block - 対象ブロック
     * @returns {Object} 情報オブジェクト
     */
    static gatherCableInfo(block) {
        const info = {
            type: "cable",
            typeId: "magisystem:cable", // ID統一
            data: {
                displayName: "エネルギーケーブル", // 統一表示名
                transferRate: Constants.ENERGY.MAX_TRANSFER_PER_TICK
            }
        };

        // モード判定
        if (block.typeId === Constants.BLOCK_TYPES.CABLE_INPUT) {
            info.data.mode = 'input';
        } else if (block.typeId === Constants.BLOCK_TYPES.CABLE_OUTPUT) {
            info.data.mode = 'output';
        } else {
            info.data.mode = 'normal';
        }

        return info;
    }

    /**
     * パイプ情報を収集
     * @param {Block} block - 対象ブロック
     * @returns {Object} 情報オブジェクト
     */
    static async gatherPipeInfo(block) {
        const info = {
            type: "pipe",
            typeId: "magisystem:pipe", // ID統一
            data: {
                displayName: "アイテムパイプ", // 統一表示名
                transferRate: 1 // アイテム/tick
            }
        };

        // モード判定
        if (block.typeId === Constants.BLOCK_TYPES.PIPE_INPUT) {
            info.data.mode = 'input';
        } else if (block.typeId === Constants.BLOCK_TYPES.PIPE_OUTPUT) {
            info.data.mode = 'output';
        } else {
            info.data.mode = 'normal';
        }

        // 接続情報
        const connectionInfo = itemPipeSystem.getConnectionInfo(block);
        if (connectionInfo) {
            info.data.connections = connectionInfo.count;
            info.data.pattern = connectionInfo.pattern;
            
            // 接続詳細を取得
            const states = block.permutation.getAllStates();
            info.data.connectionDetails = {
                above: states["magisystem:above"] || "none",
                below: states["magisystem:below"] || "none",
                north: states["magisystem:north"] || "none",
                south: states["magisystem:south"] || "none",
                east: states["magisystem:east"] || "none",
                west: states["magisystem:west"] || "none"
            };
        }

        // ネットワーク情報
        const network = itemNetwork.findConnectedNetwork(block, false);
        
        // デバッグ：輸送マネージャーの状態
        const { itemTransportManager } = await import("../items/ItemTransportManager.js");
        const debugInfo = itemTransportManager.getDebugInfo();
        info.data.transportManager = {
            running: debugInfo.isRunning,
            sources: debugInfo.transportSources,
            ticks: debugInfo.tickCounter
        };
        info.data.networkSize = network.size;

        return info;
    }

    /**
     * インベントリ情報を収集
     * @param {Block} block - 対象ブロック
     * @returns {Object} 情報オブジェクト
     */
    static gatherInventoryInfo(block) {
        const info = {
            type: "inventory",
            typeId: block.typeId,
            data: {
                displayName: this.getBlockDisplayName(block.typeId),
                itemCount: 0,
                slotCount: 0,
                totalSlots: 0,
                items: new Map()
            }
        };

        const inventory = itemNetwork.getInventory(block);
        if (inventory) {
            info.data.totalSlots = inventory.size;
            
            for (let i = 0; i < inventory.size; i++) {
                const item = inventory.getItem(i);
                if (item) {
                    info.data.itemCount += item.amount;
                    info.data.slotCount++;
                    
                    const currentAmount = info.data.items.get(item.typeId) || 0;
                    info.data.items.set(item.typeId, currentAmount + item.amount);
                }
            }

            // パイプ接続情報
            const adjacents = itemNetwork.getAdjacentBlocks(block);
            info.data.pipeConnections = adjacents.filter(
                adj => itemNetwork.isItemConduit(adj.block)
            ).length;
        }

        return info;
    }

    /**
     * ブロックタイプに応じて適切な情報を収集
     * @param {Block} block - 対象ブロック
     * @returns {Object} 情報オブジェクト
     */
    static async gatherBlockInfo(block) {
        const typeId = block.typeId;

        if (energySystem.isEnergyBlock(block)) {
            return await this.gatherEnergyInfo(block);
        } else if (typeId === Constants.BLOCK_TYPES.CABLE || 
                   typeId === Constants.BLOCK_TYPES.CABLE_INPUT || 
                   typeId === Constants.BLOCK_TYPES.CABLE_OUTPUT) {
            return this.gatherCableInfo(block);
        } else if (BlockTypeUtils.isPipe(typeId)) {
            return await this.gatherPipeInfo(block);
        } else if (itemPipeSystem.hasInventory(block)) {
            return this.gatherInventoryInfo(block);
        }

        // すべてのブロックに対して基本情報を返す
        return {
            type: "basic",
            typeId: typeId,
            data: {
                displayName: this.getBlockDisplayName(typeId)
            }
        };
    }

    /**
     * ブロックの表示名を取得
     * @param {string} typeId - ブロックタイプID
     * @returns {string} 表示名
     */
    static getBlockDisplayName(typeId) {
        if (!typeId) return "Unknown Block";
        
        // DisplayNameRegistryから取得を試みる
        const customName = DisplayNameRegistry.getBlockName(typeId);
        if (customName && customName !== typeId) {
            return customName;
        }

        // デフォルトの変換処理
        // minecraft:stone -> Stone
        // magisystem:cable_input -> Cable Input
        const cleanName = typeId
            .replace(/^minecraft:/, '')
            .replace(/^magisystem:/, '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
        
        return cleanName;
    }

    /**
     * 数値をフォーマット
     * @param {number} num - 数値
     * @returns {string} フォーマット済み文字列
     */
    static formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + "M";
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + "K";
        }
        return num.toString();
    }

    /**
     * アイテムの表示名を取得
     * @param {string} itemId - アイテムID
     * @returns {string} 表示名
     */
    static getItemDisplayName(itemId) {
        if (!itemId) return "Unknown Item";
        
        // DisplayNameRegistryから取得を試みる
        const customName = DisplayNameRegistry.getItemName(itemId);
        if (customName && customName !== itemId) {
            return customName;
        }

        // デフォルトの変換処理
        const cleanName = itemId
            .replace(/^minecraft:/, '')
            .replace(/^magisystem:/, '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
        
        return cleanName;
    }
}