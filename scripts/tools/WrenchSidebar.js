import { world } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import { generator } from "../machines/Generator.js";
import { creativeGenerator } from "../machines/CreativeGenerator.js";
import { battery } from "../machines/Battery.js";
import { itemNetwork } from "../items/ItemNetwork.js";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";
import { sidebarDisplay } from "../ui/SidebarDisplay.js";

/**
 * Wrench用のサイドバー表示更新メソッド
 */
export class WrenchSidebar {
    static updateActiveUIs(activeUIs) {
        for (const [playerKey, uiData] of activeUIs) {
            try {
                const player = world.getPlayers().find(p => p.id === playerKey);
                if (!player) {
                    activeUIs.delete(playerKey);
                    sidebarDisplay.clearDisplay(player);
                    continue;
                }

                // プレイヤーが見ているブロックを取得
                const blockRay = player.getBlockFromViewDirection({ maxDistance: 10 });
                
                // 登録されたブロックを見ていない場合は表示停止
                if (!blockRay?.block || 
                    blockRay.block.location.x !== uiData.blockLocation.x ||
                    blockRay.block.location.y !== uiData.blockLocation.y ||
                    blockRay.block.location.z !== uiData.blockLocation.z) {
                    // サイドバーをクリアして削除
                    sidebarDisplay.clearDisplay(player);
                    activeUIs.delete(playerKey);
                    continue;
                }

                const block = blockRay.block;
                if (block.typeId !== uiData.blockType) {
                    sidebarDisplay.clearDisplay(player);
                    activeUIs.delete(playerKey);
                    continue;
                }

                // プレイヤーがブロックを見ている間だけ情報表示
                if (uiData.type === "energy") {
                    this.updateEnergySidebar(block, player);
                } else if (uiData.type === "item_network") {
                    this.updateItemNetworkSidebar(block, player);
                } else if (uiData.type === "inventory") {
                    this.updateInventorySidebar(block, player);
                }
            } catch (error) {
                const player = world.getPlayers().find(p => p.id === playerKey);
                if (player) {
                    sidebarDisplay.clearDisplay(player);
                }
                activeUIs.delete(playerKey);
            }
        }
    }

    static updateEnergySidebar(block, player) {
        const typeId = block.typeId;
        const lines = [];
        
        if (energySystem.isEnergyBlock(block)) {
            const energy = energySystem.getEnergy(block);
            const maxEnergy = energySystem.getMaxCapacity(block);
            const percent = Math.round((energy / maxEnergy) * 100);
            
            lines.push(`§e=== ${this.getBlockDisplayName(typeId)} ===`);
            lines.push(`§7エネルギー: §f${energy}/${maxEnergy} MF`);
            lines.push(`§7充電率: §f${percent}%`);
            
            if (typeId === "magisystem:generator") {
                const genInfo = generator.getGeneratorInfo(block);
                lines.push(`§7状態: ${genInfo?.isActive ? "§a稼働中" : "§c停止中"}`);
                if (genInfo?.isActive) {
                    lines.push(`§7発電量: §a${generator.generationRate * 20} MF/秒`);
                    lines.push(`§7燃焼時間: §f${Math.ceil(genInfo.burnTime / 20)}秒`);
                }
            } else if (typeId === "magisystem:creative_generator") {
                lines.push(`§7状態: §a常時稼働中`);
                lines.push(`§7発電量: §a${creativeGenerator.generationRate * 20} MF/秒`);
                lines.push(`§7モード: §bクリエイティブ`);
            } else if (typeId.includes("battery")) {
                const batteryInfo = battery.getBatteryInfo(block);
                if (batteryInfo) {
                    lines.push(`§7転送速度: §f${batteryInfo.transferRate} MF/秒`);
                }
            }
            
            // 入出力情報
            const canInput = energySystem.canInput(block) ? "§a可能" : "§c不可";
            const canOutput = energySystem.canOutput(block) ? "§a可能" : "§c不可";
            lines.push(`§7入力: ${canInput} §7出力: ${canOutput}`);
            
        } else if (typeId === "magisystem:cable") {
            const networkInfo = energyNetwork.analyzeNetwork(block);
            lines.push(`§e=== エネルギーケーブル ===`);
            
            if (networkInfo) {
                lines.push(`§7ネットワーク規模: §f${networkInfo.totalBlocks}ブロック`);
                lines.push(`§7発電機: §a${networkInfo.generators.length}個`);
                lines.push(`§7バッテリー: §b${networkInfo.storages.length}個`);
                lines.push(`§7消費機器: §c${networkInfo.consumers.length}個`);
                
                // 総発電量
                let totalGeneration = 0;
                networkInfo.generators.forEach(gen => {
                    const genInfo = generator.getGeneratorInfo(gen);
                    if (genInfo && genInfo.isActive) {
                        totalGeneration += generator.generationRate * 20;
                    }
                });
                if (totalGeneration > 0) {
                    lines.push(`§7総発電量: §a${totalGeneration} MF/秒`);
                }
            } else {
                lines.push(`§cネットワーク未接続`);
            }
        }
        
        sidebarDisplay.updateDisplay(player, lines);
    }

    static updateItemNetworkSidebar(block, player) {
        const typeId = block.typeId;
        const network = itemNetwork.findConnectedNetwork(block, false);
        const connectionInfo = itemPipeSystem.getConnectionInfo(block);
        const lines = [];
        
        lines.push(`§e=== ${this.getBlockDisplayName(typeId)} ===`);
        lines.push(`§7接続数: §f${connectionInfo?.count || 0}方向`);
        lines.push(`§7パターン: §f${this.getPatternName(connectionInfo?.pattern || "isolated")}`);
        lines.push(`§7ネットワーク規模: §f${network.size}個のインベントリ`);
        
        if (network.size > 0) {
            lines.push(`§7--- 接続インベントリ ---`);
            const inventoryTypes = new Map();
            for (const [key, inventoryBlock] of network) {
                const type = inventoryBlock.typeId;
                inventoryTypes.set(type, (inventoryTypes.get(type) || 0) + 1);
            }
            
            for (const [type, count] of inventoryTypes) {
                lines.push(`§7${this.getBlockDisplayName(type)}: §f${count}個`);
            }
        }
        
        sidebarDisplay.updateDisplay(player, lines);
    }

    static updateInventorySidebar(block, player) {
        const typeId = block.typeId;
        const inventory = itemNetwork.getInventory(block);
        const lines = [];
        
        lines.push(`§e=== ${this.getBlockDisplayName(typeId)} ===`);
        
        if (inventory) {
            let itemCount = 0;
            let slotCount = 0;
            const itemTypes = new Map();
            
            for (let i = 0; i < inventory.size; i++) {
                const item = inventory.getItem(i);
                if (item) {
                    itemCount += item.amount;
                    slotCount++;
                    itemTypes.set(item.typeId, (itemTypes.get(item.typeId) || 0) + item.amount);
                }
            }
            
            lines.push(`§7アイテム数: §f${itemCount}個`);
            lines.push(`§7使用スロット: §f${slotCount}/${inventory.size}`);
            
            // パイプ接続
            const adjacents = itemNetwork.getAdjacentBlocks(block);
            const pipeConnections = adjacents.filter(adj => itemNetwork.isItemConduit(adj.block)).length;
            lines.push(`§7パイプ接続: ${pipeConnections > 0 ? `§a${pipeConnections}方向` : "§cなし"}`);
            
            // アイテム詳細（最大5種類まで表示）
            if (itemTypes.size > 0) {
                lines.push(`§7--- アイテム詳細 ---`);
                let count = 0;
                for (const [itemType, amount] of itemTypes) {
                    if (count >= 5) {
                        lines.push(`§7...他${itemTypes.size - 5}種類`);
                        break;
                    }
                    lines.push(`§7${this.getItemDisplayName(itemType)}: §f${amount}個`);
                    count++;
                }
            }
        }
        
        sidebarDisplay.updateDisplay(player, lines);
    }

    static getBlockDisplayName(typeId) {
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

    static getItemDisplayName(itemId) {
        const names = {
            "minecraft:torch": "松明",
            "minecraft:soul_torch": "魂の松明",
            "minecraft:stone": "石",
            "minecraft:cobblestone": "丸石",
            "minecraft:dirt": "土",
            "minecraft:oak_log": "オークの原木",
            "minecraft:iron_ingot": "鉄インゴット",
            "minecraft:gold_ingot": "金インゴット",
            "minecraft:diamond": "ダイヤモンド",
            "minecraft:coal": "石炭",
            "minecraft:redstone": "レッドストーン"
        };
        
        return names[itemId] || itemId;
    }

    static getPatternName(pattern) {
        const patterns = {
            "isolated": "独立型",
            "terminal": "端末型",
            "straight": "直線型",
            "corner": "L字型",
            "t-junction": "T字型",
            "cross": "十字型",
            "five-way": "5方向型",
            "six-way": "全方向型"
        };
        
        return patterns[pattern] || pattern;
    }
}