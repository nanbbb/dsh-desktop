# DeepSeek Harness 的桌面端

> 双击即用，不用敲命令

自包含的 Windows 桌面应用：把 `dsh web` 完整打包，双击即用，无需 Node/npm/命令行。

> 本项目是 DeepSeek Harness 的第三方桌面端，与 DeepSeek 官方无关。

## 内置功能

- **dsh-plus 插件**（内置）：设置面板接管 **视觉(modlens) / 记忆(mneme)** 配置、**插件市场**（搜索/一键安装）、**本地模型**（探测 ollama/LM Studio 一键添加）、一键重启引擎。
- **双通道自动更新**：壳 + 引擎分开更新，检查更新有进度提示（正在检查 / 发现新版本 / 下载中 X% / 已是最新）。
- **免环境依赖**：引擎自包含，新 PC 无需 Node/npm/dsh。

## 下载

**Windows x64**，约 281 MB。

### 方式一：夸克网盘（国内推荐，速度快）

📱 手机扫码（提取码已内置），或复制链接打开「夸克APP」：

![下载二维码](download-qr.png)

- 链接：<https://pan.quark.cn/s/35cde8c8c64b?pwd=eehh>
- 提取码：`eehh`

### 方式二：GitHub Releases

- [⬇️ 下载最新安装包](https://github.com/nanbbb/dsh-desktop/releases/latest)

双击安装即可，无需 Node/npm。首次运行若弹 SmartScreen，点「更多信息 → 仍要运行」。

## 架构

```
DSH Desktop.exe (Electron 壳)   —— 窗口 / 托盘 / 生命周期 / 引擎自动重启
  └─ 内置 Node (ELECTRON_RUN_AS_NODE) 运行引擎
engine/  —— 自包含引擎（dsh 包 + web 插件 + dsh-plus + profile）
```

用户数据（会话/设置/凭据/记忆）在 `%APPDATA%/dsh-desktop/home`，首次运行自动从旧 `~/.dsh` 迁移；卸载重装不丢数据。

## 构建 & 发布

```
node scripts/fetch-engine.js   # 从本机现有安装抓取引擎（dsh + 插件 + dsh-plus）
npm run dist                   # 打引擎 zip + NSIS 安装包到 dist/
```

发布：改版本号 → `npm run dist` → `gh release create v<版本> DSH-Desktop-Setup-<版本>.exe dsh-engine-<引擎版本>.zip latest.yml`。

## License

MIT
