/**
 * MAGISYSTEM ブロックイベントハンドラー
 * BaseEventHandlerを継承した統一的な実装
 */

import { world, ItemStack } from "@minecraft/server";
import { BaseEventHandler } from "./BaseEventHandler.js";
import { energySystem } from "../energy/EnergySystem.js";
import { generator } from "../machines/Generator.js";
import { creativeGenerator } from "../machines/CreativeGenerator.js";
import { battery } from "../machines/Battery.js";
import { mfCableSystem } from "../cables/MFCableSystem.js";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";
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
            [Constants.BLOCK_TYPES.CREATIVE_GENERATOR, this.handleCreativeGeneratorPlace.bind(this)],
            [Constants.BLOCK_TYPES.CABLE, this.handleCablePlace.bind(this)],
            [Constants.BLOCK_TYPES.CABLE_INPUT, this.handleCablePlace.bind(this)],
            [Constants.BLOCK_TYPES.CABLE_OUTPUT, this.handleCablePlace.bind(this)],
            [Constants.BLOCK_TYPES.PIPE, this.handlePipePlace.bind(this)],
            [Constants.BLOCK_TYPES.PIPE_INPUT, this.handlePipePlace.bind(this)],
            [Constants.BLOCK_TYPES.PIPE_OUTPUT, this.handlePipePlace.bind(this)],
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
        this.handleMachinePlace(block, player, generator, "発電機");
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
        machineSystem.register ? machineSystem.register(block) : 
                                machineSystem.registerGenerator ? machineSystem.registerGenerator(block) :
                                machineSystem.registerBattery(block);
        BlockUtils.playSound(block, Constants.SOUNDS.BLOCK_PLACE, { volume: 0.8 });
        mfCableSystem.updateAdjacentBlocks(block);
        this.sendDebugMessage(player, `${displayName}を配置: ${Utils.locationToKey(block.location)}`);
    }

    handleCablePlace(block, player) {
        mfCableSystem.onBlockPlaced(block);
        BlockUtils.playSound(block, Constants.SOUNDS.BLOCK_PLACE, { volume: 0.5 });
        this.sendDebugMessage(player, `ケーブルを配置: ${block.typeId}`);
    }

    handlePipePlace(block, player) {
        itemPipeSystem.onBlockPlaced(block);
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
        if (typeId === Constants.BLOCK_TYPES.GENERATOR) {
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
}

// シングルトンインスタンスをエクスポート
export const blockEvents = new BlockEvents();