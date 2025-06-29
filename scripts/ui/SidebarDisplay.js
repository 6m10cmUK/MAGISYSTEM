import { world, system, DisplaySlotId } from "@minecraft/server";

export class SidebarDisplay {
    constructor() {
        this.displayObjective = null;
        this.activeDisplays = new Map(); // プレイヤーID -> 表示データ
        this.displaySlots = {
            title: 0,
            line1: 1,
            line2: 2,
            line3: 3,
            line4: 4,
            line5: 5,
            line6: 6,
            line7: 7,
            line8: 8,
            line9: 9,
            line10: 10
        };
    }

    /**
     * 表示システムを初期化
     */
    initialize() {
        try {
            // 既存のオブジェクトを削除
            try {
                const oldObjective = world.scoreboard.getObjective("magisystem_display");
                if (oldObjective) {
                    world.scoreboard.removeObjective(oldObjective);
                }
            } catch {}

            // 新しいオブジェクトを作成
            this.displayObjective = world.scoreboard.addObjective("magisystem_display", "§e§lMAGISYSTEM");
            
            // オブジェクトが正しく作成されたか確認
            if (!this.displayObjective) {
                console.error("Failed to create scoreboard objective");
                return;
            }
            
            console.log("Scoreboard objective created successfully");
        } catch (error) {
            console.error("Failed to initialize sidebar display:", error);
            this.displayObjective = null;
        }
    }

    /**
     * プレイヤーに対してサイドバー表示を開始
     */
    startDisplay(player, blockData) {
        if (!this.displayObjective) {
            this.initialize();
        }

        // 初期化が失敗した場合は終了
        if (!this.displayObjective) {
            console.error("Failed to initialize display objective");
            return;
        }

        const playerId = player.id;
        
        // 既存の表示をクリア（エラーを避けるため個別に処理）
        if (this.activeDisplays.has(playerId)) {
            this.activeDisplays.delete(playerId);
        }

        // 新しい表示データを登録
        this.activeDisplays.set(playerId, {
            player: player,
            blockData: blockData,
            lastUpdate: system.currentTick
        });

        // サイドバーに表示
        try {
            // オブジェクトの存在を再確認
            if (!this.displayObjective) {
                console.error("Display objective is null!");
                return;
            }
            
            // スコアボードオブジェクトを取得して確認
            const testObj = world.scoreboard.getObjective("magisystem_display");
            if (!testObj) {
                console.error("Could not retrieve objective from scoreboard!");
                return;
            }
            
            // Minecraft Bedrock APIの特殊な仕様に対応
            // DisplaySlotId["Sidebar"]でアクセスすると実際のenumオブジェクトが取得できる可能性
            try {
                // DisplaySlotIdオブジェクトから正しい値を取得
                const sidebarSlot = DisplaySlotId["Sidebar"];
                world.scoreboard.setObjectiveAtDisplaySlot(sidebarSlot, testObj);
                console.log("Sidebar display set successfully using DisplaySlotId['Sidebar']!");
            } catch (enumError) {
                console.error("DisplaySlotId enum access failed:", enumError);
                
                // 数値を試す (1 = サイドバー)
                try {
                    world.scoreboard.setObjectiveAtDisplaySlot(1, testObj);
                    console.log("Sidebar display set successfully using numeric value!");
                } catch (numError) {
                    console.error("Numeric value also failed:", numError);
                    
                    // 最後の手段：プロパティとして直接アクセス
                    try {
                        const slot = DisplaySlotId.Sidebar;
                        world.scoreboard.setObjectiveAtDisplaySlot(slot, testObj);
                        console.log("Sidebar display set successfully using direct property!");
                    } catch (propError) {
                        console.error("All methods failed. This might be an API version issue.");
                        console.error("Final error:", propError);
                    }
                }
            }
        } catch (error) {
            console.error("Unexpected error in sidebar display:", error);
        }
    }

    /**
     * 表示を更新
     */
    updateDisplay(player, lines) {
        const playerId = player.id;
        const displayData = this.activeDisplays.get(playerId);
        
        if (!displayData || !this.displayObjective) return;

        try {
            // すべてのエントリをクリア
            const participants = this.displayObjective.getParticipants();
            for (const participant of participants) {
                this.displayObjective.removeParticipant(participant);
            }

            // 新しい行を追加（最大15行）
            const maxLines = Math.min(lines.length, 15);
            for (let i = 0; i < maxLines; i++) {
                const line = lines[i];
                if (line && line.trim() !== "") {
                    const score = 15 - i; // 上から順に表示
                    
                    // 行の内容をそのままスコアのラベルとして使用
                    // スコアボードAPIの制限により、フェイクプレイヤーを使う
                    const fakePlayerName = line;
                    this.displayObjective.setScore(fakePlayerName, score);
                }
            }

            // 更新時刻を記録
            displayData.lastUpdate = system.currentTick;
        } catch (error) {
            console.error("Failed to update sidebar display:", error);
        }
    }

    /**
     * プレイヤーの表示をクリア
     */
    clearDisplay(player) {
        const playerId = player.id;
        
        if (!this.displayObjective) return;

        try {
            // すべてのエントリを削除（シンプルに）
            const participants = this.displayObjective.getParticipants();
            for (const participant of participants) {
                this.displayObjective.removeParticipant(participant);
            }
        } catch (error) {
            console.error("Failed to clear sidebar display:", error);
        }

        // アクティブな表示から削除
        this.activeDisplays.delete(playerId);

        // すべてのプレイヤーの表示がなくなったらサイドバーを非表示
        if (this.activeDisplays.size === 0) {
            try {
                if (typeof DisplaySlotId !== 'undefined' && DisplaySlotId.Sidebar !== undefined) {
                    world.scoreboard.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
                } else {
                    world.scoreboard.clearObjectiveAtDisplaySlot("sidebar");
                }
            } catch (error) {
                // エラーを無視（既にクリアされている場合など）
            }
        }
    }

    /**
     * すべての表示をクリア
     */
    clearAll() {
        if (!this.displayObjective) return;

        try {
            if (typeof DisplaySlotId !== 'undefined' && DisplaySlotId.Sidebar !== undefined) {
                world.scoreboard.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
            } else {
                world.scoreboard.clearObjectiveAtDisplaySlot("sidebar");
            }
            
            // すべてのエントリを削除
            const participants = this.displayObjective.getParticipants();
            for (const participant of participants) {
                this.displayObjective.removeParticipant(participant);
            }
        } catch (error) {
            console.error("Failed to clear all sidebar displays:", error);
        }

        this.activeDisplays.clear();
    }

    /**
     * アクティブな表示を持つプレイヤーを取得
     */
    getActivePlayer(playerId) {
        return this.activeDisplays.get(playerId);
    }

    /**
     * 表示が必要かチェック
     */
    needsDisplay(playerId) {
        return this.activeDisplays.has(playerId);
    }
}

// シングルトンインスタンスをエクスポート
export const sidebarDisplay = new SidebarDisplay();