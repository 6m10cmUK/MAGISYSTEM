import { world, ItemStack, system } from "@minecraft/server";
import { Logger } from "../core/Logger.js";
import { Constants } from "../core/Constants.js";
import { ErrorHandler } from "../core/ErrorHandler.js";

/**
 * チョークシステム
 * ブロック上面に魔法陣を描く
 */
export class Chalk {
    constructor() {
        Logger.info("チョークシステムを初期化中...", "Chalk");
        this.lastUseLocation = new Map(); // 座標ごとの最終使用時刻
        this.subscription = null; // イベントサブスクリプションを保持
        this.itemUseSubscription = null; // アイテム使用イベントサブスクリプション
        this.playerModes = new Map(); // プレイヤーごとの魔法陣モード
        this.modes = ["basic", "fire", "water", "air", "earth"]; // 利用可能なモード
        try {
            this.registerEvents();
            Logger.info("チョークシステムの初期化完了", "Chalk");
        } catch (error) {
            Logger.error(`チョークシステムの初期化エラー: ${error}`, "Chalk");
        }
    }

    /**
     * イベントを登録
     */
    registerEvents() {
        Logger.info("チョークイベントを登録中...", "Chalk");
        
        // 既存のサブスクリプションがあれば解除
        if (this.subscription) {
            world.beforeEvents.itemUseOn.unsubscribe(this.subscription);
            this.subscription = null;
        }
        if (this.itemUseSubscription) {
            world.beforeEvents.itemUse.unsubscribe(this.itemUseSubscription);
            this.itemUseSubscription = null;
        }
        
        // beforeEventsですべての処理を行う
        this.subscription = world.beforeEvents.itemUseOn.subscribe((event) => {
            const { source: player, itemStack } = event;
            
            if (itemStack && itemStack.typeId === "magisystem:chalk") {
                // ログを削除してパフォーマンスを改善
                
                // デフォルトの動作をキャンセル
                event.cancel = true;
                
                // スニーク中はモード変更のみで魔法陣を描かない
                if (player.isSneaking) {
                    return;
                }
                
                // ブロック上面の判定
                const block = event.block;
                if (!this.canDrawOnBlock(block)) {
                    return;
                }
                
                // 座標ベースのクールダウンチェック
                const locationKey = `${block.location.x},${block.location.y},${block.location.z}`;
                const currentTime = Date.now();
                const lastTime = this.lastUseLocation.get(locationKey) || 0;
                
                if (currentTime - lastTime < 1000) { // 1000ms = 1秒のクールダウン
                    return;
                }
                
                this.lastUseLocation.set(locationKey, currentTime);
                
                // チョーク処理を実行（次のtickで）
                ErrorHandler.safeTry(() => {
                    // チョークと判定されました
                    // 次のtickで処理を実行
                    system.run(() => {
                        this.handleChalkUse({
                            source: player,
                            itemStack: itemStack,
                            block: event.block,
                            blockFace: event.blockFace
                        });
                    });
                }, "Chalk.handleChalkUse");
            }
        });
        
        // スニーククリックでモード切り替え
        this.itemUseSubscription = world.beforeEvents.itemUse.subscribe((event) => {
            const { source: player, itemStack } = event;
            
            if (itemStack && itemStack.typeId === "magisystem:chalk" && player.isSneaking) {
                event.cancel = true;
                
                // モード切り替え処理
                system.run(() => {
                    this.switchMode(player, itemStack);
                });
            }
        });
        
        Logger.info("チョークイベントを登録完了", "Chalk");
    }

    /**
     * ブロックに魔法陣を描けるかチェック
     * @param {Block} block - 対象ブロック
     * @returns {boolean} 描画可能かどうか
     */
    canDrawOnBlock(block) {
        const typeId = block.typeId;
        
        // 魔法陣ブロックには描画不可
        if (typeId.includes("magic_circle")) {
            return false;
        }
        
        // 上にブロックがある場合は描画不可
        const aboveLocation = {
            x: block.location.x,
            y: block.location.y + 1,
            z: block.location.z
        };
        const aboveBlock = block.dimension.getBlock(aboveLocation);
        if (aboveBlock && aboveBlock.typeId !== "minecraft:air") {
            return false;
        }
        
        return true;
    }
    
    /**
     * チョーク使用処理
     * @param {Object} event - イベントデータ
     */
    handleChalkUse(event) {
        const { source: player, itemStack, block, blockFace } = event;
        
        // チョーク使用: 面=${blockFace}
        
        // 上面のみに設置可能
        if (blockFace === "Up") {
            this.drawMagicCircle(event);
        }
    }
    
    /**
     * 魔法陣を描く
     * @param {Object} event - イベントデータ
     */
    drawMagicCircle(event) {
        const { source: player, itemStack, block } = event;
        
        // 設置位置（ブロックの上）
        const location = {
            x: block.location.x,
            y: block.location.y + 1,
            z: block.location.z
        };
        
        // 既に何かブロックが存在するかチェック
        const aboveBlock = block.dimension.getBlock(location);
        if (aboveBlock && aboveBlock.typeId !== "minecraft:air") {
            Logger.info("設置位置に既にブロックが存在します", "Chalk");
            return;
        }
        
        try {
            // 現在のモードを取得
            const mode = this.getCurrentMode(player);
            const blockType = `magisystem:magic_circle_${mode}`;
            
            // dimensionから直接ブロックを設置
            block.dimension.setBlockType(location, blockType);
            Logger.info(`魔法陣を描きました: ${location.x}, ${location.y}, ${location.z} (モード: ${mode})`, "Chalk");
            
            // 描画音を再生
            player.playSound("item.book.page_turn");
            
            // チョークの耐久値を減らす
            this.reduceDurability(itemStack, player);
        } catch (error) {
            Logger.error(`魔法陣の描画に失敗: ${error}`, "Chalk");
        }
    }

    /**
     * チョークの耐久値を減らす
     * @param {ItemStack} itemStack - アイテムスタック
     * @param {Player} player - プレイヤー
     */
    reduceDurability(itemStack, player) {
        try {
            // 現在の耐久値を取得
            const durabilityComponent = itemStack.getComponent("minecraft:durability");
            if (!durabilityComponent) {
                Logger.warn("耐久値コンポーネントが見つかりません", "Chalk");
                return;
            }

            const currentDamage = durabilityComponent.damage || 0;
            const maxDurability = durabilityComponent.maxDurability;
            
            Logger.info(`現在の耐久値: ${maxDurability - currentDamage}/${maxDurability}`, "Chalk");
            
            // 耐久値を1減らす（ダメージを1増やす）
            const newDamage = currentDamage + 1;
            
            if (newDamage >= maxDurability) {
                // チョークが壊れた
                Logger.info("チョークが使い切られました", "Chalk");
                player.playSound("random.break");
                
                // アイテムを削除
                const inventory = player.getComponent("minecraft:inventory");
                if (inventory && inventory.container) {
                    const selectedSlot = player.selectedSlotIndex;
                    inventory.container.setItem(selectedSlot, undefined);
                }
            } else {
                // 耐久値を更新
                durabilityComponent.damage = newDamage;
                const remainingUses = maxDurability - newDamage;
                Logger.info(`耐久値を更新: ${remainingUses}/${maxDurability}`, "Chalk");
                
                // インベントリのアイテムを更新
                const inventory = player.getComponent("minecraft:inventory");
                if (inventory && inventory.container) {
                    const selectedSlot = player.selectedSlotIndex;
                    inventory.container.setItem(selectedSlot, itemStack);
                }
            }
        } catch (error) {
            Logger.error(`耐久値の更新に失敗: ${error}`, "Chalk");
        }
    }
    
    /**
     * モード切り替え処理
     * @param {Player} player - プレイヤー
     * @param {ItemStack} itemStack - アイテムスタック
     */
    switchMode(player, itemStack) {
        try {
            const currentMode = this.getCurrentMode(player);
            const currentIndex = this.modes.indexOf(currentMode);
            const nextIndex = (currentIndex + 1) % this.modes.length;
            const nextMode = this.modes[nextIndex];
            
            // モードを更新
            this.playerModes.set(player.id, nextMode);
            
            // アイテム名を更新
            const modeNames = {
                "basic": "基本",
                "fire": "火",
                "water": "水",
                "air": "空気",
                "earth": "大地"
            };
            
            itemStack.nameTag = `チョーク (${modeNames[nextMode]})`;
            
            // インベントリのアイテムを更新
            const inventory = player.getComponent("minecraft:inventory");
            if (inventory && inventory.container) {
                const selectedSlot = player.selectedSlotIndex;
                inventory.container.setItem(selectedSlot, itemStack);
            }
            
            // プレイヤーに通知
            player.sendMessage(`チョークモード: ${modeNames[nextMode]}`);
            player.playSound("random.click");
            
            Logger.info(`プレイヤー ${player.name} がチョークモードを ${nextMode} に変更`, "Chalk");
        } catch (error) {
            Logger.error(`モード切り替えエラー: ${error}`, "Chalk");
        }
    }
    
    /**
     * 現在のモードを取得
     * @param {Player} player - プレイヤー
     * @returns {string} 現在のモード
     */
    getCurrentMode(player) {
        return this.playerModes.get(player.id) || "basic";
    }
}

// シングルトンインスタンス
export const chalk = new Chalk();