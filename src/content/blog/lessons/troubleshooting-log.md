---
slug: 'troubleshooting-log'
title: '踩坑日志：部署与运维中的实战问题记录'
description: '记录在 VPS 部署、代理搭建、Web 开发等领域遇到的真实问题。'
category: 'tech'
pubDate: '2026-07-12'
updatedDate: '2026-07-12'
tags: ['运维', '代理', 'VPS', '踩坑']
draft: true
---

# 韪╁潙鏃ュ織

| # | 棰嗗煙 | 闂 | 鏍瑰洜 | 瑙ｅ喅鏂规 | 鏃ユ湡 |
|---|---|---|---|---|---|
| 001 | 浠ｇ悊/Reality | VLESS Reality 涓滀含鑺傜偣杩炴帴 EOF | Reality dest 鐩爣 `www.microsoft.com` 鍝嶅簲瀛楄妭瓒呴檺 | dest/SNI 鏀逛负 `www.apple.com` | 2026-07-10 |
| 002 | 浠ｇ悊/3X-UI | VLESS Reality 瀹㈡埛绔?EOF锛坒low 涓嶅尮閰嶏級 | 3X-UI 鍒涘缓 Client 鏃舵湭璁?`flow: xtls-rprx-vision` | Client 缂栬緫 鈫?Flow 閫?xtls-rprx-vision | 2026-07-10 |
| 003 | 瀹㈡埛绔?| V2rayN 娴侀噺琚?Clash Verge TUN 鍔寔 | 涓や釜浠ｇ悊瀹㈡埛绔悓鏃惰繍琛岋紝TUN 閫犳垚璺敱鐜矾 | 褰诲簳閫€鍑?Clash Verge 鍐嶆祴 V2rayN | 2026-07-10 |
| 004 | VPS/闃茬伀澧?| 涓滀含鑺傜偣 443 绔彛澶栭儴涓嶅彲杈?| UFW 榛樿鍙斁琛?22锛?43 琚尅 | `ufw allow 443/tcp` | 2026-07-10 |

<!-- 鏂板鏉＄洰鐩存帴鍦ㄨ〃鏍兼湯灏捐拷鍔犱竴琛?-->
