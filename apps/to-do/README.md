# To-Do

本地优先的 Windows 待办应用：任务分组、自由画布、区域划分、磁性对齐、Markdown 备注、每日复盘、每月总结，以及 90 / 60 / 30 分钟休息提醒（可延后 10 分钟）。

使用 React、TypeScript、Vite、React Flow；界面字体为霞鹜文楷屏幕阅读版，代码字体为 JetBrains Mono。

## 安装与启动

需要 Windows、已安装并加入 PATH 的 Node.js/npm，以及 Chrome 或 Edge。开发环境使用 Node.js 22.16.0。首次安装依赖需要联网，构建后日常使用不依赖外部网络。

建议将仓库放在 D 盘。在本目录打开 PowerShell：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-shortcut.ps1
```

然后双击本目录生成的“启动 To-Do”快捷方式，也可以运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

服务仅绑定 `127.0.0.1:4173`。同一台电脑同时只能运行一个使用此端口的实例；若另一个目录中的 To-Do 已在运行，应先结束其本地服务。不要误终止其他程序。

休息提醒需要上述专用入口及 Windows 窗口辅助组件。仅运行 Vite 开发服务器无法提供后台提醒能力。更新后台脚本后应关闭应用，再使用快捷方式启动。

## 数据与隐私

- 当前记录存储在本应用 `.runtime/browser-profile/` 内的 IndexedDB；不是仓库文件。
- JSON 导出默认位于本应用 `Data_BackUp/`，与实时自动保存不同。
- 依赖缓存、临时文件、日志和浏览器缓存均放在本应用 `.runtime/` 下；系统和浏览器自身的系统级记录不由应用完全控制。
- 本仓库初次运行为空白数据。迁移记录应在旧应用导出 JSON，再在新应用“数据与显示”中导入，不复制正在使用的浏览器数据库。
- 使用普通浏览器访问相同地址可能使用另一份数据；删除独立浏览器配置或清除站点数据会丢失本地记录。

## 开发与检查

```powershell
. .\scripts\env.ps1
npm run build
npm test
```

浏览器检查脚本位于 `scripts/qa-*.mjs`，需要另外安装 Playwright 浏览器；先加载 `env.ps1`，再运行 `npx playwright install chromium`，确保下载进入本项目的 `.runtime/`。这些脚本属于交互验收工具，部分针对历史 UI，不应当作当前版本全部通过的保证。`qa-rest.mjs` 会建立隔离数据并短暂显示测试窗口。

原项目中读取真实备份的迁移测试已改成人工示例；不依赖个人备份。直接操作日常浏览器配置的本机验收脚本不随仓库发布。

## 字体

霞鹜文楷屏幕阅读版与 JetBrains Mono 的许可证保留在 `public/fonts/`。仓库内包含文楷字体文件，因此首次克隆会下载约 26 MB 的字体资源。
