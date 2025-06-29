import { world, system } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { energyNetwork } from "../energy/EnergyNetwork.js";
import { generator } from "../machines/Generator.js";
import { creativeGenerator } from "../machines/CreativeGenerator.js";
import { battery } from "../machines/Battery.js";
import { itemNetwork } from "../items/ItemNetwork.js";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";
import { sidebarDisplay } from "../ui/SidebarDisplay.js";
import { displaySystem } from "../ui/DisplaySystem.js";
import { WrenchSidebar } from "./WrenchSidebar.js";

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

        // スニーク中は設定変更モード
        if (player.isSneaking) {
            this.handleConfiguration(block, player);
        } else {
            // サイドバー表示の開始
            if (block.typeId.includes("pipe")) {
                this.startBlockInspection(block, player, "item_network");
            } else if (energySystem.isEnergyBlock(block) || block.typeId === "magisystem:cable") {
                this.startBlockInspection(block, player, "energy");
            } else if (itemPipeSystem.hasInventory(block)) {
                this.startBlockInspection(block, player, "inventory");
            }
        }

        // レンチ使用音
        player.playSound("random.click", { volume: 0.5 });
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
        // 将来的にサイドバーが使えるようになったら切り替え可能
    }

    static showEnergyInfo(block, player) {
        const typeId = block.typeId;
        
        // エネルギーシステムのブロック
        if (energySystem.isEnergyBlock(block)) {
            const energyInfo = energySystem.getEnergyDisplay(block);
            const energy = energySystem.getEnergy(block);
            const maxEnergy = energySystem.getMaxCapacity(block);
            
            const messages = [
                `§e=== エネルギー情報 ===`,
                `§7ブロック: §f${this.getBlockDisplayName(typeId)}`,
                `§7エネルギー: ${energyInfo}`
            ];
            
            // 発電機の場合は追加情報
            if (typeId === "magisystem:generator") {
                const genInfo = generator.getGeneratorInfo(block);
                if (genInfo) {
                    messages.push(`§7状態: ${genInfo.isActive ? "§a稼働中" : "§c停止中"}`);
                    if (genInfo.isActive) {
                        messages.push(`§7発電量: §a${generator.generationRate * 20} MF/秒`);
                    }
                    messages.push(`§7モード: §f通常モード（燃料必要）`);
                    if (genInfo.isActive) {
                        messages.push(`§7燃焼時間: §f${Math.ceil(genInfo.burnTime / 20)}秒`);
                        messages.push(`§7燃料: §f${this.getFuelDisplayName(genInfo.fuelItem)}`);
                    }
                }
            }
            
            // クリエイティブ発電機の場合は追加情報
            else if (typeId === "magisystem:creative_generator") {
                const genInfo = creativeGenerator.getGeneratorInfo(block);
                if (genInfo) {
                    messages.push(`§7状態: §a常時稼働中`);
                    messages.push(`§7発電量: §a${creativeGenerator.generationRate * 20} MF/秒`);
                    messages.push(`§7モード: §bクリエイティブモード（無限発電）`);
                    messages.push(`§7燃料: §b不要`);
                }
            }
            
            // バッテリーの場合は追加情報
            else if (typeId.includes("battery")) {
                const batteryInfo = battery.getBatteryInfo(block);
                if (batteryInfo) {
                    messages.push(`§7充電率: §f${batteryInfo.fillPercentage}%`);
                    messages.push(`§7転送速度: §f${batteryInfo.transferRate} MF/秒`);
                }
            }
            
            // 入出力情報（発電機は特別扱い）
            if (typeId === "magisystem:generator" || typeId === "magisystem:creative_generator") {
                messages.push(`§7入力: §c不可 §7出力: §a可能`);
                messages.push(`§7内部バッファ: §e${energy}/${maxEnergy} MF`);
            } else {
                const canInput = energySystem.canInput(block) ? "§a可能" : "§c不可";
                const canOutput = energySystem.canOutput(block) ? "§a可能" : "§c不可";
                messages.push(`§7入力: ${canInput} §7出力: ${canOutput}`);
            }
            
            // メッセージを一括表示
            messages.forEach(message => player.sendMessage(message));
        }
        
        // ケーブル
        else if (typeId === "magisystem:cable") {
            const messages = [`§e=== ケーブル情報 ===`];
            
            // エネルギーネットワークの分析
            const networkInfo = energyNetwork.analyzeNetwork(block);
            
            if (networkInfo) {
                // エネルギー源
                if (networkInfo.generators.length > 0) {
                    messages.push(`§7エネルギー源: §a${networkInfo.generators.length}個`);
                    let totalGeneration = 0;
                    networkInfo.generators.forEach(gen => {
                        const genInfo = generator.getGeneratorInfo(gen);
                        if (genInfo && genInfo.isActive) {
                            totalGeneration += generator.generationRate;
                        }
                    });
                    if (totalGeneration > 0) {
                        messages.push(`§7総発電量: §a${totalGeneration} MF/秒`);
                    }
                } else {
                    messages.push(`§7エネルギー源: §cなし`);
                }
                
                // エネルギー貯蔵
                if (networkInfo.storages.length > 0) {
                    messages.push(`§7バッテリー: §b${networkInfo.storages.length}個`);
                    let totalStored = 0;
                    let totalCapacity = 0;
                    networkInfo.storages.forEach(storage => {
                        totalStored += energySystem.getEnergy(storage);
                        totalCapacity += energySystem.getMaxCapacity(storage);
                    });
                    messages.push(`§7総貯蔵量: §b${totalStored}/${totalCapacity} MF`);
                }
                
                // エネルギー消費
                if (networkInfo.consumers.length > 0) {
                    messages.push(`§7消費機器: §c${networkInfo.consumers.length}個`);
                }
                
                // ネットワークサイズ
                messages.push(`§7ネットワーク規模: §f${networkInfo.totalBlocks}ブロック`);
            } else {
                messages.push(`§cネットワーク情報を取得できません`);
            }
            
            messages.forEach(message => player.sendMessage(message));
        }
        
        // インベントリブロック
        else if (itemPipeSystem.hasInventory(block)) {
            this.showInventoryInfo(block, player);
        }
        
        // その他のブロック（メッセージなし）
    }

    static showItemNetworkInfo(block, player) {
        const typeId = block.typeId;
        
        const messages = [
            `§e=== アイテムパイプ情報 ===`,
            `§7ブロック: §f${this.getBlockDisplayName(typeId)}`
        ];
        
        // 接続情報
        const connectionInfo = itemPipeSystem.getConnectionInfo(block);
        if (connectionInfo) {
            messages.push(`§7接続数: §f${connectionInfo.count}方向`);
            messages.push(`§7パターン: §f${this.getPatternName(connectionInfo.pattern)}`);
            
            // 各方向の接続状態
            let connectionDetails = [];
            Object.entries(connectionInfo.connections).forEach(([direction, connected]) => {
                if (connected) {
                    const dirName = this.getDirectionName(direction);
                    const adjacent = itemPipeSystem.getAdjacentBlock(block, direction);
                    if (adjacent) {
                        if (itemNetwork.isItemConduit(adjacent)) {
                            connectionDetails.push(`${dirName}: §bパイプ`);
                        } else if (itemPipeSystem.hasInventory(adjacent)) {
                            connectionDetails.push(`${dirName}: §aインベントリ`);
                        } else {
                            connectionDetails.push(`${dirName}: §7ブロック`);
                        }
                    }
                }
            });
            
            if (connectionDetails.length > 0) {
                messages.push(`§7接続詳細:`);
                connectionDetails.forEach(detail => {
                    messages.push(`  §7${detail}`);
                });
            }
        }
        
        // ネットワーク分析
        const network = itemNetwork.findConnectedNetwork(block, false);
        messages.push(`§7ネットワーク規模: §f${network.size}個のインベントリ`);
        
        if (network.size > 0) {
            const inventoryTypes = new Map();
            for (const [key, inventoryBlock] of network) {
                const type = inventoryBlock.typeId;
                inventoryTypes.set(type, (inventoryTypes.get(type) || 0) + 1);
            }
            
            messages.push(`§7インベントリ詳細:`);
            for (const [type, count] of inventoryTypes) {
                const displayName = this.getBlockDisplayName(type);
                messages.push(`  §7${displayName}: §f${count}個`);
            }
        }
        
        messages.forEach(message => player.sendMessage(message));
    }

    static showInventoryInfo(block, player) {
        const typeId = block.typeId;
        
        const messages = [
            `§e=== インベントリ情報 ===`,
            `§7ブロック: §f${this.getBlockDisplayName(typeId)}`
        ];
        
        // インベントリ情報
        const inventory = itemNetwork.getInventory(block);
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
            
            messages.push(`§7アイテム数: §f${itemCount}個`);
            messages.push(`§7使用スロット: §f${slotCount}/${inventory.size}`);
            
            if (itemTypes.size > 0) {
                messages.push(`§7アイテム詳細:`);
                for (const [itemType, amount] of itemTypes) {
                    const displayName = this.getItemDisplayName(itemType);
                    messages.push(`  §7${displayName}: §f${amount}個`);
                }
            }
        }
        
        // パイプ接続状況
        const adjacents = itemNetwork.getAdjacentBlocks(block);
        let pipeConnections = 0;
        
        for (const adj of adjacents) {
            if (itemNetwork.isItemConduit(adj.block)) {
                pipeConnections++;
            }
        }
        
        if (pipeConnections > 0) {
            messages.push(`§7パイプ接続: §a${pipeConnections}方向`);
            
            // 接続されたネットワークの情報
            const network = itemNetwork.findConnectedNetwork(block, true);
            if (network.size > 0) {
                messages.push(`§7接続先インベントリ: §f${network.size}個`);
            }
        } else {
            messages.push(`§7パイプ接続: §cなし`);
        }
        
        messages.forEach(message => player.sendMessage(message));
    }

    static handleConfiguration(block, player) {
        const typeId = block.typeId;
        
        // バッテリーの入出力モード切り替え（将来の実装用）
        if (typeId.includes("battery")) {
            player.sendMessage(`§e=== バッテリー設定 ===`);
            player.sendMessage(`§7現在のモード: §f入出力`);
            player.sendMessage(`§7（モード切り替えは今後実装予定）`);
        }
        
        // 発電機の設定
        else if (typeId === "magisystem:generator" || typeId === "magisystem:creative_generator") {
            player.sendMessage(`§e=== 発電機設定 ===`);
            if (typeId === "magisystem:creative_generator") {
                player.sendMessage(`§7タイプ: §bクリエイティブ発電機`);
                player.sendMessage(`§7状態: §a常時無限発電`);
            } else {
                player.sendMessage(`§7タイプ: §f通常発電機`);
                player.sendMessage(`§7燃料が必要です`);
            }
        }
        
        // その他の設定可能ブロック
        else if (energySystem.isEnergyBlock(block)) {
            player.sendMessage(`§e=== 機械設定 ===`);
            player.sendMessage(`§7このブロックには設定項目がありません`);
        }
        
        // その他（メッセージなし）
        {}
    }

    static getBlockDisplayName(typeId) {
        const names = {
            "magisystem:generator": "発電機",
            "magisystem:creative_generator": "クリエイティブ発電機",
            "magisystem:battery_basic": "基本バッテリー",
            "magisystem:battery_advanced": "発展バッテリー",
            "magisystem:battery_ultimate": "究極バッテリー",
            "magisystem:iron_furnace": "鉄のかまど",
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

    static getFuelDisplayName(itemId) {
        if (!itemId) return "なし";
        
        const names = {
            "minecraft:coal": "石炭",
            "minecraft:charcoal": "木炭",
            "minecraft:coal_block": "石炭ブロック",
            "minecraft:lava_bucket": "溶岩バケツ",
            "minecraft:blaze_rod": "ブレイズロッド",
            "minecraft:dried_kelp_block": "乾燥した昆布ブロック"
        };
        
        return names[itemId] || itemId;
    }

    static getDirectionName(direction) {
        const names = {
            above: "上",
            below: "下",
            north: "北",
            south: "南",
            east: "東",
            west: "西"
        };
        
        return names[direction] || direction;
    }
}

export default Wrench;