import { world, system, ItemStack } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import { generator } from "../machines/Generator.js";
import { creativeGenerator } from "../machines/CreativeGenerator.js";
import { battery } from "../machines/Battery.js";
import { itemNetwork } from "../items/ItemNetwork.js";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";

/**
 * Alchemistry Energy風の表示システム
 * アイテムのLoreとActionBarを組み合わせた表示
 */
export class DisplaySystem {
    constructor() {
        this.activeDisplays = new Map(); // プレイヤーID -> 表示データ
        this.updateInterval = 5; // 0.25秒ごとに更新
    }

    /**
     * 初期化
     */
    initialize() {
        // 更新タイマーを開始
        system.runInterval(() => {
            this.updateAllDisplays();
        }, this.updateInterval);
    }

    /**
     * プレイヤーの表示を開始
     */
    startDisplay(player, block, type) {
        const playerId = player.id;

        // 既存の表示をクリア
        this.clearDisplay(player);

        // 新しい表示データを登録
        this.activeDisplays.set(playerId, {
            player: player,
            block: block,
            blockLocation: {
                x: block.location.x,
                y: block.location.y,
                z: block.location.z
            },
            blockType: block.typeId,
            displayType: type,
            lastUpdate: system.currentTick
        });

        // 初回表示
        this.updateDisplay(playerId);
    }

    /**
     * 表示を更新
     */
    updateDisplay(playerId) {
        const displayData = this.activeDisplays.get(playerId);
        if (!displayData) return;

        const { player, block, displayType } = displayData;

        // プレイヤーが見ているブロックを確認
        const blockRay = player.getBlockFromViewDirection({ maxDistance: 10 });
        
        // 登録されたブロックを見ていない場合は表示停止
        if (!blockRay?.block || 
            blockRay.block.location.x !== displayData.blockLocation.x ||
            blockRay.block.location.y !== displayData.blockLocation.y ||
            blockRay.block.location.z !== displayData.blockLocation.z) {
            this.clearDisplay(player);
            return;
        }

        // 表示タイプに応じて更新
        switch (displayType) {
            case "energy":
                this.updateEnergyDisplay(player, block);
                break;
            case "item_network":
                this.updateItemNetworkDisplay(player, block);
                break;
            case "inventory":
                this.updateInventoryDisplay(player, block);
                break;
        }
    }

    /**
     * エネルギー情報を表示
     */
    updateEnergyDisplay(player, block) {

        const typeId = block.typeId;
        let displayText = "";

        if (energySystem.isEnergyBlock(block)) {
            const energy = energySystem.getEnergy(block);
            const maxEnergy = energySystem.getMaxCapacity(block);
            const percent = Math.round((energy / maxEnergy) * 100);

            // 基本情報
            displayText = `§e${this.getBlockDisplayName(typeId)}\n`;
            displayText += `§7エネルギー: §f${this.formatNumber(energy)}/${this.formatNumber(maxEnergy)} MF\n`;
            displayText += `§7充電率: §f${percent}%`;

            // 発電機の追加情報
            if (typeId === "magisystem:generator") {
                const genInfo = generator.getGeneratorInfo(block);
                if (genInfo) {
                    displayText += `\n§7状態: ${genInfo.isActive ? "§a稼働中" : "§c停止中"}`;
                    if (genInfo.isActive) {
                        displayText += `\n§7発電: §a${generator.generationRate * 20} MF/秒`;
                    }
                }
            } else if (typeId === "magisystem:creative_generator") {
                displayText += `\n§7状態: §a常時稼働`;
                displayText += `\n§7発電: §a${creativeGenerator.generationRate * 20} MF/秒`;
            }
        } else if (typeId === "magisystem:cable") {
            const networkInfo = energyNetwork.analyzeNetwork(block);
            displayText = `§eエネルギーケーブル\n`;
            if (networkInfo) {
                displayText += `§7ネットワーク: §f${networkInfo.totalBlocks}ブロック\n`;
                displayText += `§7発電機: §a${networkInfo.generators.length}個 §7バッテリー: §b${networkInfo.storages.length}個`;
            } else {
                displayText += `§c未接続`;
            }
        }

        // ActionBarに表示
        if (displayText) {
            player.onScreenDisplay.setActionBar(displayText.replace(/\n/g, " §r| "));
        }
    }

    /**
     * アイテムネットワーク情報を表示
     */
    updateItemNetworkDisplay(player, block) {

        const network = itemNetwork.findConnectedNetwork(block, false);
        const connectionInfo = itemPipeSystem.getConnectionInfo(block);

        let displayText = `§e${this.getBlockDisplayName(block.typeId)}\n`;
        displayText += `§7接続数: §f${connectionInfo?.count || 0}方向\n`;
        displayText += `§7ネットワーク: §f${network.size}個のインベントリ`;

        player.onScreenDisplay.setActionBar(displayText.replace(/\n/g, " §r| "));
    }

    /**
     * インベントリ情報を表示
     */
    updateInventoryDisplay(player, block) {
        const inventory = itemNetwork.getInventory(block);

        if (inventory) {
            let itemCount = 0;
            let slotCount = 0;

            for (let i = 0; i < inventory.size; i++) {
                const item = inventory.getItem(i);
                if (item) {
                    itemCount += item.amount;
                    slotCount++;
                }
            }

            let displayText = `§e${this.getBlockDisplayName(block.typeId)}\n`;
            displayText += `§7アイテム: §f${itemCount}個 §7スロット: §f${slotCount}/${inventory.size}`;

            player.onScreenDisplay.setActionBar(displayText.replace(/\n/g, " §r| "));
        }
    }

    /**
     * すべての表示を更新
     */
    updateAllDisplays() {
        for (const [playerId, displayData] of this.activeDisplays) {
            try {
                const player = world.getPlayers().find(p => p.id === playerId);
                if (!player) {
                    this.activeDisplays.delete(playerId);
                    continue;
                }

                this.updateDisplay(playerId);
            } catch (error) {
                this.activeDisplays.delete(playerId);
            }
        }
    }

    /**
     * 表示をクリア
     */
    clearDisplay(player) {
        const playerId = player.id;
        this.activeDisplays.delete(playerId);
        
        // ActionBarをクリア
        try {
            player.onScreenDisplay.setActionBar("");
        } catch {}
    }

    /**
     * 数値をフォーマット（K, M, B表記）
     */
    formatNumber(num) {
        if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    }

    /**
     * ブロック表示名を取得
     */
    getBlockDisplayName(typeId) {
        const names = {
            "magisystem:generator": "発電機",
            "magisystem:creative_generator": "クリエイティブ発電機",
            "magisystem:battery_basic": "基本バッテリー",
            "magisystem:battery_advanced": "発展バッテリー",
            "magisystem:battery_ultimate": "究極バッテリー",
            "magisystem:cable": "エネルギーケーブル",
            "magisystem:pipe": "アイテムパイプ",
            "magisystem:pipe_input": "入力パイプ",
            "magisystem:pipe_output": "出力パイプ",
            "minecraft:chest": "チェスト",
            "minecraft:barrel": "樽",
            "minecraft:furnace": "かまど",
            "minecraft:blast_furnace": "溶鉱炉",
            "minecraft:smoker": "燻製器",
            "minecraft:hopper": "ホッパー",
            "minecraft:dropper": "ドロッパー",
            "minecraft:dispenser": "ディスペンサー"
        };
        
        return names[typeId] || typeId;
    }
}

// シングルトンインスタンスをエクスポート
export const displaySystem = new DisplaySystem();