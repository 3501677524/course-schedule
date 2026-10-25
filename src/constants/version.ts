/** 应用版本号唯一来源。
 *
 *  ⚠️ 固定壳（预构建 APK/IPA + 注入 JS Bundle）里 `Constants.expoConfig` 恒为 null
 *  （bundle 内只有 expo-constants 的 "embedded app.config could not be read" 报错串），
 *  所以版本号不能从 expoConfig 读，否则永远落到兜底值。
 *
 *  ⚠️ 本文件由 `node scripts/sync-version.js --write` 从 app.json 自动生成，
 *  不要手改：改 app.json 的 expo.version / expo.extra.meooBuildId 后重新生成即可。
 *  （package.json 的 dev / export 脚本已自动调用，正常发版无需手动执行。） */

export const APP_VERSION = "2.5.0";

/** 构建标识（来自 app.json 的 extra.meooBuildId），用于区分同版本号的不同构建 */
export const APP_BUILD_ID = "a0038a2a4b9d3d24b60f63dffe19b7ed";
