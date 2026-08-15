# DeepSeek Harness 的桌面端

> 双击即用，不用敲命令

自包含的 Windows 桌面应用：把 `dsh web` 完整打包，双击即用，无需 Node/npm/命令行。

> 本项目是 DeepSeek Harness 的第三方桌面端，与 DeepSeek 官方无关。

## 下载

**Windows x64**，约 281 MB：

- [⬇️ 下载安装包（DSH-Desktop-Setup-0.1.0.exe）](https://github.com/nanbbb/dsh-desktop/releases/download/v0.1.0/DSH-Desktop-Setup-0.1.0.exe)
- 或到 [Releases 页面](https://github.com/nanbbb/dsh-desktop/releases/latest) 选版本

双击安装即可，无需 Node/npm。首次运行若弹 SmartScreen，点「更多信息 → 仍要运行」。

## 架构

```
DSH Desktop.exe (Electron 壳)   —— 窗口 / 托盘 / 生命周期
  └─ 内置 Node (ELECTRON_RUN_AS_NODE) 运行引擎
engine/  —— 自包含引擎（dsh 包 + web 插件 + profile）
  node_modules/@deepseek-ai/dsh   核心 + 全部 bundle
  plugins/                        dsh-browser / dsh-mneme / modlens / find-plugin
  profile/                        cordis.yml / package.json 等配置
```

用户数据（会话/设置/凭据/记忆）在 `%APPDATA%/DSH Desktop/home`，首次运行自动从旧 `~/.dsh` 迁移。

## 双通道自动更新

| 通道 | 内容 | 机制 |
| --- | --- | --- |
| 壳 | Electron 主进程 | electron-updater + NSIS，启动后台检查，退出时自动装 |
| 引擎 | dsh 核心 + 插件 | 启动前检查 GitHub Release 的 `dsh-engine-<版本>.zip`，下载替换（带回滚） |

更新源：GitHub Releases（`nanbbb/dsh-desktop`）。

## 构建

```
node scripts/fetch-engine.js   # 从本机现有安装抓取引擎（dsh + 插件）
npm run pack:engine            # 打引擎 zip 到 dist/
npm run dist                   # 打 NSIS 安装包到 dist/
```

## 发布

1. 改 `package.json` 版本号（壳）+ `engine/package.json` 版本号（引擎，仅引擎变化时改）。
2. `npm run dist && npm run pack:engine`。
3. 上传：

```
cd dist
Copy-Item "DSH Desktop Setup 0.1.0.exe" "DSH-Desktop-Setup-0.1.0.exe" -Force
gh release create v<版本> DSH-Desktop-Setup-<版本>.exe dsh-engine-<引擎版本>.zip latest.yml --repo nanbbb/dsh-desktop
```

注意：`latest.yml` 里的文件名是连字符形式（electron-builder 会把空格转连字符）。

## 开发运行

```
npm start   # 开发模式：直接用项目里的 engine/ 运行
```
