/**
 * MAGISYSTEM 機械データ管理システム
 * 各種機械の永続データを統一的に管理
 */

import { world, system } from "@minecraft/server";
import { Logger } from "../core/Logger.js";
import { ErrorHandler } from "../core/ErrorHandler.js";
import { energySystem } from "../energy/EnergySystem.js";
import { storage } from "../utils/DynamicPropertyStorage.js";

export class MachineDataManager {
    constructor() {
        this.machines = new Map(); // key: machineType, value: machine instance
        this.isInitialized = false;
        this.restorationPhases = {
            phase1: 60,   // 3秒後
            phase2: 100,  // 5秒後
            phase3: 200   // 10秒後
        };
        
        Logger.debug("機械データ管理システムを初期化", "MachineDataManager");
    }

    /**
     * 機械を登録
     * @param {string} machineType - 機械タイプ
     * @param {Object} machineInstance - 機械インスタンス
     */
    registerMachine(machineType, machineInstance) {
        this.machines.set(machineType, machineInstance);
        Logger.debug(`機械タイプ ${machineType} を登録`, "MachineDataManager");
    }

    /**
     * システムを開始
     */
    start() {
        if (this.isInitialized) {
            Logger.debug("機械データ管理システムは既に初期化済み", "MachineDataManager");
            // 再入場時は復元のみ実行
            this.restoreAllMachineData();
            return;
        }

        this.isInitialized = true;
        Logger.debug("機械データ管理システムを開始", "MachineDataManager");

        // 段階的に復元を実行
        this.phaseRestoration();
    }

    /**
     * 段階的な復元処理
     */
    phaseRestoration() {
        // Phase 1: Dynamic Propertiesから情報取得
        system.runTimeout(() => {
            Logger.debug("Phase 1: Dynamic Properties情報を取得中...", "MachineDataManager");
            this.scanDynamicProperties();
        }, this.restorationPhases.phase1);

        // Phase 2: 機械データ復元
        system.runTimeout(() => {
            Logger.debug("Phase 2: 機械データを復元中...", "MachineDataManager");
            this.restoreAllMachineData();
        }, this.restorationPhases.phase2);

        // Phase 3: 最終確認
        system.runTimeout(() => {
            Logger.debug("Phase 3: 最終確認と再スキャン...", "MachineDataManager");
            this.restoreAllMachineData();
        }, this.restorationPhases.phase3);
    }

    /**
     * Dynamic Propertiesをスキャン
     */
    scanDynamicProperties() {
        try {
            // 新しいストレージシステムを使用
            const burnKeys = storage.getAllKeys(world, 'machine_burn_');
            const smeltKeys = storage.getAllKeys(world, 'machine_smelt_');
            const machineProps = new Map();

            // 機械関連のプロパティを分類
            for (const key of burnKeys) {
                const locationKey = key.replace('machine_burn_', '');
                if (!machineProps.has(locationKey)) machineProps.set(locationKey, {});
                machineProps.get(locationKey).burnData = storage.get(key);
            }
            
            for (const key of smeltKeys) {
                const locationKey = key.replace('machine_smelt_', '');
                if (!machineProps.has(locationKey)) machineProps.set(locationKey, {});
                machineProps.get(locationKey).smeltData = storage.get(key);
            }

            Logger.debug(`${machineProps.size}個の機械データプロパティを検出`, "MachineDataManager");

            // 各機械タイプに通知
            for (const [key, data] of machineProps) {
                this.notifyMachinesAboutData(key, data);
            }

        } catch (error) {
            ErrorHandler.handleError(error, "MachineDataManager.scanDynamicProperties");
        }
    }

    /**
     * 機械にデータの存在を通知
     */
    notifyMachinesAboutData(locationKey, data) {
        // 座標を解析
        const [x, y, z] = locationKey.split(',').map(Number);
        const location = { x, y, z };

        // 各ディメンションで確認
        const dimensions = ["overworld", "nether", "the_end"];
        for (const dimId of dimensions) {
            try {
                const dimension = world.getDimension(dimId);
                const block = dimension.getBlock(location);
                
                if (block) {
                    // ブロックタイプに応じて適切な機械に通知
                    for (const [machineType, machine] of this.machines) {
                        if (machine.canHandleBlock && machine.canHandleBlock(block)) {
                            Logger.debug(`${machineType}にデータ復元を通知: ${locationKey}`, "MachineDataManager");
                            
                            // まず機械を登録
                            if (machine.register) {
                                machine.register(block);
                            }
                            
                            // データ復元
                            if (data.burnData && machine.restoreBurnData) {
                                machine.restoreBurnData(block);
                            }
                            if (data.smeltData && machine.restoreSmeltData) {
                                machine.restoreSmeltData(block);
                            }
                            
                            break;
                        }
                    }
                }
            } catch (error) {
                // ブロックが読み込まれていない場合は無視
            }
        }
    }

    /**
     * すべての機械データを復元
     */
    restoreAllMachineData() {
        try {
            Logger.debug("すべての機械データを復元開始", "MachineDataManager");
            
            // まずDynamic Propertiesをスキャン
            this.scanDynamicProperties();
            
            // 各機械タイプに復元を要求
            for (const [machineType, machine] of this.machines) {
                if (machine.restoreAll) {
                    Logger.debug(`${machineType}の復元を実行`, "MachineDataManager");
                    machine.restoreAll();
                }
            }
            
        } catch (error) {
            ErrorHandler.handleError(error, "MachineDataManager.restoreAllMachineData");
        }
    }

    /**
     * 機械データを保存（統一インターフェース）
     * @param {string} key - 位置キー
     * @param {string} dataType - データタイプ（burn, smelt, etc）
     * @param {Object} data - 保存するデータ
     */
    saveMachineData(key, dataType, data) {
        const propertyKey = this.getStorageKey(dataType, key);
        storage.set(propertyKey, data);
        Logger.debug(`機械データを保存: ${propertyKey}`, "MachineDataManager");
    }

    /**
     * 機械データを取得（統一インターフェース）
     * @param {string} key - 位置キー
     * @param {string} dataType - データタイプ
     * @returns {Object|null}
     */
    getMachineData(key, dataType) {
        const propertyKey = this.getStorageKey(dataType, key);
        return storage.get(propertyKey, world, null);
    }

    /**
     * 機械データをクリア
     * @param {string} key - 位置キー
     * @param {string} dataType - データタイプ
     */
    clearMachineData(key, dataType) {
        const propertyKey = this.getStorageKey(dataType, key);
        storage.delete(propertyKey);
        Logger.debug(`機械データをクリア: ${propertyKey}`, "MachineDataManager");
    }

    /**
     * ストレージキーを生成
     * @private
     */
    getStorageKey(dataType, locationKey) {
        return `machine_${dataType}_${locationKey}`;
    }
    
    /**
     * プロパティキーを生成（互換性のために残す）
     * @private
     * @deprecated 新しいコードではgetStorageKeyを使用
     */
    getPropertyKey(dataType, locationKey) {
        switch (dataType) {
            case 'burn':
                return `magisystem:burnData_${locationKey}`;
            case 'smelt':
                return `smelt_${locationKey}`;
            default:
                return `magisystem:${dataType}_${locationKey}`;
        }
    }

    /**
     * システムをリセット（プレイヤー全員退出時）
     */
    reset() {
        this.isInitialized = false;
        Logger.debug("機械データ管理システムをリセット", "MachineDataManager");
    }
}

// シングルトンインスタンスをエクスポート
export const machineDataManager = new MachineDataManager();