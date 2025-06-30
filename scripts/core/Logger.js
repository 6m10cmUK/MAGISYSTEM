/**
 * MAGISYSTEM ログシステム
 * 統一的なログ出力とデバッグ機能を提供
 */

import { world } from '@minecraft/server';
import { Constants } from './Constants.js';
import { Utils } from './Utils.js';

export class Logger {
    static logLevel = Constants.LOG_LEVELS.INFO;
    static logHistory = [];
    static maxHistorySize = 200;
    static categories = new Set();

    /**
     * デバッグメッセージを記録
     * @param {string} message 
     * @param {string} category 
     * @param {Object} data 
     */
    static debug(message, category = 'General', data = null) {
        if (this.logLevel <= Constants.LOG_LEVELS.DEBUG) {
            this.log('DEBUG', message, category, data);
        }
    }

    /**
     * 情報メッセージを記録
     * @param {string} message 
     * @param {string} category 
     */
    static info(message, category = 'General') {
        if (this.logLevel <= Constants.LOG_LEVELS.INFO) {
            this.log('INFO', message, category);
        }
    }

    /**
     * 警告メッセージを記録
     * @param {string} message 
     * @param {string} category 
     */
    static warn(message, category = 'General') {
        if (this.logLevel <= Constants.LOG_LEVELS.WARN) {
            this.log('WARN', message, category);
        }
    }

    /**
     * エラーメッセージを記録
     * @param {string} message 
     * @param {string} category 
     * @param {Error} error 
     */
    static error(message, category = 'General', error = null) {
        if (this.logLevel <= Constants.LOG_LEVELS.ERROR) {
            this.log('ERROR', message, category, error);
        }
    }

    /**
     * ログエントリを作成
     * @param {string} level 
     * @param {string} message 
     * @param {string} category 
     * @param {*} data 
     */
    static log(level, message, category, data = null) {
        const entry = {
            timestamp: Date.now(),
            level,
            category,
            message,
            data
        };

        // カテゴリを記録
        this.categories.add(category);

        // 履歴に追加
        this.logHistory.push(entry);
        if (this.logHistory.length > this.maxHistorySize) {
            this.logHistory.shift();
        }

        // コンソール出力
        const levelColor = this.getLevelColor(level);
        const formattedMessage = `${levelColor}[${level}]§r [${category}] ${message}`;
        
        console.log(formattedMessage);
        
        if (data) {
            if (data instanceof Error) {
                console.log(`  ${data.message}`);
                if (this.logLevel <= Constants.LOG_LEVELS.DEBUG) {
                    console.log(`  ${data.stack}`);
                }
            } else {
                console.log(`  データ: ${JSON.stringify(data, null, 2)}`);
            }
        }

        // 重要なログはゲーム内通知
        if (level === 'ERROR' || (level === 'WARN' && this.logLevel <= Constants.LOG_LEVELS.INFO) || 
            (level === 'DEBUG' && this.logLevel <= Constants.LOG_LEVELS.DEBUG)) {
            this.notifyInGame(level, category, message);
        }
    }

    /**
     * レベルに応じた色を取得
     * @param {string} level 
     * @returns {string}
     */
    static getLevelColor(level) {
        const colors = {
            DEBUG: '§7',
            INFO: '§b',
            WARN: '§e',
            ERROR: '§c'
        };
        return colors[level] || '§f';
    }

    /**
     * ゲーム内に通知
     * @param {string} level 
     * @param {string} category 
     * @param {string} message 
     */
    static notifyInGame(level, category, message) {
        try {
            const players = world.getAllPlayers();
            const levelColor = this.getLevelColor(level);
            const notification = `${levelColor}[MAGISYSTEM ${level}]§r ${category}: ${message}`;
            
            for (const player of players) {
                // デバッグモードのプレイヤーにはDEBUGログも表示
                const showDebug = player.hasTag('debug_energy');
                
                if (player.isOp() || level === 'ERROR' || (showDebug && level === 'DEBUG')) {
                    player.sendMessage(notification);
                }
            }
        } catch (error) {
            // 通知エラーは無視
        }
    }

    /**
     * パフォーマンス計測開始
     * @param {string} label 
     */
    static startTimer(label) {
        if (this.logLevel <= Constants.LOG_LEVELS.DEBUG) {
            this.timers = this.timers || new Map();
            this.timers.set(label, Date.now());
        }
    }

    /**
     * パフォーマンス計測終了
     * @param {string} label 
     * @param {string} category 
     */
    static endTimer(label, category = 'Performance') {
        if (this.logLevel <= Constants.LOG_LEVELS.DEBUG && this.timers && this.timers.has(label)) {
            const duration = Date.now() - this.timers.get(label);
            this.timers.delete(label);
            this.debug(`${label}: ${duration}ms`, category);
        }
    }

    /**
     * ログレベルを設定
     * @param {number} level 
     */
    static setLogLevel(level) {
        if (level >= Constants.LOG_LEVELS.DEBUG && level <= Constants.LOG_LEVELS.ERROR) {
            this.logLevel = level;
            this.info(`ログレベルを変更: ${this.getLevelName(level)}`, 'Logger');
        }
    }

    /**
     * レベル名を取得
     * @param {number} level 
     * @returns {string}
     */
    static getLevelName(level) {
        const names = {
            [Constants.LOG_LEVELS.DEBUG]: 'DEBUG',
            [Constants.LOG_LEVELS.INFO]: 'INFO',
            [Constants.LOG_LEVELS.WARN]: 'WARN',
            [Constants.LOG_LEVELS.ERROR]: 'ERROR'
        };
        return names[level] || 'UNKNOWN';
    }

    /**
     * ログ履歴を取得
     * @param {Object} filter 
     * @returns {Array}
     */
    static getHistory(filter = {}) {
        let history = [...this.logHistory];

        // レベルでフィルタ
        if (filter.level) {
            history = history.filter(entry => entry.level === filter.level);
        }

        // カテゴリでフィルタ
        if (filter.category) {
            history = history.filter(entry => entry.category === filter.category);
        }

        // 時間範囲でフィルタ
        if (filter.since) {
            history = history.filter(entry => entry.timestamp >= filter.since);
        }

        // 最大件数
        if (filter.limit) {
            history = history.slice(-filter.limit);
        }

        return history;
    }

    /**
     * ログ履歴をクリア
     */
    static clearHistory() {
        this.logHistory = [];
        this.info('ログ履歴をクリア', 'Logger');
    }

    /**
     * カテゴリ一覧を取得
     * @returns {Array<string>}
     */
    static getCategories() {
        return Array.from(this.categories).sort();
    }

    /**
     * ログサマリーを生成
     * @returns {Object}
     */
    static generateSummary() {
        const summary = {
            total: this.logHistory.length,
            byLevel: {},
            byCategory: {},
            recentErrors: []
        };

        // レベル別集計
        for (const entry of this.logHistory) {
            summary.byLevel[entry.level] = (summary.byLevel[entry.level] || 0) + 1;
            summary.byCategory[entry.category] = (summary.byCategory[entry.category] || 0) + 1;
        }

        // 最近のエラー
        summary.recentErrors = this.getHistory({ 
            level: 'ERROR', 
            limit: 5 
        }).map(entry => ({
            time: new Date(entry.timestamp).toLocaleTimeString(),
            category: entry.category,
            message: entry.message
        }));

        return summary;
    }

    /**
     * ブロック操作をログ
     * @param {string} action 
     * @param {Block} block 
     * @param {Object} details 
     */
    static logBlock(action, block, details = {}) {
        if (this.logLevel <= Constants.LOG_LEVELS.DEBUG) {
            const blockInfo = {
                type: block.typeId,
                location: Utils.locationToKey(block.location),
                ...details
            };
            this.debug(`${action}: ${block.typeId}`, 'Block', blockInfo);
        }
    }

    /**
     * エネルギー操作をログ
     * @param {string} action 
     * @param {number} amount 
     * @param {Object} details 
     */
    static logEnergy(action, amount, details = {}) {
        if (this.logLevel <= Constants.LOG_LEVELS.DEBUG) {
            this.debug(`${action}: ${amount} MF`, 'Energy', details);
        }
    }
}