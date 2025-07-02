import { world, system } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";
import { displaySystem } from "../ui/DisplaySystem.js";
import { Constants } from "../core/Constants.js";
import { DisplayNameRegistry } from "../core/DisplayNameRegistry.js";

export class Wrench {
    static activeUIs = new Map(); // 表示用データ

    static register() {
        // itemUseイベント（BasicMachinery方式）
        world.afterEvents.itemUse.subscribe((event) => {
            if (event.itemStack?.typeId === "magisystem:wrench") {
                const player = event.source;
                const blockRay = player.getBlockFromViewDirection({ maxDistance: 5 });
                
                if (blockRay?.block) {
                    this.onWrenchUse({ block: blockRay.block, source: player });
                }
            }
        });

        // 表示更新タイマー（0.25秒ごと）
        system.runInterval(() => {
            this.updateActiveUIs();
        }, 5);

        // ActionBar表示システムを使用
        displaySystem.initialize();
    }

    static onWrenchUse(event) {
        const { block, source: player } = event;
        
        if (!block || !player) return;

        // ActionBar表示の開始
        if (block.typeId.includes("pipe")) {
            this.startBlockInspection(block, player, "item_network");
        } else if (block.typeId === Constants.BLOCK_TYPES.STORAGE_BIN) {
            this.startBlockInspection(block, player, "storage");
        } else if (energySystem.isEnergyBlock(block) || block.typeId.includes("cable")) {
            this.startBlockInspection(block, player, "energy");
        } else if (itemPipeSystem.hasInventory(block)) {
            this.startBlockInspection(block, player, "inventory");
        }

        // レンチ使用音
        player.playSound(Constants.SOUNDS.CLICK, { volume: 0.5 });
    }

    static startBlockInspection(block, player, type) {
        const playerKey = player.id;
        
        // 既存のUIを停止
        this.activeUIs.delete(playerKey);
        
        // 新しいUIデータを登録
        this.activeUIs.set(playerKey, {
            type: type,
            blockLocation: { 
                x: block.location.x, 
                y: block.location.y, 
                z: block.location.z 
            },
            blockType: block.typeId,
            player: player
        });
        
        // ActionBar表示を開始
        displaySystem.startDisplay(player, block, type);
    }

    static updateActiveUIs() {
        // ActionBar表示システムが自動更新を行うので、ここでは何もしない
    }
}

export default Wrench;