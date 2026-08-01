---
title: "Agent 架构演化（二）：记忆与知识管理层 (Memory & RAG)"
description: "深入拆解 Agent 记忆层的三大支柱：上下文窗口动态压缩与摘要、三路混合检索（Dense + Sparse + Knowledge Graph）、MemoryOS 分层记忆体系（Episodic & Procedural），并给出 LogicAI2 的落地路线图。"
tags: ["Agent","Memory","RAG","上下文压缩","混合检索","CoALA","LogicAI2"]
slug: "agent-memory-layer-rag-evolution"
series: "Agent 架构演化"
pubDate: "2026-08-01"
seriesOrder: 1
articleStyle: technical
lang: zh
---

## 引言：上下文窗口是"物理内存"，不是"长期记忆"

上一篇文章我们拆解了 Agent 架构的第 1 层——大脑与推理计划层。但一个只会推理、转身就忘的 Agent，和一台只有 RAM、没有磁盘的电脑没有区别：每次开机都从零开始。这就是第 2 层要解决的问题——**记忆与知识管理层 (Memory & RAG)**。

先说一个关键认知：**上下文窗口不是记忆，它是"物理内存"**。LLM 本身是**无状态的**（stateless）——这是 CoALA 论文（Cognitive Architectures for Language Agents, arXiv:2309.02427, TMLR 2024）反复强调的起点：语言模型不跨调用持久化任何信息。所谓"上下文窗口"，只是模型在单次调用中能"看到"的临时缓冲区。真正的记忆，是把信息存到上下文窗口之外，在需要时精确地搬回来。

围绕这个目标，本文拆解记忆层的三大支柱：

1. **上下文窗口动态压缩与摘要**——窗口是有限的，如何让它装下更多的"有效信息"；
2. **混合检索 (Hybrid RAG: Dense + Sparse + Knowledge Graph)**——从外部知识库精确取回所需信息；
3. **MemoryOS 分层记忆体系 (Episodic & Procedural Memory)**——像操作系统管理虚拟内存一样，管理 Agent 的长期记忆。

---

## 第一部分：上下文窗口动态压缩与摘要

### 1.1 为什么不能无脑堆上下文？

"模型上下文窗口已经到 1M、2M tokens 了，还需要压缩吗？"——这是最常见的误解。答案是**需要**，理由来自三个层面的事实：

**事实一：有效上下文 ≠ 名义上下文。** Stanford 的 *Lost in the Middle* 论文（arXiv:2307.03172, TACL 2023）通过多文档问答和键值检索实验发现：当相关信息位于输入上下文的**中间位置**时，模型性能显著下降，呈现一条经典的 **U 形性能曲线**——开头（首因偏差）和结尾（近因偏差）的信息利用最好，中间的信息最容易"丢失"。论文作者的原话是："当前语言模型并不能稳健地访问和使用长输入上下文中的信息。"

**事实二：超长上下文存在真实的质量天花板。** Gemini 1.5 技术报告（arXiv:2403.05530）展示了"大海捞针"式检索任务上 1M token 上下文仍能保持 99.7% 的召回率——但那是**单点检索**任务。对需要跨段落综合推理的任务，情况远没有那么乐观：业界多项研究（如 LooGLE 基准）表明，模型在"从超大文档中综合信息"这类任务上表现远差于"找一根针"。简单说：**把信息塞进窗口 ≠ 模型能有效使用它**。

**事实三：成本与延迟随上下文线性恶化。** Prefill（输入处理）的计算量和 token 数成正比，这意味着每多塞 1 万 token，TTFT（首 token 延迟）就长一分、账单就贵一分。对于一个会长期运行、累积多轮对话的 Agent，无脑堆上下文是一条不可持续的路。

结论很清晰：**记忆管理的本质是上下文工程（Context Engineering）**——用最少的 token 传递最多的有效信息。

### 1.2 三类压缩技术路线

按压缩发生的层次，上下文压缩技术可分为三类：

| 路线 | 代表技术 | 压缩发生的位置 | 特点 |
|---|---|---|---|
| **摘要式压缩** | 递归摘要、MemGPT 的 Core Memory 块 | 对话/记忆层 | 保留语义精华，但损失细节，可能引入"摘要漂移" |
| **提示词级压缩** | LLMLingua 系列、Selective Context | 送入模型前的输入层 | 无损保留关键 token，由小型语言模型打分裁掉冗余 |
| **架构级压缩** | StreamingLLM (Attention Sink)、KV Cache 量化 | 模型内部 | 从注意力机制层面突破窗口限制，但改变不了"输入必须进窗口"的前提 |

三种路线并不互斥：生产级系统通常**先做摘要式压缩控制对话历史总量，再用提示词级压缩榨干每一次调用的 token 效率**。

### 1.3 LLMLingua 系列：用小型语言模型做"剪刀"

LLMLingua（微软研究院）的核心思想非常优雅：**用一个小型语言模型（SLM）当"语法检查器"，通过困惑度（perplexity）给输入 token 打分，剪掉低信息量的 token**。既然是"剪输入"而非"改输出"，目标模型（如 GPT、Claude）完全不需要修改。

关键数据（来自 LLMLingua 官方）：

- **LLMLingua**：最高 **20 倍压缩率**，在 CoQA、HotpotQA、TriviaQA 等基准上质量损失低于 **2%**；
- **LongLLMLingua**（面向长上下文场景的升级版）：**4 倍压缩**的同时在长上下文任务上反而提升 **17.1% 的性能**——因为它不只是压缩，还会做 **query-aware（感知查询的）压缩与文档重排**，把噪音剪掉、把关键信息挪到模型最擅长的开头/结尾位置；
- **LLMLingua-2**：用数据蒸馏学习"该剪什么"，实现任务无关的高保真压缩。

LongLLMLingua 的四大组件值得细看：**预算控制器**（给指令、示例、问题分配不同的压缩比）、**query-aware 粗到细压缩**（用对比困惑度评估上下文片段与查询的相关性）、**文档重排**（把最相关的文档排到最容易被注意到的位置）、**子序列恢复策略**（避免把关键句子剪得支离破碎）。

这意味着什么？**"剪掉不相关的内容"本身就提升了模型对关键信息的感知能力**——因为它同时缓解了 Lost in the Middle 的位置偏差。这正是"更少 token，更好结果"的罕见双赢。

### 1.4 增量摘要循环：Agent 自己的"日记整理"

提示词压缩解决"单次调用"的效率，但跨会话的长期对话历史还需要摘要式压缩。生产级做法是**增量摘要循环（Incremental Summarization Loop）**：

```typescript
interface CompactionResult {
  summary: string;        // 滚动摘要
  anchorNotes: string[];  // 锚点节点（不可丢失的关键信息）
  evictedChunks: string[]; // 已压缩进 summary 的原始片段
}

class ContextCompactor {
  private readonly summaryTokenBudget = 2000;
  private readonly anchorTypes = ['user_preference', 'decision', 'constraint', 'todo'];

  async compact(history: ChatMessage[], runningSummary: string): Promise<CompactionResult> {
    // 1. 提取锚点：遍历历史，把类型命中的消息原样保留
    const anchorNotes = history
      .filter(m => this.anchorTypes.includes(m.type ?? ''))
      .map(m => `[${m.type}] ${m.content}`);

    // 2. 把"非锚点"的历史 + 旧摘要喂给 LLM 做滚动摘要
    const compressible = history.filter(m => !this.anchorTypes.includes(m.type ?? ''));
    const newSummary = await summarize(`
      已有摘要：${runningSummary}
      新增对话：${compressible.map(m => m.content).join('\n')}
      请生成合并后的新摘要，保留决策、结论、用户偏好、待办。
    `);

    // 3. 预算保护：摘要超预算时递归压缩
    let final = newSummary;
    while (estimateTokens(final) > this.summaryTokenBudget) {
      final = await summarize(`请将以下摘要压缩到 ${this.summaryTokenBudget} tokens 以内：${final}`);
    }

    return { summary: final, anchorNotes, evictedChunks: compressible.map(m => m.content) };
  }
}
```

几个工程要点：

- **锚点节点保护**：不是所有历史都该被压缩。用户明确表达的偏好、已经做出的决策、硬性约束，这类信息一旦被摘要"软掉"，Agent 行为就会漂移。所以先抽出锚点原样保留，再压缩其余部分。
- **滚动而非重置**：每次压缩是基于"旧摘要 + 新对话"的合并，而不是从零开始总结，避免信息断层。
- **预算保护**：摘要本身也要有 token 预算上限，超了就递归压缩，防止"压缩器"自己把上下文撑爆。

---

## 第二部分：混合检索 (Hybrid RAG: Dense + Sparse + Knowledge Graph)

### 2.1 从 Naive RAG 到三代演进

RAG 的原始论文（Lewis et al., arXiv:2005.11401）奠定了"**混合参数记忆 + 非参数记忆**"的范式：参数记忆是模型权重里学到的知识，非参数记忆是外部可检索的文档索引。论文中一个极具说服力的数据是：在 Natural Questions 开放域问答上，**RAG-Sequence 达到 44.5 EM（精确匹配），而拥有 110 亿参数的 T5-11B "闭卷"模型只有 28.9 EM**——非参数记忆让模型用少得多的参数取得了显著更高的知识密集型任务成绩。

此后 RAG 经历了三代演进：

- **Naive RAG**：文档切块 → Embedding → 向量库检索 → 拼进 prompt。简单，但检索质量差（分块割裂语义、召回不精准）、无重排、无上下文。
- **Advanced RAG**：在 Naive 基础上加**混合检索（向量 + BM25）、Reranker 重排、查询改写、Contextual Retrieval 索引优化**。这是当前生产系统的主流。
- **Agentic RAG**：检索本身变成 Agent 行为——自主决定查什么、查几次、要不要换查询词、检索结果不够就继续深挖。检索从"一次查询"变成"多步推理的一部分"。

### 2.2 三路检索的能力边界

混合检索的本质是：**没有任何单一检索方式在所有场景下最优**。三路各有其能力边界：

| 检索路 | 原理 | 擅长 | 短板 |
|---|---|---|---|
| **Dense（向量）** | Embedding 语义相似度 | 语义改写、同义表达、跨语言 | 对精确专有名词、ID、代码符号不敏感；需要足够训练数据 |
| **Sparse（BM25）** | 词频 + 逆文档频率 | 精确关键词、专有名词、代码标识符、稀有术语 | 对同义词、语义改写无能为力 |
| **Graph（知识图谱）** | 实体-关系多跳遍历 | 多跳关系推理、"A 影响了 B 的 C"、全局性问题 | 建图成本高；对未建模的实体失效 |

一个经典的失败案例：查询"如何解决 CUDA out of memory"，向量检索可能命中语义相近的"显存不足处理"，而 BM25 能精确命中含 "CUDA" "out of memory" 字样的原文——**两者互补**。而"这家公司的上游供应商在哪"这类问题，只有知识图谱能通过实体关系多跳回答。

### 2.3 BM25 的数学原理（为什么它不过时）

BM25（Best Matching 25）是 1994 年提出的经典稀疏检索算法，但在混合检索时代反而迎来了第二春——**因为它和向量检索的错误模式几乎不重叠**，融合后能显著提升召回。

其核心公式：

```
score(D, Q) = Σ_{i=1..n} IDF(q_i) · [ f(q_i, D) · (k₁ + 1) ] / [ f(q_i, D) + k₁ · (1 - b + b · |D|/avgdl) ]
```

其中：

- `f(q_i, D)`：查询词 qᵢ 在文档 D 中的词频；
- `|D|` 与 `avgdl`：文档长度与语料平均文档长度；
- `k₁`（默认 1.2）：词频饱和参数——词频的边际收益递减，出现 10 次不等于 10 倍相关；
- `b`（默认 0.75）：文档长度归一化强度——惩罚"长文档靠堆字数混相关性"。

IDF（逆文档频率）衡量词的信息量：

```
IDF(q_i) = ln( (N - n(q_i) + 0.5) / (n(q_i) + 0.5) + 1 )
```

N 是文档总数，n(qᵢ) 是包含 qᵢ 的文档数。**"CUDA" 这种稀有词贡献高分，而 "的""and""the" 这类高频词几乎不贡献分数**——这正是 BM25 对专有名词检索依然犀利的根本原因。

TypeScript 里一个可用的轻量 BM25 实现（不依赖任何第三方库）：

```typescript
interface Doc { id: string; tokens: string[] }

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
}

class BM25Index {
  private docs: Doc[] = [];
  private df = new Map<string, number>();   // 每个词的文档频率
  private docLen = new Map<string, number>(); // 每个文档的词数
  private avgdl = 0;
  private readonly k1 = 1.2;
  private readonly b = 0.75;

  add(doc: Doc) {
    this.docs.push(doc);
    this.docLen.set(doc.id, doc.tokens.length);
    const seen = new Set(doc.tokens);
    for (const t of seen) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avgdl = [...this.docLen.values()].reduce((a, b) => a + b, 0) / this.docs.length;
  }

  private idf(term: string): number {
    const n = this.df.get(term) ?? 0;
    const N = this.docs.length;
    return Math.log((N - n + 0.5) / (n + 0.5) + 1);
  }

  score(query: string): Map<string, number> {
    const qTokens = tokenize(query);
    const scores = new Map<string, number>();
    for (const doc of this.docs) {
      const freq = new Map<string, number>();
      for (const t of doc.tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
      const len = this.docLen.get(doc.id)!;
      let s = 0;
      for (const q of qTokens) {
        const f = freq.get(q) ?? 0;
        if (f === 0) continue;
        const tf = (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * len / this.avgdl));
        s += this.idf(q) * tf;
      }
      if (s > 0) scores.set(doc.id, s);
    }
    return scores;
  }
}
```

### 2.4 RRF：把多路排名融合成一路

拿到向量检索和 BM25 两路结果后，怎么融合？常见做法是归一化分数加权求和，但它对两路分数分布不敏感、需要调权重。业界更常用的是 **RRF（Reciprocal Rank Fusion，倒数排名融合）**：

```
RRF_score(d) = Σ_{r ∈ rankings} 1 / (k + rank_r(d))
```

k 通常取 60。这个公式的精妙之处在于：**它只看排名不看分数**——某路检索给文档打了 0.9 还是 0.5 不重要，重要的是它排第几。两路都排前 10 的文档会获得叠加高分，而只在单路靠前的文档也不会被埋没。**零调参、对分数分布鲁棒**，这是它成为混合检索标配的原因。

```typescript
function rrf(rankings: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((docId, idx) => {
      scores.set(docId, (scores.get(docId) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return scores;
}
```

融合之后再接 **Reranker**（如 Cross-Encoder 重排序模型）：把 query 与每个候选文档拼接后一起过 Transformer，直接输出相关性分数——这是计算密集但精度最高的最后一步。Anthropic 的官方实验给出了清晰的量化（见下节）：**混合检索 + 重排，才是检索质量的完整闭环**。

### 2.5 索引侧优化：Contextual Retrieval 与 Late Chunking

检索质量的一半在索引构建阶段就已决定。两个 2024 年的重要技术直接命中"分块割裂语义"这一 Naive RAG 的头号痛点。

**Contextual Retrieval（Anthropic 官方，2024）**：传统分块的问题在于——一个片段 "营收增长 3%" 脱离上下文后毫无意义（哪家公司？哪个季度？）。Anthropic 的解法朴素而有效：**分块之前，先用 LLM 为每个块生成一段"情境前缀"（context），描述该块所属的文档与上下文，然后把"上下文 + 原文"一起 embedding / 建 BM25 索引**。

官方实验数据（Anthropic Engineering Blog, "Contextual Retrieval", 2024）：

| 方案 | Top-20 块检索失败率 |
|---|---:|
| 基线（纯向量检索） | 5.7% |
| + Contextual Embedding | 3.7%（降 35%） |
| + Contextual Embedding + Contextual BM25 | 2.9%（降 49%） |
| + Reranker 重排 | 1.9%（降 **67%**） |

注意这个组合顺序：**情境化 Embedding + 情境化 BM25 + Reranker** 三层叠加，才是完整的 Contextual Retrieval。单独用哪一层都达不到 67%。

**Late Chunking（Jina AI, arXiv:2409.04701）**：传统流程是"先分块、再各自 embedding"——每块独立过模型，彼此语境隔离。Late Chunking 把顺序反过来：**先用长上下文 embedding 模型（如 jina-embeddings-v2，支持 8192 token）对整篇文档过一遍 Transformer，生成每个 token 的向量，然后在 mean pooling（平均池化）阶段才按块边界切分**。这样每个块向量都携带了全文语境——"块 embedding 捕获了完整的上下文信息"（论文原文）。它和 Contextual Retrieval 可以叠加：一个在 embedding 阶段保留上下文，一个在池化阶段保留上下文。

### 2.6 GraphRAG：从"检索片段"到"全局理解"

向量/BM25 检索的本质是"找片段"，但当问题需要**理解整个语料库的全局结构**时（如"这份财报里所有风险因素的共同主题是什么"），片段检索就力不从心了。微软的 GraphRAG（From Local to Global, arXiv:2404.16130）用知识图谱补上了这一环，其工作流分四步：

1. **实体与关系抽取**：用 LLM 从文档中抽取实体（实体名 + 类型 + 描述）和关系（源实体 → 目标实体 + 关系描述），构建图；
2. **Leiden 分层社区检测**：用 Leiden 算法（比 Louvain 更优，能保证社区连通性）把图递归切分成**多层嵌套社区**——Level 0 原始图 → Level 1 紧密社区 → Level 2 更高层聚合，直到无法再细分；
3. **社区报告生成**：对每一层每一个社区，用 LLM 生成该社区的摘要报告（成员、关键实体、关系结构、主要主题）；
4. **Map-Reduce 全局查询**：把社区报告分批（map）让 LLM 各自产出带评分的中间答案，再汇总（reduce）成最终回答。

查询侧还有 **Local Search**：从具体实体出发沿图遍历邻居，精确回答"某个实体的直接相关问题"，避免全局搜索的高开销。微软后续还推出了 **LazyGraphRAG**——跳过索引阶段的昂贵 LLM 摘要，索引成本降到完整 GraphRAG 的 **0.1%**。

GraphRAG 的价值不在取代向量检索，而在于：**当问题需要跨文档、跨实体的关系推理时，图结构提供了向量检索无法提供的全局视角**。这也正是"三路混合检索"中 Graph 路的定位。

---

## 第三部分：MemoryOS 分层记忆体系 (Episodic & Procedural Memory)

### 3.1 CoALA：认知架构的四种记忆

如果只有 RAG，Agent 依然只是"会查资料的失忆症患者"。要构建真正"有记忆"的 Agent，业界目前最权威的框架是 **CoALA（Cognitive Architectures for Language Agents, arXiv:2309.02427, TMLR 2024）**。它把 Agent 的记忆显式划分为四种模块：

| 记忆类型 | 内容 | 类比 | 工程形态 |
|---|---|---|---|
| **Working Memory（工作记忆）** | 当前决策所需的活跃信息 | 人脑的"工作台" | 上下文窗口内的消息数组 |
| **Episodic Memory（情景记忆）** | 有时间戳的具体经历："上周用户做了什么""上次我踩了什么坑" | 人脑的"往事" | 会话记录、轨迹、复盘日志 |
| **Semantic Memory（语义记忆）** | 持久的客观事实："用户偏好""项目状态""领域知识" | 人脑的"百科" | 知识库、事实表、偏好档案 |
| **Procedural Memory（程序记忆）** | 怎么做："如何部署""如何分诊""如何写代码" | 人脑的"肌肉记忆" | 系统提示词、技能库、工具定义、代码 |

CoALA 论文特别强调了一个关键区分：**程序记忆有三种载体**——模型权重内（训练习得）、Agent 代码内（硬编码逻辑）、显式指令集（系统提示词与规则库）。三者的可更新性截然不同：权重内的知识不重训无法更新，代码内的路由不改代码无法更新，只有**显式指令集可以不动模型、不动代码地热更新**。这对工程架构有直接指导意义：**凡是需要频繁演化的"技能"，都应该沉淀为显式指令/技能库，而不是写死在代码里或期待模型自己会**。

### 3.2 情景记忆：让 Agent 从过去的错误中学习

情景记忆的工程价值常常被低估。它的核心不是"记住聊天记录"，而是**结构化地记录"当时发生了什么 → 我做了什么 → 结果如何 → 下次该怎么办"**，形成可检索的经验轨迹（Trajectory）。

```typescript
interface Episode {
  id: string;
  timestamp: string;
  task: string;              // 任务描述
  actions: Action[];         // 采取的动作序列
  outcome: 'success' | 'failure' | 'partial';
  reflection: string;        // 复盘结论：为什么会这样
  lessons: string[];         // 可复用的经验教训
}

class EpisodicMemory {
  private episodes: Episode[] = [];

  record(e: Episode) { this.episodes.push(e); }

  /** 检索与当前任务相似的历史经历，供 Agent 参考 */
  async recall(task: string, limit = 3): Promise<Episode[]> {
    const similar = await this.vectorSearch(task); // 语义相似度召回
    // 失败经验加权：失败案例的经验教训优先级更高
    return similar
      .sort((a, b) => (a.outcome === 'failure' ? 1 : 0) - (b.outcome === 'failure' ? 1 : 0))
      .slice(0, limit);
  }
}
```

**反思（Reflection）是关键环节**：不是记流水账，而是每次任务结束后主动复盘，把"这次为什么失败"提炼成可复用的教训。这正是 Reflexion 论文（arXiv:2303.11366，上一篇文章已介绍）的核心思想在记忆层的落点——情景记忆让 Agent 的"经验"跨会话累积。

### 3.3 程序记忆：技能的蒸馏与复用

程序记忆的目标是：**把"成功做成一件事的过程"蒸馏成可复用的技能（Skill），让下次不再从零推理**。Voyager（Minecraft Agent）是这一思路的经典案例：它把每次成功完成的任务代码存入技能库，后续任务直接检索复用，技能库随时间不断增长——Agent 的能力像滚雪球一样越滚越大。

工程上，程序记忆 = **技能注册表 + 按需注入**：

```typescript
interface Skill {
  id: string;
  trigger: string;        // 何时启用（触发条件描述）
  procedure: string[];    // 步骤序列（提示词级指令）
  validated: boolean;     // 是否经过验证
}

class ProceduralMemory {
  private skills: Skill[] = [];

  async resolve(task: string): Promise<Skill | null> {
    // 先尝试向量检索匹配技能
    const hit = await this.skillSearch(task);
    return hit && hit.validated ? hit : null;
  }

  async distill(episode: Episode): Promise<void> {
    // 成功且可复现的经历 → 提炼为技能
    if (episode.outcome === 'success' && episode.lessons.length > 0) {
      this.skills.push({
        id: crypto.randomUUID(),
        trigger: episode.task,
        procedure: episode.actions.map(a => a.description),
        validated: false, // 需经过验证才算可用
      });
    }
  }
}
```

关键工程决策：**新技能默认"未验证"，不能直接用于生产**。只有经过独立验证（比如在测试环境复跑成功）才标记为 validated 并进入检索池——避免把一次偶然的成功当成可复用经验。

### 3.4 生产级记忆平台横评：Mem0 / Letta(MemGPT) / Zep

2024–2026 年，Agent 记忆已经从"论文概念"进化成"生产工程"。三个代表性平台各有不同的架构哲学：

**Mem0 —— 记忆提取层（Memory as a Service）**
核心思路：把"对话/文档中哪些信息值得长期记住"这个判断交给 LLM 自动完成，提取出的事实存入向量库，需要时检索注入上下文。Mem0 研究论文（ECAI 2025, arXiv:2504.19413）在 LOCOMO 基准上给出了记忆系统的首次系统对照：

- LLM-as-Judge 评估：**Mem0 66.9% vs OpenAI Memory 52.9%**，图版本（Mem0ᵍ）再 +2%；
- **Token 效率**：选择性记忆每条对话仅约 **1,764 tokens，而全上下文方案约 26,031 tokens——节省 90%+**；
- **延迟**：p95 从全上下文的 **17.12s 降到 1.44s——提速约 91%**，准确率仅降约 6 个点（72.9% → 66.9%）。

**Letta（MemGPT）—— 上下文操作系统（LLM as OS）**
MemGPT 论文（"MemGPT: Towards LLMs as Operating Systems"）提出了一个深刻的类比：**把上下文窗口当作"物理内存"，把外部存储当作"虚拟内存"，让 LLM 自己像操作系统一样管理页面的换入换出（paging）**。核心机制包括：

- **自编辑记忆（Self-Editing Memory）**：Agent 通过工具调用改写自己的核心记忆块（core memory），而不是靠外部程序代劳；
- **内省（Inner Thoughts）**：LLM 输出不直接展示的内部推理，用于决定"该不该写记忆"；
- **上下文编译（Context Compilation）**：自动把旧消息递归摘要，腾出物理上下文空间；
- **Sleep-Time Compute**：在会话空闲期异步整理记忆，不阻塞对话。

Letta 团队的口号极具启发性：**"Agent 记忆不是一个存储问题，而是一个上下文工程问题"**。

**Zep（Graphiti）—— 时序知识图谱（Temporal Knowledge Graph）**
Zep 走的是第三条路：**用带时间的知识图谱建模 Agent 记忆**。其开源引擎 Graphiti（20,000+ stars）采用**双时态模型（bi-temporal）**：每条事实同时记录"事件发生时间"（valid time）和"信息摄入时间"（ingestion time），当新事实与旧事实冲突时，**旧事实被标记失效（invalidate）而非删除**——因此它能回答"上个月我们讨论了什么""这个结论是什么时候变的"这类时间敏感问题。架构上分为三个子图：**episode 子图**（对话事件）、**semantic entity 子图**（实体与关系）、**community 子图**（社区摘要，提供全局视角）。在 Deep Memory Retrieval 基准上，Zep 达到 **94.8% vs MemGPT 的 93.4%**，且在 LongMemEval 的时序推理任务上表现突出。

| 平台 | 架构哲学 | 核心优势 | 适合场景 |
|---|---|---|---|
| **Mem0** | 自动提取 + 向量检索 | 接入快、token 省 90%、跨框架 | 需要快速给现有 Agent 加记忆 |
| **Letta/MemGPT** | LLM 自管理上下文（OS 类比） | 自编辑记忆、内省、异步整理 | 需要 Agent 自主决定记什么 |
| **Zep/Graphiti** | 双时态知识图谱 | 时序推理、事实失效不删除 | 需要回答"当时是什么情况" |

### 3.5 基准分数与生产现实的差距

2026 年的记忆系统评测揭示了一个必须正视的残酷事实：**厂商基准分数与生产环境真实表现之间存在巨大鸿沟**。以 Mem0 为例：其 v0.8.2 在 LOCOMO 基准上达到 **91.6**，但在模拟 30 天生产运行后，**有效精度跌至 49.0%，数据过期率高达 38%**——也就是说，**没有时序建模的提取管道无法阻止数据老化**。

这个差距的启示是：选记忆系统时，**基准分数只能证明"在受控对话中回忆能力"，不能证明"长期生产中的数据保鲜能力"**。这也是 Zep 强调双时态模型、Mem0 社区讨论引入过期机制的原因——**"记得住"和"记得对"是两回事**。

---

## LogicAI2 落地映射与三阶段路线

回到我们自己的系统。LogicAI2 现有架构其实已经天然具备四类记忆的雏形，只是尚未显式化、结构化：

| CoALA 记忆类型 | LogicAI2 现有载体 | 现状 | 升级方向 |
|---|---|---|---|
| **工作记忆** | `messages` 数组 | ✅ 已有 | 增加上下文预算管理与动态压缩 |
| **语义记忆** | `sources.json` 信源库 | ⚠️ 有但分散 | 结构化索引 + 按领域选择性加载 |
| **情景记忆** | `infoscout-memory.md` 记忆文件 | ⚠️ 单文件线性追加 | 按领域拆分为结构化目录 + 失败复盘轨迹 |
| **程序记忆** | 角色 Preset 模板 | ✅ 已有 | 技能注册表 + 按需注入 + 验证机制 |

### Phase 1：上下文动态压缩与领域切片（零外部依赖）

- 引入 `ContextCompactor`（本文 1.4 节代码）：会话接近预算阈值时触发滚动摘要，锚点节点（用户偏好、决策、约束）原样保留；
- 把 `infoscout-memory.md` 按领域拆分为结构化目录（`memory/{domain}/index.md`），对话开始时**按当前领域选择性加载**，而不是全量塞进上下文——这一步立竿见影地减少无效 token 并缓解 Lost in the Middle。

### Phase 2：TS 原生三路混合检索引擎

- 不引入 Chroma、rank_bm25、Python 子进程——全部用 Bun/TypeScript 实现：
  - **Sparse 路**：本文 2.3 节的 BM25 实现 + 按词项建立倒排索引；
  - **Dense 路**：接入本地 embedding（如 nomic-embed-text / Qwen3-Embedding）向量化 chunk；
  - **Graph 路（轻量）**：从结构化 JSON（论文的 knowledge-graph 三元组、信源关系）构建邻接表，实现实体多跳遍历；
  - **融合**：RRF（2.4 节）+ 可选 Cross-Encoder reranker。
- 索引侧应用 **Contextual Retrieval 思路**：为每个 chunk 预生成情境前缀再入库。

### Phase 3：跨角色 MemoryOS 自动沉淀与技能进化

- 集成 Mem0 或自建"提取 → 向量库 → 注入"管线，实现跨会话、跨角色的记忆自动提取与共享；
- 建立 `EpisodicMemory`：每次任务结束写入带反思的经验轨迹，失败案例权重更高；
- 建立 `ProceduralMemory` 技能注册表：成功且可复现的经历蒸馏为技能，验证后才进入检索池；
- 时序考量：为记忆增加时间戳与失效机制，防止数据老化误导 Agent。

---

## 总结与下一步

记忆层是 Agent 从"聪明的对话机器"进化为"有经验的协作者"的分水岭。本文梳理的三条主线可以浓缩为一句话：

- **压缩**解决"窗口有限"——用摘要与提示词压缩让每个 token 都传递有效信息；
- **混合检索**解决"知识无限"——用 Dense + Sparse + Graph 三路互补，覆盖语义、精确与时序三类查询；
- **MemoryOS 分层记忆**解决"经验累积"——用 CoALA 四类记忆 + 自动沉淀机制，让 Agent 跨会话变强。

下一篇文章将进入第 3 层：**工具调用与行动执行层（Tool Use & Action Execution）**——Agent 如何安全、可靠地与外部世界交互。

> **参考来源**（均为可查证的一手资料）：
> - CoALA: Cognitive Architectures for Language Agents — arXiv:2309.02427（TMLR 2024）
> - Lost in the Middle — arXiv:2307.03172（TACL 2023）
> - Gemini 1.5 Technical Report — arXiv:2403.05530
> - RAG: Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks — arXiv:2005.11401
> - Anthropic Engineering: Contextual Retrieval (2024) — anthropic.com/engineering/contextual-retrieval
> - Late Chunking (Jina AI) — arXiv:2409.04701
> - GraphRAG: From Local to Global — arXiv:2404.16130；microsoft.github.io/graphrag
> - LLMLingua / LongLLMLingua — Microsoft Research, llmlingua.com
> - Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory — arXiv:2504.19413（ECAI 2025）；LOCOMO 基准
> - MemGPT: Towards LLMs as Operating Systems；Letta 官方博客
> - Zep: A Temporal Knowledge Graph Architecture for Agent Memory — arXiv:2501.13956；Graphiti (getzep.com)
> - Memory in the Age of AI Agents: A Survey — arXiv:2512.13564
