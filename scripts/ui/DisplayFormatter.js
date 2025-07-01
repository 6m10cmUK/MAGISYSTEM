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
        if (!info) return "";

        const parts = [];

        switch (info.type) {
            case "energy":
                if (info.data.isActive !== undefined) {
                    if (info.data.isActive && info.data.generationRate) {
                        parts.push(`§7発電: §a${info.data.generationRate} MF/s`);
                    }
                }
                parts.push(`§f${InfoGatherer.formatNumber(info.data.energy)}/${InfoGatherer.formatNumber(info.data.maxEnergy)} MF(§f${info.data.percent}%)`);
                break;

            case "inventory":
                parts.push(`§7アイテム: §f${info.data.itemCount}個`);
                parts.push(`§7スロット: §f${info.data.slotCount}/${info.data.totalSlots}`);
                if (info.data.pipeConnections > 0) {
                    parts.push(`§7パイプ: §a${info.data.pipeConnections}方向`);
                }
                break;
        }

        return parts.join(" §r| ");
    }

}