import { system } from "@minecraft/server";
import { Constants } from "../core/Constants.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { Logger } from "../core/Logger.js";

/**
 * バッチ処理最適化クラス
 * 大量の処理を効率的に実行するためのユーティリティ
 */
export class BatchProcessor {
    /**
     * 配列を指定サイズのバッチに分割して処理
     * @param {Array} items - 処理する項目の配列
     * @param {Function} processor - 各項目を処理する関数
     * @param {Object} options - オプション設定
     * @returns {Promise<Array>} 処理結果の配列
     */
    static async processBatch(items, processor, options = {}) {
        const {
            batchSize = Constants.PERFORMANCE.BATCH_SIZE,
            delayBetweenBatches = 1,
            context = "BatchProcessor"
        } = options;

        const results = [];
        const batches = this.createBatches(items, batchSize);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const batchResults = [];

            // バッチ内の各項目を処理
            for (const item of batch) {
                const result = await ErrorHandler.safeTryAsync(
                    async () => await processor(item),
                    `${context}.processBatch[${i}]`,
                    null
                );
                if (result !== null) {
                    batchResults.push(result);
                }
            }

            results.push(...batchResults);

            // 次のバッチまで待機（最後のバッチ以外）
            if (i < batches.length - 1 && delayBetweenBatches > 0) {
                await this.delay(delayBetweenBatches);
            }
        }

        return results;
    }

    /**
     * 指定間隔で処理を実行（デバウンス機能付き）
     * @param {Function} processor - 実行する処理
     * @param {number} interval - 実行間隔（tick）
     * @param {Object} options - オプション設定
     * @returns {Object} 制御オブジェクト
     */
    static createDebouncedInterval(processor, interval, options = {}) {
        const {
            debounceDelay = Constants.PERFORMANCE.DEBOUNCE_DELAY,
            context = "DebouncedInterval"
        } = options;

        let lastExecution = 0;
        let isRunning = false;
        let subscription = null;

        const execute = async () => {
            const currentTick = system.currentTick;
            
            // デバウンス処理
            if (currentTick - lastExecution < debounceDelay) {
                return;
            }

            if (isRunning) {
                Logger.debug(`Skipping execution - already running`, context);
                return;
            }

            isRunning = true;
            lastExecution = currentTick;

            await ErrorHandler.safeTryAsync(
                async () => await processor(),
                context
            );

            isRunning = false;
        };

        // インターバルを開始
        subscription = system.runInterval(execute, interval);

        return {
            stop: () => {
                if (subscription) {
                    system.clearRun(subscription);
                    subscription = null;
                }
            },
            forceExecute: execute,
            isRunning: () => isRunning
        };
    }

    /**
     * 並列処理を管理（同時実行数を制限）
     * @param {Array<Function>} tasks - 実行するタスクの配列
     * @param {number} maxConcurrent - 最大同時実行数
     * @returns {Promise<Array>} 実行結果の配列
     */
    static async parallelLimit(tasks, maxConcurrent = 3) {
        const results = [];
        const executing = [];

        for (const task of tasks) {
            const promise = ErrorHandler.safeTryAsync(
                async () => await task(),
                "BatchProcessor.parallelLimit",
                null
            );

            results.push(promise);

            if (tasks.length >= maxConcurrent) {
                executing.push(promise);

                if (executing.length >= maxConcurrent) {
                    await Promise.race(executing);
                    executing.splice(executing.findIndex(p => p === promise), 1);
                }
            }
        }

        return Promise.all(results);
    }

    /**
     * 配列をバッチに分割
     * @private
     */
    static createBatches(array, batchSize) {
        const batches = [];
        for (let i = 0; i < array.length; i += batchSize) {
            batches.push(array.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * 指定tick数待機
     * @private
     */
    static delay(ticks) {
        return new Promise(resolve => {
            system.runTimeout(resolve, ticks);
        });
    }

    /**
     * 重い処理を複数フレームに分散
     * @param {Function} processor - 実行する処理
     * @param {Array} items - 処理する項目
     * @param {Object} options - オプション設定
     */
    static async distributeOverFrames(processor, items, options = {}) {
        const {
            itemsPerFrame = 5,
            context = "DistributeOverFrames"
        } = options;

        for (let i = 0; i < items.length; i += itemsPerFrame) {
            const batch = items.slice(i, i + itemsPerFrame);
            
            for (const item of batch) {
                await ErrorHandler.safeTryAsync(
                    async () => await processor(item),
                    context
                );
            }

            // 次のフレームまで待機
            if (i + itemsPerFrame < items.length) {
                await this.delay(1);
            }
        }
    }
}