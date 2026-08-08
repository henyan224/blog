# Blog 内容发布协议

## 1. 目录职责

| 目录 | 职责 | 谁能写 |
| --- | --- | --- |
| `content-inbox/` | Blog 草稿提交区，默认私有 | InfoScout |
| `src/content/blog/` | 已审核、可构建、可公开的正式文章 | 用户审核后手动迁移 |
| `src/assets/blog/{slug}/` | 正式文章的图片资源 | 用户审核后手动迁移 |
| `notes/` | 私人草稿与过程材料 | 用户 / Agent |
| `docs/` | 本文档及相关工程文档 | 用户 |

## 2. 内容提交包格式

每次 InfoScout 提交必须包含：

- `manifest.json`：提交元信息。
- `article.md`：Markdown 正文及符合 Blog schema 的 frontmatter。frontmatter **不应包含** `draft` 字段；该字段已废弃。
- `assets/`：可选的图片资源目录。

`article.md` 的 frontmatter 字段：

| 字段 | 必填 | 格式 |
| --- | --- | --- |
| `title` | 是 | 字符串 |
| `description` | 是 | 字符串 |
| `tags` | 是 | 字符串数组 |
| `slug` | 是 | 英文小写、数字和连字符 |
| `series` | 是 | 字符串 |
| `pubDate` | 是 | `YYYY-MM-DD` |
| `seriesOrder` | 否 | 数字 |
| `updatedDate` | 否 | 日期 |
| `heroImage` | 否 | 图片引用 |
| `articleStyle` | 否 | `narrative` / `technical` |
| `lang` | 否 | `zh` / `en` |

`manifest.json` 最小字段：

- `protocolVersion`：`"1.0"`
- `submissionId`：唯一 ID
- `submittedAt`：ISO 8601 时间
- `source.system` / `source.project`：来源系统与项目
- `source.role`：提交角色，可选
- `source.taskId`：关联任务 ID，可选
- `contentType`：`"blog-post"`
- `requestedAction`：`"review"`
- `visibility`：`"private"`
- `article.file`：文章文件名
- `article.slug`：URL 标识
- `article.series`：所属系列（必填，例如 `"LogicAI"`、`"小白的秘密基地"`）
- `article.tags`：标签数组
- `assets[]`：如有资源
- `review.required`：`true`

manifest 不使用 `article.category`，改用 `article.series`。生活类内容统一使用 `series: "小白的秘密基地"`。

## 3. 状态流转

```text
draft → submitted → validating → review_required → approved → building → published
                                                        ↘ rejected
                                                        ↘ build_failed
```

InfoScout 无权将状态从 `review_required` 改为 `approved` 或 `published`。

## 4. 自动校验项

- `manifest.json` 格式合法。
- `article.md` 存在，且 frontmatter 符合 `content.config.ts` schema。
- slug 不与现有文章或其他草稿冲突。
- 所有引用的图片文件存在。
- `npm run build` 的退出码为 0。

## 5. 审核职责

- **草稿提交**：InfoScout — 在完成领域探索或信号分析后，按写作指南撰写文章并提交到 `content-inbox/`。
- **审核发布**：用户本人 — 审核 `content-inbox/` 中的草稿，满意后手动迁移到 `src/content/blog/`，执行 `npm run build` 验证通过后 git push 部署。

> 历史流程中张良（蓝图）、韩信（内容生成）、萧何（审计）的参与已不适用于本协议的 v2 流程。
