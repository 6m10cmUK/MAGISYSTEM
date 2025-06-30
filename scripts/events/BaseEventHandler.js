/**
 * MAGISYSTEM 基底イベントハンドラー
 * すべてのイベントハンドラーの共通機能を提供
 */

import { ErrorHandler } from "../core/ErrorHandler.js";
import { Logger } from "../core/Logger.js";

export class BaseEventHandler {
    /**
     * コンストラクタ
     * @param {string} name - イベントハンドラー名
     */
    constructor(name) {
        this.name = name;
        this.registered = false;
        this.eventSubscriptions = [];
    }

    /**
     * イベントハンドラーを登録
     */
    register() {
        if (this.registered) {
            Logger.warn(`${this.name}は既に登録されています`, this.name);
            return;
        }

        try {
            this.setupEventHandlers();
            this.registered = true;
            Logger.info(`${this.name}を登録しました`, this.name);
        } catch (error) {
            ErrorHandler.handleError(error, `${this.name}.register`);
        }
    }

    /**
     * イベントハンドラーの設定（サブクラスで実装）
     */
    setupEventHandlers() {
        throw new Error("setupEventHandlers()メソッドは実装する必要があります");
    }

    /**
     * 安全なイベントサブスクリプション
     * @param {Object} eventObject - イベントオブジェクト
     * @param {Function} handler - イベントハンドラー関数
     * @param {string} eventName - イベント名（ログ用）
     */
    safeSubscribe(eventObject, handler, eventName) {
        try {
            const subscription = eventObject.subscribe((event) => {
                ErrorHandler.safeTry(() => {
                    Logger.startTimer(`${this.name}_${eventName}`);
                    handler(event);
                    Logger.endTimer(`${this.name}_${eventName}`, this.name);
                }, `${this.name}.${eventName}`);
            });

            this.eventSubscriptions.push({
                name: eventName,
                subscription,
                eventObject
            });

            Logger.debug(`イベント登録: ${eventName}`, this.name);
        } catch (error) {
            ErrorHandler.handleError(error, `${this.name}.safeSubscribe`, { eventName });
        }
    }

    /**
     * 条件付きイベントサブスクリプション
     * @param {Object} eventObject 
     * @param {Function} handler 
     * @param {Function} condition - イベントを処理するかどうかの条件
     * @param {string} eventName 
     */
    conditionalSubscribe(eventObject, handler, condition, eventName) {
        this.safeSubscribe(eventObject, (event) => {
            if (condition(event)) {
                handler(event);
            }
        }, eventName);
    }

    /**
     * デバウンス付きイベントサブスクリプション
     * @param {Object} eventObject 
     * @param {Function} handler 
     * @param {number} delay - デバウンス遅延（tick）
     * @param {string} eventName 
     */
    debouncedSubscribe(eventObject, handler, delay, eventName) {
        let timeout;
        this.safeSubscribe(eventObject, (event) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => handler(event), delay);
        }, eventName);
    }

    /**
     * イベントハンドラーの登録解除
     */
    unregister() {
        if (!this.registered) return;

        try {
            for (const { name, subscription, eventObject } of this.eventSubscriptions) {
                if (eventObject.unsubscribe && subscription) {
                    eventObject.unsubscribe(subscription);
                    Logger.debug(`イベント登録解除: ${name}`, this.name);
                }
            }

            this.eventSubscriptions = [];
            this.registered = false;
            Logger.info(`${this.name}の登録を解除しました`, this.name);
        } catch (error) {
            ErrorHandler.handleError(error, `${this.name}.unregister`);
        }
    }

    /**
     * イベント統計情報を取得
     * @returns {Object}
     */
    getStats() {
        return {
            name: this.name,
            registered: this.registered,
            eventCount: this.eventSubscriptions.length,
            events: this.eventSubscriptions.map(e => e.name)
        };
    }

    /**
     * プレイヤーがデバッグモードかチェック
     * @param {Player} player 
     * @returns {boolean}
     */
    isDebugMode(player) {
        return player?.hasTag("debug_energy") || false;
    }

    /**
     * デバッグメッセージを送信
     * @param {Player} player 
     * @param {string} message 
     */
    sendDebugMessage(player, message) {
        if (this.isDebugMode(player)) {
            player.sendMessage(`§7[DEBUG] ${message}`);
        }
    }
}