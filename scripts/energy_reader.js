import { world, system } from '@minecraft/server';
import { getBlockEnergy, setBlockEnergy } from './shared.js';

// エネルギーリーダーアイテム（レンチ）
const ENERGY_READER_ITEMS = [
    'magisystem:wrench'  // 専用レンチ
];

// アイテムでブロックをクリック
world.afterEvents.itemUseOn.subscribe((event) => {
    const player = event.source;
    const block = event.block;
    const item = event.itemStack;
    
    if (!item || !ENERGY_READER_ITEMS.includes(item.typeId)) {
        return;
    }
    
    // エネルギー情報を表示
    displayEnergyInfo(player, block);
});

function displayEnergyInfo(player, block) {
    const blockType = block.typeId;
    
    // エネルギー関連ブロックでない場合は終了
    if (blockType !== 'magisystem:generator' && 
        blockType !== 'magisystem:battery_basic' && 
        blockType !== 'magisystem:energy_cable' && 
        blockType !== 'magisystem:iron_furnace') {
        player.sendMessage('§7このブロックはエネルギーを持っていません');
        return;
    }
    
    const energyData = getBlockEnergy(block.location);
    
    // エネルギーデータがない場合は初期値を設定
    if (!energyData.maxEnergy) {
        energyData.maxEnergy = getDefaultMaxEnergy(blockType);
    }
    
    // 発電機の場合
    if (block.typeId === 'magisystem:generator') {
        const fuelTicks = energyData.fuel || 0;
        const fuelSeconds = Math.floor(fuelTicks / 20); // 秒に変換
        const fuelMinutes = Math.floor(fuelSeconds / 60); // 分
        const remainingSeconds = fuelSeconds % 60; // 残り秒
        
        // 各燃料タイプでの換算
        const fuelCoal = fuelTicks / 80;  // 石炭1個 = 80秒
        const fuelCoalBlock = fuelTicks / 720;  // 石炭ブロック1個 = 720秒
        const fuelBlaze = fuelTicks / 120;  // ブレイズロッド1個 = 120秒
        
        player.sendMessage('§6=== 発電機の状態 ===');
        player.sendMessage(`§eエネルギー: §f${energyData.energy} / ${energyData.maxEnergy || 1000} MF`);
        player.sendMessage(`§e発電速度: §f10 MF/秒`);
        player.sendMessage(`§e燃料残量: §f${fuelTicks}ticks (${fuelMinutes}分${remainingSeconds}秒)`);
        player.sendMessage(`§e燃料換算:`);
        player.sendMessage(`  §7- 石炭: §f${fuelCoal.toFixed(1)}個分`);
        player.sendMessage(`  §7- 石炭ブロック: §f${fuelCoalBlock.toFixed(2)}個分`);
        player.sendMessage(`  §7- ブレイズロッド: §f${fuelBlaze.toFixed(1)}個分`);
        player.sendMessage(`§e稼働状態: ${energyData.fuel > 0 ? '§a稼働中' : '§c停止中'}`);
        
        // エネルギーバーを表示
        const energyPercent = Math.floor((energyData.energy / (energyData.maxEnergy || 1000)) * 100);
        const bar = createBar(energyPercent);
        player.sendMessage(`§eエネルギー: ${bar} §f${energyPercent}%`);
        
    // バッテリーの場合
    } else if (block.typeId === 'magisystem:battery_basic') {
        const maxEnergy = energyData.maxEnergy || 10000;
        const energyPercent = Math.floor((energyData.energy / maxEnergy) * 100);
        
        player.sendMessage('§6=== 基本バッテリー ===');
        player.sendMessage(`§eエネルギー: §f${energyData.energy} / ${maxEnergy} MF`);
        player.sendMessage(`§e充電率: §f${energyPercent}%`);
        
        // 充電状態の詳細表示
        const bar = createBar(energyPercent);
        player.sendMessage(`§e充電状態: ${bar}`);
        
        // 充電/放電の推定時間
        if (energyData.energy < maxEnergy) {
            const timeToFull = Math.ceil((maxEnergy - energyData.energy) / 10 / 60); // 分単位
            player.sendMessage(`§e満充電まで: §f約${timeToFull}分 §7(10MF/秒で充電時)`);
        } else {
            player.sendMessage(`§e状態: §a満充電`);
        }
        
    // エネルギーケーブルの場合
    } else if (block.typeId === 'magisystem:energy_cable') {
        player.sendMessage('§6=== エネルギーケーブル ===');
        player.sendMessage(`§e通過エネルギー: §f${energyData.energy} / ${energyData.maxEnergy || 100} MF`);
        
    // 鉄のかまどの場合
    } else if (block.typeId === 'magisystem:iron_furnace') {
        player.sendMessage('§6=== 鉄のかまど ===');
        player.sendMessage(`§eエネルギー: §f${energyData.energy} / ${energyData.maxEnergy || 100} MF`);
        player.sendMessage(`§e精錬速度: §f通常の2倍`);
        player.sendMessage(`§eエネルギー消費: §f5 MF/アイテム`);
        
    // その他のブロック
    } else if (energyData.maxEnergy > 0) {
        player.sendMessage('§6=== エネルギーブロック ===');
        player.sendMessage(`§eエネルギー: §f${energyData.energy} / ${energyData.maxEnergy} MF`);
    }
}

function createBar(percent) {
    const length = 20;
    const filled = Math.floor(percent / 5); // 5%ごとに1ブロック
    const empty = length - filled;
    
    let bar = '';
    if (percent >= 80) {
        bar = '§a' + '█'.repeat(filled);
    } else if (percent >= 40) {
        bar = '§e' + '█'.repeat(filled);
    } else {
        bar = '§c' + '█'.repeat(filled);
    }
    bar += '§7' + '░'.repeat(empty);
    
    return bar;
}

// パーティクルエフェクト（オプション）
function showEnergyParticles(block) {
    const location = {
        x: block.location.x + 0.5,
        y: block.location.y + 1,
        z: block.location.z + 0.5
    };
    
    // エネルギーレベルに応じたパーティクル
    const energyData = getBlockEnergy(block.location);
    if (energyData.energy > 0) {
        block.dimension.spawnParticle('minecraft:redstone_wire_dust_particle', location);
    }
}

// 定期的なエネルギー表示（スニーク中のみ）
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        if (player.isSneaking) {
            const item = player.getComponent('minecraft:inventory').container.getItem(player.selectedSlotIndex);
            
            if (item && ENERGY_READER_ITEMS.includes(item.typeId)) {
                // プレイヤーが見ているブロックを取得
                const blockRay = player.getBlockFromViewDirection({ maxDistance: 5 });
                
                if (blockRay && blockRay.block) {
                    const blockType = blockRay.block.typeId;
                    
                    // エネルギー関連ブロックかチェック
                    if (blockType === 'magisystem:generator' || 
                        blockType === 'magisystem:battery_basic' || 
                        blockType === 'magisystem:energy_cable' || 
                        blockType === 'magisystem:iron_furnace') {
                        
                        const energyData = getBlockEnergy(blockRay.block.location);
                        const maxEnergy = energyData.maxEnergy || getDefaultMaxEnergy(blockType);
                        
                        // アクションバーに表示
                        if (blockType === 'magisystem:generator' && energyData.fuel > 0) {
                            player.onScreenDisplay.setActionBar(`§eエネルギー: §f${energyData.energy} / ${maxEnergy} MF §7| §e燃料: §f${energyData.fuel}ticks`);
                        } else {
                            player.onScreenDisplay.setActionBar(`§eエネルギー: §f${energyData.energy} / ${maxEnergy} MF`);
                        }
                        
                        // パーティクル表示
                        showEnergyParticles(blockRay.block);
                    }
                }
            }
        }
    }
}, 1); // 毎tick（0.05秒）で更新

// デフォルトの最大エネルギー値を取得
function getDefaultMaxEnergy(blockType) {
    const defaults = {
        'magisystem:generator': 1000,
        'magisystem:battery_basic': 10000,
        'magisystem:energy_cable': 100,
        'magisystem:cable_none': 100,
        'magisystem:cable_straight_y': 100,
        'magisystem:cable_straight_x': 100,
        'magisystem:cable_straight_z': 100,
        'magisystem:cable_corner': 100,
        'magisystem:cable_three_way': 100,
        'magisystem:cable_cross': 100,
        'magisystem:iron_furnace': 100
    };
    return defaults[blockType] || 0;
}

export { ENERGY_READER_ITEMS };