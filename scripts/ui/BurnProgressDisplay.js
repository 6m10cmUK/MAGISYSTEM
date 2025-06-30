import { world, system } from "@minecraft/server";
import { generator } from "../machines/Generator.js";
import { Logger } from "../core/Logger.js";
import { Constants } from "../core/Constants.js";

/**
 * 燃焼進行状況表示システム
 * ボスバーを使用して燃焼状態を視覚的に表示
 */
export class BurnProgressDisplay {
    constructor() {
        this.playerGeneratorMap = new Map(); // プレイヤーと発電機の関連付け
        this.updateInterval = 5; // 更新間隔（tick）
    }

    /**
     * システムを初期化
     */
    initialize() {
        system.runInterval(() => {
            this.updateAllPlayers();
        }, this.updateInterval);
        
        Logger.info("燃焼進行状況表示システムを初期化", "BurnProgressDisplay");
    }

    /**
     * すべてのプレイヤーの表示を更新
     */
    updateAllPlayers() {
        for (const player of world.getAllPlayers()) {
            this.updatePlayerDisplay(player);
        }
    }

    /**
     * プレイヤーの表示を更新
     */
    updatePlayerDisplay(player) {
        try {
            // プレイヤーが見ているブロックを取得
            const blockRayResult = player.getBlockFromViewDirection({
                maxDistance: 5,
                includePassableBlocks: false
            });

            if (!blockRayResult || !blockRayResult.block) {
                // 発電機を見ていない場合はボスバーを非表示
                this.hideBossBar(player);
                return;
            }

            const block = blockRayResult.block;
            const typeId = block.typeId;

            // 熱発電機かどうかチェック
            if (typeId !== Constants.BLOCK_TYPES.THERMAL_GENERATOR && 
                typeId !== Constants.BLOCK_TYPES.GENERATOR) {
                this.hideBossBar(player);
                return;
            }

            // 発電機情報を取得
            const genInfo = generator.getGeneratorInfo(block);
            if (!genInfo || genInfo.maxBurnTime <= 0) {
                this.hideBossBar(player);
                return;
            }

            // 燃焼進行率を計算（0～1）
            const progress = genInfo.burnTime / genInfo.maxBurnTime;
            
            // ボスバーで表示
            this.showBurnProgress(player, progress, genInfo);

        } catch (error) {
            Logger.debug(`表示更新エラー: ${error}`, "BurnProgressDisplay");
        }
    }

    /**
     * 燃焼進行状況を表示
     */
    showBurnProgress(player, progress, genInfo) {
        // プログレスバーを作成（20文字）
        const barLength = 20;
        const filledLength = Math.floor(progress * barLength);
        const emptyLength = barLength - filledLength;
        
        // カラーコード設定（残量に応じて色を変更）
        let color = "§a"; // 緑
        if (progress < 0.3) color = "§e"; // 黄色
        if (progress < 0.1) color = "§c"; // 赤
        
        // プログレスバー作成
        const filledBar = "█".repeat(filledLength);
        const emptyBar = "░".repeat(emptyLength);
        const progressBar = `${color}${filledBar}§7${emptyBar}`;
        
        // 燃料名を取得
        const fuelName = genInfo.fuelItem ? genInfo.fuelItem.replace("minecraft:", "") : "unknown";
        
        // タイトル表示
        const title = `§e: §f${fuelName} ${progressBar} §f${Math.round(progress * 100)}%`;
        
        // ボスバーとして表示（ActionBarを使用）
        player.onScreenDisplay.setActionBar(title);
        
        // プレイヤーと発電機の関連付けを保存
        this.playerGeneratorMap.set(player.id, {
            block: { 
                x: genInfo.location?.x || 0, 
                y: genInfo.location?.y || 0, 
                z: genInfo.location?.z || 0 
            },
            lastUpdate: system.currentTick
        });
    }

    /**
     * ボスバーを非表示
     */
    hideBossBar(player) {
        // プレイヤーが発電機を見ていた場合のみクリア
        if (this.playerGeneratorMap.has(player.id)) {
            const lastUpdate = this.playerGeneratorMap.get(player.id).lastUpdate;
            // 最後の更新から一定時間経過していたらクリア
            if (system.currentTick - lastUpdate > 10) {
                player.onScreenDisplay.setActionBar("");
                this.playerGeneratorMap.delete(player.id);
            }
        }
    }
}

// シングルトンインスタンス
export const burnProgressDisplay = new BurnProgressDisplay();