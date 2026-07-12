---
slug: 'proxy-05-ai-service-access'
title: '代理原理（五）：AI 服务访问实战 —— Claude、GPT 与 API 中转'
description: '代理系列最终篇。Claude/ChatGPT/Gemini 的访问策略、Apple ID 跨区订阅低价方案、one-api 中转平台部署，把前四篇的知识串成完整的生产力链路。'
category: 'tech'
tags: ['代理', 'AI', 'Claude', 'ChatGPT', 'one-api']
series: '代理原理'
seriesOrder: 5
draft: true
pubDate: '2026-06-09'
heroImage: '../../../assets/proxy-hero.png'
lang: 'zh'
---

前四篇我们从原理到实操，搭完了整条代理链路。本篇是**收尾实战**——把代理能力转化为生产力：稳定访问 AI 服务、低成本订阅、搭建团队共享的 API 中转站。

---

## 第一章：各 AI 服务的访问策略

### Claude（Anthropic）

**风控等级：⭐⭐⭐⭐⭐ 最严格**

Claude 是目前主流 AI 服务中对 IP 最敏感的：

| 访问方式 | IP 要求 | 可用性 |
|---------|---------|--------|
| claude.ai 网页版 | 美国住宅 IP 最稳 | DC IP 大概率被封 |
| Claude iOS App | 相对宽松 | 需要美区 Apple ID |
| Claude API | 只看 API Key | 任何 IP 都行 |

**推荐配置：**

```yaml
# Clash 规则
rules:
  - DOMAIN-SUFFIX,claude.ai,住宅代理
  - DOMAIN-SUFFIX,anthropic.com,住宅代理
  - DOMAIN-SUFFIX,statsig.anthropic.com,住宅代理
  # statsig 是 Claude 的分析服务，也要走代理
```

> **关键经验**：Claude 网页版最好用**固定的美国住宅 IP**，不要频繁切换节点。如果只有 DC IP，优先用 WARP 中转。API 访问不挑 IP——如果你主要用 API，直接 DC IP 就够了。

### ChatGPT（OpenAI）

**风控等级：⭐⭐⭐ 中等**

```yaml
rules:
  - DOMAIN-SUFFIX,openai.com,Proxy
  - DOMAIN-SUFFIX,chatgpt.com,Proxy
  - DOMAIN-SUFFIX,oaiusercontent.com,Proxy
  - DOMAIN-SUFFIX,oaistatic.com,Proxy
  - DOMAIN-SUFFIX,auth0.com,Proxy        # 登录认证
  - DOMAIN-SUFFIX,challenges.cloudflare.com,Proxy  # CF 验证
```

ChatGPT 对 DC IP 的容忍度比 Claude 高不少。多数 VPS 的 IP 能直接用网页版，但以下情况会触发风控：

- 用了大量用户共享的 VPN 服务商 IP
- 同一 IP 短时间内登录多个账号
- IP 所在 ASN 被批量标记为代理

### Gemini（Google）

**风控等级：⭐⭐ 较宽松**

```yaml
rules:
  - DOMAIN-SUFFIX,gemini.google.com,Proxy
  - DOMAIN-SUFFIX,generativelanguage.googleapis.com,Proxy
  - DOMAIN-SUFFIX,bard.google.com,Proxy
  - DOMAIN-KEYWORD,gemini,Proxy
```

Google 对 IP 类型不太敏感，DC IP 通常没问题。主要限制是**地区**——某些国家/地区（包括中国、俄罗斯、欧盟部分国家）不可用。只要 IP 在支持的地区就行。

### 各服务对比总结

| 服务 | DC IP | WARP | 住宅 IP | API 访问 |
|------|-------|------|---------|---------|
| **Claude 网页** | ❌ 经常封 | ⚠️ 时好时坏 | ✅ 稳定 | — |
| **Claude API** | ✅ 可用 | ✅ 可用 | ✅ 可用 | 不挑 IP |
| **ChatGPT 网页** | ⚠️ 部分可用 | ✅ 可用 | ✅ 稳定 | — |
| **ChatGPT API** | ✅ 可用 | ✅ 可用 | ✅ 可用 | 不挑 IP |
| **Gemini 网页** | ✅ 可用 | ✅ 可用 | ✅ 可用 | — |
| **Gemini API** | ✅ 可用 | ✅ 可用 | ✅ 可用 | 不挑 IP |

> **核心结论**：如果你主要用 **API**（通过 one-api 或直接调用），DC IP 完全够用，不需要住宅代理。只有用**网页版** Claude 时才需要住宅 IP。

---

## 第二章：Apple ID 跨区订阅

### 为什么要跨区？

AI 服务的订阅价格因地区而异。Apple 的 App Store 是最方便的低价入口：

| 服务 | 美国价格 | 尼日利亚价格 | 折合人民币 |
|------|---------|------------|-----------|
| Claude Pro | $20/月 | ~₦15,750/月 | ~¥74/月 |
| ChatGPT Plus | $20/月 | ~₦13,000/月 | ~¥61/月 |

> 尼日利亚区曾经是最便宜的选项，但各服务商在持续调整地区定价。土耳其、阿根廷、印度等区也值得关注。**订阅前先查当地 App Store 的实际价格。**

### 跨区订阅步骤

#### 1. 注册目标地区的 Apple ID

```
方法：
1. 登录 appleid.apple.com
2. 创建新 Apple ID
3. 国家/地区选"尼日利亚"（或目标地区）
4. 地址填当地真实地址（Google Maps 搜一个）
5. 付款方式选"无"
```

#### 2. 充值 App Store 余额

直接用信用卡会暴露真实地址，推荐用**礼品卡**：

```
礼品卡购买渠道：
├── 官方渠道：Apple 官网（需要当地付款方式）
├── 第三方：
│   ├── SEAGM (seagm.com) — 支持多国礼品卡
│   ├── G2A (g2a.com) — 游戏/礼品卡平台
│   ├── OffGamers — 东南亚/非洲区覆盖好
│   └── 淘宝 — 搜"尼日利亚 Apple 礼品卡"
│
└── 注意：部分第三方可能加价 5-15%
```

#### 3. 下载 App 并订阅

```
1. 在 iPhone 上切换到新 Apple ID（设置 → Apple ID → 退出 → 登录新的）
2. 打开 App Store → 搜索 Claude / ChatGPT
3. 下载 App
4. 在 App 内订阅（用礼品卡余额支付）
5. 订阅成功后，可以切回主力 Apple ID
   （订阅不会因为切换账号而中断）
```

> **注意事项**：
> - 下载 App 时必须用目标地区的 Apple ID
> - 订阅管理（续费/取消）需要切回该 Apple ID
> - iOS App 订阅的 Claude Pro 和网页版的是通用的，登录同一个 Claude 账号即可
> - 代理要全局模式，且 IP 建议在目标地区（不强制但更安全）

---

## 第三章：one-api 中转平台

### 为什么需要中转？

当你有多个 AI 服务的 API Key 时，直接管理很麻烦：

```
没有中转：
  项目 A → Claude API Key
  项目 B → OpenAI API Key
  项目 C → Gemini API Key
  团队成员 D → 需要单独给他每个 Key
  
  Key 泄露了？每个项目逐个换
  想限制某人的用量？做不到
  想看谁用了多少？没有统计
```

**one-api** 解决了这些问题——它是一个 API **统一入口和管理后台**：

```
有中转：
  所有项目/成员 → one-api（统一入口）
                    │
                    ├── 内部路由到 Claude API
                    ├── 内部路由到 OpenAI API
                    ├── 内部路由到 Gemini API
                    └── 内部路由到 DeepSeek API
                    
  ✅ 对外只暴露一个地址和 Key
  ✅ 可以给每个成员分配独立 Key + 额度
  ✅ 统一的用量统计和日志
  ✅ 上游 Key 轮转、负载均衡
```

### 部署 one-api

one-api 推荐用 Docker 部署在你的 VPS 上：

```bash
# 创建数据目录
mkdir -p /opt/one-api

# 启动容器
docker run -d \
  --name one-api \
  --restart always \
  -p 3000:3000 \
  -v /opt/one-api:/data \
  -e TZ=Asia/Shanghai \
  justsong/one-api:latest
```

启动后访问 `http://你的VPS_IP:3000`，默认账号 `root`，密码 `123456`（**立即修改**）。

### 配置上游渠道

在 one-api 后台 → "渠道" → 添加：

#### Claude

```
类型：Anthropic Claude
名称：Claude-Sonnet
Base URL：https://api.anthropic.com
密钥：sk-ant-api03-xxxxx（你的 Claude API Key）
模型：claude-sonnet-4-20250514
```

#### OpenAI

```
类型：OpenAI
名称：GPT-4o
Base URL：https://api.openai.com
密钥：sk-xxxxx（你的 OpenAI API Key）
模型：gpt-4o, gpt-4o-mini
```

#### DeepSeek

```
类型：OpenAI（DeepSeek 兼容 OpenAI 格式）
名称：DeepSeek
Base URL：https://api.deepseek.com
密钥：sk-xxxxx
模型：deepseek-chat, deepseek-reasoner
```

#### Gemini

```
类型：Google Gemini
名称：Gemini-Pro
Base URL：https://generativelanguage.googleapis.com
密钥：AIzaSy-xxxxx
模型：gemini-2.5-pro
```

### 分发 Key 给团队

后台 → "令牌" → 创建：

```
名称：张三-开发用
额度：$50（用完自动停）
过期时间：2026-12-31
限制模型：claude-sonnet-4-20250514, gpt-4o
IP 白名单：可选
```

张三在他的应用中这样调用：

```python
import openai

client = openai.OpenAI(
    api_key="sk-one-api-给张三的key",
    base_url="https://你的域名/v1"    # one-api 的地址
)

response = client.chat.completions.create(
    model="claude-sonnet-4-20250514",   # one-api 会自动路由到 Claude
    messages=[{"role": "user", "content": "你好"}]
)
```

> **one-api 的核心价值**：对调用者来说，接口格式统一为 OpenAI 兼容格式。不管后端是 Claude、Gemini 还是 DeepSeek，调用方式完全一样。换模型只需要改 `model` 参数。

### 绑定域名 + HTTPS

裸 IP + HTTP 不安全，建议绑定域名并配置 HTTPS：

```bash
# 安装 Nginx
apt install nginx -y

# 安装 certbot（Let's Encrypt 免费证书）
apt install certbot python3-certbot-nginx -y

# 配置 Nginx 反向代理
cat > /etc/nginx/sites-available/one-api << 'EOF'
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 启用配置
ln -s /etc/nginx/sites-available/one-api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 申请 SSL 证书
certbot --nginx -d api.yourdomain.com
```

完成后就可以用 `https://api.yourdomain.com` 访问了。

> **注意**：如果你的 Xray 已经占用了 443 端口，需要让 Xray 和 Nginx 共存。方案是 Xray 监听 443，Nginx 监听其他端口（如 8443），或者用 Xray 的 fallback 把非代理流量回落到 Nginx。

---

## 第四章：成本优化

### 自建 vs 购买 API 的成本对比

| 方案 | 月成本 | 优势 | 劣势 |
|------|--------|------|------|
| **Claude Pro 订阅（美区）** | ~¥145 | 无限对话（有速率限制） | 贵，单人用 |
| **Claude Pro 订阅（尼日利亚区）** | ~¥74 | 便宜一半 | 需要跨区操作 |
| **Claude API 按量付费** | 按用量 | 团队共享，灵活 | 重度使用可能更贵 |
| **DeepSeek API** | 极低 | 便宜到几乎免费 | 能力不如 Claude |

### API 价格参考（2025年中）

| 模型 | 输入价格 | 输出价格 | 日常对话成本估算 |
|------|---------|---------|---------------|
| Claude Sonnet 4 | $3/百万token | $15/百万token | ~$0.1-0.3/天 |
| GPT-4o | $2.5/百万token | $10/百万token | ~$0.1-0.2/天 |
| GPT-4o-mini | $0.15/百万token | $0.6/百万token | ~$0.01/天 |
| DeepSeek-V3 | ¥1/百万token | ¥2/百万token | ~¥0.1/天 |
| Gemini 2.5 Pro | $1.25/百万token | $10/百万token | ~$0.05-0.15/天 |

> **实际经验**：个人日常使用（每天 20-30 轮对话），Claude API 月成本约 $5-15，远低于 $20 的 Pro 订阅。但如果你高频使用长上下文或代码生成，API 成本会快速上升。

### 推荐的成本策略

```
个人开发者：
  ├── 日常对话 → DeepSeek（几乎免费）
  ├── 复杂推理/代码 → Claude API（按量）
  └── 备用 → Gemini 免费额度

小团队（3-5 人）：
  ├── one-api 统一管理
  ├── 主力 → Claude API + GPT-4o
  ├── 轻量任务 → DeepSeek / GPT-4o-mini
  └── 每人每月预算 $10-20
```

---

## 完整链路回顾

五篇文章，我们搭建了一条完整的链路：

```
第一篇：原理
  └── 理解了代理的本质、协议演进、数据流

第二篇：服务端
  └── 在 VPS 上搭建了 VLESS + Reality 节点

第三篇：客户端
  └── 配置了 Clash/小火箭的规则和策略组

第四篇：代理链
  └── 解决了 DC IP 被封的问题（住宅代理/WARP）

第五篇：AI 服务
  └── 把代理能力转化为生产力（访问策略 + 订阅 + API 中转）
```

最终形成的网络拓扑：

```
你的设备
  │
  ├── [国内流量] → DIRECT → 直连
  │
  └── [国外流量] → Clash 规则匹配
        │
        ├── [AI 服务] → VPS → 住宅代理/WARP → Claude/GPT
        ├── [一般外网] → VPS → 直连 → Google/YouTube
        └── [API 调用] → VPS → one-api → 各 AI 提供商
```

从一无所知到搭建完整的私有 AI 基础设施——**这就是你的数据包翻过墙的全过程。**

---

*本系列参考：[one-api 项目](https://github.com/songquanpeng/one-api)，[Anthropic API 文档](https://docs.anthropic.com/)，[OpenAI API 文档](https://platform.openai.com/docs)*
