# LogicAI2 到 Blog 的知识沉淀流程

本文定义 LogicAI2 任务材料如何进入 Blog 知识库。核心原则：LogicAI2 负责产生材料，萧何负责审计，Blog 只承接经过筛选和脱敏的知识资产。

## 目录边界

```text
notes/              未发布草稿，不参与 Astro 构建
notes/inbox/        临时输入
notes/logicai/      LogicAI2 任务沉淀草稿
notes/reviews/      项目复盘草稿
notes/lessons/      踩坑草稿
templates/          写作模板
src/content/blog/   正式文章，会被 Astro 收集和发布
docs/topics/        专题说明，不进入 Astro 内容集合
```

禁止在 `src/content/blog/**/README.md`、`src/content/blog/**/_README.md`、`src/content/blog/**/topic.md` 放说明文档，因为 `src/content/blog/**/*.{md,mdx}` 会被 Astro 当作正式文章加载。

## 标准工作流

```text
LogicAI2 任务完成
  ↓
张良判断是否具备沉淀价值
  ↓
韩信或系统整理原始材料
  ↓
萧何进行知识审计
  ↓
生成 notes/logicai/ 草稿
  ↓
用户人工确认
  ↓
迁移到 src/content/blog/{topic}/
  ↓
在 Blog 仓库执行 npm run build 验证
  ↓
用户决定是否 commit / push
```

## 沉淀触发条件

满足任一条件即可进入草稿候选：

- 解决了真实问题；
- 形成了可复用方法；
- 出现了值得复盘的失败；
- 做出了重要架构决策；
- 改变了对某类问题的认知；
- 后续高概率再次遇到；
- 对他人也有参考价值。

## 不沉淀条件

- 只是临时闲聊；
- 没有可复用结论；
- 事实无法验证；
- 包含无法脱敏的敏感信息；
- 内容只对当前会话有效。

## 萧何审核节点

草稿迁移为正式文章前，萧何必须检查：

1. 价值：是否值得长期保存；
2. 事实：结论是否来自实际代码、命令输出、报错或可靠资料；
3. 脱敏：是否包含 token、密钥、私有路径、代理节点、账号、未公开业务细节；
4. 归类：是否放入正确专题；
5. 表达：是否从流水账整理为可复用经验；
6. 发布边界：是否适合公开，或只能私有保存。

审核结果使用：

```yaml
audit_status: "pending | approved | rejected"
visibility: "private | public"
```

## 草稿 frontmatter 标准

`notes/` 草稿使用模板中的 9 个核心字段：

```yaml
---
title: ""
date: "YYYY-MM-DD"
type: "lesson | project-review | adr | thinking-note | technical-note"
source: "logicai2 | manual"
source_task: ""
audit_owner: "xiaohe"
audit_status: "pending"
visibility: "private"
tags: []
---
```

## 正式文章 frontmatter 标准

迁移到 `src/content/blog/{topic}/` 后，必须改为 Astro Blog 文章 frontmatter，例如：

```yaml
---
title: "Blog 按专题重构复盘"
description: "一次将 Astro Blog 从扁平文章目录调整为专题目录的工程复盘。"
pubDate: 2026-07-12
category: "tech"
tags: ["Blog", "Astro", "工程实践"]
draft: false
slug: "blog-topic-restructure-review"
---
```

说明：

- `category` 必须符合内容 schema：`tech` 或 `life`；
- `slug` 用于保持稳定 URL；
- 正式文章不得保留敏感信息；
- `draft: true` 的正式文章不会生成详情页，但仍需通过内容 schema 校验。

## 专题映射

```text
AI Agent       -> src/content/blog/ai-agent/
工程实践       -> src/content/blog/engineering/
经验教训       -> src/content/blog/lessons/
生活认知       -> src/content/blog/life/
量化交易       -> 暂无正式目录，后续有正式文章再创建
项目复盘       -> 暂无正式目录，后续有正式文章再创建
```

## 最小示例流程

### 1. 生成草稿

路径：

```text
notes/logicai/2026-07-12-blog-topic-restructure-review.md
```

草稿内容：

```yaml
---
title: "Blog 按专题重构复盘"
date: "2026-07-12"
type: "project-review"
source: "logicai2"
source_task: "按专题细分 Blog 架构"
audit_owner: "xiaohe"
audit_status: "pending"
visibility: "private"
tags: ["Blog", "Astro", "工程实践"]
---
```

正文应包括：背景、目标、移动目录、URL 稳定策略、构建验证结果、遗留问题。

### 2. 萧何审计

萧何检查草稿后给出结论：

```yaml
audit_status: "approved"
visibility: "public"
```

若存在敏感信息、事实不清或价值不足，则保持 `pending` 或改为 `rejected`，不得迁移。

### 3. 迁移为正式文章

目标路径：

```text
src/content/blog/engineering/blog-topic-restructure-review.md
```

正式 frontmatter：

```yaml
---
title: "Blog 按专题重构复盘"
description: "一次将 Astro Blog 从扁平文章目录调整为专题目录的工程复盘。"
pubDate: 2026-07-12
category: "tech"
tags: ["Blog", "Astro", "工程实践"]
draft: false
slug: "blog-topic-restructure-review"
---
```

### 4. 构建验证

在 Blog 仓库根目录执行：

```powershell
npm run build; echo BUILD_EXIT:$LASTEXITCODE
```

只有 `BUILD_EXIT:0` 才能视为迁移完成。

## 后续 LogicAI2 能力方向（本次不实现）

后续可以考虑在 LogicAI2 侧增加：

- `src/roles/templates/xiaohe/knowledge-audit.md`
- `src/knowledge/draft-contract.ts`
- `src/knowledge/export-blog-draft.ts`
- `workspace/projects/{project}/knowledge-draft.md`

本次只定义协议，不创建、不修改任何 LogicAI2 代码。
