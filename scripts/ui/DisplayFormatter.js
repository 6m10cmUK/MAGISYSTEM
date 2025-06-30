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
                    parts.push(`§7状態: ${info.data.isActive ? "§a稼働中" : "§c停止中"}`);
                    if (info.data.isActive && info.data.generationRate) {
                        parts.push(`§7発電: §a${info.data.generationRate} MF/s`);
                    }
                }
                parts.push(`§7エネルギー: §f${InfoGatherer.formatNumber(info.data.energy)}/${InfoGatherer.formatNumber(info.data.maxEnergy)} MF`);
                parts.push(`§7充電率: §f${info.data.percent}%`);
                
                if (info.data.transferRate) {
                    parts.push(`§7転送: §f${info.data.transferRate} MF/s`);
                }
                break;

            case "cable":
                parts.push(`§7転送量: §f${info.data.transferRate} MF/s`);
                break;

            case "pipe":
                parts.push(`§7転送量: §f${info.data.transferRate} アイテム/s`);
                if (info.data.connections !== undefined) {
                    parts.push(`§7接続: §f${info.data.connections}方向`);
                }
                parts.push(`§7ネット: §f${info.data.networkSize}個`);
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