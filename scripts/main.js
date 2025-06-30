import { world, system } from "@minecraft/server";
import { blockEvents } from "./events/BlockEvents.js";
import { tickEvents } from "./events/TickEvents.js";
import { itemPickupEvents } from "./events/ItemPickupEvents.js";
import { Wrench } from "./tools/Wrench.js";
import { generator } from "./machines/Generator.js";
import { Constants } from "./core/Constants.js";
import { ErrorHandler } from "./core/ErrorHandler.js";
import { Logger } from "./core/Logger.js";
import { energySystem } from "./energy/EnergySystem.js";
import { itemTransportManager } from "./items/ItemTransportManager.js";
import { itemPipeSystem } from "./pipes/ItemPipeSystem.js";
import { Utils } from "./core/Utils.js";
// import { burnProgressDisplay } from "./ui/BurnProgressDisplay.js";

// 初期化
Logger.info("工業MODを初期化中...", "Main");

// システムの初期化
class MagisystemMain {
    static async initialize() {
        try {
            // イベントの登録
            blockEvents.register();
            tickEvents.register();
            itemPickupEvents.register();
            Wrench.register();
            
            // アイテム拾いの防止
            this.registerItemPickupPrevention();
            
            // ワールド初期化イベント
            this.registerWorldInitialize();
            
            // デバッグコマンド
            this.registerDebugCommands();
            
            // エラーハンドリング
            this.registerErrorHandling();
            
            // 燃焼進行状況表示システムは削除
            // burnProgressDisplay.initialize();
            
            Logger.info("すべてのシステムが正常に読み込まれました！", "Main");
        } catch (error) {
            ErrorHandler.handleError(error, "MagisystemMain.initialize");
        }
    }

    static registerWorldInitialize() {
        world.afterEvents.worldInitialize.subscribe(() => {
            Logger.info("ワールドが正常に初期化されました！", "Main");
            
            // アイテム輸送システムを開始
            itemTransportManager.start();
            
            // エネルギーシステムの初期化を確実に実行
            energySystem.initializeScoreboard();
            
            // 少し遅延してからブロックの復元を試みる
            system.runTimeout(() => {
                Logger.info("エネルギーデータの復元を開始...", "Main");
                this.restoreEnergyData();
            }, 20); // 1秒後
            
            // パイプの見た目を定期的に修正する処理を開始
            this.startPipeVisualFix();
        });
    }
    
    static restoreEnergyData() {
        try {
            // Dynamic Propertyから保存されたエネルギーデータを探す
            const properties = world.getDynamicPropertyIds();
            let restoredCount = 0;
            
            for (const prop of properties) {
                if (prop.startsWith("energy_") && prop.match(/^energy_-?\d+,-?\d+,-?\d+$/)) {
                    const locationKey = prop.substring(7); // "energy_"を除去
                    const energyValue = world.getDynamicProperty(prop);
                    
                    if (energyValue !== undefined && energyValue > 0) {
                        Logger.debug(`エネルギー復元: ${locationKey} = ${energyValue} MF`, "Main");
                        restoredCount++;
                    }
                }
            }
            
            if (restoredCount > 0) {
                Logger.info(`${restoredCount}個のブロックのエネルギーを復元しました`, "Main");
            }
        } catch (error) {
            ErrorHandler.handleError(error, "MagisystemMain.restoreEnergyData");
        }
    }

    static registerDebugCommands() {
        if (!world.beforeEvents?.chatSend) {
            Logger.warn("チャットコマンドシステムはこのバージョンでは利用できません", "Main");
            return;
        }
        
        world.beforeEvents.chatSend.subscribe((event) => {
            const message = event.message;
            const player = event.sender;
            
            if (message.startsWith("!magisystem")) {
                event.cancel = true;
                
                // 次のtickでメッセージを処理
                system.run(() => {
                    this.handleCommand(player, message);
                });
            }
        });
    }
    
    static handleCommand(player, message) {
        ErrorHandler.safeTry(() => {
            const args = message.split(" ");
                
            switch (args[1]) {
                case "debug":
                    this.toggleDebugMode(player);
                    break;
                case "test":
                    this.toggleTestMode(player);
                    break;
                case "scoreboard":
                    this.checkScoreboard(player);
                    break;
                case "energy":
                    this.checkEnergyData(player);
                    break;
                case "loglevel":
                    this.setLogLevel(player, args[2]);
                    break;
                case "item":
                    this.checkItemTransport(player);
                    break;
                
                case "help":
                    this.showHelp(player);
                    break;
                
                default:
                    player.sendMessage(`${Constants.UI.ERROR_COLOR}[MAGISYSTEM] 不明なコマンドです。!magisystem help でヘルプを表示`);
            }
        }, "MagisystemMain.handleCommand");
    }
    
    static toggleDebugMode(player) {
        const debugTag = "debug_energy";
        if (player.hasTag(debugTag)) {
            player.removeTag(debugTag);
            player.sendMessage(`${Constants.UI.ERROR_COLOR}[MAGISYSTEM] デバッグモードを無効にしました`);
            Logger.setLogLevel(Constants.LOG_LEVELS.INFO);
        } else {
            player.addTag(debugTag);
            player.sendMessage(`${Constants.UI.SUCCESS_COLOR}[MAGISYSTEM] デバッグモードを有効にしました`);
            Logger.setLogLevel(Constants.LOG_LEVELS.DEBUG);
        }
    }
    
    static toggleTestMode(player) {
        generator.testMode = !generator.testMode;
        player.sendMessage(`${Constants.UI.DEFAULT_BUTTON_COLOR}[MAGISYSTEM] 発電機テストモード: ${generator.testMode ? `${Constants.UI.SUCCESS_COLOR}有効` : `${Constants.UI.ERROR_COLOR}無効`}`);
        if (generator.testMode) {
            player.sendMessage("§7発電機が燃料なしで無限に発電します");
        } else {
            player.sendMessage("§7発電機は通常通り燃料が必要です");
        }
    }
    
    static checkScoreboard(player) {
        try {
            const obj = world.scoreboard.getObjective(Constants.SCOREBOARD.ENERGY_OBJECTIVE);
            if (obj) {
                player.sendMessage(`${Constants.UI.SUCCESS_COLOR}[MAGISYSTEM] スコアボードは正常に初期化されています`);
                const participants = obj.getParticipants();
                player.sendMessage(`§7登録されたエネルギーブロック数: ${participants.length}`);
            } else {
                player.sendMessage(`${Constants.UI.ERROR_COLOR}[MAGISYSTEM] スコアボードが存在しません`);
            }
        } catch (error) {
            player.sendMessage(`${Constants.UI.ERROR_COLOR}[MAGISYSTEM] エラー: ${error}`);
        }
    }
    
    static checkEnergyData(player) {
        try {
            const properties = world.getDynamicPropertyIds();
            let energyProps = 0;
            let totalEnergy = 0;
            
            for (const prop of properties) {
                if (prop.startsWith("energy_") && prop.match(/^energy_-?\d+,-?\d+,-?\d+$/)) {
                    const energyValue = world.getDynamicProperty(prop);
                    if (energyValue !== undefined && energyValue > 0) {
                        energyProps++;
                        totalEnergy += energyValue;
                        const location = prop.substring(7);
                        player.sendMessage(`§7${location}: ${energyValue} MF`);
                    }
                }
            }
            
            player.sendMessage(`${Constants.UI.SUCCESS_COLOR}[MAGISYSTEM] Dynamic Propertyに保存されたエネルギー: ${energyProps}個`);
            player.sendMessage(`§7合計エネルギー: ${totalEnergy} MF`);
        } catch (error) {
            player.sendMessage(`${Constants.UI.ERROR_COLOR}[MAGISYSTEM] エラー: ${error}`);
        }
    }
    
    static setLogLevel(player, level) {
        const levels = {
            "debug": Constants.LOG_LEVELS.DEBUG,
            "info": Constants.LOG_LEVELS.INFO,
            "warn": Constants.LOG_LEVELS.WARN,
            "error": Constants.LOG_LEVELS.ERROR
        };
        
        if (level && levels[level] !== undefined) {
            Logger.setLogLevel(levels[level]);
            player.sendMessage(`${Constants.UI.SUCCESS_COLOR}[MAGISYSTEM] ログレベルを${level.toUpperCase()}に設定しました`);
        } else {
            player.sendMessage(`${Constants.UI.ERROR_COLOR}[MAGISYSTEM] 無効なログレベルです。使用可能: debug, info, warn, error`);
        }
    }
    
    static showHelp(player) {
        const helpMessages = [
            `${Constants.UI.HEADER_COLOR}=== MAGISYSTEM ヘルプ ===`,
            "§7!magisystem debug - デバッグモードの切り替え",
            "§7!magisystem test - 発電機の無限発電モード切り替え",
            "§7!magisystem scoreboard - スコアボードの状態確認",
            "§7!magisystem energy - Dynamic Propertyのエネルギーデータ確認",
            "§7!magisystem loglevel <level> - ログレベルの設定",
            "§7!magisystem item - アイテム輸送システムの状態確認",
            "§7!magisystem help - このヘルプを表示",
            "§7レンチで機械を右クリック - エネルギー情報を表示",
            "§7スニーク+レンチ - 機械の設定（開発中）"
        ];
        
        helpMessages.forEach(msg => player.sendMessage(msg));
    }
    
    static checkItemTransport(player) {
        const debugInfo = itemTransportManager.getDebugInfo();
        
        player.sendMessage("§e=== アイテム輸送システム状態 ===");
        player.sendMessage(`§7稼働状態: ${debugInfo.isRunning ? "§a稼働中" : "§c停止中"}`);
        player.sendMessage(`§7輸送元: §f${debugInfo.transportSources}個`);
        player.sendMessage(`§7経過Tick: §f${debugInfo.tickCounter}`);
        
        // システムが停止している場合は再開
        if (!debugInfo.isRunning) {
            player.sendMessage("§cシステムが停止しています。再開します...");
            itemTransportManager.start();
        }
        
        // 手動スキャンを実行
        player.sendMessage("§7手動スキャンを実行中...");
        system.runTimeout(() => {
            itemTransportManager.scanForExistingOutputPipes();
        }, 1);
        
        // チャンクロード検出も手動実行
        player.sendMessage("§7チャンクロード検出を実行中...");
        itemTransportManager.checkNewlyLoadedChunks();
        
        // 周囲の出力パイプをスキャン
        const radius = 10;
        let outputPipeCount = 0;
        let connectedInventoryCount = 0;
        
        for (let x = -radius; x <= radius; x++) {
            for (let y = -radius; y <= radius; y++) {
                for (let z = -radius; z <= radius; z++) {
                    const location = {
                        x: Math.floor(player.location.x) + x,
                        y: Math.floor(player.location.y) + y,
                        z: Math.floor(player.location.z) + z
                    };
                    
                    const block = player.dimension.getBlock(location);
                    if (block?.typeId === "magisystem:pipe_output") {
                        outputPipeCount++;
                        
                        // 隣接インベントリをチェック
                        const adjacents = [
                            block.above(),
                            block.below(),
                            block.north(),
                            block.south(),
                            block.east(),
                            block.west()
                        ];
                        
                        for (const adj of adjacents) {
                            if (adj && itemPipeSystem.hasInventory(adj)) {
                                connectedInventoryCount++;
                                player.sendMessage(`§7- ${adj.typeId} at ${Utils.locationToKey(adj.location)}`);
                            }
                        }
                    }
                }
            }
        }
        
        player.sendMessage(`§7周囲の出力パイプ: §f${outputPipeCount}個`);
        player.sendMessage(`§7接続されたインベントリ: §f${connectedInventoryCount}個`);
    }
    
    static registerItemPickupPrevention() {
        // アイテムが拾われる前のイベント
        world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
            const entity = event.target;
            
            // generator_displayタグを持つアイテムは拾えない
            if (entity.typeId === "minecraft:item" && entity.hasTag("generator_display")) {
                event.cancel = true;
            }
        });
        
        // エンティティスポーン時にアイテムの設定
        world.afterEvents.entitySpawn.subscribe((event) => {
            const entity = event.entity;
            
            // generator_displayタグを持つアイテムの物理を無効化
            if (entity.typeId === "minecraft:item" && entity.hasTag("generator_display")) {
                try {
                    // 重力を無効化（可能な場合）
                    const physics = entity.getComponent("minecraft:physics");
                    if (physics) {
                        physics.isAffectedByGravity = false;
                    }
                } catch (error) {
                    // 物理コンポーネントが利用できない場合は無視
                }
            }
        });
    }
    
    static registerErrorHandling() {
        system.afterEvents.scriptEventReceive.subscribe((event) => {
            if (event.id === "magisystem:error") {
                ErrorHandler.handleError(new Error(event.message), "ScriptEvent", {
                    sourceBlock: event.sourceBlock,
                    sourceEntity: event.sourceEntity
                });
            }
        });
    }
    
    /**
     * パイプの見た目を定期的に修正する処理
     */
    static startPipeVisualFix() {
        let tickCounter = 0;
        
        system.runInterval(() => {
            tickCounter++;
            
            // 5秒ごとに実行（100tick）
            if (tickCounter % 100 !== 0) return;
            
            try {
                // プレイヤーの周囲のパイプを更新
                const players = world.getAllPlayers();
                
                for (const player of players) {
                    const dimension = player.dimension;
                    const center = player.location;
                    const radius = 20; // 20ブロックの範囲
                    
                    let updatedCount = 0;
                    
                    // プレイヤーの周囲のパイプをチェック
                    for (let x = -radius; x <= radius; x += 2) {
                        for (let y = -radius; y <= radius; y += 2) {
                            for (let z = -radius; z <= radius; z += 2) {
                                const location = {
                                    x: Math.floor(center.x) + x,
                                    y: Math.floor(center.y) + y,
                                    z: Math.floor(center.z) + z
                                };
                                
                                const block = dimension.getBlock(location);
                                if (block && itemPipeSystem.isTransportBlock(block)) {
                                    // 見た目がおかしくなりやすいパイプを強制更新
                                    const connectionInfo = itemPipeSystem.getConnectionInfo(block);
                                    if (connectionInfo && connectionInfo.count > 0) {
                                        // キャッシュをクリアして強制更新
                                        itemPipeSystem.clearLocationCache(block.location);
                                        itemPipeSystem.updatePattern(block, true);
                                        updatedCount++;
                                    }
                                }
                                
                                // 処理負荷を抑えるため、一度に更新する数を制限
                                if (updatedCount >= 10) {
                                    return;
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                // エラーは無視（ログを汚さない）
            }
        }, 1); // 毎tick実行（内部でカウンタを使用）
    }
}

// メインの初期化
MagisystemMain.initialize();