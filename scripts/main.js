import { world, system } from "@minecraft/server";
import { BlockEvents } from "./events/BlockEvents.js";
import { TickEvents } from "./events/TickEvents.js";
import { Wrench } from "./tools/Wrench.js";
import { generator } from "./machines/Generator.js";

// 初期化メッセージ
console.log("§a[MAGISYSTEM] Initializing industrial mod...");

// イベントの登録
BlockEvents.register();
TickEvents.register();
Wrench.register();

// ワールド初期化時の処理
world.afterEvents.worldInitialize.subscribe(() => {
    console.log("§a[MAGISYSTEM] World initialized successfully!");
    
    // スコアボードの初期化
    try {
        world.scoreboard.addObjective("magisystem_energy", "MF Energy Storage");
    } catch {
        // 既に存在する場合は無視
    }
});

// デバッグコマンドの登録
// chatSendイベントが利用可能か確認
if (world.beforeEvents?.chatSend) {
    world.beforeEvents.chatSend.subscribe((event) => {
        const message = event.message;
        const player = event.sender;
        
        if (message.startsWith("!magisystem")) {
            event.cancel = true;
            
            // 次のtickでメッセージを処理（beforeEventsでは直接メッセージ送信できない）
            system.run(() => {
                const args = message.split(" ");
                
                if (args[1] === "debug") {
                    if (player.hasTag("debug_energy")) {
                        player.removeTag("debug_energy");
                        player.sendMessage("§c[MAGISYSTEM] デバッグモードを無効にしました");
                    } else {
                        player.addTag("debug_energy");
                        player.sendMessage("§a[MAGISYSTEM] デバッグモードを有効にしました");
                    }
                }
                else if (args[1] === "test") {
                    // テストモードの切り替え
                    generator.testMode = !generator.testMode;
                    player.sendMessage(`§e[MAGISYSTEM] 発電機テストモード: ${generator.testMode ? "§a有効" : "§c無効"}`);
                    if (generator.testMode) {
                        player.sendMessage("§7発電機が燃料なしで無限に発電します");
                    } else {
                        player.sendMessage("§7発電機は通常通り燃料が必要です");
                    }
                }
                else if (args[1] === "scoreboard") {
                    // スコアボードの状態確認
                    try {
                        const obj = world.scoreboard.getObjective("magisystem_energy");
                        if (obj) {
                            player.sendMessage("§a[MAGISYSTEM] スコアボードは正常に初期化されています");
                            const participants = obj.getParticipants();
                            player.sendMessage(`§7登録されたエネルギーブロック数: ${participants.length}`);
                        } else {
                            player.sendMessage("§c[MAGISYSTEM] スコアボードが存在しません");
                        }
                    } catch (error) {
                        player.sendMessage(`§c[MAGISYSTEM] エラー: ${error}`);
                    }
                }
                else if (args[1] === "help") {
                    player.sendMessage("§e=== MAGISYSTEM ヘルプ ===");
                    player.sendMessage("§7!magisystem debug - デバッグモードの切り替え");
                    player.sendMessage("§7!magisystem test - 発電機の無限発電モード切り替え");
                    player.sendMessage("§7!magisystem scoreboard - スコアボードの状態確認");
                    player.sendMessage("§7!magisystem help - このヘルプを表示");
                    player.sendMessage("§7レンチで機械を右クリック - エネルギー情報を表示");
                    player.sendMessage("§7スニーク+レンチ - 機械の設定（開発中）");
                }
                else {
                    player.sendMessage("§c[MAGISYSTEM] 不明なコマンドです。!magisystem help でヘルプを表示");
                }
            });
        }
    });
} else {
    console.warn("§e[MAGISYSTEM] Chat command system not available in this version");
}

console.log("§a[MAGISYSTEM] All systems loaded successfully!");

// エラーハンドリング
system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id === "magisystem:error") {
        console.error(`§c[MAGISYSTEM] Error: ${event.message}`);
    }
});