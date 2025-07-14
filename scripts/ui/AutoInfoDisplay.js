import { world, system } from "@minecraft/server";
import { InfoGatherer } from "./InfoGatherer.js";
import { DisplayFormatter } from "./DisplayFormatter.js";
import { Logger } from "../core/Logger.js";
import { ErrorHandler } from "../core/ErrorHandler.js";

/**
 * 自動情報表示システム
 * プレイヤーが見ているブロックの情報を自動的に表示
 */
export class AutoInfoDisplay {
    constructor() {
        this.playerStates = new Map(); // プレイヤーID -> 状態
        this.updateInterval = 4; // 0.2秒ごとに更新（5tick）
        this.maxViewDistance = 6; // 最大視線距離
        this.displayDuration = 0; // 表示継続時間（0秒）※視線を外したら即座に消える
        this.displayMode = 'actionbar'; // 'actionbar' または 'title' または 'subtitle'
    }

    /**
     * システムを初期化
     */
    initialize() {
        Logger.debug("自動情報表示システムを初期化", "AutoInfoDisplay");
        
        // 定期更新を開始
        system.runInterval(() => {
            this.updateAllPlayers();
        }, this.updateInterval);
        
        // プレイヤー参加/退出イベント
        world.afterEvents.playerJoin.subscribe(event => {
            this.onPlayerJoin(event.player);
        });
        
        world.afterEvents.playerLeave.subscribe(event => {
            this.onPlayerLeave(event.playerId);
        });
    }

    /**
     * プレイヤー参加時の処理
     */
    onPlayerJoin(player) {
        if (!player || !player.id) {
            Logger.warn("無効なプレイヤーオブジェクト", "AutoInfoDisplay");
            return;
        }
        this.playerStates.set(player.id, {
            lastBlockKey: null,
            displayEndTick: 0,
            isDisplaying: false,
            lastDisplayText: null,
            lastUpdateTick: 0
        });
        Logger.debug(`プレイヤー ${player.name || player.id} の表示状態を初期化`, "AutoInfoDisplay");
    }

    /**
     * プレイヤー退出時の処理
     */
    onPlayerLeave(playerId) {
        this.playerStates.delete(playerId);
    }

    /**
     * すべてのプレイヤーを更新
     */
    updateAllPlayers() {
        const players = world.getAllPlayers();
        const currentTick = system.currentTick;
        
        for (const player of players) {
            if (!player || !player.id) continue;
            ErrorHandler.safeTry(() => {
                this.updatePlayer(player, currentTick);
            }, `AutoInfoDisplay.updatePlayer[${player.name || player.id}]`);
        }
    }

    /**
     * プレイヤーの表示を更新
     */
    async updatePlayer(player, currentTick) {
        // プレイヤー状態を取得（なければ作成）
        let state = this.playerStates.get(player.id);
        if (!state) {
            state = {
                lastBlockKey: null,
                displayEndTick: 0,
                isDisplaying: false,
                lastDisplayText: null,
                lastUpdateTick: 0
            };
            this.playerStates.set(player.id, state);
        }

        // プレイヤーが見ているブロックを取得
        const blockHit = player.getBlockFromViewDirection({
            maxDistance: this.maxViewDistance
        });

        if (!blockHit || !blockHit.block) {
            // ブロックを見ていない場合、即座に消す
            if (state.isDisplaying) {
                this.clearDisplay(player);
                state.isDisplaying = false;
                state.lastBlockKey = null;
            }
            return;
        }

        const block = blockHit.block;
        const blockKey = `${block.location.x},${block.location.y},${block.location.z}`;

        // 同じブロックを見続けている場合
        if (blockKey === state.lastBlockKey) {
            // 視線を合わせている間は表示し続ける
            state.displayEndTick = currentTick + (this.displayDuration || 100); // 最低でも5秒は表示
            
            // 詳細情報があるブロックは0.2秒ごとに更新（4tick = 0.2秒）
            const info = await InfoGatherer.gatherBlockInfo(block);
            const shouldUpdate = this.shouldUpdateDisplay(info ? info.type : "basic", currentTick, state);
            
            if (shouldUpdate && info) {
                const displayText = DisplayFormatter.formatForActionBar(info);
                if (displayText) {
                    this.showDisplay(player, displayText);
                    state.lastDisplayText = displayText;
                    state.lastUpdateTick = currentTick;
                }
            }
            return;
        }

        // 新しいブロックを見た場合
        state.lastBlockKey = blockKey;

        // ブロック情報を収集
        const info = await InfoGatherer.gatherBlockInfo(block);
        if (!info) {
            // 情報がないブロックの場合
            if (state.isDisplaying) {
                this.clearDisplay(player);
                state.isDisplaying = false;
            }
            return;
        }

        // 情報を表示
        const displayText = DisplayFormatter.formatForActionBar(info);
        if (displayText) {
            this.showDisplay(player, displayText);
            state.isDisplaying = true;
            state.displayEndTick = currentTick + (this.displayDuration || 100);
            state.lastDisplayText = displayText;
            state.lastUpdateTick = currentTick;
        }
    }

    /**
     * 表示を更新すべきかどうかを判定
     * @param {string} blockType - ブロックタイプ（energy, cable, pipe, inventory, basic）
     * @param {number} currentTick - 現在のtick
     * @param {Object} state - プレイヤーの状態
     * @returns {boolean} 更新すべきかどうか
     */
    shouldUpdateDisplay(blockType, currentTick, state) {
        // 詳細情報があるブロックは0.2秒ごとに更新（4tick = 0.2秒）
        const detailBlockTypes = ["energy", "pipe", "inventory"];
        const updateInterval = detailBlockTypes.includes(blockType) ? 4 : 20; // 詳細情報は4tick、その他は20tick
        
        // 最初の更新または更新間隔が経過した場合
        return state.lastUpdateTick === 0 || (currentTick - state.lastUpdateTick) >= updateInterval;
    }

    /**
     * 情報を表示
     */
    showDisplay(player, text) {
        if (this.displayMode === 'subtitle') {
            // サブタイトル表示（画面中央上寄り）
            this.showSubtitle(player, text);
        } else if (this.displayMode === 'title') {
            // タイトル表示（画面中央）
            player.onScreenDisplay.setTitle(' ', {
                stayDuration: 40,      // 2秒間表示
                fadeInDuration: 0,     // フェードイン無し
                fadeOutDuration: 5,    // 0.25秒でフェードアウト
                subtitle: text         // サブタイトルに情報を表示
            });
        } else {
            // ActionBar表示（JSON UIで上部に移動済み）
            player.onScreenDisplay.setActionBar(text);
        }
    }

    /**
     * サブタイトルとして表示
     */
    showSubtitle(player, text) {
        // メインタイトルを空にしてサブタイトルのみ表示
        player.onScreenDisplay.setTitle('', {
            stayDuration: 0,       // ずっと表示
            fadeInDuration: 0,     // フェードイン無し
            fadeOutDuration: 10,   // 0.5秒でフェードアウト
            subtitle: text         // サブタイトルに情報を表示
        });
    }
    
    /**
     * 表示をクリア
     */
    clearDisplay(player) {
        if (this.displayMode === 'subtitle') {
            // サブタイトルをクリア
            player.onScreenDisplay.setTitle('', {
                stayDuration: 0,
                fadeInDuration: 0,
                fadeOutDuration: 0
            });
        } else if (this.displayMode === 'title') {
            // タイトルをクリアするには空のタイトルを短時間表示
            player.onScreenDisplay.setTitle(' ', {
                stayDuration: 0,
                fadeInDuration: 0,
                fadeOutDuration: 0
            });
        } else {
            player.onScreenDisplay.setActionBar("");
        }
    }

    /**
     * 表示モードを設定
     * @param {string} mode - 'actionbar' または 'title' または 'subtitle'
     */
    setDisplayMode(mode) {
        if (mode === 'actionbar' || mode === 'title' || mode === 'subtitle') {
            this.displayMode = mode;
            Logger.debug(`表示モードを ${mode} に変更`, "AutoInfoDisplay");
        }
    }

    /**
     * システムを停止
     */
    stop() {
        // インターバルの停止は system.clearRun で行う必要があるが、
        // 現在の実装では参照を保持していないため、再起動が必要
        this.playerStates.clear();
        Logger.debug("自動情報表示システムを停止", "AutoInfoDisplay");
    }

    /**
     * デバッグ情報を取得
     */
    getDebugInfo() {
        return {
            activePlayers: this.playerStates.size,
            displayingCount: Array.from(this.playerStates.values())
                .filter(state => state.isDisplaying).length,
            displayMode: this.displayMode
        };
    }
}

// シングルトンインスタンスをエクスポート
export const autoInfoDisplay = new AutoInfoDisplay();