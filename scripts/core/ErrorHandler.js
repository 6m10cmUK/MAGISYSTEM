/**
 * MAGISYSTEM エラーハンドリングシステム
 * 統一的なエラー処理とログ出力を提供
 */

import { world } from '@minecraft/server';
import { Constants } from './Constants.js';

export class ErrorHandler {
    static logLevel = Constants.LOG_LEVELS.INFO;
    static errorHistory = [];
    static maxHistorySize = 100;

    /**
     * エラーを処理してログ出力
     * @param {Error} error 
     * @param {string} context 
     * @param {Object} additionalInfo 
     */
    static handleError(error, context, additionalInfo = {}) {
        const errorInfo = {
            timestamp: new Date().toISOString(),
            context,
            message: error.message,
            stack: error.stack,
            additionalInfo
        };

        // エラー履歴に追加
        this.errorHistory.push(errorInfo);
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory.shift();
        }

        // コンソールに出力
        this.logError(`[ERROR] ${context}: ${error.message}`);
        
        // デバッグモードの場合はスタックトレースも出力
        if (this.logLevel <= Constants.LOG_LEVELS.DEBUG) {
            console.error(error.stack);
        }

        // ゲーム内通知（オペレーターのみ）
        this.notifyOperators(`§c[MAGISYSTEM エラー] ${context}: ${error.message}`);
    }

    /**
     * 警告を記録
     * @param {string} message 
     * @param {string} context 
     * @param {Object} additionalInfo 
     */
    static warn(message, context, additionalInfo = {}) {
        if (this.logLevel <= Constants.LOG_LEVELS.WARN) {
            const warnInfo = {
                timestamp: new Date().toISOString(),
                context,
                message,
                additionalInfo
            };

            console.warn(`[WARN] ${context}: ${message}`);
            this.notifyOperators(`§e[MAGISYSTEM 警告] ${context}: ${message}`);
        }
    }

    /**
     * 情報を記録
     * @param {string} message 
     * @param {string} context 
     */
    static info(message, context) {
        if (this.logLevel <= Constants.LOG_LEVELS.INFO) {
            console.log(`[INFO] ${context}: ${message}`);
        }
    }

    /**
     * デバッグ情報を記録
     * @param {string} message 
     * @param {string} context 
     * @param {Object} data 
     */
    static debug(message, context, data = {}) {
        if (this.logLevel <= Constants.LOG_LEVELS.DEBUG) {
            console.log(`[DEBUG] ${context}: ${message}`, data);
        }
    }

    /**
     * エラーログを出力
     * @param {string} message 
     */
    static logError(message) {
        console.error(message);
    }

    /**
     * オペレーターに通知
     * @param {string} message 
     */
    static notifyOperators(message) {
        try {
            const players = world.getAllPlayers();
            for (const player of players) {
                if (player.isOp()) {
                    player.sendMessage(message);
                }
            }
        } catch (error) {
            // 通知の失敗は無視
        }
    }

    /**
     * 安全な関数実行
     * @param {Function} func 
     * @param {string} context 
     * @param {*} defaultReturn 
     * @returns {*}
     */
    static safeTry(func, context, defaultReturn = null) {
        try {
            return func();
        } catch (error) {
            this.handleError(error, context);
            return defaultReturn;
        }
    }

    /**
     * 非同期関数の安全な実行
     * @param {Function} asyncFunc 
     * @param {string} context 
     * @param {*} defaultReturn 
     * @returns {Promise<*>}
     */
    static async safeTryAsync(asyncFunc, context, defaultReturn = null) {
        try {
            return await asyncFunc();
        } catch (error) {
            this.handleError(error, context);
            return defaultReturn;
        }
    }

    /**
     * エラー履歴を取得
     * @param {number} limit 
     * @returns {Array}
     */
    static getErrorHistory(limit = 10) {
        return this.errorHistory.slice(-limit);
    }

    /**
     * エラー履歴をクリア
     */
    static clearErrorHistory() {
        this.errorHistory = [];
    }

    /**
     * ログレベルを設定
     * @param {number} level 
     */
    static setLogLevel(level) {
        if (level >= Constants.LOG_LEVELS.DEBUG && level <= Constants.LOG_LEVELS.ERROR) {
            this.logLevel = level;
        }
    }

    /**
     * カスタムエラークラス
     */
    static MagisystemError = class extends Error {
        constructor(message, code, context) {
            super(message);
            this.name = 'MagisystemError';
            this.code = code;
            this.context = context;
        }
    };

    /**
     * エラーをフォーマット
     * @param {Error} error 
     * @returns {string}
     */
    static formatError(error) {
        if (error instanceof this.MagisystemError) {
            return `[${error.code}] ${error.context}: ${error.message}`;
        }
        return `${error.name}: ${error.message}`;
    }
}