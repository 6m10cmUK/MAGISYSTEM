/**
 * MAGISYSTEM ブロックイベントハンドラー
 * BaseEventHandlerを継承した統一的な実装
 */

import { world, system, ItemStack } from "@minecraft/server";
import { BaseEventHandler } from "./BaseEventHandler.js";
import { energySystem } from "../energy/EnergySystem.js";
import { generator } from "../machines/Generator.js";
import { creativeGenerator } from "../machines/CreativeGenerator.js";
import { battery } from "../machines/Battery.js";
import { electricFurnace } from "../machines/ElectricFurnace.js";
import { seebeckGenerator } from "../machines/SeebeckGenerator.js";
import { mfCableSystem } from "../cables/MFCableSystem.js";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";
import { itemTransportManager } from "../items/ItemTransportManager.js";
import BlockUtils from "../utils/BlockUtils.js";
import { Constants } from "../core/Constants.js";
import { Logger } from "../core/Logger.js";
import { Utils } from "../core/Utils.js";
import { BlockTypeUtils } from "../utils/BlockTypeUtils.js";

export class BlockEvents extends BaseEventHandler {
    constructor() {
        super("BlockEvents");
        
        // ブロックタイプのマッピング
        this.blockHandlers = new Map([
            [Constants.BLOCK_TYPES.GENERATOR, this.handleGeneratorPlace.bind(this)],
            [Constants.BLOCK_TYPES.THERMAL_GENERATOR, this.handleGeneratorPlace.bind(this)],
            [Constants.BLOCK_TYPES.CREATIVE_GENERATOR, this.handleCreativeGeneratorPlace.bind(this)],
            [Constants.BLOCK_TYPES.ELECTRIC_FURNACE, this.handleElectricFurnacePlace.bind(this)],
            [Constants.BLOCK_TYPES.CABLE, this.handleCablePlace.bind(this)],
            [Constants.BLOCK_TYPES.CABLE_INPUT, this.handleCablePlace.bind(this)],
            [Constants.BLOCK_TYPES.CABLE_OUTPUT, this.handleCablePlace.bind(this)],
            [Constants.BLOCK_TYPES.PIPE, this.handlePipePlace.bind(this)],
            [Constants.BLOCK_TYPES.PIPE_INPUT, this.handlePipePlace.bind(this)],
            [Constants.BLOCK_TYPES.PIPE_OUTPUT, this.handlePipePlace.bind(this)],
            [Constants.BLOCK_TYPES.ELECTRIC_FURNACE, this.handleElectricFurnacePlace.bind(this)],
            ['magisystem:seebeck_generator', this.handleSeebeckGeneratorPlace.bind(this)],
        ]);
    }

    /**
     * イベントハンドラーの設定
     */
    setupEventHandlers() {
        // ブロック配置イベント
        this.safeSubscribe(
            world.afterEvents.playerPlaceBlock,
            (event) => this.onBlockPlace(event),
            "playerPlaceBlock"
        );

        // ブロック破壊イベント
        this.safeSubscribe(
            world.afterEvents.playerBreakBlock,
            (event) => this.onBlockBreak(event),
            "playerBreakBlock"
        );

        // 爆発によるブロック破壊
        this.safeSubscribe(
            world.afterEvents.blockExplode,
            (event) => this.onBlockExplode(event),
            "blockExplode"
        );
    }

    /**
     * ブロック配置時の処理
     * @param {Object} event 
     */
    onBlockPlace(event) {
        const { block, player } = event;
        const typeId = block.typeId;
        
        Logger.logBlock("配置", block, { player: player.name });
        
        // 専用ハンドラーがある場合は使用
        const handler = this.blockHandlers.get(typeId);
        if (handler) {
            handler(block, player);
            return;
        }
        
        // バッテリーの場合
        if (BlockTypeUtils.isBattery(typeId)) {
            this.handleBatteryPlace(block, player);
            return;
        }
        
        // その他のエネルギーブロック
        if (energySystem.isEnergyBlock(block)) {
            this.handleEnergyBlockPlace(block, player);
        }
        
        // インベントリブロックの場合、隣接するパイプを更新
        if (itemPipeSystem.hasInventory(block)) {
            this.updateAdjacentPipes(block);
            
            // 隣接する出力パイプがあればItemTransportManagerに通知
            const adjacents = [
                block.above(),
                block.below(),
                block.north(),
                block.south(),
                block.east(),
                block.west()
            ];
            
            for (const adjacent of adjacents) {
                if (adjacent?.typeId === "magisystem:pipe_output") {
                    itemTransportManager.registerTransportSource(block);
                    break;
                }
            }
        }
    }

    /**
     * ブロック破壊時の処理
     * @param {Object} event 
     */
    onBlockBreak(event) {
        const { block, brokenBlockPermutation, player, dimension } = event;
        const typeId = brokenBlockPermutation.type.id;
        const location = block.location;
        
        Logger.logBlock("破壊", block, { player: player.name, typeId });
        
        // エネルギーブロックの場合
        if (BlockTypeUtils.isEnergyBlock(typeId)) {
            this.handleEnergyBlockBreak(typeId, location, dimension, brokenBlockPermutation);
        }
        
        // ケーブルの場合
        else if (BlockTypeUtils.isCable(typeId)) {
            mfCableSystem.onBlockRemoved(location, dimension);
        }
        
        // パイプの場合
        else if (BlockTypeUtils.isPipe(typeId)) {
            itemPipeSystem.onBlockRemoved(location, dimension);
            
            // アイテム輸送マネージャーに通知
            itemTransportManager.onPipeRemoved(location, dimension, typeId);
        }
        
        // インベントリブロックの場合、隣接するパイプを更新
        const inventory = brokenBlockPermutation.getComponent?.("minecraft:inventory");
        if (inventory || itemPipeSystem.inventoryBlocks.has(typeId) || 
            typeId === Constants.BLOCK_TYPES.THERMAL_GENERATOR ||
            typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE) {
            this.updateAdjacentPipesAtLocation(location, dimension);
        }
    }

    /**
     * 爆発によるブロック破壊時の処理
     * @param {Object} event 
     */
    onBlockExplode(event) {
        const { block, explodedBlockPermutation, dimension } = event;
        const typeId = explodedBlockPermutation.type.id;
        const location = block.location;
        
        Logger.logBlock("爆発破壊", block, { typeId });
        
        // 破壊時と同じ処理を実行
        if (BlockTypeUtils.isEnergyBlock(typeId)) {
            this.handleEnergyBlockBreak(typeId, location, dimension, explodedBlockPermutation);
        } else if (BlockTypeUtils.isCable(typeId)) {
            mfCableSystem.onBlockRemoved(location, dimension);
        } else if (BlockTypeUtils.isPipe(typeId)) {
            itemPipeSystem.onBlockRemoved(location, dimension);
        }
    }

    // ========== ブロック配置ハンドラー ==========

    handleGeneratorPlace(block, player) {
        Logger.info(`発電機を配置: ${block.typeId}`, this.name);
        this.handleMachinePlace(block, player, generator, "発電機");
        
        // 熱発電機の場合、隣接するパイプを更新
        if (block.typeId === Constants.BLOCK_TYPES.THERMAL_GENERATOR) {
            this.updateAdjacentPipes(block);
        }
    }

    handleCreativeGeneratorPlace(block, player) {
        this.handleMachinePlace(block, player, creativeGenerator, "クリエイティブ発電機");
    }

    handleBatteryPlace(block, player) {
        // バッテリーを登録
        battery.registerBattery(block);
        
        // 手持ちのアイテムからエネルギー情報を取得
        const itemStack = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
        if (itemStack) {
            const storedEnergy = itemStack.getDynamicProperty('stored_energy');
            if (storedEnergy && storedEnergy > 0) {
                // 保存されたエネルギーを設定
                energySystem.setEnergy(block, storedEnergy);
                Logger.info(`バッテリーエネルギー復元: ${storedEnergy} MF`, this.name);
            }
        }
        
        BlockUtils.playSound(block, Constants.SOUNDS.BLOCK_PLACE, { volume: 0.8 });
        mfCableSystem.updateAdjacentBlocks(block);
        this.sendDebugMessage(player, `バッテリーを配置: ${Utils.locationToKey(block.location)}`);
    }

    /**
     * 機械配置の共通処理
     */
    handleMachinePlace(block, player, machineSystem, displayName) {
        const result = machineSystem.register ? machineSystem.register(block) : 
                                machineSystem.registerGenerator ? machineSystem.registerGenerator(block) :
                                machineSystem.registerBattery(block);
        
        Logger.info(`${displayName}登録結果: ${result}, 位置: ${Utils.locationToKey(block.location)}`, "BlockEvents");
        
        BlockUtils.playSound(block, Constants.SOUNDS.BLOCK_PLACE, { volume: 0.8 });
        mfCableSystem.updateAdjacentBlocks(block);
        this.sendDebugMessage(player, `${displayName}を配置: ${Utils.locationToKey(block.location)}`);
    }

    handleElectricFurnacePlace(block, player) {
        // 電気炉を登録
        const result = electricFurnace.register(block);
        Logger.info(`電気炉登録結果: ${result}, 位置: ${Utils.locationToKey(block.location)}`, "BlockEvents");
        
        // エネルギーシステムにも初期値を設定（電気炉はエネルギーを使用）
        const initialEnergy = 0;
        energySystem.setEnergy(block, initialEnergy);
        Logger.info(`電気炉のエネルギーを初期化: ${initialEnergy} MF`, "BlockEvents");
        
        BlockUtils.playSound(block, Constants.SOUNDS.BLOCK_PLACE, { volume: 0.8 });
        mfCableSystem.updateAdjacentBlocks(block);
        this.sendDebugMessage(player, `電気炉を配置: ${Utils.locationToKey(block.location)}`);
        
        // 隣接するパイプを更新（アイテム輸送のため）
        this.updateAdjacentPipes(block);
    }
    
    handleSeebeckGeneratorPlace(block, player) {
        Logger.info(`ゼーベック発電機を配置: ${block.typeId}`, this.name);
        const result = seebeckGenerator.registerSeebeckGenerator(block);
        
        Logger.info(`ゼーベック発電機登録結果: ${result}, 位置: ${Utils.locationToKey(block.location)}`, "BlockEvents");
        
        BlockUtils.playSound(block, Constants.SOUNDS.BLOCK_PLACE, { volume: 0.8 });
        mfCableSystem.updateAdjacentBlocks(block);
        this.sendDebugMessage(player, `ゼーベック発電機を配置: ${Utils.locationToKey(block.location)}`);
    }

    handleCablePlace(block, player) {
        mfCableSystem.onBlockPlaced(block);
        BlockUtils.playSound(block, Constants.SOUNDS.BLOCK_PLACE, { volume: 0.5 });
        this.sendDebugMessage(player, `ケーブルを配置: ${block.typeId}`);
    }

    handlePipePlace(block, player) {
        itemPipeSystem.onBlockPlaced(block);
        
        // アイテム輸送マネージャーに通知
        itemTransportManager.onPipePlaced(block);
        
        // 強制的に接続状態を更新（1tick後）
        system.runTimeout(() => {
            itemPipeSystem.updatePattern(block);
            
            // 隣接するパイプも再度更新
            const adjacents = [
                block.above(),
                block.below(),
                block.north(),
                block.south(),
                block.east(),
                block.west()
            ];
            
            for (const adj of adjacents) {
                if (adj && itemPipeSystem.isTransportBlock(adj)) {
                    itemPipeSystem.updatePattern(adj);
                }
            }
        }, 1);
        
        BlockUtils.playSound(block, Constants.SOUNDS.BLOCK_PLACE, { volume: 0.5 });
        this.sendDebugMessage(player, `パイプを配置: ${block.typeId}`);
    }

    handleEnergyBlockPlace(block, player) {
        energySystem.setEnergy(block, 0);
        BlockUtils.playSound(block, Constants.SOUNDS.BLOCK_PLACE, { volume: 0.8 });
        mfCableSystem.updateAdjacentBlocks(block);
        this.sendDebugMessage(player, `エネルギーブロックを配置: ${block.typeId}`);
    }

    // ========== ブロック破壊ハンドラー ==========

    handleEnergyBlockBreak(typeId, location, dimension, brokenPermutation) {
        // 発電機の場合
        if (typeId === Constants.BLOCK_TYPES.GENERATOR || typeId === Constants.BLOCK_TYPES.THERMAL_GENERATOR) {
            generator.unregisterGenerator(location, dimension);
        }
        // クリエイティブ発電機の場合
        else if (typeId === Constants.BLOCK_TYPES.CREATIVE_GENERATOR) {
            creativeGenerator.unregisterGenerator(location, dimension);
        }
        // バッテリーの場合
        else if (BlockTypeUtils.isBattery(typeId)) {
            // バッテリーの場合は特別な処理（残量を保持してドロップ）
            this.dropBatteryWithEnergy(typeId, location, dimension);
            battery.unregisterBattery(location, dimension);
            
            // エネルギーデータをクリアして終了
            energySystem.clearEnergy(location, dimension);
            mfCableSystem.onBlockRemoved(location, dimension);
            return; // ここで処理を終了
        }
        // 電気炉の場合
        else if (typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE) {
            electricFurnace.cleanup(location, dimension);
            
            // 隣接するパイプを更新
            this.updateAdjacentPipesAtLocation(location, dimension);
        }
        // ゼーベック発電機の場合
        else if (typeId === 'magisystem:seebeck_generator') {
            seebeckGenerator.unregisterSeebeckGenerator(location, dimension);
        } else {
            // 他のエネルギーブロックは通常のドロップ
            this.dropStoredEnergy(location, dimension, brokenPermutation);
        }
        
        // エネルギーデータをクリア
        energySystem.clearEnergy(location, dimension);
        
        // 隣接するケーブルを更新
        mfCableSystem.onBlockRemoved(location, dimension);
    }

    // ========== ユーティリティメソッド ==========

    /**
     * 保存されたエネルギーをドロップ
     */
    dropStoredEnergy(location, dimension, brokenPermutation) {
        // 保存されたエネルギーを取得
        const storedEnergy = this.getStoredEnergyFromLocation(location, dimension);
        
        if (storedEnergy > 0) {
            Logger.info(`エネルギードロップ: ${storedEnergy} MF at ${Utils.locationToKey(location)}`, this.name);
            
            // エネルギーアイテムとしてドロップする処理
            // TODO: エネルギークリスタルなどのアイテムとしてドロップ
            
            // 現在は単にログに記録
            BlockUtils.spawnParticle(
                { location, dimension },
                Constants.PARTICLES.ELECTRIC_SPARK,
                { count: Math.min(storedEnergy / 100, 10) }
            );
        }
    }

    /**
     * 位置からエネルギー量を取得
     */
    getStoredEnergyFromLocation(location, dimension) {
        try {
            const key = Utils.locationToKey(location);
            const obj = world.scoreboard.getObjective(Constants.SCOREBOARD.ENERGY_OBJECTIVE);
            if (!obj) return 0;
            
            const participants = obj.getParticipants();
            for (const participant of participants) {
                if (participant.displayName === key) {
                    return obj.getScore(participant) || 0;
                }
            }
        } catch (error) {
            Logger.debug(`エネルギー取得エラー: ${error}`, this.name);
        }
        return 0;
    }

    /**
     * バッテリーをエネルギー残量付きでドロップ
     */
    dropBatteryWithEnergy(typeId, location, dimension) {
        const storedEnergy = this.getStoredEnergyFromLocation(location, dimension);
        const batteryInfo = battery.getBatteryInfoFromType(typeId);
        
        if (!batteryInfo) return;
        
        // エネルギーが0の場合でも手動でドロップ（lootテーブルは無効化済み）
        if (storedEnergy === 0) {
            const itemStack = new ItemStack(typeId, 1);
            itemStack.setLore([
                `§7エネルギー: §f0/${batteryInfo.capacity} MF`,
                `§7充電率: §f0%`
            ]);
            dimension.spawnItem(itemStack, {
                x: location.x + 0.5,
                y: location.y + 0.5,
                z: location.z + 0.5
            });
            return;
        }
        
        // アイテムスタックを作成（ブロックIDと同じ）
        const itemStack = new ItemStack(typeId, 1);
        
        const energyPercent = Math.round((storedEnergy / batteryInfo.capacity) * 100);
        
        // スタックサイズが1なのでDynamic Propertiesが使える
        itemStack.setDynamicProperty('stored_energy', storedEnergy);
        itemStack.setDynamicProperty('max_energy', batteryInfo.capacity);
        
        // Loreに残量を表示
        const lore = [
            `§7エネルギー: §f${storedEnergy}/${batteryInfo.capacity} MF`,
            `§7充電率: §f${energyPercent}%`,
            `§8§o設置すると残量が復元されます`
        ];
        
        itemStack.setLore(lore);
        
        // nameTagを使用してエネルギー情報を表示
        const batteryName = this.getBatteryDisplayName(typeId);
        itemStack.nameTag = `§r${batteryName} §7[${energyPercent}%]`;
        
        // アイテムをドロップ
        dimension.spawnItem(itemStack, {
            x: location.x + 0.5,
            y: location.y + 0.5,
            z: location.z + 0.5
        });
        
        Logger.debug(`バッテリードロップ: ${storedEnergy}/${batteryInfo.capacity} MF`, this.name);
    }

    /**
     * バッテリータイプから表示名を取得
     */
    getBatteryDisplayName(typeId) {
        switch (typeId) {
            case Constants.BLOCK_TYPES.BATTERY_BASIC:
                return '基本バッテリー';
            case Constants.BLOCK_TYPES.BATTERY_ADVANCED:
                return '発展バッテリー';
            case Constants.BLOCK_TYPES.BATTERY_ULTIMATE:
                return '究極バッテリー';
            default:
                return 'バッテリー';
        }
    }
    
    /**
     * 隣接するパイプを更新
     * @param {Block} block
     */
    updateAdjacentPipes(block) {
        // 全キャッシュをクリア（確実に更新するため）
        itemPipeSystem.clearAllCache();
        
        const adjacents = [
            block.above(),
            block.below(),
            block.north(),
            block.south(),
            block.east(),
            block.west()
        ];
        
        for (const adjacent of adjacents) {
            if (adjacent && itemPipeSystem.isTransportBlock(adjacent)) {
                // 1tick後に更新（確実に反映させるため）
                system.runTimeout(() => {
                    itemPipeSystem.updatePattern(adjacent);
                }, 1);
            }
        }
    }
    
    /**
     * 特定位置の隣接するパイプを更新
     * @param {Vector3} location
     * @param {Dimension} dimension
     */
    updateAdjacentPipesAtLocation(location, dimension) {
        // 全キャッシュをクリア（確実に更新するため）
        itemPipeSystem.clearAllCache();
        
        const offsets = Object.values(Constants.DIRECTIONS);
        
        // 1tick後に更新（確実に反映させるため）
        system.runTimeout(() => {
            for (const offset of offsets) {
                const adjacentLocation = Utils.addLocation(location, offset);
                const adjacentBlock = Utils.getBlockSafe(dimension, adjacentLocation);
                
                if (adjacentBlock && itemPipeSystem.isTransportBlock(adjacentBlock)) {
                    itemPipeSystem.updatePattern(adjacentBlock);
                }
            }
        }, 1);
    }
}

// シングルトンインスタンスをエクスポート
export const blockEvents = new BlockEvents();