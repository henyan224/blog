# HenYan's Blog

Personal blog for technical notes, project reviews, and life reflections. Built with Astro and Markdown/MDX.

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

Blog posts live in:

```text
src/content/blog/
```

Draft posts should use frontmatter:

```yaml
draft: true
```

Drafts are excluded from generated blog routes.

## Knowledge Notes

Unpublished knowledge drafts live in:

```text
notes/
```

`notes/` is for private or pre-publication material such as LogicAI2 task reviews, lessons learned, and raw thinking notes. These files are not part of the Astro content collection and should not be treated as published blog posts.

Real drafts under `notes/` must be reviewed before commit or push, especially for secrets, tokens, private service addresses, proxy configs, account data, and unpublished internal details.

## Templates

Reusable writing templates live in:

```text
templates/
```

Current template types:

- `lesson.md`
- `project-review.md`
- `adr.md`
- `thinking-note.md`
- `technical-note.md`

Each template includes the shared draft frontmatter fields used by the LogicAI2 → Blog knowledge workflow.

## Publishing Boundary

`notes/` and `templates/` are not publishing locations. A piece becomes a blog article only after it is reviewed, cleaned, moved into `src/content/blog/{topic}/`, and verified with:

```sh
npm run build
```

Do not place topic README files under `src/content/blog/**/`, because Markdown files there are loaded by Astro as blog content.

## Notes

Do not commit local secrets, proxy configs, build output, or dependencies.
