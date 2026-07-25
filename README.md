# HenYan's Blog

AI Agent 架构设计、工程实践与技术探索的公开知识发布站。基于 Astro 与 Markdown/MDX 构建。

## Tech Stack

- Astro
- Markdown / MDX content collections
- RSS
- Sitemap
- KaTeX for math rendering
- Giscus comments

## Local Development

```sh
npm install
npm run dev
```

The development server runs at `http://localhost:4321` by default.

## Build

```sh
npm run build
```

## Preview Production Build

```sh
npm run preview
```

## Content

Published blog posts live in:

```text
src/content/blog/
```

Use `series` to organize related posts. For example, life writing belongs to:

```yaml
series: '小白的秘密基地'
```

All articles in `src/content/blog/` are publicly generated; the site does not hide posts through a `draft` field.

## Knowledge Notes

Unpublished knowledge drafts live in:

```text
notes/
```

`notes/` is for private or pre-publication material such as LogicAI2 task reviews, lessons learned, and raw thinking notes. These files are not part of the Astro content collection and should not be treated as published blog posts.

Real drafts under `notes/` must be reviewed before commit or push, especially for secrets, tokens, private service addresses, proxy configs, account data, and unpublished internal details.

## Publishing Boundary

`notes/` is not a publishing location. A piece becomes a blog article only after it is reviewed, cleaned, moved into `src/content/blog/{topic}/`, and verified with:

```sh
npm run build
```

Do not place topic README files under `src/content/blog/**/`, because Markdown files there are loaded by Astro as blog content.

## Notes

Do not commit local secrets, proxy configs, build output, or dependencies.