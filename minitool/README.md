# 小红书小工具包 · 塔罗显化之旅

这是网页版的独立静态包，给小红书「小工具」上传用。`public/`、`worker/`、`functions/` 都没有改，线上站和 Cloudflare 部署不受影响。

上传文件：`minitool/tarot-journey-xhs.zip`（约 6.5MB）。解压后的预览目录是 `minitool/package/`。zip 根目录只有一个 `index.html`。

## 本地预览

不要用 `file://` 打开。请起一个静态服务器：

```bash
python3 minitool/build.py          # 可选：从当前网页源码重新打包
cd minitool/package
python3 -m http.server 8765
```

浏览器打开 http://127.0.0.1:8765/ 。手机宽度下是全屏；宽窗口里会收成手机框。

- 普通浏览器没有 `window.xhs`。解读会走现有模板，并写明「当前未连接小红书 AI」。
- 「保存图片」会弹出预览，并说明没有写入相册。不会触发浏览器下载，也不会提示已保存。
- `?template=1` 强制模板解读。`?demo=1` 固定抽到隐士 / 星星 / 世界。`?seed=1` 固定洗牌。

流程：开启旅程 → 选主题 → 默认大阿卡纳 22 张（可改 78 张）→ 抽 3 张 → 翻牌 → 左右箭头看单张解读 → 完整解读 → 揭晓第 23 张显化牌 → 保存图片。

重新生成 zip：

```bash
python3 minitool/build.py
node minitool/selftest.mjs
```

## 上传清单

还没有创作者登录，这个包没有提交到小红书，也没有部署公开站。

| 项 | 建议 |
| --- | --- |
| 名称 | 塔罗显化之旅 |
| 简介 | 在薰衣草星光塔里抽出过去、现在、未来三张牌，收下第 23 张显化牌和一句显化宣言。默认 22 张大阿卡纳，也可以换成 78 张完整牌组。平台 AI 开通后会按你的问题写解读；未开通时自动使用基础解读。 |
| 图标 | `minitool/upload/icon-192.png`（192×192，靛紫色底上的月牙）。若后台要别的尺寸，用同一张图等比缩放。 |
| 包 | `minitool/tarot-journey-xhs.zip`，入口 `index.html` |
| 相册 | 需要。用户点「保存图片」时，用 `saveImageToPhotosAlbum` 写入系统相册。 |
| 存储 | 需要。先 `writeTempFile` 把 PNG 写成临时文件，再交给相册接口。按需申请，不要一进页面就弹权限。 |
| 其他权限 | 不需要定位、麦克风、通讯录、相机。 |
| 平台 AI | 内测能力。调用 `window.xhs.AI.createModel("deepseek-v4-flash").generateText(...)`，非流式，整段返回。未加白会得到 `AI_NOT_ALLOWED`，每个用户每天大约 100 次。未开通、超额或返回无效时，自动改用模板解读。 |

## 和网页版的差异

- 没有背景音乐，包里也没有 mp3。
- 没有自建后端，不请求 Cloudflare、DeepSeek 或任何外部 CDN。包内没有 API key，也没有自定义模型地址。
- AI 只走小红书平台能力，依赖加白；失败时回退到网页版同一套中文模板（简体、收紧字数、显化宣言不用负面词、单张解读整段出现）。
- 保存图片只走 `writeTempFile` + `saveImageToPhotosAlbum`。浏览器预览检测到没有 `window.xhs` 时会说明保存没有发生。
- 分享只带解读文案，不带线上网址。
- 牌面大图压成 webp，放在 `assets/`。首页背景和月亮在包根目录，标题字体在 `fonts/`，正文霞鹜文楷在 `assets/fonts/wenkai/`。

保留的产品约束：默认 22 张、可选 78 张；主按钮没有箭头；牌面解读页保留左右箭头；解读文字左对齐并且整段出现；保存图裁到总结句为止；显化宣言仍然是第一人称、现在进行时。

字体许可见 `minitool/NOTICES.md`。许可全文不放进 zip，因为小工具允许的类型里没有 txt。
