# AI塔罗显化 · 塔罗显化之旅

一款爱爬「命运之塔」的手机网页小游戏：在薰衣草紫色的星光高塔中拾级而上，从 22 张大阿卡纳中一次抽取 3 张（过去 / 现在 / 未来），由 AI 结合你的问题写出专属解读和 3 个小行动，登上塔顶时获得第 23 张显化牌「XXII 创造者 THE CREATOR」。

- 23 张统一矢量插画风牌面，每张人物各不相同
- 一页抽 3 张：左右滑动挑牌，点选后飞入「过去 / 现在 / 未来」槽位
- 洗牌、星尘拖尾、长按蓄力翻牌、光爆等抽牌动效
- AI 解读：**DeepSeek（deepseek-chat）优先，OpenAI 兜底**；都不可用时自动退回本地模板解读
- API Key 只保存在 Cloudflare 的加密 Secrets 中，不会出现在网页代码里

## 目录结构

```
public/                 静态网页（部署输出目录）
  index.html
  styles.css
  app.js                前端逻辑，调用同源 POST /api/reading，失败时用模板解读
  assets/               牌面、背景、字体
functions/
  api/reading.js        Cloudflare Pages Function：AI 解读接口
  api/health.js         GET /api/health：查看已配置的服务商（不暴露 key）
wrangler.toml           Cloudflare Pages 配置
```

## 本地运行

只看前端（使用模板解读）：

```bash
cd public && python3 -m http.server 8080
# 打开 http://localhost:8080
```

带 AI 解读的完整本地环境（需要 Node.js 18+）：

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入你的 DEEPSEEK_API_KEY / OPENAI_API_KEY（此文件不会被提交）
npx wrangler pages dev
# 打开 http://localhost:8788
```

## 部署到 Cloudflare Pages

```bash
npx wrangler login                                            # 或设置环境变量 CLOUDFLARE_API_TOKEN
npx wrangler pages project create tarot-journey --production-branch main
npx wrangler pages deploy

# 设置密钥（交互式输入，不会留在命令历史里）
npx wrangler pages secret put DEEPSEEK_API_KEY --project-name tarot-journey
npx wrangler pages secret put OPENAI_API_KEY   --project-name tarot-journey

# 设置密钥后重新部署一次使其生效
npx wrangler pages deploy
```

部署完成后访问 `https://tarot-journey.pages.dev`。

也可以在 Cloudflare 控制台把本仓库连接到 Pages（构建命令留空，输出目录填 `public`），并在「设置 → 变量和机密」中添加上述两个密钥。

## 接口说明

`POST /api/reading`

```json
{
  "question": "我该不该换工作？",
  "theme": "career",
  "cards": [
    { "position": "past",    "name_cn": "隐士", "name_en": "The Hermit", "numeral": "IX" },
    { "position": "present", "name_cn": "星星", "name_en": "The Star",   "numeral": "XVII" },
    { "position": "future",  "name_cn": "世界", "name_en": "The World",  "numeral": "XXI" }
  ]
}
```

返回：`title`、`reading[]`、`actions[]`、`creator_message`、`provider`、`model`。

校验与防刷：

- 问题 2–120 字，恰好 3 张牌，请求体不超过 4KB
- 限流：每个 IP 每 10 分钟 10 次，全站每天 300 次
  - 默认在单个 Worker 实例内存中计数（尽力而为，**不是全局的**）
  - 绑定名为 `TAROT_KV` 的 KV 命名空间后（见 `wrangler.toml` 注释），限流跨实例生效
- 可选环境变量：`RATE_PER_IP`、`RATE_WINDOW`（秒）、`DAILY_CAP`、`DEEPSEEK_MODEL`、`OPENAI_MODEL`
