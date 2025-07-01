import { world, system } from "@minecraft/server";
import { InfoGatherer } from "./InfoGatherer.js";
import { DisplayFormatter } from "./DisplayFormatter.js";

/**
 * ActionBar表示システム
 * InfoGathererとDisplayFormatterを使用してシンプルに実装
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
            blockLocation: {
                x: block.location.x,
                y: block.location.y,
                z: block.location.z
            },
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

        const { player, blockLocation } = displayData;

        // プレイヤーが見ているブロックを確認
        const blockRay = player.getBlockFromViewDirection({ maxDistance: 10 });
        
        // 登録されたブロックを見ていない場合は表示停止
        if (!blockRay?.block || 
            blockRay.block.location.x !== blockLocation.x ||
            blockRay.block.location.y !== blockLocation.y ||
            blockRay.block.location.z !== blockLocation.z) {
            this.clearDisplay(player);
            return;
        }

        // ブロック情報を収集（非同期）
        InfoGatherer.gatherBlockInfo(blockRay.block).then(info => {
            if (!info) {
                this.clearDisplay(player);
                return;
            }

            // ActionBar用にフォーマットして表示
            const displayText = DisplayFormatter.formatForActionBar(info);
            if (displayText) {
                player.onScreenDisplay.setActionBar(displayText);
            }
        });
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
     * プレイヤーの表示をクリア
     */
    clearDisplay(player) {
        const playerId = player.id;
        this.activeDisplays.delete(playerId);
        // ActionBarをクリア
        player.onScreenDisplay.setActionBar("");
    }
}

// シングルトンインスタンスをエクスポート
export const displaySystem = new DisplaySystem();