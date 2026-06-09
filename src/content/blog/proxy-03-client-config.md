---
title: '代理原理（三）：客户端配置 —— 规则、策略组与 DNS 防泄漏'
description: '代理系列第三篇。深入 Clash 和 Shadowrocket 的配置体系：规则匹配逻辑、策略组设计、DNS 防泄漏、分流实战。让代理不仅能用，而且用得优雅。'
category: 'tech'
tags: ['代理', '网络', 'Clash', 'Shadowrocket', '分流']
series: '代理原理'
seriesOrder: 3
draft: true
pubDate: '2026-06-09'
heroImage: '../../assets/proxy-hero.png'
lang: 'zh'
---

[上一篇](../proxy-02-build-your-own-node)我们搭好了服务端。节点能连了，但这只是"能用"。

本篇解决"好用"：**怎么让国内流量直连、国外流量走代理、特定网站走特定节点？**

---

## 核心概念：代理客户端在做什么？

代理客户端（Clash / Shadowrocket / v2rayN）本质上是一个**本地流量调度器**：

```
你设备上的所有网络请求
    │
    ▼
代理客户端（本地运行）
    │
    ├── 规则匹配："这个请求去哪？"
    │     │
    │     ├── 匹配到"中国 IP" → DIRECT（直连，不走代理）
    │     ├── 匹配到"claude.ai" → Proxy（走代理节点）
    │     └── 匹配到"广告域名" → REJECT（拦截）
    │
    ├── DIRECT → 直接发出去
    ├── Proxy  → 加密 → 发送到 VPS → VPS 转发到目标
    └── REJECT → 丢弃请求
```

这就是**分流**——根据规则把不同的流量分配到不同的出口。

---

## 第一章：规则（Rules）

### 规则的基本格式

每条规则就是一个 if-then：

```
规则类型, 匹配值, 策略
```

例如：
```yaml
# 域名后缀匹配 → 走代理
- DOMAIN-SUFFIX,google.com,Proxy

# 域名关键词匹配 → 走代理
- DOMAIN-KEYWORD,youtube,Proxy

# IP 段匹配 → 直连
- IP-CIDR,192.168.0.0/16,DIRECT

# 中国 IP → 直连
- GEOIP,CN,DIRECT

# 以上都没匹配到 → 走代理（兜底）
- MATCH,Proxy
```

### 规则类型大全

| 规则类型 | 匹配对象 | 示例 | 说明 |
|---------|---------|------|------|
| `DOMAIN` | 精确域名 | `DOMAIN,claude.ai,Proxy` | 只匹配 `claude.ai`，不匹配子域名 |
| `DOMAIN-SUFFIX` | 域名后缀 | `DOMAIN-SUFFIX,google.com,Proxy` | 匹配 `*.google.com` 和 `google.com` |
| `DOMAIN-KEYWORD` | 域名关键词 | `DOMAIN-KEYWORD,youtube,Proxy` | 域名中包含 `youtube` 就匹配 |
| `IP-CIDR` | IPv4 地址段 | `IP-CIDR,192.168.0.0/16,DIRECT` | 匹配目标 IP 在这个范围内 |
| `IP-CIDR6` | IPv6 地址段 | `IP-CIDR6,::1/128,DIRECT` | IPv6 版本 |
| `GEOIP` | 国家/地区 | `GEOIP,CN,DIRECT` | 目标 IP 属于中国 |
| `PROCESS-NAME` | 进程名 | `PROCESS-NAME,Telegram,Proxy` | 指定应用的流量 |
| `MATCH` | 兜底 | `MATCH,Proxy` | 以上都没命中时走这个 |

### 规则的匹配顺序

**从上到下，先匹配先生效，匹配到就停止。** 所以：

```yaml
rules:
  # ① 最具体的规则放最前面
  - DOMAIN,ads.google.com,REJECT        # 拦截谷歌广告
  - DOMAIN-SUFFIX,google.com,Proxy      # 其他谷歌域名走代理

  # ② 分类规则
  - DOMAIN-SUFFIX,claude.ai,Proxy
  - DOMAIN-SUFFIX,anthropic.com,Proxy
  - DOMAIN-SUFFIX,openai.com,Proxy

  # ③ 国内直连
  - DOMAIN-SUFFIX,cn,DIRECT
  - DOMAIN-SUFFIX,baidu.com,DIRECT
  - DOMAIN-SUFFIX,qq.com,DIRECT
  - GEOIP,CN,DIRECT

  # ④ 兜底（最后一条）
  - MATCH,Proxy
```

> **常见错误**：把 `GEOIP,CN,DIRECT` 放在 `DOMAIN-SUFFIX,google.com,Proxy` 前面。如果 Google 的某个 CDN 节点恰好在中国，就会被 GEOIP 规则拦截，直连而非走代理。**具体规则永远放在宽泛规则前面。**

---

## 第二章：策略组（Proxy Groups）

### 为什么需要策略组？

如果你有多个节点（美国、日本、香港），不想每条规则都硬编码节点名，就需要策略组——**给节点分组，规则指向组而非单个节点**。

### 策略组类型

```yaml
proxy-groups:
  # 1. select：手动选择
  - name: "节点选择"
    type: select
    proxies:
      - "US-Dallas"
      - "JP-Tokyo"
      - "HK-Premium"
      - "DIRECT"

  # 2. url-test：自动选最快
  - name: "自动选择"
    type: url-test
    proxies:
      - "US-Dallas"
      - "JP-Tokyo"
      - "HK-Premium"
    url: "http://www.gstatic.com/generate_204"
    interval: 300      # 每 300 秒测一次速

  # 3. fallback：故障转移
  - name: "故障转移"
    type: fallback
    proxies:
      - "HK-Premium"
      - "JP-Tokyo"
      - "US-Dallas"
    url: "http://www.gstatic.com/generate_204"
    interval: 300

  # 4. load-balance：负载均衡
  - name: "负载均衡"
    type: load-balance
    proxies:
      - "US-Dallas"
      - "US-SanJose"
    strategy: round-robin
```

| 类型 | 行为 | 适合场景 |
|------|------|---------|
| `select` | 你手动选哪个用哪个 | 日常使用，灵活控制 |
| `url-test` | 自动测延迟，选最快的 | 懒人模式 |
| `fallback` | 按顺序尝试，第一个挂了用第二个 | 保证可用性 |
| `load-balance` | 多个节点轮流用 | 避免单节点被封 |

### 实战：分场景策略组设计

```yaml
proxy-groups:
  # 主选择器：日常手动切换
  - name: "Proxy"
    type: select
    proxies:
      - "自动选择"
      - "US-Dallas"
      - "JP-Tokyo"
      - "HK-Premium"
      - "DIRECT"

  # 自动测速组
  - name: "自动选择"
    type: url-test
    proxies:
      - "US-Dallas"
      - "JP-Tokyo"
      - "HK-Premium"
    url: "http://www.gstatic.com/generate_204"
    interval: 300

  # AI 服务专用（需要美国 IP）
  - name: "AI 服务"
    type: select
    proxies:
      - "US-Dallas"
      - "住宅代理"

  # 流媒体（需要特定地区解锁）
  - name: "流媒体"
    type: select
    proxies:
      - "JP-Tokyo"
      - "HK-Premium"
      - "US-Dallas"
```

然后规则这样写：

```yaml
rules:
  - DOMAIN-SUFFIX,claude.ai,AI 服务
  - DOMAIN-SUFFIX,anthropic.com,AI 服务
  - DOMAIN-SUFFIX,openai.com,AI 服务
  - DOMAIN-SUFFIX,netflix.com,流媒体
  - DOMAIN-SUFFIX,youtube.com,Proxy
  - GEOIP,CN,DIRECT
  - MATCH,Proxy
```

> 这样 Claude/ChatGPT 固定走美国节点（避免频繁切换 IP 触发风控），Netflix 走日本解锁，其他外网走自动选择。

---

## 第三章：DNS 防泄漏

### 什么是 DNS 泄漏？

你开了代理，以为所有流量都走 VPS 了，但 **DNS 查询可能还是走的本地网络**：

```
DNS 泄漏场景：

你访问 google.com
    │
    ├── DNS 查询："google.com 的 IP 是？"
    │       ↓
    │   发给了本地 ISP 的 DNS（114.114.114.114）
    │       ↓
    │   ISP 知道你在查 google.com → 记录！
    │   GFW 看到 DNS 请求 → 返回假 IP（DNS 污染）
    │
    └── 实际流量 → 走代理 → 但目标 IP 是假的 → 失败
```

**即使流量走了代理，DNS 泄漏也会暴露你在访问什么网站，而且可能导致连接失败。**

### 解决方案：Clash 的 DNS 配置

```yaml
dns:
  enable: true
  listen: "0.0.0.0:1053"
  enhanced-mode: fake-ip       # 关键！
  fake-ip-range: 198.18.0.1/16

  # 默认 DNS（用于解析国内域名）
  default-nameserver:
    - 119.29.29.29              # 腾讯 DNS
    - 180.184.1.1               # 字节 DNS

  # 主 DNS（加密，防污染）
  nameserver:
    - "tls://dot.pub:853"       # 腾讯 DoT
    - "https://doh.pub/dns-query"  # 腾讯 DoH

  # 回退 DNS（当主 DNS 结果可能被污染时使用）
  fallback:
    - "tls://8.8.8.8:853"      # Google DoT
    - "tls://1.1.1.1:853"      # Cloudflare DoT

  # 回退过滤条件
  fallback-filter:
    geoip: true
    geoip-code: CN              # 如果主 DNS 返回中国 IP，用回退 DNS 重查
    ipcidr:
      - 240.0.0.0/4             # 保留地址段，说明被污染了
```

### Fake-IP 模式详解

这是 Clash 最重要的 DNS 特性：

```
传统模式（redir-host）：
  1. 你访问 google.com
  2. Clash 先查 DNS → 拿到真实 IP（142.250.x.x）
  3. 用真实 IP 建立连接 → 走代理
  问题：DNS 查询本身可能泄漏/被污染

Fake-IP 模式：
  1. 你访问 google.com
  2. Clash 立即返回一个假 IP（198.18.0.x）
  3. 你的设备连接 198.18.0.x → 流量到达 Clash
  4. Clash 看到 198.18.0.x → 查表 → 知道是 google.com
  5. 把域名（不是 IP）发给代理节点
  6. VPS 在远端解析 google.com → 拿到真实 IP → 连接
  结果：DNS 查询在 VPS 端完成，本地零泄漏
```

> **Fake-IP 的唯一缺点**：某些国内应用（微信、QQ）会校验 DNS 结果的真实性，发现是假 IP 就拒绝连接。所以要配置 `fake-ip-filter` 排除这些域名：

```yaml
  fake-ip-filter:
    - "*.lan"
    - "*.localdomain"
    - "+.weixin.com"
    - "+.qq.com"
    - "+.wechat.com"
    - "*.push.apple.com"
    - "weatherapi.market.xiaomi.com"
```

---

## 第四章：Shadowrocket（小火箭）配置

### 配置文件结构

小火箭的配置文件是 `.conf` 格式（类似 Surge），结构如下：

```ini
[General]
bypass-system = true
dns-server = 119.29.29.29, 180.184.1.1
skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local

[Proxy]
US-Dallas = vless, 107.161.90.139, 443, ...
JP-Tokyo = vless, 45.76.xxx.xxx, 443, ...

[Proxy Group]
Proxy = select, US-Dallas, JP-Tokyo, DIRECT
AI服务 = select, US-Dallas

[Rule]
DOMAIN-SUFFIX,claude.ai,AI服务
DOMAIN-SUFFIX,anthropic.com,AI服务
DOMAIN-SUFFIX,google.com,Proxy
DOMAIN-SUFFIX,youtube.com,Proxy
GEOIP,CN,DIRECT
FINAL,Proxy
```

### 小火箭 vs Clash 语法对照

| 功能 | Clash (YAML) | Shadowrocket (conf) |
|------|-------------|-------------------|
| 兜底规则 | `MATCH,Proxy` | `FINAL,Proxy` |
| 域名后缀 | `DOMAIN-SUFFIX,x.com,Proxy` | `DOMAIN-SUFFIX,x.com,Proxy` |
| 注释 | `# comment` | `// comment` |
| 节点定义位置 | `proxies:` 段 | `[Proxy]` 段 |
| 策略组 | `proxy-groups:` 段 | `[Proxy Group]` 段 |

### 添加规则的快捷方式

不用手动编辑配置文件，小火箭有个快捷操作：

1. 打开小火箭 → 底部"配置"选项卡
2. 点当前配置 → "编辑" → 找到 `[Rule]` 段
3. 在最前面添加你的规则

或者更简单：当某个网站打不开时，打开小火箭的"数据" → 找到那个域名 → 长按 → "添加规则" → 选择策略。

---

## 第五章：完整配置模板

### Clash Meta 完整配置

```yaml
mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
unified-delay: true

dns:
  enable: true
  listen: "0.0.0.0:1053"
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  default-nameserver:
    - 119.29.29.29
    - 180.184.1.1
  nameserver:
    - "tls://dot.pub:853"
    - "https://doh.pub/dns-query"
  fallback:
    - "tls://8.8.8.8:853"
    - "tls://1.1.1.1:853"
  fallback-filter:
    geoip: true
    geoip-code: CN
  fake-ip-filter:
    - "+.weixin.com"
    - "+.qq.com"
    - "*.lan"
    - "*.push.apple.com"

proxies:
  - name: "US-Dallas"
    type: vless
    server: 107.161.90.139
    port: 443
    uuid: YOUR-UUID-HERE
    network: tcp
    tls: true
    udp: true
    servername: "www.microsoft.com"
    flow: xtls-rprx-vision
    client-fingerprint: chrome
    reality-opts:
      public-key: "YOUR-PUBLIC-KEY"
      short-id: "YOUR-SHORT-ID"

proxy-groups:
  - name: "Proxy"
    type: select
    proxies:
      - "自动选择"
      - "US-Dallas"
      - "DIRECT"

  - name: "自动选择"
    type: url-test
    proxies:
      - "US-Dallas"
    url: "http://www.gstatic.com/generate_204"
    interval: 300

  - name: "AI 服务"
    type: select
    proxies:
      - "US-Dallas"

rules:
  # AI 服务
  - DOMAIN-SUFFIX,claude.ai,AI 服务
  - DOMAIN-SUFFIX,anthropic.com,AI 服务
  - DOMAIN-SUFFIX,openai.com,AI 服务
  - DOMAIN-SUFFIX,chatgpt.com,AI 服务

  # 常用外网
  - DOMAIN-SUFFIX,google.com,Proxy
  - DOMAIN-SUFFIX,youtube.com,Proxy
  - DOMAIN-SUFFIX,github.com,Proxy
  - DOMAIN-SUFFIX,twitter.com,Proxy
  - DOMAIN-SUFFIX,x.com,Proxy
  - DOMAIN-SUFFIX,telegram.org,Proxy
  - DOMAIN-SUFFIX,t.me,Proxy

  # 国内直连
  - DOMAIN-SUFFIX,cn,DIRECT
  - DOMAIN-SUFFIX,baidu.com,DIRECT
  - DOMAIN-SUFFIX,bilibili.com,DIRECT
  - DOMAIN-SUFFIX,qq.com,DIRECT
  - DOMAIN-SUFFIX,weixin.com,DIRECT
  - DOMAIN-SUFFIX,taobao.com,DIRECT
  - DOMAIN-SUFFIX,jd.com,DIRECT
  - DOMAIN-SUFFIX,163.com,DIRECT

  # 国内 IP 直连
  - GEOIP,CN,DIRECT

  # 兜底
  - MATCH,Proxy
```

---

## 小结

1. **规则（Rules）** 是分流的核心——从上到下匹配，先命中先生效。具体规则在前，宽泛规则在后。

2. **策略组（Proxy Groups）** 让你把节点分组管理。`select` 手动选、`url-test` 自动选最快、`fallback` 故障转移。

3. **DNS 防泄漏**是容易被忽视但极其重要的一环。**Fake-IP 模式**是最干净的方案——本地只用假 IP，真实 DNS 解析在 VPS 端完成。

4. **分场景策略**：AI 服务固定美国节点、流媒体按地区选节点、日常自动选最快——这才是"用得优雅"。

**下一篇**，我们将进入进阶领域——代理链与住宅 IP：为什么 DC IP 会被 Claude 封号？住宅代理怎么工作？WARP 能不能白嫖？

---

*本系列参考：[Clash Meta 文档](https://wiki.metacubex.one/)，[Shadowrocket 使用指南](https://github.com/nicholascw/ShadowrocketHelp)*
