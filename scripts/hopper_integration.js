import { world, system } from '@minecraft/server';
import { energySystem } from './energy/EnergySystem.js';
import { FuelRegistry } from './core/FuelRegistry.js';

// ホッパーの位置を記録
const activeHoppers = new Set();

// ホッパー設置時に登録
world.afterEvents.playerPlaceBlock.subscribe((event) => {
    if (event.block.typeId === 'minecraft:hopper') {
        const belowLocation = {
            x: event.block.location.x,
            y: event.block.location.y - 1,
            z: event.block.location.z
        };
        
        const belowBlock = event.block.dimension.getBlock(belowLocation);
        if (belowBlock && belowBlock.typeId === 'magisystem:generator') {
            const key = `${event.block.location.x},${event.block.location.y},${event.block.location.z}`;
            activeHoppers.add(key);
            event.player.sendMessage('§aホッパーを発電機に接続しました');
        }
    }
});

// ホッパー破壊時に削除
world.afterEvents.playerBreakBlock.subscribe((event) => {
    if (event.block.typeId === 'minecraft:hopper') {
        const key = `${event.block.location.x},${event.block.location.y},${event.block.location.z}`;
        activeHoppers.delete(key);
    }
});

// 効率的なホッパー処理
system.runInterval(() => {
    const dimension = world.getDimension('overworld');
    
    // 登録されたホッパーのみチェック
    for (const key of activeHoppers) {
        try {
            const [x, y, z] = key.split(',').map(Number);
            const hopperBlock = dimension.getBlock({ x, y, z });
            
            if (!hopperBlock || hopperBlock.typeId !== 'minecraft:hopper') {
                activeHoppers.delete(key);
                continue;
            }
            
            checkHopperConnection(hopperBlock, dimension);
        } catch (e) {}
    }
}, 20); // 1秒ごとにチェック

function checkHopperConnection(hopperBlock, dimension) {
    // ホッパーの向きをチェック（下向きのみ対応）
    const belowLocation = {
        x: hopperBlock.location.x,
        y: hopperBlock.location.y - 1,
        z: hopperBlock.location.z
    };
    
    const targetBlock = dimension.getBlock(belowLocation);
    
    if (targetBlock && targetBlock.typeId === 'magisystem:generator') {
        // ホッパーのインベントリをチェック
        const hopperInventory = hopperBlock.getComponent('minecraft:inventory');
        if (!hopperInventory) return;
        
        const container = hopperInventory.container;
        transferFuelFromHopper(container, targetBlock);
    }
}

function transferFuelFromHopper(hopperContainer, generatorBlock) {
    const energyData = energySystem.getBlockEnergy(generatorBlock);
    
    // 燃料スロットに空きがあるかチェック（最大1600燃料値 = 石炭20個分）
    if (energyData.fuel >= 1600) return;
    
    // ホッパーの各スロットをチェック
    for (let i = 0; i < hopperContainer.size; i++) {
        const item = hopperContainer.getItem(i);
        
        if (item && FuelRegistry.isFuel(item.typeId)) {
            // FuelRegistryの値はtick単位なので、ホッパーシステムのスケールに変換（/20）
            const fuelValue = Math.floor(FuelRegistry.getFuelValue(item.typeId) / 20);
            
            // 燃料を追加できるかチェック
            if (energyData.fuel + fuelValue <= 1600) {
                // アイテムを1つ消費
                if (item.amount === 1) {
                    hopperContainer.setItem(i, undefined);
                } else {
                    item.amount--;
                    hopperContainer.setItem(i, item);
                }
                
                // 燃料を追加
                energyData.fuel += fuelValue;
                energySystem.setBlockEnergy(generatorBlock, energyData);
                
                // エフェクト
                const particleLocation = {
                    x: generatorBlock.location.x + 0.5,
                    y: generatorBlock.location.y + 0.5,
                    z: generatorBlock.location.z + 0.5
                };
                dimension.spawnParticle('minecraft:villager_happy', particleLocation);
                
                // 1回の転送で1つのアイテムのみ
                break;
            }
        }
    }
}

// 発電機の上にホッパーを設置した場合の自動接続
world.afterEvents.playerPlaceBlock.subscribe((event) => {
    const block = event.block;
    
    if (block.typeId === 'minecraft:hopper') {
        // 下のブロックをチェック
        const dimension = block.dimension;
        const belowLocation = {
            x: block.location.x,
            y: block.location.y - 1,
            z: block.location.z
        };
        
        const belowBlock = dimension.getBlock(belowLocation);
        
        if (belowBlock && belowBlock.typeId === 'magisystem:generator') {
            event.player.sendMessage('§aホッパーを発電機に接続しました。燃料が自動供給されます。');
        }
    }
});

// FuelRegistryを使用するため、FUEL_VALUESのエクスポートは削除