import { world, system } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { generator } from "../machines/Generator.js";
import { creativeGenerator } from "../machines/CreativeGenerator.js";
import { battery } from "../machines/Battery.js";
import { itemNetwork } from "../items/ItemNetwork.js";

export class TickEvents {
    static register() {
        // メインの更新ループ（20tick = 1秒ごと）
        system.runInterval(() => {
            this.updateMachines();
        }, 20);

        // ケーブルの視覚更新（100tick = 5秒ごと）
        system.runInterval(() => {
            this.updateCableVisuals();
        }, 100);

        // アイテム転送処理（20tick = 1秒ごと）
        system.runInterval(() => {
            this.updateItemTransfer();
        }, 20);

        // デバッグ情報の更新（40tick = 2秒ごと）
        if (this.isDebugMode()) {
            system.runInterval(() => {
                this.updateDebugInfo();
            }, 40);
        }
    }

    static updateMachines() {
        // すべてのディメンションを処理
        const dimensions = [
            world.getDimension("overworld"),
            world.getDimension("nether"),
            world.getDimension("the_end")
        ];

        for (const dimension of dimensions) {
            try {
                // Dynamic Propertiesから登録されたブロック位置を取得
                const properties = world.getDynamicPropertyIds();
                
                for (const prop of properties) {
                    // 座標形式のプロパティをチェック（例: "10,64,-20"）
                    if (prop.match(/^-?\d+,-?\d+,-?\d+$/)) {
                        const dimId = world.getDynamicProperty(prop);
                        
                        if (dimId === dimension.id) {
                            const [x, y, z] = prop.split(',').map(Number);
                            const location = { x, y, z };
                            
                            try {
                                const block = dimension.getBlock(location);
                                if (block) {
                                    this.updateBlock(block);
                                }
                            } catch {}
                        }
                    }
                }
            } catch (error) {
                console.warn(`Error updating machines in ${dimension.id}: ${error}`);
            }
        }
    }

    static updateBlock(block) {
        const typeId = block.typeId;

        // 発電機の更新
        if (typeId === "magisystem:generator") {
            generator.updateGenerator(block);
        }
        
        // クリエイティブ発電機の更新
        else if (typeId === "magisystem:creative_generator") {
            creativeGenerator.updateGenerator(block);
        }
        
        // バッテリーの更新
        else if (typeId.includes("battery")) {
            battery.updateBattery(block);
        }
        
        // 他の機械の更新（将来の実装用）
        else if (typeId === "magisystem:iron_furnace") {
            // TODO: かまどの更新処理
        }
    }

    static updateCableVisuals() {
        // ケーブルの視覚的な更新（電流アニメーションなど）
        // パフォーマンスを考慮して低頻度で実行
        
        try {
            // アクティブなプレイヤーの周辺のみ更新
            const players = world.getAllPlayers();
            
            for (const player of players) {
                const dimension = player.dimension;
                const playerLoc = player.location;
                
                // プレイヤーの周囲16ブロックのケーブルを更新
                for (let x = -16; x <= 16; x += 4) {
                    for (let y = -8; y <= 8; y += 4) {
                        for (let z = -16; z <= 16; z += 4) {
                            try {
                                const block = dimension.getBlock({
                                    x: Math.floor(playerLoc.x + x),
                                    y: Math.floor(playerLoc.y + y),
                                    z: Math.floor(playerLoc.z + z)
                                });
                                
                                if (block?.typeId?.startsWith("magisystem:cable")) {
                                    // エネルギーが流れているかチェック
                                    const hasEnergy = this.checkCableHasEnergy(block);
                                    
                                    // 視覚状態を更新
                                    try {
                                        const currentState = block.permutation.getState("magisystem:powered");
                                        if (currentState !== undefined && currentState !== hasEnergy) {
                                            block.setPermutation(
                                                block.permutation.withState("magisystem:powered", hasEnergy ? 1 : 0)
                                            );
                                        }
                                    } catch {}
                                }
                            } catch {}
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`Error updating cable visuals: ${error}`);
        }
    }

    static checkCableHasEnergy(cableBlock) {
        // ケーブルに隣接するエネルギーブロックをチェック
        const adjacents = [
            cableBlock.above(),
            cableBlock.below(),
            cableBlock.north(),
            cableBlock.south(),
            cableBlock.east(),
            cableBlock.west()
        ];

        for (const adj of adjacents) {
            if (adj && energySystem.isEnergyBlock(adj)) {
                const energy = energySystem.getEnergy(adj);
                if (energy > 0) {
                    return true;
                }
            }
        }
        
        return false;
    }

    static updateDebugInfo() {
        // デバッグモードでのエネルギー情報表示
        const players = world.getAllPlayers();
        
        for (const player of players) {
            if (player.hasTag("debug_energy")) {
                const block = player.getBlockFromViewDirection();
                
                if (block?.block && energySystem.isEnergyBlock(block.block)) {
                    const energyInfo = energySystem.getEnergyDisplay(block.block);
                    if (energyInfo) {
                        player.onScreenDisplay.setActionBar(`§eエネルギー: ${energyInfo}`);
                    }
                }
            }
        }
    }

    static updateItemTransfer() {
        // アクティブなプレイヤーの周辺のインベントリブロックでアイテム転送を実行
        const players = world.getAllPlayers();
        
        for (const player of players) {
            const dimension = player.dimension;
            const playerLoc = player.location;
            
            // プレイヤーの周囲16ブロック内のインベントリブロックを処理
            for (let x = -16; x <= 16; x += 1) {
                for (let y = -8; y <= 8; y += 1) {
                    for (let z = -16; z <= 16; z += 1) {
                        try {
                            const block = dimension.getBlock({
                                x: Math.floor(playerLoc.x + x),
                                y: Math.floor(playerLoc.y + y),
                                z: Math.floor(playerLoc.z + z)
                            });
                            
                            // インベントリを持つブロックのみをチェック
                            if (!block || !this.isInventoryBlock(block.typeId)) {
                                continue;
                            }
                            
                            if (this.shouldProcessItemTransfer(block)) {
                                // アイテムを1個転送
                                itemNetwork.distributeItems(block, 1);
                            }
                        } catch {}
                    }
                }
            }
        }
    }

    static shouldProcessItemTransfer(block) {
        // インベントリを持つブロックで、パイプと接続されているものを対象
        const inventory = itemNetwork.getInventory(block);
        
        if (!block || !inventory) {
            return false;
        }
        
        // パイプ自体は除外
        if (itemNetwork.isItemConduit(block)) {
            return false;
        }
        
        // 隣接ブロックにパイプがあるかチェック
        const adjacents = itemNetwork.getAdjacentBlocks(block);
        
        for (const adj of adjacents) {
            if (itemNetwork.isItemConduit(adj.block)) {
                return true;
            }
        }
        
        return false;
    }

    static isInventoryBlock(typeId) {
        const inventoryBlocks = [
            "minecraft:chest",
            "minecraft:barrel",
            "minecraft:furnace",
            "minecraft:blast_furnace",
            "minecraft:smoker",
            "minecraft:hopper",
            "minecraft:dropper",
            "minecraft:dispenser",
            "minecraft:brewing_stand",
            "minecraft:shulker_box",
            "minecraft:ender_chest"
        ];
        
        return inventoryBlocks.includes(typeId) || typeId.includes("shulker_box");
    }

    static isDebugMode() {
        // デバッグモードのチェック
        try {
            return world.getDynamicProperty("debug_mode") === true;
        } catch {
            return false;
        }
    }
}

export default TickEvents;