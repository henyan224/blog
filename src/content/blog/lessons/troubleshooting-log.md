---
slug: 'troubleshooting-log'
title: '踩坑日志：部署与运维中的实战问题记录'
description: '记录在 VPS 部署、代理搭建、Web 开发等领域遇到的真实问题。'
pubDate: '2026-07-12'
updatedDate: '2026-07-12'
tags: ['运维', '代理', 'VPS', '踩坑']
---

# 踩坑日志

| # | 领域 | 问题 | 根因 | 解决方案 | 日期 |
|---|---|---|---|---|---|
| 001 | 代理/Reality | VLESS Reality 东京节点连接 EOF | Reality dest 目标 `www.microsoft.com` 响应字节超限 | dest/SNI 改为 `www.apple.com` | 2026-07-10 |
| 002 | 代理/3X-UI | VLESS Reality 客户端 EOF（flow 不匹配） | 3X-UI 创建 Client 时未设 `flow: xtls-rprx-vision` | Client 编辑 → Flow 选 `xtls-rprx-vision` | 2026-07-10 |
| 003 | 客户端 | V2rayN 流量被 Clash Verge TUN 劫持 | 两个代理客户端同时运行，TUN 造成路由环路 | 彻底退出 Clash Verge 再测 V2rayN | 2026-07-10 |
| 004 | VPS/防火墙 | 东京节点 443 端口外部不可达 | UFW 默认只放行 22，443 被拦 | `ufw allow 443/tcp` | 2026-07-10 |

<!-- 新增条目直接在表格末尾追加一行 -->
