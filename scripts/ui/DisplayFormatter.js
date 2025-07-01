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
                    // ゼーベック発電機の場合
                    if (info.data.requiresLavaAndWater) {
                        if (info.data.isActive) {
                            parts.push(`§7状態: §a発電中 (${info.data.generationRate} MF/s)`);
                        } else {
                            parts.push(`§7状態: §c停止中 (溶岩と水が必要)`);
                        }
                    }
                    // その他の発電機
                    else if (info.data.isActive && info.data.generationRate) {
                        parts.push(`§7発電: §a${info.data.generationRate} MF/s`);
                    }
                    // 電気炉の場合
                    else if (info.data.smeltTime !== undefined) {
                        if (info.data.isActive) {
                            parts.push(`§7精錬中: §e${info.data.inputItem ? info.data.inputItem.replace('minecraft:', '') : 'なし'}`);
                            parts.push(`§7進捗: §a${info.data.smeltProgress}%`);
                            parts.push(`§7残り: §f${Math.ceil(info.data.smeltTime / 20)}秒`);
                        } else if (info.data.energy < info.data.energyPerTick) {
                            parts.push(`§cエネルギー不足`);
                        } else {
                            parts.push(`§7待機中`);
                        }
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