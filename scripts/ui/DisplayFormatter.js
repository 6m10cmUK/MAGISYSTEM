import { InfoGatherer } from "./InfoGatherer.js";

/**
 * 表示フォーマットクラス
 * ActionBar表示用にフォーマット
 */
export class DisplayFormatter {
    /**
     * ActionBar用にフォーマット（1行表示）
     * @param {Object} info - InfoGathererで収集した情報
     * @returns {string} フォーマット済み文字列
     */
    static formatForActionBar(info) {
        if (!info || !info.data) return "";

        const parts = [];

        // すべてのブロックに対してまず名前を表示（ID付き）
        if (info.data.displayName) {
            parts.push(`§e${info.data.displayName} §7§o${info.typeId}§r`);
        }

        switch (info.type) {
            case "energy":
                if (info.data.isActive !== undefined) {
                    // 発電機
                    if (info.data.generationRate) {
                        if (info.data.isActive) {
                            parts.push(`§7発電: §a${info.data.generationRate} MF/s`);
                            if (info.data.fuelItem) {
                                // 燃料アイテムの表示名を取得
                                const fuelName = InfoGatherer.getItemDisplayName(info.data.fuelItem);
                                const burnRemaining = info.data.maxBurnTime > 0
                                    ? Math.round(info.data.burnTime / info.data.maxBurnTime * 100)
                                    : 0;
                                parts.push(`§7燃焼中: §e${fuelName} §7(§a${burnRemaining}%§7)`);
                            }
                        } else {
                            parts.push(`§7待機中`);
                        }
                    }
                    // 電気炉の場合
                    else if (info.data.smeltTime !== undefined) {
                        if (info.data.isActive) {
                            parts.push(`§7精錬中: §e${info.data.inputItem ? info.data.inputItem.replace('minecraft:', '') : 'なし'}(§a${info.data.smeltProgress}%§7)`);
                        } else if (info.data.energy < info.data.energyPerTick) {
                            parts.push(`§cエネルギー不足`);
                        } else {
                            parts.push(`§7待機中`);
                        }
                    }
                }
                // バッテリーインジケーター表示
                const indicator = this.createEnergyIndicator(info.data.percent);
                parts.push(`${indicator} §f${InfoGatherer.formatNumber(info.data.energy)}/${InfoGatherer.formatNumber(info.data.maxEnergy)} MF`);
                break;

            case "cable":
                parts.push(`§7転送速度: §a${info.data.transferRate} MF/tick`);
                break;

            case "pipe":
                parts.push(`§7アイテムパイプ`);
                if (info.data.connections) {
                    parts.push(`§7接続: §a${info.data.connections}方向`);
                }
                if (info.data.transportManager && info.data.transportManager.running) {
                    parts.push(`§7輸送元: §f${info.data.transportManager.sources}`);
                }
                break;

            case "inventory":
                parts.push(`§7アイテム: §f${info.data.itemCount}個`);
                parts.push(`§7スロット: §f${info.data.slotCount}/${info.data.totalSlots}`);
                break;

            case "basic":
                // 基本ブロックの場合は名前のみ（既に追加済み）
                break;
        }

        // 改行で複数行表示に対応
        return parts.join("\n");
    }

    /**
     * エネルギーインジケーターを作成
     * @param {number} percent - パーセンテージ（0-100）
     * @returns {string} インジケーター文字列
     */
    static createEnergyIndicator(percent) {
        const totalBars = 10;
        const filledBars = Math.round(percent / 10);
        const emptyBars = totalBars - filledBars;
        
        let indicator = '§8[';
        
        // 色を決定（残量に応じて）
        let color;
        if (percent >= 60) {
            color = '§a'; // 緑
        } else if (percent >= 30) {
            color = '§e'; // 黄
        } else {
            color = '§c'; // 赤
        }

        const indicator_icon = '=';  // Black Diamond
        
        // バーを生成
        indicator += color;
        for (let i = 0; i < filledBars; i++) {
            indicator += indicator_icon;
        }
        
        indicator += '§8';
        for (let i = 0; i < emptyBars; i++) {
            indicator += indicator_icon;
        }
        
        indicator += '§8]';
        
        // パーセンテージも追加
        indicator += ` ${color}${percent}%§r`;
        
        return indicator;
    }
}