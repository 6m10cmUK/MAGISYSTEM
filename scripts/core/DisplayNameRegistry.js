/**
 * 表示名レジストリ
 * DRY原則に基づいて表示名を一元管理
 */
export class DisplayNameRegistry {
    static blockNames = new Map([
        // MAGISYSTEM ブロック
        ["magisystem:generator", "発電機"],
        ["magisystem:thermal_generator", "熱発電機"],
        ["magisystem:creative_generator", "クリエイティブ発電機"],
        ["magisystem:solar_generator", "ソーラー発電機"],
        ["magisystem:battery", "バッテリー"],
        ["magisystem:battery_basic", "基本バッテリー"],
        ["magisystem:battery_advanced", "発展バッテリー"],
        ["magisystem:battery_ultimate", "究極バッテリー"],
        ["magisystem:iron_furnace", "鉄のかまど"],
        ["magisystem:electric_furnace", "電気炉"],
        ["magisystem:cable", "エネルギーケーブル"],
        ["magisystem:cable_input", "入力ケーブル"],
        ["magisystem:cable_output", "出力ケーブル"],
        ["magisystem:pipe", "アイテムパイプ"],
        ["magisystem:pipe_input", "入力パイプ"],
        ["magisystem:pipe_output", "出力パイプ"],
        
        // バニラブロック
        ["minecraft:chest", "チェスト"],
        ["minecraft:barrel", "樽"],
        ["minecraft:furnace", "かまど"],
        ["minecraft:blast_furnace", "溶鉱炉"],
        ["minecraft:smoker", "燻製器"],
        ["minecraft:hopper", "ホッパー"],
        ["minecraft:dropper", "ドロッパー"],
        ["minecraft:dispenser", "ディスペンサー"],
        ["minecraft:shulker_box", "シュルカーボックス"],
        
        // 基本ブロック
        ["minecraft:dirt", "土"],
        ["minecraft:grass_block", "草ブロック"],
        ["minecraft:stone", "石"],
        ["minecraft:cobblestone", "丸石"],
        ["minecraft:bedrock", "岩盤"],
        ["minecraft:sand", "砂"],
        ["minecraft:gravel", "砂利"],
        ["minecraft:oak_log", "オークの原木"],
        ["minecraft:oak_leaves", "オークの葉"],
        ["minecraft:oak_planks", "オークの板材"],
        ["minecraft:water", "水"],
        ["minecraft:lava", "溶岩"],
        ["minecraft:iron_ore", "鉄鉱石"],
        ["minecraft:coal_ore", "石炭鉱石"],
        ["minecraft:gold_ore", "金鉱石"],
        ["minecraft:diamond_ore", "ダイヤモンド鉱石"],
        ["minecraft:redstone_ore", "レッドストーン鉱石"],
        ["minecraft:obsidian", "黒曜石"],
        ["minecraft:netherrack", "ネザーラック"],
        ["minecraft:end_stone", "エンドストーン"],
        ["minecraft:glass", "ガラス"],
        ["minecraft:crafting_table", "作業台"],
        ["minecraft:torch", "松明"],
        ["minecraft:ladder", "はしご"],
        ["minecraft:iron_block", "鉄ブロック"],
        ["minecraft:gold_block", "金ブロック"],
        ["minecraft:diamond_block", "ダイヤモンドブロック"],
        ["minecraft:emerald_block", "エメラルドブロック"],
        ["minecraft:redstone_block", "レッドストーンブロック"],
        ["minecraft:wool", "羊毛"],
        ["minecraft:white_wool", "白い羊毛"],
        ["minecraft:orange_wool", "橙色の羊毛"],
        ["minecraft:magenta_wool", "赤紫色の羊毛"],
        ["minecraft:light_blue_wool", "薄青色の羊毛"],
        ["minecraft:yellow_wool", "黄色の羊毛"],
        ["minecraft:lime_wool", "黄緑色の羊毛"],
        ["minecraft:pink_wool", "桃色の羊毛"],
        ["minecraft:gray_wool", "灰色の羊毛"],
        ["minecraft:light_gray_wool", "薄灰色の羊毛"],
        ["minecraft:cyan_wool", "青緑色の羊毛"],
        ["minecraft:purple_wool", "紫色の羊毛"],
        ["minecraft:blue_wool", "青色の羊毛"],
        ["minecraft:brown_wool", "茶色の羊毛"],
        ["minecraft:green_wool", "緑色の羊毛"],
        ["minecraft:red_wool", "赤色の羊毛"],
        ["minecraft:black_wool", "黒色の羊毛"]
    ]);
    
    static itemNames = new Map([
        // 燃料アイテム
        ["minecraft:coal", "石炭"],
        ["minecraft:charcoal", "木炭"],
        ["minecraft:coal_block", "石炭ブロック"],
        ["minecraft:lava_bucket", "溶岩バケツ"],
        ["minecraft:blaze_rod", "ブレイズロッド"],
        ["minecraft:dried_kelp_block", "乾燥した昆布ブロック"],
        
        // 一般アイテム
        ["minecraft:torch", "松明"],
        ["minecraft:soul_torch", "魂の松明"],
        ["minecraft:stone", "石"],
        ["minecraft:cobblestone", "丸石"],
        ["minecraft:dirt", "土"],
        ["minecraft:oak_log", "オークの原木"],
        ["minecraft:iron_ingot", "鉄インゴット"],
        ["minecraft:gold_ingot", "金インゴット"],
        ["minecraft:diamond", "ダイヤモンド"],
        ["minecraft:redstone", "レッドストーン"],
        ["minecraft:lapis_lazuli", "ラピスラズリ"],
        ["minecraft:emerald", "エメラルド"],
        ["minecraft:netherite_ingot", "ネザライトインゴット"]
    ]);
    
    static patternNames = new Map([
        ["isolated", "独立型"],
        ["terminal", "端末型"],
        ["straight", "直線型"],
        ["corner", "L字型"],
        ["t-junction", "T字型"],
        ["cross", "十字型"],
        ["five-way", "5方向型"],
        ["six-way", "全方向型"]
    ]);
    
    static directionNames = new Map([
        ["above", "上"],
        ["below", "下"],
        ["north", "北"],
        ["south", "南"],
        ["east", "東"],
        ["west", "西"],
        ["up", "上"],
        ["down", "下"]
    ]);
    
    /**
     * ブロックの表示名を取得
     * @param {string} blockId - ブロックID
     * @returns {string} 表示名
     */
    static getBlockName(blockId) {
        return this.blockNames.get(blockId) || blockId;
    }
    
    /**
     * アイテムの表示名を取得
     * @param {string} itemId - アイテムID
     * @returns {string} 表示名
     */
    static getItemName(itemId) {
        return this.itemNames.get(itemId) || itemId;
    }
    
    /**
     * パターンの表示名を取得
     * @param {string} pattern - パターン名
     * @returns {string} 表示名
     */
    static getPatternName(pattern) {
        return this.patternNames.get(pattern) || pattern;
    }
    
    /**
     * 方向の表示名を取得
     * @param {string} direction - 方向
     * @returns {string} 表示名
     */
    static getDirectionName(direction) {
        return this.directionNames.get(direction) || direction;
    }
    
    /**
     * 燃料の表示名を取得（燃料以外の場合は"なし"を返す）
     * @param {string} itemId - アイテムID
     * @returns {string} 表示名
     */
    static getFuelName(itemId) {
        if (!itemId) return "なし";
        
        const fuelNames = [
            "minecraft:coal",
            "minecraft:charcoal",
            "minecraft:coal_block",
            "minecraft:lava_bucket",
            "minecraft:blaze_rod",
            "minecraft:dried_kelp_block"
        ];
        
        if (fuelNames.includes(itemId)) {
            return this.getItemName(itemId);
        }
        
        return itemId;
    }
    
    /**
     * カスタム表示名を登録
     * @param {string} type - タイプ（"block", "item", "pattern", "direction"）
     * @param {string} id - ID
     * @param {string} displayName - 表示名
     */
    static register(type, id, displayName) {
        switch (type) {
            case "block":
                this.blockNames.set(id, displayName);
                break;
            case "item":
                this.itemNames.set(id, displayName);
                break;
            case "pattern":
                this.patternNames.set(id, displayName);
                break;
            case "direction":
                this.directionNames.set(id, displayName);
                break;
        }
    }
}