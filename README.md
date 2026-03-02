# ChatGPT Snippet Bookmark

> **Disclaimer / 免责声明**
>
> This is an independent third-party project and is **not** affiliated with, endorsed by, or sponsored by OpenAI.
>
> 本项目为第三方独立项目，与 OpenAI **无隶属、无背书、无赞助关系**。

Save highlighted snippets from ChatGPT conversations, then search and reuse them later.

把 ChatGPT 对话中你选中的“金句片段”快速收藏起来，后续可检索、复制、导出。

---

## Features / 功能

- Save selected text from **assistant messages only**
  - 仅保存 **assistant 回复**中的选中文本，避免误存用户输入
- Quick save via shortcut or context menu
  - 支持快捷键和右键菜单快速收藏
- Search, copy, tag, and delete snippets
  - 支持搜索、复制、打标签、删除
- Open source conversation and auto-locate saved snippet (best effort)
  - 可回到原对话并自动定位片段（尽力定位，受页面结构影响）
- Export all snippets to Markdown
  - 一键导出全部收藏为 Markdown

---

## Install / 安装

1. Open Chrome: `chrome://extensions`
   - 打开 Chrome 扩展页：`chrome://extensions`
2. Enable **Developer mode**
   - 开启右上角 **开发者模式**
3. Click **Load unpacked**
   - 点击 **加载已解压的扩展程序**
4. Select this folder
   - 选择本项目目录（包含 `manifest.json`）

---

## Usage / 使用方法

### Save a snippet / 保存片段
- On ChatGPT (`chatgpt.com` / `chat.openai.com`), highlight text in an assistant message.
- 在 ChatGPT 页面中，选中 assistant 回复里的文字。

Then save via one of these methods:
- 然后通过以下任一方式保存：

- Shortcut: `Cmd/Ctrl + Shift + S`
- 快捷键：`Cmd/Ctrl + Shift + S`
- Right click: **Save selection to Snippet Bookmarks**
- 右键菜单：**Save selection to Snippet Bookmarks**

### Manage snippets / 管理片段
Click extension icon to:
- 点击扩展图标后可以：
  - Search snippets / 搜索
  - Open source conversation / 打开原对话
  - Copy snippet text / 复制文本
  - Add tags / 添加标签
  - Delete snippets / 删除片段
  - Export Markdown / 导出 Markdown

---

## Permissions / 权限说明

- `storage`: store snippets locally
  - 本地保存收藏数据
- `activeTab`, `tabs`, `scripting`: read selected text and help locate snippet when opening
  - 读取当前页选中文本，并在打开时尝试定位
- `contextMenus`: right-click quick save
  - 提供右键快速收藏

Host permissions are limited to:
- 站点权限仅限：
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`

---

## Privacy / 隐私

- Snippets are stored in `chrome.storage.local` on your device.
  - 收藏数据存储在你本机的 `chrome.storage.local`。
- No snippet content is sent to external APIs/servers.
  - 不会把收藏内容上传到外部服务。
- See `PRIVACY.md` for details.
  - 详见 `PRIVACY.md`。

---

## Known Limitations / 已知限制

- ChatGPT page DOM can change over time, which may affect auto-locate behavior.
  - ChatGPT 页面结构（DOM）会变化，可能影响自动定位准确率。
- If auto-locate fails, reopen and try again after page fully loads.
  - 若定位失败，可在页面完全加载后重试。

---

## Version / 版本

Current version: **0.2.0**

当前版本：**0.2.0**

---

## License / 许可证

MIT License. See `LICENSE`.

MIT 许可证，详见 `LICENSE`。