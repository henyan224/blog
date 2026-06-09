---
title: '代理原理（二）：自建节点实战 —— 从零搭建 VLESS + Reality'
description: '代理系列第二篇。手把手搭建一台 VLESS + Reality 代理服务器：VPS 选购、Xray-core 安装、Reality 配置、SNI 选择策略、客户端连接。'
category: 'tech'
tags: ['代理', '网络', 'VLESS', 'Reality', 'Xray']
series: '代理原理'
seriesOrder: 2
draft: true
pubDate: '2026-06-09'
heroImage: '../../assets/proxy-hero.png'
lang: 'zh'
---

[上一篇](../proxy-01-how-proxy-works)我们从原理层面拆解了代理的工作机制——协议演进、代理链、路由规则。

本篇动手：**从零搭建一台 VLESS + Reality 代理服务器**，并配置客户端连接。

---

## 第一步：买一台 VPS

### 什么是 VPS？

**VPS（Virtual Private Server，虚拟专用服务器）** 就是你在云端租的一台电脑。它 24 小时开机、有独立公网 IP、在海外机房运行——你通过终端远程操控它。

```
你的电脑 ──[SSH]──→ VPS (美国机房)
                      │
                      ├── 独立公网 IP（如 107.161.90.139）
                      ├── Linux 系统（通常 Ubuntu/Debian）
                      ├── 24/7 运行
                      └── 你装什么跑什么
```

### 选购要点

| 指标 | 推荐 | 原因 |
|------|------|------|
| **地区** | 美国西海岸 / 日本 / 新加坡 / 香港 | 到中国延迟低 |
| **线路** | CN2 GIA / AS9929 / CMIN2 | 绕开拥堵的国际出口 |
| **配置** | 1 核 512MB 内存就够 | 代理几乎不吃资源 |
| **带宽** | 500Mbps+ / 1TB+ 月流量 | 看视频需要带宽 |
| **价格** | $3-10/月 | 太便宜的线路差 |

### 线路等级科普

中国到海外的网络不是一根线直通的，中间要经过多个"路由节点"。不同线路的质量天差地别：

```
线路等级（从好到差）：

⭐⭐⭐⭐⭐  CN2 GIA（AS4809）— 电信高端
             双向走中国电信独立通道，晚高峰依然稳定
             就像高速公路的 ETC 专用车道

⭐⭐⭐⭐    AS9929 — 联通高端
             联通的 A 网精品线路，延迟低、抖动小
             晚高峰表现仅次于 CN2 GIA

⭐⭐⭐⭐    CMIN2（AS58807）— 移动高端
             中国移动国际精品网，近两年崛起
             移动用户体验极佳，价格比 CN2 GIA 便宜

⭐⭐⭐      CN2 GT（AS4809 单向）
             只有回程走 CN2，去程走普通线路
             比纯 163 好，但晚高峰仍有波动

⭐⭐        163 骨干网（AS4134）
             电信普通线路，便宜但晚高峰拥堵严重
             延迟可能飙到 500ms+，丢包率高

⭐          普通国际线路
             不做任何优化，高峰期基本不可用
```

> **怎么判断自己是什么运营商？** 打开手机设置看 SIM 卡信息，或者 PC 端看宽带账号。电信用户优先选 CN2 GIA，联通选 AS9929，移动选 CMIN2——**匹配自己的运营商线路效果最好**。

### VPS 服务商推荐

按地区分类，标注了线路质量和适合的用户画像。

#### 🇺🇸 美国（最多选择）

| 服务商 | 线路 | 价格 | 特点 | 适合 |
|--------|------|------|------|------|
| **搬瓦工（BandwagonHost）** | CN2 GIA | $50+/年 | 线路质量最稳，圈内口碑最好 | 追求稳定、不差钱 |
| **DMIT** | CN2 GIA / CMIN2 | $7/月起 | 提供不同线路等级可选 | 需要精品线路 |
| **HostDare** | CN2 GIA / CN2 GT | $4/月起 | CN2 GIA 中较便宜的选择 | 性价比党 |
| **RackNerd** | 普通 / CN2 GT | $10-20/年 | 黑五/新年促销极低价 | 练手、预算极低 |
| **Vultr** | 普通 | $3.5/月起 | 按小时计费，全球 30+ 机房 | 临时测试、频繁换 IP |
| **DigitalOcean** | 普通 | $4/月起 | 开发者友好，文档最好 | 同时跑其他服务 |
| **Linode（Akamai）** | 普通 | $5/月起 | 稳定老牌，企业级 | 长期稳定运行 |
| **CloudCone** | 普通 | $15/年起 | 促销价极低 | 练手备用 |

> **美西首选城市**：洛杉矶（Los Angeles）> 圣何塞（San Jose）> 西雅图（Seattle）。洛杉矶到中国的海缆最多，延迟通常 130-180ms。

#### 🇯🇵 日本（低延迟首选）

| 服务商 | 线路 | 价格 | 特点 | 适合 |
|--------|------|------|------|------|
| **搬瓦工** | CN2 GIA（大阪） | $50+/年 | 日本唯一靠谱 CN2 GIA | 追求极致低延迟 |
| **DMIT** | Premium（东京） | $7/月起 | 精品线路，三网优化 | 对延迟敏感 |
| **Vultr** | 普通（东京/大阪） | $3.5/月起 | NTT 线路，软银回程 | 临时使用 |
| **Linode** | 普通（东京） | $5/月起 | 稳定，IIJ 线路 | 长期备用 |

> **日本的优势**：到中国物理距离最近（海缆仅 ~3000km），延迟可低至 **40-80ms**（优化线路），比美国快一倍。但日本 CN2 GIA 资源稀缺，价格较高。

#### 🇸🇬 新加坡

| 服务商 | 线路 | 价格 | 特点 | 适合 |
|--------|------|------|------|------|
| **DigitalOcean** | 普通 | $4/月起 | 新加坡机房稳定 | 东南亚业务 |
| **Vultr** | 普通 | $3.5/月起 | 按小时，灵活 | 测试 |
| **Linode** | 普通 | $5/月起 | Akamai 网络 | 长期运行 |
| **Jtti** | CN2 GIA / 普通 | $5/月起 | 不限流量方案 | 大流量需求 |

> **新加坡到中国延迟**：约 60-120ms（优化线路）。优势是地理位置好，劣势是精品线路选择不如美国和日本多。

#### 🇭🇰 香港（最低延迟，最贵）

| 服务商 | 线路 | 价格 | 特点 | 适合 |
|--------|------|------|------|------|
| **DMIT** | Premium CN2 GIA | $15/月起 | 香港 CN2 GIA 标杆 | 对延迟极致追求 |
| **搬瓦工** | CN2 GIA | $90+/年 | 稳定但价格最高 | 不差钱 |
| **阿里云国际** | 普通 | $5/月起 | 大厂，合规 | 合规业务 |

> **香港的延迟可以低至 10-30ms**，和国内差不多。但香港带宽极贵，1Mbps CN2 GIA 可能就要 $10/月。适合对延迟有极致要求、流量不大的场景。

#### 🇰🇷 韩国

| 服务商 | 线路 | 价格 | 特点 | 适合 |
|--------|------|------|------|------|
| **DMIT** | 优化线路 | $7/月起 | 韩国新机房 | 游戏加速 |
| **LightNode** | CN2 | $7/月起 | 首月折扣 | 试用 |

> 韩国到中国延迟约 40-80ms，主要优势是**游戏加速**（韩服/日服）。代理用途不如日本和美国主流。

#### 🇪🇺 欧洲（不推荐做代理，但适合其他用途）

| 服务商 | 地区 | 价格 | 特点 |
|--------|------|------|------|
| **Contabo** | 德国/美国 | €4/月起 | 超大硬盘/内存/流量，配置极高 |
| **Hetzner** | 德国/芬兰 | €4/月起 | 性能怪兽，欧洲首选 |
| **OVH** | 法国 | €3.5/月起 | 不限流量 |

> 欧洲到中国延迟 200-350ms，做代理体验差。但 **Contabo/Hetzner** 配置极高（4核8G内存 $7/月），适合跑 one-api、数据库等不敏感延迟的服务。

### 如何选？一张决策图

```
你的预算是多少？
│
├── < $20/年 → RackNerd / CloudCone（黑五促销）
│                线路一般，能用就行
│
├── $3-7/月 → 看你的运营商：
│              ├── 电信 → HostDare / DMIT（CN2 GIA）
│              ├── 联通 → DMIT（AS9929 / Premium）
│              └── 移动 → DMIT（CMIN2）
│
├── $7-15/月 → 想要低延迟？
│               ├── 是 → DMIT 日本/香港 Premium
│               └── 否 → 搬瓦工美西 CN2 GIA
│
└── 不差钱 → 搬瓦工香港 CN2 GIA（$90+/年）
              延迟 10-30ms，体验最佳
```

### 购买前必做：测试 IP

很多服务商提供**测试 IP（Looking Glass）**，购买前先 ping 一下：

```bash
# Windows PowerShell
ping 测试IP

# 或用在线工具
# https://ping.pe/测试IP    ← 全球各地到这个 IP 的延迟
# https://tools.ipip.net/   ← 路由追踪，看走了什么线路
```

| 延迟范围 | 体验 |
|---------|------|
| < 50ms | 极佳（香港/日本优化线路） |
| 50-100ms | 优秀（日本/新加坡） |
| 100-200ms | 良好（美西 CN2 GIA） |
| 200-300ms | 一般（美西普通/欧洲） |
| > 300ms | 差（欧洲普通线路） |

> **重要提醒**：购买后第一时间测试 IP 是否被墙。大众化服务商（Vultr、DO）的 IP 被滥用严重，分配到已被封锁的 IP 概率不低。大部分服务商支持免费更换 IP（销毁重建实例）。

### 购买后你会得到什么

```
IP 地址：107.161.90.139
SSH 端口：22
用户名：root
密码：xK7$mP2@qR9  （或 SSH 密钥）
系统：Ubuntu 22.04
```

---

## 第二步：连接到你的 VPS

### Windows

用 **PowerShell** 或 **Windows Terminal**（推荐）：

```bash
ssh root@107.161.90.139
```

首次连接会提示确认指纹，输入 `yes`，然后输入密码。

> **SSH（Secure Shell）**：一种加密的远程登录协议。你在本地终端输入命令，命令通过加密通道发送到 VPS 上执行，结果再传回来显示。就像你坐在 VPS 前面敲键盘一样。

### macOS / Linux

同上，终端直接 `ssh root@IP`。

### 连上之后先做两件事

```bash
# 1. 更新系统
apt update && apt upgrade -y

# 2. 设置时区（很多协议对时间敏感）
timedatectl set-timezone Asia/Shanghai
```

---

## 第三步：安装 Xray-core

### Xray 是什么？

**Xray-core** 是一个网络代理工具的核心引擎，支持 VLESS、VMess、Trojan、Shadowsocks 等几乎所有主流代理协议。它是 V2Ray 的分支，性能更好，功能更多（特别是 Reality 支持）。

```
你的手机/电脑（客户端）
    │
    │  VLESS + Reality 协议
    ▼
Xray-core（运行在 VPS 上，接收并转发流量）
    │
    │  正常 TCP 连接
    ▼
目标网站（claude.ai / google.com / ...）
```

### 一键安装

```bash
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
```

这个脚本会：
1. 下载最新版 Xray-core 二进制文件
2. 安装到 `/usr/local/bin/xray`
3. 创建 systemd 服务（开机自启）
4. 配置文件位置：`/usr/local/etc/xray/config.json`

验证安装：

```bash
xray version
# 输出类似：Xray 25.5.16 (Xray, Pair of Penetrating Eyes.) ...
```

---

## 第四步：生成密钥和 UUID

VLESS + Reality 需要三样东西：UUID（身份认证）、Reality 密钥对（加密握手）、Short ID。

### 生成 UUID

```bash
xray uuid
# 输出：31ced8e4-0c46-4ec5-9510-89bb487667b9
```

> **UUID（Universally Unique Identifier）**：一个 128 位的随机标识符，格式为 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`。客户端和服务器预共享同一个 UUID，用来验证身份——就像一个暗号，对不上就拒绝连接。

### 生成 Reality 密钥对

```bash
xray x25519
# 输出：
# Private key: HGmN3Q9vNMu-5asRhXXBOUVQ3Fz8nOiN_tGLMXe9EFc
# Public key:  9oOPKwunZ7TM01ewNp0xjFxtTuK7nKKRSx5ayD28DCU
```

> **x25519**：一种椭圆曲线密钥交换算法。生成一对密钥——私钥放在服务器上（绝对不能泄露），公钥给客户端。客户端用公钥加密，只有持有私钥的服务器才能解密。这就是 Reality 握手时验证身份的核心机制。

- **Private key**（私钥）→ 放在**服务器**配置里
- **Public key**（公钥）→ 放在**客户端**配置里

### 生成 Short ID

```bash
openssl rand -hex 6
# 输出：870ca1347c3e
```

> **Short ID** 是 Reality 的一个额外验证参数。服务器配置一个 Short ID 列表，客户端必须提供列表中的某个 ID 才能通过认证。相当于暗号之外的第二道门禁。

---

## 第五步：选择 SNI（伪装域名）

### SNI 是什么？（回顾）

上一篇讲过，TLS 握手时客户端会明文发送 **SNI（Server Name Indication）**，告诉服务器"我要连的是哪个域名"。GFW 会检查这个字段。

Reality 的策略是：**SNI 填一个真实的大网站**，这样 GFW 看到你在"访问微软官网"，不会起疑。

### 选择 SNI 的标准

不是随便填一个网站就行。好的 SNI 需要满足：

| 条件 | 原因 | 示例 |
|------|------|------|
| **支持 TLS 1.3** | Reality 只兼容 TLS 1.3 | ✅ 大部分现代网站 |
| **支持 HTTP/2** | 更好的兼容性 | ✅ 大部分 CDN 网站 |
| **不在中国大陆部署 CDN** | 否则 GFW 探测时会发现 IP 不匹配 | ❌ 淘宝、百度 |
| **网站稳定、长期存在** | 避免域名过期失效 | ✅ 微软、苹果等大厂 |
| **TLS 指纹不做特殊限制** | 有些网站会验证客户端证书 | ❌ 某些银行网站 |

### 推荐的 SNI 列表

```
www.microsoft.com      ← 最常用，稳定
www.apple.com
www.amazon.com
www.samsung.com
www.logitech.com
www.hp.com
dl.google.com
```

### 验证 SNI 是否可用

```bash
# 测试目标域名是否支持 TLS 1.3
# 用你的 VPS IP 去连目标域名，看能不能拿到证书

curl -I --resolve www.microsoft.com:443:107.161.90.139 https://www.microsoft.com
```

如果返回 HTTP 状态码（如 `200` 或 `301`），说明这个 SNI 可用。如果报证书错误也没关系——Reality 不需要真的拿到合法证书，只要 TLS 握手能正常开始就行。

> **为什么不能选有国内 CDN 的域名？** 假设你选了 `www.baidu.com` 作为 SNI。GFW 探测时发现：你的 VPS IP 是美国的（107.161.90.139），但 `www.baidu.com` 的服务器在中国——**一个美国 IP 声称自己是百度，这明显不对劲。** 选 `www.microsoft.com` 就没这个问题，因为微软的服务器遍布全球，美国 IP 服务微软域名完全合理。

---

## 第六步：配置 Xray 服务端

### 编写配置文件

```bash
nano /usr/local/etc/xray/config.json
```

写入以下内容（替换你自己生成的 UUID、密钥、Short ID）：

```json
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "31ced8e4-0c46-4ec5-9510-89bb487667b9",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "dest": "www.microsoft.com:443",
          "serverNames": [
            "www.microsoft.com"
          ],
          "privateKey": "HGmN3Q9vNMu-5asRhXXBOUVQ3Fz8nOiN_tGLMXe9EFc",
          "shortIds": [
            "870ca1347c3e"
          ]
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"]
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    },
    {
      "protocol": "blackhole",
      "tag": "block"
    }
  ]
}
```

### 逐字段解读

```
inbounds（入站）— 定义"怎么接收客户端的连接"
│
├── listen: "0.0.0.0"       ← 监听所有网卡（接受任何 IP 的连接）
├── port: 443               ← 用 443 端口（HTTPS 的标准端口，更不显眼）
├── protocol: "vless"       ← 使用 VLESS 协议
│
├── settings.clients[0]
│   ├── id: "31ced..."      ← UUID（暗号），客户端必须匹配
│   └── flow: "xtls-rprx-vision"  ← XTLS Vision 流控
│                                    减少 TLS-in-TLS 特征
│
└── streamSettings
    ├── network: "tcp"      ← 传输层用 TCP（最简单直接）
    ├── security: "reality" ← 安全层用 Reality
    │
    └── realitySettings
        ├── dest: "www.microsoft.com:443"
        │     ↑ 当探测请求来时，把流量转发到这个真实网站
        │
        ├── serverNames: ["www.microsoft.com"]
        │     ↑ 允许的 SNI 列表，客户端必须用这些域名
        │
        ├── privateKey: "HGmN3..."
        │     ↑ 服务器私钥（绝对不能泄露！）
        │
        └── shortIds: ["870ca1..."]
              ↑ 允许的 Short ID 列表
```

```
outbounds（出站）— 定义"收到的流量往哪发"
│
├── freedom（直连）  ← 正常转发到目标网站
└── blackhole（黑洞）← 丢弃（用于屏蔽广告等）
```

### XTLS Vision 是什么？

普通的代理有一个问题：客户端和代理服务器之间用 TLS 加密（Reality 的 TLS），代理服务器再和目标网站建立另一个 TLS 连接。这就出现了 **TLS-in-TLS**（TLS 套 TLS）——外层 TLS 里面包着一个内层 TLS 的握手和数据。

```
普通代理：
  [外层 Reality TLS [内层 HTTPS TLS [真实数据]]]
       ↑                  ↑
  你和 VPS 之间的加密    VPS 和目标网站之间的加密
  
问题：GFW 分析外层 TLS 的流量模式，会发现里面
      有一个"TLS 握手"的特征——正常的 HTTPS 流量
      不会在加密数据里再出现 TLS 握手模式。
```

**XTLS Vision** 解决了这个问题：它识别内层 TLS 流量，对已经加密的部分**直接透传**（不再套一层加密），只对未加密的控制数据做加密。这样外层流量的模式和真正的单层 HTTPS 一模一样。

```
XTLS Vision：
  内层数据已加密的部分 → 直接透传（外层不再二次加密）
  内层控制数据/握手    → 外层正常加密

  结果：流量模式和正常 HTTPS 完全一致
```

---

## 第七步：启动并验证

### 启动 Xray

```bash
# 启动
systemctl start xray

# 设置开机自启
systemctl enable xray

# 查看状态
systemctl status xray
```

你应该看到 `Active: active (running)`。

### 检查端口

```bash
ss -tlnp | grep 443
# 应该看到 xray 在监听 443 端口
```

### 查看日志

```bash
journalctl -u xray -f
# -f 表示实时跟踪，Ctrl+C 退出
```

### 常见问题排查

| 现象 | 可能原因 | 解决 |
|------|---------|------|
| 启动失败 | 配置文件 JSON 格式错误 | `xray run -test -config /usr/local/etc/xray/config.json` 检查语法 |
| 端口被占用 | 其他程序（如 Nginx）占了 443 | `ss -tlnp | grep 443` 查看谁在用 |
| 客户端连不上 | 防火墙没开 443 | `ufw allow 443/tcp` 或检查云服务商的安全组 |

---

## 第八步：配置客户端

服务端搭好了，现在配置客户端连接它。

### Shadowrocket（iOS 小火箭）

打开小火箭 → 右上角 `+` → 手动输入：

```
类型：VLESS
地址：107.161.90.139
端口：443
UUID：31ced8e4-0c46-4ec5-9510-89bb487667b9
TLS：开启
SNI：www.microsoft.com
Reality：开启
Public Key：9oOPKwunZ7TM01ewNp0xjFxtTuK7nKKRSx5ayD28DCU
Short ID：870ca1347c3e
Flow：xtls-rprx-vision
```

### Clash Meta（Android / Windows / macOS）

在 Clash 配置文件的 `proxies` 段添加：

```yaml
proxies:
  - name: "US-VPS"
    type: vless
    server: 107.161.90.139
    port: 443
    uuid: 31ced8e4-0c46-4ec5-9510-89bb487667b9
    network: tcp
    tls: true
    udp: true
    servername: "www.microsoft.com"
    flow: xtls-rprx-vision
    client-fingerprint: chrome
    reality-opts:
      public-key: "9oOPKwunZ7TM01ewNp0xjFxtTuK7nKKRSx5ayD28DCU"
      short-id: "870ca1347c3e"
```

### v2rayN（Windows 图形界面）

服务器 → 添加 VLESS 服务器：

```
地址：107.161.90.139
端口：443
用户ID：31ced8e4-0c46-4ec5-9510-89bb487667b9
流控：xtls-rprx-vision
传输协议：tcp
传输层安全：reality
SNI：www.microsoft.com
Fingerprint：chrome
PublicKey：9oOPKwunZ7TM01ewNp0xjFxtTuK7nKKRSx5ayD28DCU
ShortId：870ca1347c3e
```

### 各字段对应关系

```
服务端配置                          客户端配置
─────────────────────              ─────────────────────
port: 443                    →     端口: 443
clients[0].id: "31ced..."    →     UUID: "31ced..."
clients[0].flow               →     Flow: xtls-rprx-vision
realitySettings.privateKey    →     ❌ 不给客户端！
（用 x25519 生成时的 publicKey） →   PublicKey: "9oOPK..."
realitySettings.shortIds      →     ShortId: "870ca..."
realitySettings.serverNames   →     SNI: www.microsoft.com
```

> **注意：privateKey 绝对不能给客户端。** 客户端只需要 publicKey。私钥泄露 = 任何人都能冒充你的服务器。

---

## 第九步：验证连接

### 测试是否能翻墙

1. 客户端连上节点
2. 访问 [https://www.google.com](https://www.google.com) —— 能打开说明翻墙成功
3. 访问 [https://ipinfo.io](https://ipinfo.io) —— 显示的 IP 应该是你 VPS 的 IP

### 测试 Reality 是否生效

从**另一台机器**（或用在线工具）直接访问你的 VPS IP：

```bash
# 用浏览器访问 https://107.161.90.139
# 应该看到微软官网的内容（Reality 回落到 www.microsoft.com）
# 而不是连接错误或空白页
```

如果看到微软官网 → Reality 配置正确，GFW 探测时也会看到微软官网。

### 测速

```bash
# 在 VPS 上安装测速工具
apt install speedtest-cli -y
speedtest
```

这测的是 VPS 本身的带宽。实际体验还取决于你到 VPS 的线路质量。

---

## 安全加固（可选但推荐）

### 1. 禁用密码登录，改用 SSH 密钥

```bash
# 本地生成密钥对（如果还没有）
ssh-keygen -t ed25519

# 把公钥复制到 VPS
ssh-copy-id root@107.161.90.139

# 在 VPS 上禁用密码登录
nano /etc/ssh/sshd_config
# 找到这两行，改成：
# PasswordAuthentication no
# PubkeyAuthentication yes

# 重启 SSH
systemctl restart sshd
```

### 2. 配置防火墙

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 443/tcp   # Xray
ufw enable
```

### 3. 启用 BBR 加速

**BBR** 是 Google 开发的 TCP 拥塞控制算法，能显著提高网络吞吐量，特别是高延迟链路（中国到海外）：

```bash
echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
sysctl -p

# 验证
sysctl net.ipv4.tcp_congestion_control
# 输出：net.ipv4.tcp_congestion_control = bbr
```

---

## 完整部署清单

```
✅ 购买 VPS（美国/日本/新加坡，$3-10/月）
✅ SSH 连接并更新系统
✅ 安装 Xray-core
✅ 生成 UUID + x25519 密钥对 + Short ID
✅ 选择 SNI（www.microsoft.com）
✅ 编写服务端 config.json
✅ 启动 Xray 并设置开机自启
✅ 配置客户端（小火箭 / Clash / v2rayN）
✅ 验证翻墙 + Reality 回落
✅ 安全加固（SSH 密钥 + 防火墙 + BBR）
```

---

## 小结

1. **VPS** 是你在海外的一台电脑，代理服务跑在上面。选购重点是线路质量（CN2 GIA > 普通线路）。

2. **Xray-core** 是代理引擎，支持所有主流协议。一键脚本安装，配置文件是 JSON 格式。

3. **VLESS + Reality** 的配置核心是四样东西：**UUID**（身份认证）、**x25519 密钥对**（加密握手）、**Short ID**（二级验证）、**SNI**（伪装域名）。

4. **XTLS Vision** 消除了 TLS-in-TLS 特征，让流量模式和正常 HTTPS 完全一致。

5. **服务端只放私钥，客户端只放公钥**——这是安全的基本原则。

6. **Reality 的回落机制**：非法请求被透明转发到真实网站（如微软），让 GFW 的主动探测看到的就是一个普通的微软服务器。

**下一篇**，我们将深入客户端配置——Clash/Shadowrocket 的规则编写、策略组设计、DNS 防泄漏，让你的代理不仅能用，而且用得优雅。

---

*本系列参考：[Project X 官方文档](https://xtls.github.io/)，[XTLS/Xray-core](https://github.com/XTLS/Xray-core)*
