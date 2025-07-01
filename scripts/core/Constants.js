/**
 * MAGISYSTEM 定数管理
 * すべてのマジックナンバーと設定値を一元管理
 */

export const Constants = {
    // エネルギーシステム
    ENERGY: {
        UPDATE_INTERVAL: 20, // tick
        MAX_TRANSFER_PER_TICK: 100, // MF
        DEFAULT_CAPACITY: 1000, // MF
        DEFAULT_MAX_OUTPUT: 20, // MF/tick
        DEFAULT_MAX_INPUT: 20, // MF/tick
    },

    // ブロックタイプ
    BLOCK_TYPES: {
        // 発電機
        GENERATOR: 'magisystem:thermal_generator',  // thermal_generatorに更新
        THERMAL_GENERATOR: 'magisystem:thermal_generator',
        CREATIVE_GENERATOR: 'magisystem:creative_generator',
        SOLAR_GENERATOR: 'magisystem:solar_generator',
        
        // バッテリー
        BATTERY: 'magisystem:battery',
        BATTERY_BASIC: 'magisystem:battery_basic',
        BATTERY_ADVANCED: 'magisystem:battery_advanced',
        BATTERY_ULTIMATE: 'magisystem:battery_ultimate',
        
        // ケーブル
        CABLE: 'magisystem:cable',
        CABLE_INPUT: 'magisystem:cable_input',
        CABLE_OUTPUT: 'magisystem:cable_output',
        
        // パイプ
        PIPE: 'magisystem:pipe',
        PIPE_INPUT: 'magisystem:pipe_input',
        PIPE_OUTPUT: 'magisystem:pipe_output',
        
        // その他の機械
        IRON_FURNACE: 'magisystem:iron_furnace',
        ELECTRIC_FURNACE: 'magisystem:electric_furnace',
        
        // バニラブロック
        HOPPER: 'minecraft:hopper',
        CHEST: 'minecraft:chest',
        BARREL: 'minecraft:barrel',
        FURNACE: 'minecraft:furnace',
        BLAST_FURNACE: 'minecraft:blast_furnace',
        SMOKER: 'minecraft:smoker',
        DROPPER: 'minecraft:dropper',
        DISPENSER: 'minecraft:dispenser',
    },

    // ケーブル接続
    CABLE: {
        CHECK_RADIUS: 1,
        MAX_CONNECTIONS: 6,
        CONNECTION_STATES: {
            NONE: 'none',
            SINGLE: 'single',
            STRAIGHT: 'straight',
            CORNER: 'corner',
            T_SHAPE: 't_shape',
            CROSS: 'cross',
            FIVE_WAY: 'five_way',
            ALL: 'all',
        },
    },

    // 発電機設定
    GENERATOR: {
        BASE_OUTPUT: 10, // MF/tick (未使用)
        FUEL_MULTIPLIER: 1,
        THERMAL_OUTPUT: 20, // MF/tick (熱発電機)
        CREATIVE_OUTPUT: 100, // MF/tick (クリエイティブ発電機)
        SOLAR_OUTPUT_DAY: 5, // MF/tick
        SOLAR_OUTPUT_NIGHT: 0, // MF/tick
        SEEBECK_OUTPUT: 15, // MF/tick
        SEEBECK_CAPACITY: 10000, // MF
    },

    // バッテリー設定
    BATTERY: {
        SMALL_CAPACITY: 5000, // MF
        MEDIUM_CAPACITY: 10000, // MF
        LARGE_CAPACITY: 20000, // MF
        DEFAULT_MAX_IO: 50, // MF/tick
    },

    // ホッパー設定
    HOPPER: {
        TRANSFER_COOLDOWN: 8, // tick
        MAX_STACK_SIZE: 64,
        CHECK_INTERVAL: 20, // tick
    },

    // 電気炉設定
    ELECTRIC_FURNACE: {
        ENERGY_PER_TICK: 2, // MF/tick (40 MF/s)
        SMELT_TIME: 133, // tick (バニラの1.5倍速)
        CAPACITY: 10000, // MF
        STACK_LIMIT: 64,
    },

    // ブロック状態名
    BLOCK_STATES: {
        ACTIVE: 'magisystem:active',
        SMELT_PROGRESS: 'magisystem:smelt_progress',
        BURN_PROGRESS: 'magisystem:burn_progress',
        CARDINAL_DIRECTION: 'minecraft:cardinal_direction',
    },

    // 方向
    DIRECTIONS: {
        UP: { x: 0, y: 1, z: 0 },
        DOWN: { x: 0, y: -1, z: 0 },
        NORTH: { x: 0, y: 0, z: -1 },
        SOUTH: { x: 0, y: 0, z: 1 },
        EAST: { x: 1, y: 0, z: 0 },
        WEST: { x: -1, y: 0, z: 0 },
    },

    // スコアボード
    SCOREBOARD: {
        ENERGY_OBJECTIVE: 'magisystem_energy',
        MAX_ENERGY_OBJECTIVE: 'magisystem_max_energy',
        NETWORK_ID_OBJECTIVE: 'magisystem_network_id',
    },

    // Dynamic Properties
    PROPERTIES: {
        ENERGY_DATA: 'magisystem:energy_data',
        MACHINE_DATA: 'magisystem:machine_data',
        NETWORK_DATA: 'magisystem:network_data',
    },

    // UI設定
    UI: {
        DEFAULT_BUTTON_COLOR: '§e',
        ERROR_COLOR: '§c',
        SUCCESS_COLOR: '§a',
        INFO_COLOR: '§b',
        HEADER_COLOR: '§l§6',
    },

    // ログレベル
    LOG_LEVELS: {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
    },

    // パフォーマンス設定
    PERFORMANCE: {
        MAX_BLOCKS_PER_TICK: 100,
        CACHE_DURATION: 200, // tick
        BATCH_SIZE: 10,
        DEBOUNCE_DELAY: 5, // tick
    },

    // パーティクル
    PARTICLES: {
        FLAME: 'minecraft:basic_flame_particle',
        SMOKE: 'minecraft:basic_smoke_particle',
        ELECTRIC_SPARK: 'minecraft:critical_hit_emitter',
        ENERGY: 'minecraft:endrod',
        REDSTONE: 'minecraft:redstone_ore_dust_particle',
    },

    // サウンド
    SOUNDS: {
        BLOCK_PLACE: 'dig.stone',
        CLICK: 'random.click',
        FIZZ: 'random.fizz',
        POP: 'random.pop',
        LEVELUP: 'random.levelup',
    },
};

// 定数のイミュータブル化
Object.freeze(Constants);
Object.keys(Constants).forEach(key => {
    if (typeof Constants[key] === 'object') {
        Object.freeze(Constants[key]);
    }
});