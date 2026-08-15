# DeepSeek Harness 桌面端

把 `dsh web` 包成一个原生窗口应用：双击图标即用，无需每次敲命令、也无需留着终端窗口。

## 快速开始

桌面上的 **「DeepSeek Harness」** 快捷方式双击即可打开。

等价的手动启动方式（在项目目录下）：

```
npm start
```

## 它做了什么

1. 启动时先探测 `127.0.0.1:3080` 是否已有 DSH 服务在跑：
   - 有 → 直接复用（比如你之前已经用 `dsh web` 打开过）。
   - 没有 → 自动在后台启动 `dsh web`，等服务就绪后再加载页面。
2. 用一个原生窗口打开界面；启动期间先显示加载页。
3. 点窗口「关闭」按钮 = 缩到系统托盘（右下角图标），服务保持运行；再次双击图标或点托盘「显示 DSH」即可秒开。
4. 托盘菜单「退出」= 真正结束；**只有本应用自动启动的服务会被一并回收**，你自己手动起的服务不受影响。

## 配置

默认 host/port 可通过环境变量覆盖：

| 变量 | 默认值 |
| --- | --- |
| `DSH_WEB_HOST` | `127.0.0.1` |
| `DSH_WEB_PORT` | `3080` |

## 日志

应用自动启动的服务日志在：

```
%APPDATA%\dsh-desktop\dsh-web.log
```

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `main.js` | Electron 主进程：探测/启动服务、窗口、托盘、生命周期 |
| `splash.html` | 启动加载页 |
| `icon.png` / `icon.ico` | 应用图标（`scripts/make-icon.js` 生成） |
| `package.json` | 依赖（electron 37.10.3） |

重新生成图标：

```
node scripts/make-icon.js
```

## 说明

- 当前是「开发运行」形态：快捷方式直接指向 `node_modules/electron/dist/electron.exe`。若移动项目目录需重新指向快捷方式。
- 如需打包成独立 `.exe`（可分发、带安装包），可以后续用 electron-builder 打一个发布版。
