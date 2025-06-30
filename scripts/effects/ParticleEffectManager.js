import { system } from "@minecraft/server";
import { BlockUtils } from "../utils/BlockUtils.js";
import { Constants } from "../core/Constants.js";
import { ErrorHandler } from "../core/ErrorHandler.js";

/**
 * パーティクルエフェクト管理クラス
 * DRY原則に基づいてパーティクルエフェクトを一元管理
 */
export class ParticleEffectManager {
    /**
     * 発電機のエフェクトを生成
     * @param {Block} block - ブロック
     * @param {string} type - エフェクトタイプ ("normal", "creative", "test")
     */
    static spawnGeneratorEffect(block, type = "normal") {
        if (system.currentTick % 5 !== 0) return;
        
        return ErrorHandler.safeTry(() => {
            const effects = this.getGeneratorEffects()[type] || this.getGeneratorEffects().normal;
            
            effects.forEach(effect => {
                if (effect.random) {
                    const randomX = (Math.random() - 0.5) * 0.5;
                    const randomZ = (Math.random() - 0.5) * 0.5;
                    BlockUtils.spawnParticle(block, effect.particle, {
                        offset: { x: randomX, y: effect.offset.y, z: randomZ }
                    });
                } else {
                    BlockUtils.spawnParticle(block, effect.particle, { offset: effect.offset });
                }
            });
        }, "ParticleEffectManager.spawnGeneratorEffect");
    }
    
    /**
     * バッテリーのエフェクトを生成
     * @param {Block} block - ブロック
     * @param {number} chargeLevel - 充電レベル (0-100)
     */
    static spawnBatteryEffect(block, chargeLevel) {
        if (system.currentTick % 10 !== 0) return;
        
        return ErrorHandler.safeTry(() => {
            if (chargeLevel > 80) {
                // 高充電時
                BlockUtils.spawnParticle(block, Constants.PARTICLES.ENERGY, {
                    offset: { x: 0, y: 0.5, z: 0 }
                });
            } else if (chargeLevel > 20) {
                // 中充電時
                if (system.currentTick % 20 === 0) {
                    BlockUtils.spawnParticle(block, Constants.PARTICLES.REDSTONE, {
                        offset: { x: 0, y: 0.5, z: 0 }
                    });
                }
            }
            // 低充電時はエフェクトなし
        }, "ParticleEffectManager.spawnBatteryEffect");
    }
    
    /**
     * エネルギー転送エフェクトを生成
     * @param {Block} fromBlock - 送信元ブロック
     * @param {Block} toBlock - 送信先ブロック
     */
    static spawnEnergyTransferEffect(fromBlock, toBlock) {
        if (system.currentTick % 10 !== 0) return;
        
        return ErrorHandler.safeTry(() => {
            // 送信元から送信先への方向を計算
            const dx = toBlock.location.x - fromBlock.location.x;
            const dy = toBlock.location.y - fromBlock.location.y;
            const dz = toBlock.location.z - fromBlock.location.z;
            
            // 中間点でパーティクルを生成
            const midX = fromBlock.location.x + dx * 0.5;
            const midY = fromBlock.location.y + dy * 0.5;
            const midZ = fromBlock.location.z + dz * 0.5;
            
            BlockUtils.spawnParticle(fromBlock, Constants.PARTICLES.ELECTRIC_SPARK, {
                molangVariables: { variable_x: midX, variable_y: midY, variable_z: midZ }
            });
        }, "ParticleEffectManager.spawnEnergyTransferEffect");
    }
    
    /**
     * ブロック破壊エフェクトを生成
     * @param {Location} location - 場所
     * @param {Dimension} dimension - ディメンション
     * @param {string} blockType - ブロックタイプ
     */
    static spawnBreakEffect(location, dimension, blockType) {
        return ErrorHandler.safeTry(() => {
            const particleCount = blockType.includes("generator") ? 10 : 5;
            
            for (let i = 0; i < particleCount; i++) {
                const randomX = (Math.random() - 0.5) * 0.8;
                const randomY = Math.random() * 0.5;
                const randomZ = (Math.random() - 0.5) * 0.8;
                
                BlockUtils.spawnParticle(
                    { location, dimension },
                    Constants.PARTICLES.ELECTRIC_SPARK,
                    {
                        offset: { x: randomX, y: randomY, z: randomZ }
                    }
                );
            }
        }, "ParticleEffectManager.spawnBreakEffect");
    }
    
    /**
     * 発電機エフェクトの定義を取得
     * @private
     * @returns {Object} エフェクト定義
     */
    static getGeneratorEffects() {
        return {
            normal: [
                { particle: Constants.PARTICLES.FLAME, offset: { x: 0, y: 0.5, z: 0 } },
                { particle: Constants.PARTICLES.SMOKE, offset: { x: 0, y: 1.0, z: 0 } },
                { particle: Constants.PARTICLES.ENERGY, offset: { x: 0, y: 0.5, z: 0 }, random: true }
            ],
            creative: [
                { particle: Constants.PARTICLES.ENERGY, offset: { x: 0, y: 0.5, z: 0 } },
                { particle: Constants.PARTICLES.ELECTRIC_SPARK, offset: { x: 0, y: 0.8, z: 0 } }
            ],
            test: [
                { particle: Constants.PARTICLES.FLAME, offset: { x: 0, y: 0.5, z: 0 } },
                { particle: Constants.PARTICLES.ELECTRIC_SPARK, offset: { x: 0, y: 0.8, z: 0 } },
                { particle: Constants.PARTICLES.SMOKE, offset: { x: 0, y: 1.0, z: 0 } },
                { particle: Constants.PARTICLES.ENERGY, offset: { x: 0, y: 0.5, z: 0 }, random: true }
            ]
        };
    }
}