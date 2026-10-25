# 课程表 (course-schedule)

大学生课程表 App —— Expo / React Native 跨平台应用（Android / iOS / Web）。

本地优先：课表、考试、作业等数据默认保存在本机 SQLite，断网完全可用；支持班级课表云同步（Supabase）、Excel 模板一键导入、上课提醒与考试双重提醒、天气与生活建议。

## ✨ 功能

- **今日课程**：时间轴 + 下节课倒计时，自动识别教学周（单双周）
- **本周课表**：周视图，课程颜色区分
- **考试安排**：考前 1 天 + 考前 1 小时双重提醒
- **作业管理**：作业清单与状态跟踪
- **课程管理**：20+ 门课，手动排课、Excel 模板批量导入（内置模板导出）
- **学期管理**：多学期切换，自动计算当前教学周
- **班级云同步**：管理员上传、同学拉取（Supabase）
- **天气与生活建议**：气温与带伞建议
- **外观定制**：墨绿 / 石墨蓝 / 暮紫 / 暖橙 / 青瓷 / 酒红 主题色，浅色 / 深色 / 跟随系统
- **检查更新**：读取 GitHub Release 自动检测新版本（当前 `1.0.0`）

## 🚀 运行

```bash
npm install
npx expo start        # 开发服务
npx expo start --web  # 网页预览
npx expo run:android  # Android 真机构建
```

> 依赖版本从线上构建包还原推断（`package.json`），如遇版本冲突请运行 `npx expo install --fix` 校正。

## 📁 目录结构

```
src/
├── app/                  # 页面路由（expo-router 文件路由）
│   ├── (tabs)/           # 底部标签：今日 / 本周 / 今日预览 / 我的
│   ├── auth.tsx          # 登录注册
│   └── detail/           # 课程编辑、作业、考试详情
├── components/           # 组件（CourseForm、WeekGrid、WeatherCard…）
├── services/             # 业务逻辑（SQLite、通知、云同步、天气、导出…）
├── hooks/                # useAppData / useAuth / useWeather
├── supabase/             # 云同步后端客户端
└── assets/               # 内置课表模板（xlsx 以 zip 容器随包打包）
```

## 🔄 检查更新机制

`src/services/updateCheck.ts` 读取 GitHub 仓库的 Release / Tag 作为最新版本，与本地版本逐段比较：

- 仓库有 Release（如 `v1.8.0`）→ 展示更新说明并跳转发布页下载
- 无 Release / Tag → 显示「已是最新」
- 请求 8 秒超时，失败降级不报错

## 📦 发布记录

- **v2.5.0**：自定义背景（纯色 / 渐变 / 图片）、主题色跟随背景、触感反馈总开关、新版 Excel 模板，[Android](https://github.com/3501677524/course-schedule/releases/download/v2.5.0/app-release-v3007.apk) / [iOS](https://github.com/3501677524/course-schedule/releases/download/v2.5.0/app-ios-release-v3007.ipa)
- **v2.1.0**：Excel 导入全面兼容修复、导入诊断、剪贴板导入、导入确认弹窗，[Android](https://github.com/3501677524/course-schedule/releases/download/v2.1.0/app-release-v2900.apk) / [iOS](https://github.com/3501677524/course-schedule/releases/download/v2.1.0/app-ios-release-v2900.ipa)
- **v2.0.0**：双端新版本，[Android](https://github.com/3501677524/course-schedule/releases/download/v2.0.0/app-release-v2302.apk) / [iOS](https://github.com/3501677524/course-schedule/releases/download/v2.0.0/app-ios-release-v2302.ipa)
- **v1.8.0**：首个公开 Release，包含 Android 安装包 [app-release-v1800.apk](https://github.com/3501677524/course-schedule/releases/download/v1.8.0/app-release-v1800.apk)

## ⚠️ 注意

- `src/supabase/client.ts` 含云同步服务密钥，发布前请确认是否需要轮换
- `app.json` 中 `android.package` 为占位包名，正式发布前请改为你自己的包名
- 课表模板导出依赖 `xlsx` 解析，模板文件位于 `src/assets/2603025班学期周课表_模板.zip`（内容为 OOXML xlsx）
