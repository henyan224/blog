---
title: '用 Astro 搭建个人博客'
description: '从零开始用 Astro 搭建一个现代化的个人博客，记录完整过程和踩过的坑。'
category: 'tech'
tags: ['astro', 'blog', 'frontend']
pubDate: '2026-06-01'
heroImage: '../../assets/blog-placeholder-1.jpg'
lang: 'zh'
---

## 为什么选择 Astro

在众多静态站点生成器中，Astro 以其 **Islands Architecture** 脱颖而出。它的核心理念是：内容网站不应该为框架买单。

### 核心优势

- **默认零 JS**：除非你明确要求，否则不往浏览器发一行 JavaScript
- **框架无关**：可以混用 React、Vue、Svelte 组件
- **Content Collections**：内置类型安全的内容管理

### 快速开始

```bash
npm create astro@latest
```

## 项目结构

```
src/
├── content/blog/    # Markdown 文章
├── components/      # 组件
├── layouts/         # 布局模板
├── pages/           # 页面路由
└── styles/          # 全局样式
```

## 部署

推荐使用 Vercel，`git push` 即自动部署，零配置。

> 博客最大的敌人不是技术，而是完美主义。先写起来，再慢慢优化。
