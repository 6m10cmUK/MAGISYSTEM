import { world, system } from "@minecraft/server";
import { Logger } from "../core/Logger.js";
import { ErrorHandler } from "../core/ErrorHandler.js";

/**
 * 魔法陣の構成確認システム
 * 5x5の十字パターンを確認する
 */
export class MagicCircleChecker {
    constructor() {
        Logger.info("魔法陣チェッカーを初期化中...", "MagicCircleChecker");
        this.lastCheckTime = new Map(); // 位置ごとの最終チェック時刻
        this.registerEvents();
    }

    /**
     * イベントを登録
     */
    registerEvents() {
        // 魔法陣ブロックを右クリックしたときのイベント（素手での右クリック）
        world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
            ErrorHandler.safeTry(() => {
                const { player, block } = event;
                
                Logger.debug(`ブロック右クリック: ${block.typeId} at ${block.location.x},${block.location.y},${block.location.z}`, "MagicCircleChecker");
                
                // 魔法陣ブロックかどうかチェック
                if (this.isMagicCircleBlock(block.typeId)) {
                    Logger.debug("魔法陣ブロックを右クリック", "MagicCircleChecker");
                    
                    // 手に何も持っていない場合のみ実行
                    const inventory = player.getComponent("minecraft:inventory");
                    if (inventory && inventory.container) {
                        const selectedItem = inventory.container.getItem(player.selectedSlotIndex);
                        if (!selectedItem) {
                            event.cancel = true;
                            Logger.debug("素手で魔法陣ブロックを右クリック - パターンチェック実行", "MagicCircleChecker");
                            
                            // 次のtickで処理を実行
                            system.run(() => {
                                this.checkMagicCirclePattern(player, block);
                            });
                        }
                    }
                }
            }, "MagicCircleChecker.playerInteractWithBlock");
        });
        
        // アイテムを持っている時の右クリックもチェック
        world.beforeEvents.itemUseOn.subscribe((event) => {
            ErrorHandler.safeTry(() => {
                const { source: player, block, itemStack } = event;
                
                // 魔法陣ブロックかどうかチェック
                if (this.isMagicCircleBlock(block.typeId)) {
                    // 特定のアイテムを持っている場合のみ実行（例：レンチ）
                    if (itemStack && itemStack.typeId === "magisystem:wrench") {
                        event.cancel = true;
                        
                        // 次のtickで処理を実行
                        system.run(() => {
                            this.checkMagicCirclePattern(player, block);
                        });
                    }
                }
            }, "MagicCircleChecker.itemUseOn");
        });
        
        Logger.info("魔法陣チェッカーのイベント登録完了", "MagicCircleChecker");
    }

    /**
     * 魔法陣ブロックかどうか判定
     * @param {string} typeId - ブロックタイプID
     * @returns {boolean} 魔法陣ブロックかどうか
     */
    isMagicCircleBlock(typeId) {
        return typeId.includes("magic_circle");
    }

    /**
     * 魔法陣の構成パターンをチェック
     * @param {Player} player - プレイヤー
     * @param {Block} clickedBlock - クリックされたブロック
     */
    checkMagicCirclePattern(player, clickedBlock) {
        Logger.debug(`魔法陣パターンチェック開始: ${clickedBlock.location.x}, ${clickedBlock.location.y}, ${clickedBlock.location.z}`, "MagicCircleChecker");
        
        try {
            // クリックされたブロックから中心ブロックを推定
            const centerBlock = this.findCenterBlock(clickedBlock);
            
            if (!centerBlock) {
                player.sendMessage("§c✗ 魔法陣の中心を特定できませんでした");
                player.playSound("random.fizz");
                return;
            }
            
            // 同じ位置での連続チェックを防ぐクールダウン
            const centerKey = `${centerBlock.location.x},${centerBlock.location.y},${centerBlock.location.z}`;
            const currentTime = Date.now();
            const lastTime = this.lastCheckTime.get(centerKey) || 0;
            
            if (currentTime - lastTime < 3000) { // 3秒のクールダウン
                Logger.debug("クールダウン中のため、チェックをスキップ", "MagicCircleChecker");
                return;
            }
            
            this.lastCheckTime.set(centerKey, currentTime);
            
            Logger.debug(`推定された中心ブロック: ${centerBlock.location.x}, ${centerBlock.location.y}, ${centerBlock.location.z}`, "MagicCircleChecker");
            
            const result = this.validateCrossPattern(centerBlock);
            
            if (result.isValid) {
                // 魔法陣ブロックの種類をカウント
                const typeCount = this.countMagicCircleTypes(centerBlock);
                const typeCountText = this.formatTypeCount(typeCount);
                
                // startマジックサークルの数をチェック
                const startCircleCount = typeCount.types["magisystem:magic_circle_start"] || 0;
                
                if (startCircleCount === 0) {
                    player.sendMessage("§c✗ 始動の魔法陣が配置されていません");
                    player.playSound("random.fizz");
                    Logger.debug("始動の魔法陣が見つかりませんでした", "MagicCircleChecker");
                    return;
                } else if (startCircleCount > 1) {
                    player.sendMessage(`§c✗ 始動の魔法陣は1つだけ配置してください（現在: ${startCircleCount}個）`);
                    player.playSound("random.fizz");
                    Logger.debug(`始動の魔法陣が複数配置されています: ${startCircleCount}個`, "MagicCircleChecker");
                    return;
                }
                
                // start魔法陣が正しい位置にあるかチェック
                if (!this.isStartCircleInCorrectPosition(centerBlock)) {
                    player.sendMessage("§c✗ 始動の魔法陣は四隅のいずれかに配置してください");
                    player.playSound("random.fizz");
                    Logger.debug("始動の魔法陣が間違った位置に配置されています", "MagicCircleChecker");
                    return;
                }
                
                // start魔法陣から時計回りに順番を取得
                const clockwiseOrder = this.getClockwiseOrder(centerBlock);
                const orderText = this.formatClockwiseOrder(clockwiseOrder);
                
                player.sendMessage("§a✓ 魔法陣の構成が正しく配置されています！");
                player.sendMessage(`§d時計回りの順番: ${orderText}`);
                player.playSound("random.levelup");
                Logger.info(`魔法陣パターン確認成功: ${centerBlock.location.x}, ${centerBlock.location.y}, ${centerBlock.location.z}`, "MagicCircleChecker");
                Logger.info(`時計回りの順番: ${orderText}`, "MagicCircleChecker");
            } else {
                player.sendMessage(`§c✗ 魔法陣の構成が不正です: ${result.reason}`);
                player.playSound("random.fizz");
                Logger.debug(`魔法陣パターン確認失敗: ${result.reason}`, "MagicCircleChecker");
            }
        } catch (error) {
            Logger.error(`魔法陣パターンチェックエラー: ${error}`, "MagicCircleChecker");
            player.sendMessage("§c魔法陣の確認中にエラーが発生しました");
        }
    }

    /**
     * クリックされたブロックから中心ブロックを推定
     * @param {Block} clickedBlock - クリックされたブロック
     * @returns {Block|null} 中心ブロック
     */
    findCenterBlock(clickedBlock) {
        const dimension = clickedBlock.dimension;
        const clickedPos = clickedBlock.location;
        
        Logger.debug(`中心ブロック推定開始: クリック位置 (${clickedPos.x}, ${clickedPos.y}, ${clickedPos.z})`, "MagicCircleChecker");
        
        // 5x5の四角枠パターンで可能な全ての中心位置を試す
        const possibleCenters = [
            // クリックしたブロックが中心の場合
            { x: 0, z: 0 },
            // クリックしたブロックが枠の一部の場合
            // 上下の枠（1行目・5行目）
            { x: -1, z: -2 }, { x: 0, z: -2 }, { x: 1, z: -2 },  // 上の枠
            { x: -1, z: 2 }, { x: 0, z: 2 }, { x: 1, z: 2 },   // 下の枠
            // 左右の枠（2-4行目）
            { x: -2, z: -1 }, { x: -2, z: 0 }, { x: -2, z: 1 },  // 左の枠
            { x: 2, z: -1 }, { x: 2, z: 0 }, { x: 2, z: 1 },   // 右の枠
            // 角の魔法陣の場合
            { x: -2, z: -2 }, { x: 2, z: -2 }, { x: -2, z: 2 }, { x: 2, z: 2 }
        ];
        
        Logger.debug(`${possibleCenters.length}個の中心候補をチェック中...`, "MagicCircleChecker");
        
        for (let i = 0; i < possibleCenters.length; i++) {
            const offset = possibleCenters[i];
            const centerPos = {
                x: clickedPos.x + offset.x,
                y: clickedPos.y,
                z: clickedPos.z + offset.z
            };
            
            Logger.debug(`候補${i + 1}: 中心位置 (${centerPos.x}, ${centerPos.y}, ${centerPos.z})`, "MagicCircleChecker");
            
            const potentialCenter = dimension.getBlock(centerPos);
            if (potentialCenter) {
                // 中心は空気でも魔法陣ブロックでもOK
                Logger.debug(`候補${i + 1}: ブロック発見 (${potentialCenter.typeId})`, "MagicCircleChecker");
                
                // この位置を中心として四角枠パターンが成立するかチェック
                if (this.isValidCenterPosition(potentialCenter, clickedBlock)) {
                    Logger.debug(`候補${i + 1}: 有効な中心位置として確定`, "MagicCircleChecker");
                    return potentialCenter;
                } else {
                    Logger.debug(`候補${i + 1}: 無効な中心位置 (パターンが合わない)`, "MagicCircleChecker");
                }
            } else {
                Logger.debug(`候補${i + 1}: ブロックが取得できない`, "MagicCircleChecker");
            }
        }
        
        Logger.debug("有効な中心ブロックが見つかりませんでした", "MagicCircleChecker");
        return null;
    }

    /**
     * 指定された位置が中心として有効かチェック
     * @param {Block} centerBlock - 中心候補ブロック
     * @param {Block} clickedBlock - クリックされたブロック
     * @returns {boolean} 有効な中心位置かどうか
     */
    isValidCenterPosition(centerBlock, clickedBlock) {
        const centerPos = centerBlock.location;
        const clickedPos = clickedBlock.location;
        const dimension = centerBlock.dimension;
        
        // クリックされたブロックが十字パターンのどこに位置するかチェック
        const offsetX = clickedPos.x - centerPos.x;
        const offsetZ = clickedPos.z - centerPos.z;
        
        Logger.debug(`中心位置検証: クリック位置オフセット (${offsetX}, ${offsetZ})`, "MagicCircleChecker");
        
        // 四角枠パターンの有効な位置かどうかチェック
        const validPositions = [
            // 中心（空気）
            { x: 0, z: 0 }, { x: -1, z: 0 }, { x: 1, z: 0 },
            { x: 0, z: -1 }, { x: 0, z: 1 }, { x: -1, z: -1 }, { x: 1, z: -1 }, { x: -1, z: 1 }, { x: 1, z: 1 },
            // 枠の魔法陣ブロック
            // 上の枠（z=-2）
            { x: -1, z: -2 }, { x: 0, z: -2 }, { x: 1, z: -2 },
            // 下の枠（z=2）
            { x: -1, z: 2 }, { x: 0, z: 2 }, { x: 1, z: 2 },
            // 左の枠（x=-2）
            { x: -2, z: -1 }, { x: -2, z: 0 }, { x: -2, z: 1 },
            // 右の枠（x=2）
            { x: 2, z: -1 }, { x: 2, z: 0 }, { x: 2, z: 1 },
            // 角の魔法陣
            { x: -2, z: -2 }, { x: 2, z: -2 }, { x: -2, z: 2 }, { x: 2, z: 2 }
        ];
        
        const isValidPosition = validPositions.some(pos => 
            pos.x === offsetX && pos.z === offsetZ
        );
        
        if (!isValidPosition) {
            Logger.debug("無効な位置: 十字パターンに含まれない", "MagicCircleChecker");
            return false;
        }
        
        Logger.debug("有効な位置: 四角枠パターンに含まれる", "MagicCircleChecker");
        
        // 四角枠パターンの魔法陣ブロックが正しく配置されているかの簡易チェック
        const framePositions = [
            // 上の枠（z=-2）
            { x: -1, z: -2 }, { x: 0, z: -2 }, { x: 1, z: -2 },
            // 下の枠（z=2）
            { x: -1, z: 2 }, { x: 0, z: 2 }, { x: 1, z: 2 },
            // 左の枠（x=-2）
            { x: -2, z: -1 }, { x: -2, z: 0 }, { x: -2, z: 1 },
            // 右の枠（x=2）
            { x: 2, z: -1 }, { x: 2, z: 0 }, { x: 2, z: 1 },
            // 角の魔法陣
            { x: -2, z: -2 }, { x: 2, z: -2 }, { x: -2, z: 2 }, { x: 2, z: 2 }
        ];
        
        // 少なくとも枠の主要部分に魔法陣ブロックがあるかチェック
        let magicCircleCount = 0;
        Logger.debug("四角枠パターンの魔法陣ブロック数をカウント中...", "MagicCircleChecker");
        
        for (const pos of framePositions) {
            const checkPos = {
                x: centerPos.x + pos.x,
                y: centerPos.y,
                z: centerPos.z + pos.z
            };
            
            const block = dimension.getBlock(checkPos);
            if (block && this.isMagicCircleBlock(block.typeId)) {
                magicCircleCount++;
                Logger.debug(`魔法陣ブロック発見: (${checkPos.x}, ${checkPos.y}, ${checkPos.z}) - ${block.typeId}`, "MagicCircleChecker");
            }
        }
        
        Logger.debug(`魔法陣ブロック数: ${magicCircleCount}/${framePositions.length}`, "MagicCircleChecker");
        
        // 少なくとも8個以上の魔法陣ブロックがあれば有効と判断（16個中の半分）
        const isValid = magicCircleCount >= 8;
        Logger.debug(`中心位置検証結果: ${isValid ? "有効" : "無効"}`, "MagicCircleChecker");
        
        return isValid;
    }

    /**
     * 5x5四角枠パターンを検証
     * @param {Block} centerBlock - 中心ブロック
     * @returns {Object} 検証結果
     */
    validateCrossPattern(centerBlock) {
        const center = centerBlock.location;
        const dimension = centerBlock.dimension;
        
        // 四角枠パターンの定義
        // x=空白(air), z=魔法陣ブロック
        const framePattern = [
            // row 0: xzzzx (z=-2)
            [
                { x: -2, z: -2, expected: "air" },
                { x: -1, z: -2, expected: "magic_circle" },
                { x: 0, z: -2, expected: "magic_circle" },
                { x: 1, z: -2, expected: "magic_circle" },
                { x: 2, z: -2, expected: "air" }
            ],
            // row 1: zxxxz (z=-1)
            [
                { x: -2, z: -1, expected: "magic_circle" },
                { x: -1, z: -1, expected: "air" },
                { x: 0, z: -1, expected: "air" },
                { x: 1, z: -1, expected: "air" },
                { x: 2, z: -1, expected: "magic_circle" }
            ],
            // row 2: zxxxz (z=0, 中心行)
            [
                { x: -2, z: 0, expected: "magic_circle" },
                { x: -1, z: 0, expected: "air" },
                { x: 0, z: 0, expected: "air" }, // 中心は空気
                { x: 1, z: 0, expected: "air" },
                { x: 2, z: 0, expected: "magic_circle" }
            ],
            // row 3: zxxxz (z=1)
            [
                { x: -2, z: 1, expected: "magic_circle" },
                { x: -1, z: 1, expected: "air" },
                { x: 0, z: 1, expected: "air" },
                { x: 1, z: 1, expected: "air" },
                { x: 2, z: 1, expected: "magic_circle" }
            ],
            // row 4: xzzzx (z=2)
            [
                { x: -2, z: 2, expected: "air" },
                { x: -1, z: 2, expected: "magic_circle" },
                { x: 0, z: 2, expected: "magic_circle" },
                { x: 1, z: 2, expected: "magic_circle" },
                { x: 2, z: 2, expected: "air" }
            ]
        ];

        // パターンをチェック
        for (let row = 0; row < framePattern.length; row++) {
            for (let col = 0; col < framePattern[row].length; col++) {
                const { x: offsetX, z: offsetZ, expected } = framePattern[row][col];
                
                const checkLocation = {
                    x: center.x + offsetX,
                    y: center.y,
                    z: center.z + offsetZ
                };
                
                const block = dimension.getBlock(checkLocation);
                if (!block) {
                    return {
                        isValid: false,
                        reason: `位置 (${checkLocation.x}, ${checkLocation.y}, ${checkLocation.z}) のブロックを取得できません`
                    };
                }
                
                const isValid = this.validateBlockType(block, expected);
                if (!isValid) {
                    const expectedDesc = expected === "air" ? "空気" : "魔法陣ブロック";
                    const actualDesc = block.typeId === "minecraft:air" ? "空気" : 
                                      this.isMagicCircleBlock(block.typeId) ? "魔法陣ブロック" : block.typeId;
                    
                    return {
                        isValid: false,
                        reason: `位置 (${checkLocation.x}, ${checkLocation.y}, ${checkLocation.z}) で ${expectedDesc} が期待されましたが、${actualDesc} が見つかりました`
                    };
                }
            }
        }
        
        return { isValid: true };
    }

    /**
     * ブロックタイプを検証
     * @param {Block} block - チェックするブロック
     * @param {string} expected - 期待されるタイプ ("air" または "magic_circle")
     * @returns {boolean} 検証結果
     */
    validateBlockType(block, expected) {
        if (expected === "air") {
            return block.typeId === "minecraft:air";
        } else if (expected === "magic_circle") {
            return this.isMagicCircleBlock(block.typeId);
        }
        return false;
    }

    /**
     * 魔法陣ブロックの種類をカウント
     * @param {Block} centerBlock - 中心ブロック
     * @returns {Object} 種類カウント情報
     */
    countMagicCircleTypes(centerBlock) {
        const centerPos = centerBlock.location;
        const dimension = centerBlock.dimension;
        
        // 四角枠パターンの魔法陣ブロック位置
        const framePositions = [
            // 上の枠（z=-2）
            { x: -1, z: -2 }, { x: 0, z: -2 }, { x: 1, z: -2 },
            // 下の枠（z=2）
            { x: -1, z: 2 }, { x: 0, z: 2 }, { x: 1, z: 2 },
            // 左の枠（x=-2）
            { x: -2, z: -1 }, { x: -2, z: 0 }, { x: -2, z: 1 },
            // 右の枠（x=2）
            { x: 2, z: -1 }, { x: 2, z: 0 }, { x: 2, z: 1 },
            // 角の魔法陣
            { x: -2, z: -2 }, { x: 2, z: -2 }, { x: -2, z: 2 }, { x: 2, z: 2 }
        ];

        const typeCount = {};
        let totalBlocks = 0;
        
        Logger.debug("魔法陣ブロックの種類をカウント中...", "MagicCircleChecker");

        for (const pos of framePositions) {
            const checkPos = {
                x: centerPos.x + pos.x,
                y: centerPos.y,
                z: centerPos.z + pos.z
            };

            const block = dimension.getBlock(checkPos);
            if (block && this.isMagicCircleBlock(block.typeId)) {
                const blockType = block.typeId;
                typeCount[blockType] = (typeCount[blockType] || 0) + 1;
                totalBlocks++;
                Logger.debug(`魔法陣ブロック: (${checkPos.x}, ${checkPos.y}, ${checkPos.z}) - ${blockType}`, "MagicCircleChecker");
            }
        }

        const totalTypes = Object.keys(typeCount).length;
        
        Logger.debug(`魔法陣ブロックの種類数: ${totalTypes}種類、合計${totalBlocks}個`, "MagicCircleChecker");

        return {
            totalTypes,
            totalBlocks,
            types: typeCount
        };
    }

    /**
     * 種類カウント情報を文字列にフォーマット
     * @param {Object} typeCount - 種類カウント情報
     * @returns {string} フォーマット済み文字列
     */
    formatTypeCount(typeCount) {
        if (typeCount.totalTypes === 0) {
            return "なし";
        }

        const typeNames = {
            "magisystem:magic_circle_basic": "基本",
            "magisystem:magic_circle_fire": "火",
            "magisystem:magic_circle_water": "水",
            "magisystem:magic_circle_air": "空気",
            "magisystem:magic_circle_earth": "大地",
            "magisystem:magic_circle_start": "始動"
        };

        const typeList = Object.entries(typeCount.types)
            .map(([typeId, count]) => {
                const name = typeNames[typeId] || typeId.replace("magisystem:magic_circle_", "");
                return `${name}×${count}`;
            })
            .join(", ");

        return `${typeCount.totalTypes}種類 (${typeList})`;
    }

    /**
     * startマジックサークルから時計回りに魔法陣の順番を取得
     * @param {Block} centerBlock - 中心ブロック
     * @returns {Array} 時計回りの魔法陣リスト
     */
    getClockwiseOrder(centerBlock) {
        const centerPos = centerBlock.location;
        const dimension = centerBlock.dimension;
        
        // まずstartマジックサークルの位置を見つける
        let startPosition = null;
        
        // 四角枠パターンの魔法陣ブロック位置
        const framePositions = [
            // 上の枠（z=-2）
            { x: -1, z: -2 }, { x: 0, z: -2 }, { x: 1, z: -2 },
            // 下の枠（z=2）
            { x: -1, z: 2 }, { x: 0, z: 2 }, { x: 1, z: 2 },
            // 左の枠（x=-2）
            { x: -2, z: -1 }, { x: -2, z: 0 }, { x: -2, z: 1 },
            // 右の枠（x=2）
            { x: 2, z: -1 }, { x: 2, z: 0 }, { x: 2, z: 1 },
            // 角の魔法陣
            { x: -2, z: -2 }, { x: 2, z: -2 }, { x: -2, z: 2 }, { x: 2, z: 2 }
        ];

        // startマジックサークルを探す
        for (const pos of framePositions) {
            const checkPos = {
                x: centerPos.x + pos.x,
                y: centerPos.y,
                z: centerPos.z + pos.z
            };

            const block = dimension.getBlock(checkPos);
            if (block && block.typeId === "magisystem:magic_circle_start") {
                startPosition = pos;
                Logger.debug(`startマジックサークル発見: (${checkPos.x}, ${checkPos.y}, ${checkPos.z})`, "MagicCircleChecker");
                break;
            }
        }

        if (!startPosition) {
            Logger.warn("startマジックサークルが見つかりません", "MagicCircleChecker");
            return [];
        }

        // 時計回りの順番を定義（5x5の四角枠）
        // 各辺ごとに整理
        const clockwisePositions = [
            // 上辺（左から右）
            { x: -2, z: -2 }, { x: -1, z: -2 }, { x: 0, z: -2 }, { x: 1, z: -2 }, { x: 2, z: -2 },
            // 右辺（上から下）
            { x: 2, z: -1 }, { x: 2, z: 0 }, { x: 2, z: 1 },
            // 下辺（右から左）
            { x: 2, z: 2 }, { x: 1, z: 2 }, { x: 0, z: 2 }, { x: -1, z: 2 }, { x: -2, z: 2 },
            // 左辺（下から上）
            { x: -2, z: 1 }, { x: -2, z: 0 }, { x: -2, z: -1 }
        ];

        // startPositionのインデックスを見つける
        let startIndex = -1;
        for (let i = 0; i < clockwisePositions.length; i++) {
            const pos = clockwisePositions[i];
            if (pos.x === startPosition.x && pos.z === startPosition.z) {
                startIndex = i;
                break;
            }
        }

        if (startIndex === -1) {
            Logger.error("startマジックサークルの位置が時計回りリストに含まれていません", "MagicCircleChecker");
            return [];
        }

        // startPositionから時計回りに並び替え
        const orderedPositions = [
            ...clockwisePositions.slice(startIndex),
            ...clockwisePositions.slice(0, startIndex)
        ];

        // 各位置の魔法陣タイプを取得
        const clockwiseOrder = [];
        for (const pos of orderedPositions) {
            const checkPos = {
                x: centerPos.x + pos.x,
                y: centerPos.y,
                z: centerPos.z + pos.z
            };

            const block = dimension.getBlock(checkPos);
            if (block && this.isMagicCircleBlock(block.typeId)) {
                clockwiseOrder.push({
                    position: pos,
                    typeId: block.typeId,
                    location: checkPos
                });
            }
        }

        return clockwiseOrder;
    }

    /**
     * 時計回りの順番を文字列にフォーマット
     * @param {Array} clockwiseOrder - 時計回りの魔法陣リスト
     * @returns {string} フォーマット済み文字列
     */
    formatClockwiseOrder(clockwiseOrder) {
        if (clockwiseOrder.length === 0) {
            return "なし";
        }

        const typeNames = {
            "magisystem:magic_circle_basic": "基本",
            "magisystem:magic_circle_fire": "火",
            "magisystem:magic_circle_water": "水",
            "magisystem:magic_circle_air": "空気",
            "magisystem:magic_circle_earth": "大地",
            "magisystem:magic_circle_start": "始動"
        };

        // 連続する同じ種類をグループ化
        const groupedOrder = [];
        let currentGroup = null;
        
        for (const item of clockwiseOrder) {
            const name = typeNames[item.typeId] || item.typeId.replace("magisystem:magic_circle_", "");
            
            if (currentGroup && currentGroup.name === name) {
                // 同じ種類が連続している場合、カウントを増やす
                currentGroup.count++;
            } else {
                // 新しい種類の場合、新しいグループを作成
                if (currentGroup) {
                    groupedOrder.push(currentGroup);
                }
                currentGroup = { name: name, count: 1 };
            }
        }
        
        // 最後のグループを追加
        if (currentGroup) {
            groupedOrder.push(currentGroup);
        }
        
        // フォーマット済み文字列を作成
        const orderList = groupedOrder
            .map(group => {
                if (group.count === 1) {
                    return group.name;
                } else {
                    return `${group.name}${group.count}`;
                }
            })
            .join("、");

        return orderList;
    }

    /**
     * startマジックサークルが正しい位置にあるかチェック
     * @param {Block} centerBlock - 中心ブロック
     * @returns {boolean} 正しい位置にあるかどうか
     */
    isStartCircleInCorrectPosition(centerBlock) {
        const centerPos = centerBlock.location;
        const dimension = centerBlock.dimension;
        
        // startマジックサークルが配置可能な4つの位置（新しいパターンのs位置）
        const validStartPositions = [
            { x: 0, z: -2 },   // 上
            { x: 2, z: 0 },    // 右
            { x: 0, z: 2 },    // 下
            { x: -2, z: 0 }    // 左
        ];
        
        // 各位置をチェック
        for (const pos of validStartPositions) {
            const checkPos = {
                x: centerPos.x + pos.x,
                y: centerPos.y,
                z: centerPos.z + pos.z
            };
            
            const block = dimension.getBlock(checkPos);
            if (block && block.typeId === "magisystem:magic_circle_start") {
                Logger.debug(`startマジックサークルが正しい位置に配置されています: (${checkPos.x}, ${checkPos.y}, ${checkPos.z})`, "MagicCircleChecker");
                return true;
            }
        }
        
        // 間違った位置にstartマジックサークルがあるかチェック
        const allMagicCirclePositions = [
            // 上の枠（z=-2）
            { x: -1, z: -2 }, { x: 0, z: -2 }, { x: 1, z: -2 },
            // 下の枠（z=2）
            { x: -1, z: 2 }, { x: 0, z: 2 }, { x: 1, z: 2 },
            // 左の枠（x=-2）
            { x: -2, z: -1 }, { x: -2, z: 0 }, { x: -2, z: 1 },
            // 右の枠（x=2）
            { x: 2, z: -1 }, { x: 2, z: 0 }, { x: 2, z: 1 },
            // 角の魔法陣
            { x: -2, z: -2 }, { x: 2, z: -2 }, { x: -2, z: 2 }, { x: 2, z: 2 }
        ];
        
        for (const pos of allMagicCirclePositions) {
            // validStartPositionsに含まれていない位置のみチェック
            const isValidPosition = validStartPositions.some(validPos => 
                validPos.x === pos.x && validPos.z === pos.z
            );
            
            if (!isValidPosition) {
                const checkPos = {
                    x: centerPos.x + pos.x,
                    y: centerPos.y,
                    z: centerPos.z + pos.z
                };
                
                const block = dimension.getBlock(checkPos);
                if (block && block.typeId === "magisystem:magic_circle_start") {
                    Logger.debug(`startマジックサークルが間違った位置に配置されています: (${checkPos.x}, ${checkPos.y}, ${checkPos.z})`, "MagicCircleChecker");
                    return false;
                }
            }
        }
        
        return false;
    }
}

// シングルトンインスタンス
export const magicCircleChecker = new MagicCircleChecker();