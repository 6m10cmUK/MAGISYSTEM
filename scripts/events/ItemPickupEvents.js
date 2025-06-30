/**
 * MAGISYSTEM アイテム拾得イベントハンドラー
 * 発電機の表示アイテムを拾えないようにする
 */

import { world } from "@minecraft/server";
import { BaseEventHandler } from "./BaseEventHandler.js";
import { Logger } from "../core/Logger.js";
import { ErrorHandler } from "../core/ErrorHandler.js";

export class ItemPickupEvents extends BaseEventHandler {
    constructor() {
        super("ItemPickupEvents");
    }

    /**
     * イベントハンドラーの設定
     */
    setupEventHandlers() {
        // アイテム使用前イベント（拾う前）
        this.safeSubscribe(
            world.beforeEvents.itemUse,
            (event) => this.onBeforeItemUse(event),
            "beforeItemUse"
        );

        // エンティティヒットイベント（プレイヤーがアイテムに接触）
        this.safeSubscribe(
            world.afterEvents.entityHitEntity,
            (event) => this.onEntityHit(event),
            "entityHitEntity"
        );
    }

    /**
     * アイテム使用前の処理
     */
    onBeforeItemUse(event) {
        ErrorHandler.safeTry(() => {
            // 発電機表示アイテムの拾得を防ぐ処理
            // ※この実装は将来のAPI拡張に備えた予約
        }, "ItemPickupEvents.onBeforeItemUse");
    }

    /**
     * エンティティヒット時の処理
     */
    onEntityHit(event) {
        ErrorHandler.safeTry(() => {
            const { damagingEntity, hitEntity } = event;
            
            // プレイヤーがアイテムエンティティに接触した場合
            if (damagingEntity?.typeId === "minecraft:player" && 
                hitEntity?.typeId === "minecraft:item") {
                
                // generator_displayタグを持つアイテムは拾えないようにする
                if (hitEntity.hasTag("generator_display")) {
                    // アイテムを元の位置に戻す
                    const posTag = hitEntity.getTags().find(tag => tag.startsWith("generator_"));
                    if (posTag) {
                        const parts = posTag.split("_");
                        if (parts.length === 4) {
                            const x = parseFloat(parts[1]);
                            const y = parseFloat(parts[2]);
                            const z = parseFloat(parts[3]);
                            
                            hitEntity.teleport({
                                x: x + 0.5,
                                y: y + 0.5,
                                z: z + 0.5
                            });
                        }
                    }
                }
            }
        }, "ItemPickupEvents.onEntityHit");
    }
}

// シングルトンインスタンスをエクスポート
export const itemPickupEvents = new ItemPickupEvents();