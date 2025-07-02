import { world, system, ItemStack, BlockPermutation } from "@minecraft/server";
import { Constants } from "../core/Constants.js";
import { Logger } from "../core/Logger.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { Utils } from "../core/Utils.js";
import { machineDataManager } from "./MachineDataManager.js";

/**
 * ストレージビンクラス
 * 1種類のアイテムを大量に保存できるブロック
 */
export class StorageBin {
    constructor() {
        this.storageBins = new Map(); // location key -> storage data
        this.displayItems = new Map(); // location key -> item entity（通常のアイテムエンティティを使用）
    }

    /**
     * ストレージビンを登録
     * @param {Block} block 
     */
    register(block) {
        return ErrorHandler.safeTry(() => {
            const key = Utils.locationToKey(block.location);
            
            if (this.storageBins.has(key)) {
                Logger.debug(`ストレージビンは既に登録されています: ${key}`, "StorageBin");
                return false;
            }

            const storageData = {
                itemType: null,
                itemCount: 0,
                maxCount: Constants.STORAGE_BIN.MAX_ITEM_COUNT,
                location: block.location,
                dimension: block.dimension.id
            };

            this.storageBins.set(key, storageData);
            this.saveStorageData(block, storageData);
            
            Logger.info(`ストレージビンを登録: ${key}`, "StorageBin");
            return true;
        }, "StorageBin.register", false);
    }

    /**
     * ストレージビンの登録解除
     * @param {Location} location 
     * @param {Dimension} dimension 
     */
    unregister(location, dimension) {
        return ErrorHandler.safeTry(() => {
            const key = Utils.locationToKey(location);
            Logger.info(`unregister開始: key=${key}`, "StorageBin");
            
            const storageData = this.storageBins.get(key);
            
            if (storageData) {
                Logger.debug(`ストレージデータあり: itemType=${storageData.itemType}, count=${storageData.itemCount}`, "StorageBin");
                
                // アイテムをドロップ
                if (storageData.itemType && storageData.itemCount > 0) {
                    this.dropAllItems(location, dimension, storageData);
                }
                
                // 表示エンティティを削除
                this.hideHologramDisplay(key, dimension);
                
                // データを削除
                this.storageBins.delete(key);
                machineDataManager.clearMachineData(key, 'storage');
                
                Logger.info(`ストレージビンを削除完了: ${key}`, "StorageBin");
                return true;
            } else {
                Logger.warn(`ストレージデータが見つかりません: ${key}`, "StorageBin");
            }
            
            return false;
        }, "StorageBin.unregister", false);
    }

    /**
     * アイテムを右クリックで登録
     * @param {Block} block 
     * @param {Player} player 
     * @param {ItemStack} itemStack 
     */
    registerItem(block, player, itemStack) {
        return ErrorHandler.safeTry(() => {
            const key = Utils.locationToKey(block.location);
            const storageData = this.storageBins.get(key);
            
            if (!storageData) {
                Logger.error(`ストレージビンが見つかりません: ${key}`, "StorageBin");
                return false;
            }

            // 既に別のアイテムが登録されている場合
            if (storageData.itemType && storageData.itemType !== itemStack.typeId) {
                player.sendMessage(`§cこのストレージビンには既に${storageData.itemType}が登録されています`);
                return false;
            }

            // 初めてのアイテム登録
            if (!storageData.itemType) {
                storageData.itemType = itemStack.typeId;
                storageData.itemCount = Math.min(itemStack.amount, storageData.maxCount);
                
                // プレイヤーの手持ちアイテムを全て消費
                const equipment = player.getComponent("minecraft:equippable");
                equipment.setEquipment("Mainhand", null);
                
                this.updateDisplayEntity(block, storageData);
                this.saveStorageData(block, storageData);
                player.sendMessage(`§a${itemStack.typeId}を${storageData.itemCount}個登録しました`);
                
                return true;
            }

            // 既に登録されているアイテムを追加
            const addCount = Math.min(itemStack.amount, storageData.maxCount - storageData.itemCount);
            if (addCount > 0) {
                storageData.itemCount += addCount;
                
                // プレイヤーの手持ちアイテムを減らす
                const equipment = player.getComponent("minecraft:equippable");
                const mainhand = equipment.getEquipment("Mainhand");
                
                if (mainhand && mainhand.amount > addCount) {
                    mainhand.amount -= addCount;
                    equipment.setEquipment("Mainhand", mainhand);
                } else {
                    equipment.setEquipment("Mainhand", null);
                }
                
                this.saveStorageData(block, storageData);
                player.sendMessage(`§a${addCount}個のアイテムを追加しました（合計: ${storageData.itemCount}個）`);
                
                return true;
            } else {
                player.sendMessage(`§cストレージビンが満杯です`);
                return false;
            }
        }, "StorageBin.registerItem", false);
    }

    /**
     * アイテムを取り出す（Shift+右クリック）
     * @param {Block} block 
     * @param {Player} player 
     */
    extractItem(block, player) {
        return ErrorHandler.safeTry(() => {
            const key = Utils.locationToKey(block.location);
            const storageData = this.storageBins.get(key);
            
            if (!storageData) {
                Logger.error(`ストレージビンが見つかりません: ${key}`, "StorageBin");
                return false;
            }

            if (!storageData.itemType || storageData.itemCount === 0) {
                player.sendMessage(`§cストレージビンは空です`);
                return false;
            }

            // 1スタック取り出す
            const extractCount = Math.min(Constants.STORAGE_BIN.STACK_SIZE, storageData.itemCount);
            storageData.itemCount -= extractCount;

            // アイテムをプレイヤーに渡す
            const container = player.getComponent("minecraft:inventory").container;
            const itemStack = new ItemStack(storageData.itemType, extractCount);
            container.addItem(itemStack);

            // アイテムが空になったらリセット
            if (storageData.itemCount === 0) {
                storageData.itemType = null;
                this.hideHologramDisplay(key, block.dimension);
                this.updateDisplayEntity(block, storageData);
            }

            this.saveStorageData(block, storageData);
            player.sendMessage(`§a${extractCount}個のアイテムを取り出しました（残り: ${storageData.itemCount}個）`);
            
            return true;
        }, "StorageBin.extractItem", false);
    }

    /**
     * パイプシステム用のインベントリコンポーネントを取得
     * @param {Block} block 
     */
    getInventoryComponent(block) {
        const self = this;
        const key = Utils.locationToKey(block.location);
        
        return {
            container: {
                size: 1, // 仮想的に1スロット
                
                getItem(slot) {
                    if (slot !== 0) return null;
                    
                    const storageData = self.storageBins.get(key);
                    if (!storageData || !storageData.itemType || storageData.itemCount === 0) {
                        return null;
                    }
                    
                    // 取り出し可能な分だけ返す（最大1スタック）
                    const amount = Math.min(Constants.STORAGE_BIN.STACK_SIZE, storageData.itemCount);
                    return new ItemStack(storageData.itemType, amount);
                },
                
                setItem(slot, itemStack) {
                    if (slot !== 0) return false;
                    
                    const storageData = self.storageBins.get(key);
                    if (!storageData) return false;
                    
                    if (!itemStack) {
                        // アイテムを取り出し（パイプが吸い出した）
                        const currentItem = this.getItem(0);
                        if (currentItem) {
                            storageData.itemCount -= currentItem.amount;
                            if (storageData.itemCount === 0) {
                                storageData.itemType = null;
                                self.removeDisplayEntity(key, block.dimension);
                            }
                            self.saveStorageData(block, storageData);
                            return true;
                        }
                        return false;
                    }
                    
                    // アイテムを追加（パイプから入力）
                    if (!storageData.itemType) {
                        storageData.itemType = itemStack.typeId;
                        self.updateDisplayEntity(block, storageData);
                    } else if (storageData.itemType !== itemStack.typeId) {
                        return false; // 異なるアイテムは受け入れない
                    }
                    
                    const addCount = Math.min(itemStack.amount, storageData.maxCount - storageData.itemCount);
                    if (addCount > 0) {
                        storageData.itemCount += addCount;
                        self.saveStorageData(block, storageData);
                        return true;
                    }
                    
                    return false;
                },
                
                get emptySlotsCount() {
                    const storageData = self.storageBins.get(key);
                    if (!storageData) return 0;
                    
                    // アイテムが登録されていない、または空き容量がある場合
                    return (!storageData.itemType || storageData.itemCount < storageData.maxCount) ? 1 : 0;
                },
                
                canAddItem(itemStack) {
                    const storageData = self.storageBins.get(key);
                    if (!storageData) return false;
                    
                    // アイテムが登録されていない場合は受け入れ可能
                    if (!storageData.itemType) return true;
                    
                    // 同じアイテムで空き容量がある場合
                    return storageData.itemType === itemStack.typeId && 
                           storageData.itemCount < storageData.maxCount;
                }
            }
        };
    }

    /**
     * 表示エンティティを更新
     * @param {Block} block 
     * @param {Object} storageData 
     */
    updateDisplayEntity(block, storageData) {
        const key = Utils.locationToKey(block.location);
        
        // ブロックステートを更新
        try {
            const hasItem = storageData.itemType !== null;
            const fillLevel = Math.floor((storageData.itemCount / storageData.maxCount) * 10);
            
            // ブロックのステートを変更
            const currentPermutation = block.permutation;
            const newPermutation = currentPermutation
                .withState("magisystem:has_item", hasItem)
                .withState("magisystem:fill_level", fillLevel);
            
            block.setPermutation(newPermutation);
            
            Logger.debug(`ブロックステート更新: has_item=${hasItem}, fill_level=${fillLevel}`, "StorageBin");
        } catch (error) {
            Logger.error(`ブロックステート更新エラー: ${error}`, "StorageBin");
        }
        
        // ホログラムテキストで表示
        if (storageData.itemType) {
            this.showHologramDisplay(block, storageData);
        } else {
            this.hideHologramDisplay(key, block.dimension);
        }
    }

    /**
     * 表示エンティティを削除
     * @param {string} key 
     * @param {Dimension} dimension 
     */
    /**
     * ホログラムテキストを表示（カスタムエンティティ版）
     * @param {Block} block 
     * @param {Object} storageData 
     */
    showHologramDisplay(block, storageData) {
        const key = Utils.locationToKey(block.location);
        
        // 既存の表示があれば削除
        this.hideHologramDisplay(key, block.dimension);
        
        if (!storageData.itemType) return;
        
        try {
            // アイテムを表示する位置（ブロックの中央）
            const displayLocation = {
                x: block.location.x + 0.5,
                y: block.location.y + 0.5,
                z: block.location.z + 0.5
            };
            
            // 新方式: インベントリ付きエンティティを使用
            const useStorageEntity = true;
            
            if (useStorageEntity) {
                // ストレージエンティティをスポーン
                const storageEntity = block.dimension.spawnEntity("magisystem:storage_entity", displayLocation);
                
                // タグを追加
                storageEntity.addTag("storage_display_item");
                storageEntity.addTag(`storage_${key}`);
                
                // 名前タグで個数を表示
                storageEntity.nameTag = `§e${storageData.itemType}\n§f${storageData.itemCount.toLocaleString()}個`;
                storageEntity.nameTagAlwaysShow = true;
                
                // インベントリコンポーネントにアイテムを設定
                const inventory = storageEntity.getComponent("minecraft:inventory");
                if (inventory && inventory.container) {
                    const itemStack = new ItemStack(storageData.itemType, Math.min(64, storageData.itemCount));
                    inventory.container.setItem(0, itemStack);
                    Logger.debug(`インベントリにアイテムを設定: ${storageData.itemType} x ${itemStack.amount}`, "StorageBin");
                }
                
                // Dynamic Propertiesでメタデータを保存
                try {
                    storageEntity.setDynamicProperty("itemType", storageData.itemType);
                    storageEntity.setDynamicProperty("itemCount", storageData.itemCount);
                    storageEntity.setDynamicProperty("maxCount", storageData.maxCount);
                    Logger.debug(`Dynamic Propertiesを設定`, "StorageBin");
                } catch (e) {
                    Logger.debug(`Dynamic Properties設定失敗: ${e.message}`, "StorageBin");
                }
                
                this.displayItems.set(key, storageEntity.id);
                Logger.info(`ストレージエンティティで表示: ${storageData.itemType}`, "StorageBin");
                return;
            }
            
            // 従来のカスタムエンティティ方式（フォールバック）
            const entityType = "magisystem:item_display";
            Logger.debug(`エンティティをスポーン試行: ${entityType} at ${displayLocation.x}, ${displayLocation.y}, ${displayLocation.z}`, "StorageBin");
            
            // カスタムアイテム表示エンティティをスポーン
            const displayEntity = block.dimension.spawnEntity(entityType, displayLocation);
            
            
            // タグを追加
            displayEntity.addTag("storage_display_item");
            displayEntity.addTag(`storage_${key}`);
            Logger.debug(`タグを追加: storage_display_item, storage_${key}`, "StorageBin");
            
            // 名前タグで個数を表示
            displayEntity.nameTag = `§e${storageData.itemCount.toLocaleString()}個`;
            displayEntity.nameTagAlwaysShow = true;
            
            // エンティティにアイテムを装備させる
            system.runTimeout(() => {
                try {
                    // 複数のスロットを試す
                    const slots = [
                        { command: "slot.weapon.offhand", equipment: "Offhand" },
                        { command: "slot.armor.chest", equipment: "Chest" },
                        { command: "slot.weapon.mainhand", equipment: "Mainhand" }
                    ];
                    
                    let success = false;
                    for (const slot of slots) {
                        try {
                            displayEntity.runCommand(`replaceitem entity @s ${slot.command} 0 ${storageData.itemType} 1`);
                            Logger.debug(`アイテム装備成功 (${slot.command}): ${storageData.itemType}`, "StorageBin");
                            success = true;
                            break;
                        } catch (error) {
                            Logger.debug(`${slot.command}スロット失敗: ${error.message}`, "StorageBin");
                            
                            // equippableコンポーネントでも試す
                            try {
                                const equipment = displayEntity.getComponent("minecraft:equippable");
                                if (equipment) {
                                    const itemStack = new ItemStack(storageData.itemType, 1);
                                    equipment.setEquipment(slot.equipment, itemStack);
                                    Logger.debug(`装備成功 (component ${slot.equipment}): ${storageData.itemType}`, "StorageBin");
                                    success = true;
                                    break;
                                }
                            } catch (equipError) {
                                // 次のスロットを試す
                            }
                        }
                    }
                    
                    if (!success) {
                        throw new Error("全てのスロットで装備に失敗");
                    }
                    
                    Logger.debug(`アイテム装備成功: ${storageData.itemType}`, "StorageBin");
                } catch (error) {
                    Logger.error(`アイテム装備エラー: ${error}`, "StorageBin");
                    
                    // 最後の手段：動的テクスチャの変更を試みる
                    this.tryDynamicTexture(displayEntity, storageData.itemType);
                }
            }, 2);
            
            // スケール調整（ブロック系は大きめ、アイテム系は標準サイズ）
            if (isBlockItem) {
                displayEntity.triggerEvent("magisystem:scale_large");
            } else {
                displayEntity.triggerEvent("magisystem:scale_normal");
            }
            
            
            this.displayItems.set(key, displayEntity.id);
            
            Logger.debug(`カスタムディスプレイ作成: ${storageData.itemType}`, "StorageBin");
        } catch (error) {
            Logger.error(`カスタムディスプレイエラー: ${error}`, "StorageBin");
            Logger.error(`エラースタック: ${error.stack}`, "StorageBin");
            
        }
    }
    
    /**
     * 動的テクスチャ変更を試みる
     * @param {Entity} entity 
     * @param {string} itemType 
     */
    tryDynamicTexture(entity, itemType) {
        try {
            // アイテムタイプからテクスチャパスを生成
            const texturePath = itemType.replace('minecraft:', '');
            
            // setPropertyを使ってテクスチャを変更（実験的）
            entity.setProperty("magisystem:item_texture", texturePath);
            
            Logger.debug(`動的テクスチャ設定を試行: ${texturePath}`, "StorageBin");
        } catch (error) {
            Logger.error(`動的テクスチャエラー: ${error}`, "StorageBin");
        }
    }
    
    /**
     * アイテムエンティティを定位置に保持（改良版）
     * @param {Entity} itemEntity 
     * @param {Location} targetLocation 
     * @param {string} key 
     */
    keepItemEntityInPlace(itemEntity, targetLocation, key) {
        // より頻繁に位置を固定（5tickごと）
        const intervalId = system.runInterval(() => {
            try {
                // アイテムエンティティがまだ存在するか確認
                if (!itemEntity.isValid()) {
                    system.clearRun(intervalId);
                    return;
                }
                
                // タグが削除されていたら（表示終了）
                if (!itemEntity.hasTag(`storage_${key}`)) {
                    system.clearRun(intervalId);
                    return;
                }
                
                // アイテムを定位置にテレポート
                itemEntity.teleport(targetLocation);
                
                // 速度をリセット
                itemEntity.clearVelocity();
                
                // アイテムのプロパティを設定（実験的）
                try {
                    // アイテムを拾えないようにする試み
                    itemEntity.setProperty("minecraft:pickup_delay", 32767);
                    itemEntity.setProperty("minecraft:age", -32768);
                } catch (e) {
                    // プロパティ設定が失敗しても続行
                }
            } catch (error) {
                // エラーが発生したらインターバルを停止
                system.clearRun(intervalId);
            }
        }, 5); // 5tickごと（0.25秒）
        
        // インターバルIDを記録（後でクリアするため）
        if (!this.itemIntervals) {
            this.itemIntervals = new Map();
        }
        this.itemIntervals.set(key, intervalId);
    }
    
    /**
     * 旧バージョンとの互換性のため残す
     */
    keepItemInPlace(itemEntity, targetLocation, key) {
        this.keepItemEntityInPlace(itemEntity, targetLocation, key);
    }
    
    /**
     * ホログラムテキストを削除
     * @param {string} key 
     * @param {Dimension} dimension 
     */
    hideHologramDisplay(key, dimension) {
        Logger.info(`hideHologramDisplay開始: key=${key}`, "StorageBin");
        
        // インターバルをクリア
        if (this.itemIntervals && this.itemIntervals.has(key)) {
            system.clearRun(this.itemIntervals.get(key));
            this.itemIntervals.delete(key);
            Logger.debug(`インターバルをクリア: ${key}`, "StorageBin");
        }
        
        
        // 保存されたエンティティIDで削除
        const entityId = this.displayItems.get(key);
        Logger.debug(`保存されたエンティティID: ${entityId}`, "StorageBin");
        
        if (entityId) {
            try {
                const entity = world.getEntity(entityId);
                if (entity && entity.isValid()) {
                    entity.kill();
                    Logger.info(`エンティティを削除: ID=${entityId}`, "StorageBin");
                } else {
                    Logger.warn(`エンティティが見つかりません: ID=${entityId}`, "StorageBin");
                }
            } catch (error) {
                Logger.error(`エンティティ削除エラー: ${error}`, "StorageBin");
            }
            this.displayItems.delete(key);
        }
        
        // タグでも検索して削除
        try {
            const entities = dimension.getEntities({
                tags: [`storage_${key}`]
            });
            
            Logger.debug(`タグ検索結果: ${entities.length}個のエンティティ`, "StorageBin");
            
            for (const entity of entities) {
                if (entity.hasTag("storage_display_item") || entity.hasTag("storage_hologram") || 
                    entity.typeId === "magisystem:item_display" || entity.typeId === "magisystem:item_display_for_items") {
                    entity.kill();
                    Logger.info(`タグによるエンティティ削除: type=${entity.typeId}`, "StorageBin");
                }
            }
            
            // タイプで直接検索も試みる（両方のエンティティタイプ）
            const displayEntities = dimension.getEntities({
                type: "magisystem:item_display"
            });
            
            const itemDisplayEntities = dimension.getEntities({
                type: "magisystem:item_display_for_items"
            });
            
            Logger.debug(`タイプ検索結果: ${displayEntities.length}個のitem_displayエンティティ, ${itemDisplayEntities.length}個のitem_display_for_itemsエンティティ`, "StorageBin");
            
            for (const entity of displayEntities) {
                if (entity.hasTag(`storage_${key}`)) {
                    entity.kill();
                    Logger.info(`タイプ検索によるエンティティ削除: ID=${entity.id}`, "StorageBin");
                }
            }
            
            for (const entity of itemDisplayEntities) {
                if (entity.hasTag(`storage_${key}`)) {
                    entity.kill();
                    Logger.info(`タイプ検索によるエンティティ削除: ID=${entity.id}`, "StorageBin");
                }
            }
        } catch (error) {
            Logger.error(`エンティティ検索エラー: ${error}`, "StorageBin");
        }
    }
    
    /**
     * アイテム表示を作成（旧実装・現在は使用しない）
     * @param {Block} block 
     * @param {Object} storageData 
     */
    showItemDisplay(block, storageData) {
        const key = Utils.locationToKey(block.location);
        
        // 既存の表示があれば削除
        this.hideItemDisplay(key, block.dimension);
        
        if (!storageData.itemType) return;
        
        try {
            // アイテムフレームを設置する位置（ブロックの上面）
            const aboveLocation = {
                x: block.location.x,
                y: block.location.y + 1,
                z: block.location.z
            };
            
            // 上のブロックを取得
            const aboveBlock = block.dimension.getBlock(aboveLocation);
            if (!aboveBlock || aboveBlock.typeId !== "minecraft:air") {
                Logger.debug(`上部にブロックがあるため表示をスキップ`, "StorageBin");
                return;
            }
            
            // setblockコマンドでアイテムフレームを設置
            try {
                // アイテムフレームを下向きに設置
                block.dimension.runCommand(`setblock ${aboveLocation.x} ${aboveLocation.y} ${aboveLocation.z} frame 1`);
                Logger.debug(`アイテムフレームを設置（コマンド方式）`, "StorageBin");
            } catch (cmdError) {
                Logger.error(`アイテムフレーム設置コマンドエラー: ${cmdError}`, "StorageBin");
                return;
            }
            
            // 少し待ってからアイテムを設定
            system.runTimeout(() => {
                try {
                    const frameBlock = block.dimension.getBlock(aboveLocation);
                    if (frameBlock && frameBlock.typeId === "minecraft:frame") {
                        // 複数の方法でアイテムを設定を試みる
                        
                        // 方法1: インベントリコンポーネント
                        const inventory = frameBlock.getComponent("minecraft:inventory");
                        if (inventory && inventory.container) {
                            const itemStack = new ItemStack(storageData.itemType, 1);
                            inventory.container.setItem(0, itemStack);
                            Logger.debug(`アイテムフレームにアイテムを設定（インベントリ方式）: ${storageData.itemType}`, "StorageBin");
                            return;
                        }
                        
                        // 方法2: エンティティとして検索してreplaceitemコマンド
                        const frameEntities = block.dimension.getEntities({
                            location: aboveLocation,
                            maxDistance: 0.5,
                            type: "minecraft:item_frame"
                        });
                        
                        if (frameEntities.length > 0) {
                            const frameEntity = frameEntities[0];
                            try {
                                frameEntity.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${storageData.itemType} 1`);
                                Logger.debug(`アイテムフレームにアイテムを設定（コマンド方式）: ${storageData.itemType}`, "StorageBin");
                                return;
                            } catch (cmdError) {
                                Logger.error(`replaceitemコマンドエラー: ${cmdError}`, "StorageBin");
                            }
                        }
                        
                        // 方法3: ブロックデータとして設定
                        try {
                            const itemStack = new ItemStack(storageData.itemType, 1);
                            // アイテムフレームブロックエンティティのNBTデータを設定する試み
                            const blockEntity = frameBlock.getComponent("minecraft:blockEntity");
                            if (blockEntity) {
                                blockEntity.setItem(itemStack);
                                Logger.debug(`アイテムフレームにアイテムを設定（ブロックエンティティ方式）: ${storageData.itemType}`, "StorageBin");
                                return;
                            }
                        } catch (beError) {
                            // ブロックエンティティ方式が失敗
                        }
                        
                        Logger.error(`アイテムフレームへのアイテム設定に失敗しました`, "StorageBin");
                    } else {
                        Logger.error(`アイテムフレームが見つかりません: ${frameBlock?.typeId}`, "StorageBin");
                    }
                } catch (error) {
                    Logger.error(`アイテム設定エラー: ${error}`, "StorageBin");
                }
            }, 2);
            
            // フレームの位置を記録
            this.displayItems.set(key, `${aboveLocation.x},${aboveLocation.y},${aboveLocation.z}`);
            
            Logger.debug(`アイテムフレーム設置: ${storageData.itemType}`, "StorageBin");
        } catch (error) {
            Logger.error(`表示エラー: ${error}`, "StorageBin");
        }
    }
    
    /**
     * アイテム表示を削除
     * @param {string} key 
     * @param {Dimension} dimension 
     */
    hideItemDisplay(key, dimension) {
        // 保存されたフレーム位置を取得
        const frameLocationStr = this.displayItems.get(key);
        if (frameLocationStr) {
            try {
                const [x, y, z] = frameLocationStr.split(',').map(Number);
                const frameBlock = dimension.getBlock({x, y, z});
                if (frameBlock && frameBlock.typeId === "minecraft:frame") {
                    // アイテムフレームを空気ブロックに置き換える
                    frameBlock.setType("minecraft:air");
                    Logger.debug(`アイテムフレームを削除: ${x},${y},${z}`, "StorageBin");
                }
            } catch (error) {
                Logger.error(`フレーム削除エラー: ${error}`, "StorageBin");
            }
            this.displayItems.delete(key);
        }
        
        // 念のため、タグでも検索して削除（旧バージョンの互換性）
        const entities = dimension.getEntities({
            tags: [`storage_${key}`]
        });
        
        for (const entity of entities) {
            if (entity.typeId === "minecraft:item_frame" || entity.typeId === "magisystem:storage_display") {
                entity.kill();
            }
        }
    }
    
    removeDisplayEntity(key, dimension) {
        // 互換性のため残す
        this.hideItemDisplay(key, dimension);
    }

    /**
     * 全アイテムをドロップ
     * @param {Location} location 
     * @param {Dimension} dimension 
     * @param {Object} storageData 
     */
    dropAllItems(location, dimension, storageData) {
        if (!storageData.itemType || storageData.itemCount === 0) return;
        
        const dropLocation = {
            x: location.x + 0.5,
            y: location.y + 0.5,
            z: location.z + 0.5
        };
        
        let remaining = storageData.itemCount;
        while (remaining > 0) {
            const dropCount = Math.min(Constants.STORAGE_BIN.STACK_SIZE, remaining);
            const itemStack = new ItemStack(storageData.itemType, dropCount);
            dimension.spawnItem(itemStack, dropLocation);
            remaining -= dropCount;
        }
    }

    /**
     * ストレージデータを保存
     * @param {Block} block 
     * @param {Object} storageData 
     */
    saveStorageData(block, storageData) {
        const key = Utils.locationToKey(block.location);
        const data = {
            itemType: storageData.itemType,
            itemCount: storageData.itemCount
        };
        machineDataManager.saveMachineData(key, 'storage', data);
    }

    /**
     * ストレージデータを復元
     * @param {Block} block 
     */
    restoreStorageData(block) {
        return ErrorHandler.safeTry(() => {
            const key = Utils.locationToKey(block.location);
            const savedData = machineDataManager.getMachineData(key, 'storage');
            
            if (savedData) {
                const storageData = {
                    itemType: savedData.itemType,
                    itemCount: savedData.itemCount,
                    maxCount: Constants.STORAGE_BIN.MAX_ITEM_COUNT,
                    location: block.location,
                    dimension: block.dimension.id
                };
                
                this.storageBins.set(key, storageData);
                
                // 表示エンティティを再生成
                if (storageData.itemType) {
                    this.updateDisplayEntity(block, storageData);
                }
                
                Logger.debug(`ストレージデータを復元: ${key}, ${storageData.itemType} x ${storageData.itemCount}`, "StorageBin");
                return true;
            }
            
            return false;
        }, "StorageBin.restoreStorageData", false);
    }

    /**
     * ストレージビンの情報を取得（レンチ用）
     * @param {Block} block 
     */
    getStorageInfo(block) {
        const key = Utils.locationToKey(block.location);
        const storageData = this.storageBins.get(key);
        
        if (!storageData) return null;
        
        return {
            itemType: storageData.itemType,
            itemCount: storageData.itemCount,
            maxCount: storageData.maxCount,
            fillPercent: Math.round((storageData.itemCount / storageData.maxCount) * 100)
        };
    }

    /**
     * 全ストレージビンをスキャン（ワールド読み込み時）
     */
    scanAllStorageBins() {
        return ErrorHandler.safeTry(() => {
            const players = world.getAllPlayers();
            
            if (players.length === 0) {
                Logger.warn("プレイヤーが見つかりません。スキャンを延期します。", "StorageBin");
                return;
            }
            
            let count = 0;
            
            for (const player of players) {
                const dimension = player.dimension;
                const center = player.location;
                const scanRadius = 100;
                
                // 範囲内のストレージビンを検索
                for (let x = -scanRadius; x <= scanRadius; x += 10) {
                    for (let y = -scanRadius; y <= scanRadius; y += 10) {
                        for (let z = -scanRadius; z <= scanRadius; z += 10) {
                            const location = {
                                x: Math.floor(center.x) + x,
                                y: Math.floor(center.y) + y,
                                z: Math.floor(center.z) + z
                            };
                            
                            try {
                                const block = dimension.getBlock(location);
                                if (block && block.typeId === Constants.BLOCK_TYPES.STORAGE_BIN) {
                                    const key = Utils.locationToKey(block.location);
                                    if (!this.storageBins.has(key)) {
                                        this.register(block);
                                        this.restoreStorageData(block);
                                        count++;
                                    }
                                }
                            } catch (error) {
                                // ブロックが読み込まれていない場合は無視
                            }
                        }
                    }
                }
            }
            
            if (count > 0) {
                Logger.info(`${count}個のストレージビンを検出・登録しました`, "StorageBin");
            }
        }, "StorageBin.scanAllStorageBins");
    }
}

// シングルトンインスタンスをエクスポート
export const storageBin = new StorageBin();