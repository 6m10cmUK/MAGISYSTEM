import { world, system } from "@minecraft/server";
import { Logger } from "../core/Logger.js";
import { Constants } from "../core/Constants.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { mfCableSystem } from "../cables/MFCableSystem.js";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";
import { itemTransportManager } from "../items/ItemTransportManager.js";

/**
 * レンチシステム
 * エネルギーケーブルとアイテムパイプのモード変換機能（右クリック）
 */
export class Wrench {
    constructor() {
        Logger.info("レンチシステムを初期化中...", "Wrench");
        this.registerEvents();
    }

    /**
     * イベントを登録
     */
    registerEvents() {
        Logger.info("レンチイベントを登録中...", "Wrench");
        
        // プレイヤーがブロックを右クリックしたときのイベント（beforeEvents）
        world.beforeEvents.itemUseOn.subscribe((event) => {
            ErrorHandler.safeTry(() => {
                const { source: player, itemStack } = event;
                // レンチの場合のみ処理
                if (itemStack && itemStack.typeId === Constants.ITEMS.WRENCH) {
                    this.handleWrenchUse(event);
                }
            }, "Wrench.handleWrenchUse");
        });
        
        Logger.info("レンチイベントを登録完了", "Wrench");
    }

    /**
     * レンチ使用処理
     * @param {ItemUseOnBeforeEvent} event - イベント
     */
    handleWrenchUse(event) {
        const { source: player, itemStack, block } = event;
        
        Logger.debug(`レンチ使用: ブロック=${block.typeId}`, "Wrench");

        // エネルギーケーブルまたはアイテムパイプかチェック
        const isEnergyCable = this.isEnergyCable(block.typeId);
        const isItemPipe = this.isItemPipe(block.typeId);
        
        if (!isEnergyCable && !isItemPipe) {
            Logger.debug(`対象ブロックではない: ${block.typeId}`, "Wrench");
            return;
        }

        // イベントをキャンセルして独自処理を実行
        event.cancel = true;
        
        Logger.debug("モード変換を実行", "Wrench");
        // 次のtickで実行
        system.run(() => {
            if (isEnergyCable) {
                this.convertCableMode(block, player);
            } else if (isItemPipe) {
                this.convertPipeMode(block, player);
            }
        });
    }

    /**
     * エネルギーケーブルかどうか判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean} エネルギーケーブルかどうか
     */
    isEnergyCable(typeId) {
        return typeId === Constants.BLOCK_TYPES.CABLE || 
               typeId === Constants.BLOCK_TYPES.CABLE_INPUT || 
               typeId === Constants.BLOCK_TYPES.CABLE_OUTPUT;
    }

    /**
     * アイテムパイプかどうか判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean} アイテムパイプかどうか
     */
    isItemPipe(typeId) {
        return typeId === Constants.BLOCK_TYPES.PIPE || 
               typeId === Constants.BLOCK_TYPES.PIPE_INPUT || 
               typeId === Constants.BLOCK_TYPES.PIPE_OUTPUT;
    }

    /**
     * ケーブルモードを変換
     * @param {Block} block - 対象ブロック
     * @param {Player} player - プレイヤー
     */
    convertCableMode(block, player) {
        const currentType = block.typeId;
        let nextType;

        Logger.debug(`現在のケーブル: ${currentType}`, "Wrench");

        // 通常→入力→出力→通常のサイクル
        switch (currentType) {
            case Constants.BLOCK_TYPES.CABLE:
                nextType = Constants.BLOCK_TYPES.CABLE_INPUT;
                break;
            case Constants.BLOCK_TYPES.CABLE_INPUT:
                nextType = Constants.BLOCK_TYPES.CABLE_OUTPUT;
                break;
            case Constants.BLOCK_TYPES.CABLE_OUTPUT:
                nextType = Constants.BLOCK_TYPES.CABLE;
                break;
            default:
                Logger.debug(`不明なケーブルタイプ: ${currentType}`, "Wrench");
                return;
        }

        Logger.debug(`変更先: ${nextType}`, "Wrench");

        try {
            // 新しいブロックを設置
            block.setType(nextType);
            
            // 接続状態を復元
            const newBlock = block.dimension.getBlock(block.location);
            if (newBlock) {
                Logger.debug("接続パターンを更新", "Wrench");
                // 接続パターンを更新
                mfCableSystem.updatePattern(newBlock, true);
                
                // 成功メッセージを表示
                const modeNames = {
                    [Constants.BLOCK_TYPES.CABLE]: "通常モード",
                    [Constants.BLOCK_TYPES.CABLE_INPUT]: "入力モード",
                    [Constants.BLOCK_TYPES.CABLE_OUTPUT]: "出力モード"
                };
                
                player.sendMessage(`§a[レンチ] ケーブルを${modeNames[nextType]}に変更しました`);
                Logger.debug(`ケーブルモード変更成功: ${currentType} → ${nextType}`, "Wrench");
            } else {
                Logger.error("新しいブロックの取得に失敗", "Wrench");
            }
        } catch (error) {
            player.sendMessage(`§c[レンチ] ケーブルモードの変更に失敗しました`);
            Logger.error(`ケーブルモード変更エラー: ${error}`, "Wrench");
        }
    }

    /**
     * パイプモードを変換
     * @param {Block} block - 対象ブロック
     * @param {Player} player - プレイヤー
     */
    convertPipeMode(block, player) {
        const currentType = block.typeId;
        let nextType;

        Logger.debug(`現在のパイプ: ${currentType}`, "Wrench");

        // 通常→入力→出力→通常のサイクル
        switch (currentType) {
            case Constants.BLOCK_TYPES.PIPE:
                nextType = Constants.BLOCK_TYPES.PIPE_INPUT;
                break;
            case Constants.BLOCK_TYPES.PIPE_INPUT:
                nextType = Constants.BLOCK_TYPES.PIPE_OUTPUT;
                break;
            case Constants.BLOCK_TYPES.PIPE_OUTPUT:
                nextType = Constants.BLOCK_TYPES.PIPE;
                break;
            default:
                Logger.debug(`不明なパイプタイプ: ${currentType}`, "Wrench");
                return;
        }

        Logger.debug(`変更先: ${nextType}`, "Wrench");

        try {
            // 新しいブロックを設置
            block.setType(nextType);
            
            // 接続状態を復元
            const newBlock = block.dimension.getBlock(block.location);
            if (newBlock) {
                Logger.debug("パイプ接続パターンを更新", "Wrench");
                // 接続パターンを更新
                itemPipeSystem.updatePattern(newBlock, true);
                
                // 出力パイプに変換した場合は、ItemTransportManagerに登録
                if (nextType === Constants.BLOCK_TYPES.PIPE_OUTPUT) {
                    itemTransportManager.onPipePlaced(newBlock);
                } else if (currentType === Constants.BLOCK_TYPES.PIPE_OUTPUT) {
                    // 出力パイプから他のモードに変換した場合は登録解除
                    itemTransportManager.onPipeRemoved(block.location, block.dimension);
                }
                
                // 成功メッセージを表示
                const modeNames = {
                    [Constants.BLOCK_TYPES.PIPE]: "通常モード",
                    [Constants.BLOCK_TYPES.PIPE_INPUT]: "入力モード",
                    [Constants.BLOCK_TYPES.PIPE_OUTPUT]: "出力モード"
                };
                
                player.sendMessage(`§a[レンチ] パイプを${modeNames[nextType]}に変更しました`);
                Logger.debug(`パイプモード変更成功: ${currentType} → ${nextType}`, "Wrench");
            } else {
                Logger.error("新しいパイプブロックの取得に失敗", "Wrench");
            }
        } catch (error) {
            player.sendMessage(`§c[レンチ] パイプモードの変更に失敗しました`);
            Logger.error(`パイプモード変更エラー: ${error}`, "Wrench");
        }
    }
}

// シングルトンインスタンス
export const wrench = new Wrench();