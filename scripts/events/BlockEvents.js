import { world, system } from "@minecraft/server";
import { energySystem } from "../energy/EnergySystem.js";
import { generator } from "../machines/Generator.js";
import { creativeGenerator } from "../machines/CreativeGenerator.js";
import { battery } from "../machines/Battery.js";
import { mfCableSystem } from "../cables/MFCableSystem.js";
import { itemPipeSystem } from "../pipes/ItemPipeSystem.js";
import BlockUtils from "../utils/BlockUtils.js";

export class BlockEvents {
    static register() {
        // ブロック配置イベント
        world.afterEvents.playerPlaceBlock.subscribe((event) => {
            this.onBlockPlace(event.block, event.player);
        });

        // ブロック破壊イベント
        world.afterEvents.playerBreakBlock.subscribe((event) => {
            this.onBlockBreak(event.block, event.brokenBlockPermutation, event.player, event.dimension);
        });

        // エクスプロージョンによるブロック破壊
        world.afterEvents.blockExplode.subscribe((event) => {
            this.onBlockExplode(event.block, event.explodedBlockPermutation, event.dimension);
        });
    }

    static onBlockPlace(block, player) {
        const typeId = block.typeId;

        // 発電機の配置
        if (typeId === "magisystem:generator") {
            generator.registerGenerator(block);
            BlockUtils.playSound(block, "dig.stone", { volume: 0.8 });
            
            // 隣接するケーブルを更新
            mfCableSystem.updateAdjacentCables(block);
        }
        
        // クリエイティブ発電機の配置
        else if (typeId === "magisystem:creative_generator") {
            creativeGenerator.registerGenerator(block);
            BlockUtils.playSound(block, "dig.stone", { volume: 0.8 });
            
            // 隣接するケーブルを更新
            mfCableSystem.updateAdjacentCables(block);
        }
        
        // バッテリーの配置
        else if (typeId.includes("battery")) {
            battery.registerBattery(block);
            BlockUtils.playSound(block, "dig.stone", { volume: 0.8 });
            
            // 隣接するケーブルを更新
            mfCableSystem.updateAdjacentCables(block);
        }
        
        // ケーブルの配置
        else if (typeId === "magisystem:cable" || typeId === "magisystem:cable_input" || typeId === "magisystem:cable_output") {
            mfCableSystem.onCablePlaced(block);
            // 隣接するケーブルも更新
            mfCableSystem.updateAdjacentCables(block);
            BlockUtils.playSound(block, "dig.copper", { volume: 0.5 });
        }
        
        // パイプの配置
        else if (typeId === "magisystem:pipe" || typeId === "magisystem:pipe_input" || typeId === "magisystem:pipe_output") {
            itemPipeSystem.onPipePlaced(block);
            // 隣接するパイプも更新
            itemPipeSystem.updateAdjacentPipes(block);
            BlockUtils.playSound(block, "dig.stone", { volume: 0.5 });
        }
        
        // その他のエネルギー機器
        else if (energySystem.isEnergyBlock(block)) {
            energySystem.setEnergy(block, 0);
            BlockUtils.playSound(block, "dig.stone", { volume: 0.8 });
            
            // 隣接するケーブルを更新
            mfCableSystem.updateAdjacentCables(block);
        }
    }

    static onBlockBreak(block, brokenPermutation, player, dimension) {
        const typeId = brokenPermutation.type.id;
        const location = block.location;

        // 発電機の破壊
        if (typeId === "magisystem:generator") {
            generator.unregisterGenerator(location, dimension);
            this.dropStoredEnergy(location, dimension, brokenPermutation);
            
            // 隣接するケーブルを更新
            mfCableSystem.onCableRemoved(location, dimension);
        }
        
        // クリエイティブ発電機の破壊
        else if (typeId === "magisystem:creative_generator") {
            creativeGenerator.unregisterGenerator(location, dimension);
            this.dropStoredEnergy(location, dimension, brokenPermutation);
            
            // 隣接するケーブルを更新
            mfCableSystem.onCableRemoved(location, dimension);
        }
        
        // バッテリーの破壊
        else if (typeId.includes("battery")) {
            battery.unregisterBattery(location, dimension);
            this.dropStoredEnergy(location, dimension, brokenPermutation);
            
            // 隣接するケーブルを更新
            mfCableSystem.onCableRemoved(location, dimension);
        }
        
        // ケーブルの破壊
        else if (typeId === "magisystem:cable" || typeId === "magisystem:cable_input" || typeId === "magisystem:cable_output") {
            mfCableSystem.onCableRemoved(location, dimension);
        }
        
        // パイプの破壊
        else if (typeId === "magisystem:pipe" || typeId === "magisystem:pipe_input" || typeId === "magisystem:pipe_output") {
            itemPipeSystem.onPipeRemoved(location, dimension);
        }
        
        // その他のエネルギー機器
        else if (this.isEnergyBlockType(typeId)) {
            this.dropStoredEnergy(location, dimension, brokenPermutation);
            energySystem.clearEnergy(location, dimension);
            
            // 隣接するケーブルを更新
            mfCableSystem.onCableRemoved(location, dimension);
        }
    }

    static onBlockExplode(block, explodedPermutation, dimension) {
        const typeId = explodedPermutation.type.id;
        const location = block.location;

        // エクスプロージョンによる破壊も同様に処理
        if (typeId === "magisystem:generator") {
            generator.unregisterGenerator(location, dimension);
        } else if (this.isEnergyBlockType(typeId)) {
            energySystem.clearEnergy(location, dimension);
        }

        // ケーブルの更新
        if (typeId === "magisystem:cable" || this.isEnergyBlockType(typeId)) {
            mfCableSystem.onCableRemoved(location, dimension);
        }
    }

    static dropStoredEnergy(location, dimension, brokenPermutation) {
        // エネルギー値を取得
        const storedEnergy = this.getStoredEnergyFromLocation(location, dimension);
        
        if (storedEnergy > 0) {
            // エネルギーが保存されている場合、特別なアイテムをドロップ
            // （将来的にエネルギーセルなどの実装を想定）
            console.log(`Dropped block with ${storedEnergy} MF stored`);
        }
    }

    static getStoredEnergyFromLocation(location, dimension) {
        try {
            const key = `${location.x},${location.y},${location.z}`;
            const objective = world.scoreboard.getObjective("mf_energy");
            if (objective) {
                const participant = objective.getParticipant(key);
                if (participant) {
                    return objective.getScore(participant) || 0;
                }
            }
        } catch {}
        return 0;
    }

    static isEnergyBlockType(typeId) {
        const energyBlocks = [
            "magisystem:generator",
            "magisystem:battery_basic",
            "magisystem:battery_advanced",
            "magisystem:battery_ultimate",
            "magisystem:iron_furnace"
        ];
        
        return energyBlocks.includes(typeId);
    }

}

export default BlockEvents;