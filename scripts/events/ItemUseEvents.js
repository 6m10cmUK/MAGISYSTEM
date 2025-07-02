import { world, system } from "@minecraft/server";
import { BaseEventHandler } from "./BaseEventHandler.js";
import { storageBin } from "../machines/StorageBin.js";
import { Constants } from "../core/Constants.js";
import { Logger } from "../core/Logger.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { Utils } from "../core/Utils.js";

/**
 * アイテム使用イベントハンドラー
 * ストレージビンの右クリック処理を担当
 */
export class ItemUseEvents extends BaseEventHandler {
    constructor() {
        super("ItemUseEvents");
        this.processingBlocks = new Set(); // 処理中のブロックを追跡
    }

    /**
     * イベントハンドラーの設定
     */
    setupEventHandlers() {
        // ブロックに対するアイテム使用イベント（通常の右クリック）
        this.safeSubscribe(
            world.beforeEvents.itemUseOn,
            (event) => this.onItemUseOnBlock(event),
            "itemUseOn"
        );
        
        // プレイヤーがブロックと対話するイベント（素手の場合）
        this.safeSubscribe(
            world.beforeEvents.playerInteractWithBlock,
            (event) => this.onPlayerInteractWithBlock(event),
            "playerInteractWithBlock"
        );
    }

    /**
     * ブロックに対してアイテムを使用する前の処理
     * @param {Object} event 
     */
    onItemUseOnBlock(event) {
        const { source: player, block, itemStack } = event;
        
        // ストレージビンの場合
        if (block.typeId === Constants.BLOCK_TYPES.STORAGE_BIN) {
            Logger.debug(`ストレージビン右クリック: itemStack=${itemStack?.typeId || "素手"}, sneaking=${player.isSneaking}`, this.name);
            
            // レンチの場合は処理しない（レンチが優先）
            if (itemStack?.typeId === "magisystem:wrench") {
                return;
            }
            
            // 重複処理を防ぐ
            const blockKey = Utils.locationToKey(block.location);
            if (this.processingBlocks.has(blockKey)) {
                event.cancel = true;
                return;
            }
            
            // アイテムを持っている場合は登録
            if (itemStack) {
                event.cancel = true;
                this.processingBlocks.add(blockKey);
                
                // 次のtickで処理を実行
                system.run(() => {
                    this.handleStorageRegister(block, player, itemStack);
                    // 処理完了後にフラグを解除
                    system.runTimeout(() => {
                        this.processingBlocks.delete(blockKey);
                    }, 10); // 0.5秒後に解除
                });
            }
        }
    }

    /**
     * プレイヤーがブロックと対話する時の処理（主に素手用）
     * @param {Object} event 
     */
    onPlayerInteractWithBlock(event) {
        const { player, block } = event;
        
        // ストレージビンの場合
        if (block.typeId === Constants.BLOCK_TYPES.STORAGE_BIN) {
            Logger.debug(`ストレージビン対話: player=${player.name}, sneaking=${player.isSneaking}`, this.name);
            
            // 手持ちアイテムを確認
            const equipment = player.getComponent("minecraft:equippable");
            const mainhand = equipment.getEquipment("Mainhand");
            
            // レンチの場合は処理しない
            if (mainhand?.typeId === "magisystem:wrench") {
                return;
            }
            
            // 重複処理を防ぐ
            const blockKey = Utils.locationToKey(block.location);
            if (this.processingBlocks.has(blockKey)) {
                event.cancel = true;
                return;
            }
            
            // 素手の場合はアイテムを取り出す
            if (!mainhand) {
                event.cancel = true;
                this.processingBlocks.add(blockKey);
                
                // 次のtickで処理を実行
                system.run(() => {
                    this.handleStorageExtract(block, player);
                    // 処理完了後にフラグを解除
                    system.runTimeout(() => {
                        this.processingBlocks.delete(blockKey);
                    }, 10); // 0.5秒後に解除
                });
            }
        }
    }

    /**
     * ストレージビンへのアイテム登録処理
     * @param {Block} block 
     * @param {Player} player 
     * @param {ItemStack} itemStack 
     */
    handleStorageRegister(block, player, itemStack) {
        ErrorHandler.safeTry(() => {
            // 全てのアイテムを登録可能にする
            storageBin.registerItem(block, player, itemStack);
            Logger.debug(`ストレージビンにアイテムを登録: ${itemStack.typeId}`, this.name);
        }, "ItemUseEvents.handleStorageRegister");
    }

    /**
     * ストレージビンからのアイテム取り出し処理
     * @param {Block} block 
     * @param {Player} player 
     */
    handleStorageExtract(block, player) {
        ErrorHandler.safeTry(() => {
            storageBin.extractItem(block, player);
            Logger.debug(`ストレージビンからアイテムを取り出し`, this.name);
        }, "ItemUseEvents.handleStorageExtract");
    }
}

// シングルトンインスタンスをエクスポート
export const itemUseEvents = new ItemUseEvents();