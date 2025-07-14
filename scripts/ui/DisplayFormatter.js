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

        // すべてのブロックに対してまず名前を表示
        if (info.data.displayName) {
            parts.push(`§e${info.data.displayName}`);
        }

        switch (info.type) {
            case "energy":
                if (info.data.isActive !== undefined) {
                    // 発電機
                    if (info.data.isActive && info.data.generationRate) {
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
                if (info.data.pipeConnections > 0) {
                    parts.push(`§7パイプ: §a${info.data.pipeConnections}方向`);
                }
                break;

            case "basic":
                // 基本ブロックの場合は名前のみ（既に追加済み）
                break;
        }

        // 改行で複数行表示に対応
        return parts.join("\n");
    }


}