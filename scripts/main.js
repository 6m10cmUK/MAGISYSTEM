import { world, system } from "@minecraft/server";
import { blockEvents } from "./events/BlockEvents.js";
import { tickEvents } from "./events/TickEvents.js";
import { itemPickupEvents } from "./events/ItemPickupEvents.js";
import { generator } from "./machines/Generator.js";
import { electricFurnace } from "./machines/ElectricFurnace.js";
import { Constants } from "./core/Constants.js";
import { ErrorHandler } from "./core/ErrorHandler.js";
import { Logger } from "./core/Logger.js";
import { energySystem } from "./energy/EnergySystem.js";
import { itemTransportManager } from "./items/ItemTransportManager.js";
import { itemPipeSystem } from "./pipes/ItemPipeSystem.js";
import { Utils } from "./core/Utils.js";
import { machineDataManager } from "./machines/MachineDataManager.js";
import { autoInfoDisplay } from "./ui/AutoInfoDisplay.js";
import { wrench } from "./tools/Wrench.js";
import { chalk } from "./items/Chalk.js";
import { magicCircleChecker } from "./items/MagicCircleChecker.js";

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
            
            // 自動情報表示システムを初期化
            autoInfoDisplay.initialize();
            // 表示モードをactionbarに設定（JSON UIで位置調整）
            autoInfoDisplay.setDisplayMode('actionbar');
            
            // レンチシステムを初期化
            Logger.info("レンチシステムを初期化", "Main");
            
            // チョークシステムを初期化
            Logger.info("チョークシステムを初期化", "Main");
            
            // 魔法陣チェッカーシステムを初期化
            Logger.info("魔法陣チェッカーシステムを初期化", "Main");
            
            // アイテム拾いの防止
            this.registerItemPickupPrevention();
            
            // ワールド初期化イベント
            this.registerWorldInitialize();
            
            // デバッグコマンド
            this.registerDebugCommands();
            
            // エラーハンドリング
            this.registerErrorHandling();
            
            // 機械データ管理システムに機械を登録
            machineDataManager.registerMachine('generator', generator);
            machineDataManager.registerMachine('electricFurnace', electricFurnace);
            
            // レンチシステムは削除（自動情報表示に置き換え）
            
            Logger.info("すべてのシステムが正常に読み込まれました！", "Main");
        } catch (error) {
            ErrorHandler.handleError(error, "MagisystemMain.initialize");
        }
    }

    static registerWorldInitialize() {
        // worldInitializeイベント（リロード時）
        world.afterEvents.worldInitialize.subscribe(() => {
            Logger.info("ワールドが正常に初期化されました！(worldInitialize)", "Main");
            this.initializeSystems();
        });
        
        // プレイヤー参加イベント（ワールド再入場時）
        world.afterEvents.playerJoin.subscribe((event) => {
            Logger.info(`プレイヤー${event.playerName}が参加しました`, "Main");
            
            // 最初のプレイヤーが参加した時にシステムを開始
            const players = world.getAllPlayers();
            if (players.length === 1) {
                if (!this.systemsInitialized) {
                    Logger.info("最初のプレイヤーが参加 - システムを開始", "Main");
                    // チャンクがロードされるまで少し待つ
                    system.runTimeout(() => {
                        this.initializeSystems();
                    }, 40); // 2秒待つ
                } else {
                    // すでに初期化済みの場合は機械データの復元のみ実行
                    Logger.info("システム初期化済み - 機械データのみ復元", "Main");
                    system.runTimeout(() => {
                        this.restoreEnergyData();
                        this.restoreMachineData();
                    }, 40); // 2秒待つ
                }
            }
        });
        
        // プレイヤー退出イベント
        world.afterEvents.playerLeave.subscribe((event) => {
            Logger.info(`プレイヤー${event.playerName}が退出しました`, "Main");
            
            // 全員退出したらフラグをリセット
            const players = world.getAllPlayers();
            if (players.length === 0) {
                Logger.info("全プレイヤーが退出 - システムフラグをリセット", "Main");
                this.systemsInitialized = false;
            }
        });
    }
    
    static initializeSystems() {
        this.systemsInitialized = true;
        
        // アイテム輸送システムを開始（まだ開始していない場合）
        if (!itemTransportManager.isRunning) {
            itemTransportManager.start();
        }
        
        // 機械データ管理システムを開始
        machineDataManager.start();
        
        // エネルギーシステムの初期化を確実に実行
        energySystem.initializeScoreboard();
        
        // 少し遅延してからブロックの復元を試みる
        system.runTimeout(() => {
            Logger.info("エネルギーデータの復元を開始...", "Main");
            this.restoreEnergyData();
            // 個別の復元処理は削除（machineDataManagerが管理）
            // this.restoreMachineData();
        }, 20); // 1秒後
        
        // パイプの見た目を定期的に修正する処理を開始
        this.startPipeVisualFix();
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

    static restoreMachineData() {
        try {
            Logger.info("機械データの復元を開始", "Main");
            
            // ワールド内のすべてのディメンションをチェック
            const dimensions = ["overworld", "nether", "the_end"];
            
            for (const dimId of dimensions) {
                const dimension = world.getDimension(dimId);
                Logger.info(`ディメンション ${dimId} をチェック中`, "Main");
                
                // Dynamic Propertiesから保存された位置情報を取得
                const properties = world.getDynamicPropertyIds();
                Logger.info(`Dynamic Properties数: ${properties.length}`, "Main");
                
                // 座標形式のプロパティを確認
                const coordProps = properties.filter(p => p.match(/^-?\d+,-?\d+,-?\d+$/));
                Logger.info(`座標形式のプロパティ: ${coordProps.join(', ')}`, "Main");
                
                let machineCount = 0;
                for (const prop of properties) {
                    // 座標形式のプロパティをチェック
                    if (prop.match(/^-?\d+,-?\d+,-?\d+$/) && world.getDynamicProperty(prop) === dimId) {
                        machineCount++;
                        Logger.info(`${dimId}の座標を発見: ${prop}`, "Main");
                        const [x, y, z] = prop.split(',').map(Number);
                        const location = { x, y, z };
                        
                        try {
                            const block = dimension.getBlock(location);
                            if (!block) continue;
                            
                            // 発電機の燃焼データ復元
                            if (block.typeId === Constants.BLOCK_TYPES.GENERATOR || 
                                block.typeId === Constants.BLOCK_TYPES.THERMAL_GENERATOR) {
                                // まず発電機を登録
                                generator.register(block);
                                // その後、燃焼データを復元
                                generator.restoreBurnData(block);
                            }
                            // 電気炉の精錬データ復元
                            else if (block.typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE) {
                                Logger.info(`電気炉を発見: ${prop}`, "Main");
                                // まず電気炉を登録
                                const registered = electricFurnace.register(block);
                                Logger.info(`電気炉登録結果: ${registered}`, "Main");
                                // その後、精錬データを復元
                                electricFurnace.restoreSmeltData(block);
                            }
                        } catch (error) {
                            // ブロックが取得できない場合は無視
                            Logger.debug(`ブロック復元スキップ: ${prop}`, "Main");
                        }
                    }
                }
                Logger.info(`${dimId}で${machineCount}個の機械を検出`, "Main");
            }
            
            // 精錬データが保存されているかも確認
            const allProperties = world.getDynamicPropertyIds();
            const smeltProperties = allProperties.filter(p => p.startsWith('smelt_'));
            Logger.info(`精錬データプロパティ数: ${smeltProperties.length}`, "Main");
            
            // 精錬データから電気炉を復元
            for (const prop of smeltProperties) {
                const data = world.getDynamicProperty(prop);
                Logger.info(`${prop}: ${data}`, "Main");
                
                if (data) {
                    // smelt_x,y,z から座標を取得
                    const coords = prop.replace('smelt_', '');
                    const [x, y, z] = coords.split(',').map(Number);
                    const location = { x, y, z };
                    
                    try {
                        // 全ディメンションで電気炉を探す
                        for (const dimId of dimensions) {
                            const dimension = world.getDimension(dimId);
                            const block = dimension.getBlock(location);
                            
                            if (block && block.typeId === Constants.BLOCK_TYPES.ELECTRIC_FURNACE) {
                                Logger.info(`電気炉を発見（精錬データから）: ${coords} in ${dimId}`, "Main");
                                
                                // まず電気炉を登録
                                const registered = electricFurnace.register(block);
                                Logger.info(`電気炉登録結果: ${registered}`, "Main");
                                
                                // その後、精錬データを復元
                                electricFurnace.restoreSmeltData(block);
                                break;
                            }
                        }
                    } catch (error) {
                        Logger.debug(`精錬データ復元エラー: ${prop} - ${error}`, "Main");
                    }
                }
            }
            
        } catch (error) {
            ErrorHandler.handleError(error, "MagisystemMain.restoreMachineData");
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
                case "scan":
                    this.forceRescanItemTransport(player);
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
            "§7!magisystem scan - アイテム輸送システムの強制再スキャン",
            "§7!magisystem help - このヘルプを表示",
            "§7レンチで機械を右クリック - エネルギー情報を表示",
            "§7スニーク+レンチ - 機械の設定（開発中）"
        ];
        
        helpMessages.forEach(msg => player.sendMessage(msg));
    }
    
    static forceRescanItemTransport(player) {
        player.sendMessage("§e=== アイテム輸送システム強制再スキャン ===");
        
        // 強制再スキャンを実行
        itemTransportManager.forceRescanAll();
        
        player.sendMessage("§a強制再スキャンが完了しました");
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
        itemTransportManager.detectChunkLoads();
        
        // Dynamic Properties情報を表示
        const registeredCount = itemTransportManager.chunkDetection.registeredPipes.size;
        player.sendMessage(`§7登録済みパイプ: §f${registeredCount}個`);
        
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