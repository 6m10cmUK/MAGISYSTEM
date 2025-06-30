import { system } from "@minecraft/server";
import { generator } from "../machines/Generator.js";
import { Logger } from "../core/Logger.js";
import { Constants } from "../core/Constants.js";
import { ErrorHandler } from "../core/ErrorHandler.js";

/**
 * 燃焼プログレスバー表示クラス
 * パーティクルを使用してブロック表面にプログレスバーを表示
 */
export class BurnProgressBar {
    constructor() {
        this.activeGenerators = new Map();
        this.updateInterval = 5; // 5tickごとに更新
    }

    /**
     * 初期化
     */
    initialize() {
        system.runInterval(() => {
            this.updateAllBars();
        }, this.updateInterval);

        Logger.info("燃焼プログレスバー表示システムを初期化", "BurnProgressBar");
    }

    /**
     * 発電機を登録
     */
    registerGenerator(block) {
        const key = `${block.location.x},${block.location.y},${block.location.z}`;
        this.activeGenerators.set(key, {
            block: block,
            dimension: block.dimension
        });
    }

    /**
     * 発電機を登録解除
     */
    unregisterGenerator(location) {
        const key = `${location.x},${location.y},${location.z}`;
        this.activeGenerators.delete(key);
    }

    /**
     * すべてのプログレスバーを更新
     */
    updateAllBars() {
        for (const [key, data] of this.activeGenerators) {
            try {
                const block = data.dimension.getBlock(data.block.location);
                if (!block || (block.typeId !== Constants.BLOCK_TYPES.THERMAL_GENERATOR && 
                    block.typeId !== Constants.BLOCK_TYPES.GENERATOR)) {
                    this.activeGenerators.delete(key);
                    continue;
                }

                const genInfo = generator.getGeneratorInfo(block);
                if (genInfo && genInfo.burnTime > 0 && genInfo.maxBurnTime > 0) {
                    const progress = genInfo.burnTime / genInfo.maxBurnTime;
                    this.displayProgressBar(block, progress);
                }
            } catch (error) {
                Logger.debug(`プログレスバー更新エラー: ${error}`, "BurnProgressBar");
            }
        }
    }

    /**
     * プログレスバーを表示
     */
    displayProgressBar(block, progress) {
        const location = block.location;
        const dimension = block.dimension;

        // バーのパラメータ
        const barLength = 0.8; // ブロックの80%の長さ
        const barHeight = 0.1; // バーの高さ
        const barY = location.y + 1.1; // ブロックの少し上

        // 進行状況に応じた色を決定
        let particleType = "minecraft:villager_happy"; // 緑
        if (progress < 0.3) particleType = "minecraft:endrod"; // 黄色
        if (progress < 0.1) particleType = "minecraft:redstone_wire_dust_particle"; // 赤

        // バーの開始位置と終了位置
        const startX = location.x + 0.5 - barLength / 2;
        const endX = startX + (barLength * progress);
        const z = location.z + 0.5;

        // パーティクルでバーを描画（10個のパーティクル）
        const particleCount = 10;
        for (let i = 0; i < particleCount; i++) {
            const x = startX + (endX - startX) * (i / particleCount);
            dimension.spawnParticle(particleType, {
                x: x,
                y: barY,
                z: z
            });
        }

        // バックグラウンド（空のバー部分）を薄く表示
        if (progress < 1) {
            const bgStartX = endX;
            const bgEndX = location.x + 0.5 + barLength / 2;
            const bgParticleCount = Math.floor((1 - progress) * particleCount);
            
            for (let i = 0; i < bgParticleCount; i++) {
                const x = bgStartX + (bgEndX - bgStartX) * (i / bgParticleCount);
                dimension.spawnParticle("minecraft:balloon_gas_particle", {
                    x: x,
                    y: barY,
                    z: z
                });
            }
        }
    }
}

// シングルトンインスタンス
export const burnProgressBar = new BurnProgressBar();