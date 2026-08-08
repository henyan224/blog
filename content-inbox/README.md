# Content Inbox

Agent 提交候选内容的目录。每次提交创建一个子目录：

```text
content-inbox/{submission-id}/
├── manifest.json
├── article.md
└── assets/
```

规则：

1. 默认私有，不直接发布。
2. `article.md` 必须带 `draft: true`。
3. 不允许直接写入 `src/content/blog/`。
4. 提交后等待自动校验和人工审核。

详见 `docs/content-publication-protocol.md`。
