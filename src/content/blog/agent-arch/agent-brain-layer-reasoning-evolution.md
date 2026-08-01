---
title: "Agent 大脑层：从思维链到蒙特卡洛树搜索的推理进化之路"
description: "系统性拆解 Agent 架构大脑层的六大推理模式——CoT、ReAct、Plan-and-Execute、ToT、LATS、Reasoning Tokens，深入蒙特卡洛树搜索机制，并以 LogicAI2 为实例展示类比迁移与工程落地路径。"
tags: ["Agent","LLM","推理","Tree of Thoughts","MCTS","LATS","ReAct","CoT","LogicAI"]
slug: "agent-brain-layer-reasoning-evolution"
series: "Agent 架构演化系列"
pubDate: "2026-07-30"
articleStyle: technical
lang: zh
seriesOrder: 2
---

## 引言：Agent 的大脑在想什么？

在 Agent 架构的五层共识中，**大脑与推理计划层（Brain & Planning）** 是最核心的一层——它决定了 Agent "怎么想"和"怎么决定下一步做什么"。

从 2022 年 CoT（思维链）的提出到 2026 年 Reasoning Tokens 的普及，大脑层的推理模式经历了一场清晰的进化：

```
CoT（线性推理）
  → ReAct（推理+工具循环）
    → Plan-and-Execute（规划执行分离）
      → ToT（树形分支搜索）
        → LATS（蒙特卡洛树搜索 + 自我反思）
          → Reasoning Tokens（推理时算力动态控制）
```

这篇文章将沿着这条进化路线，逐站拆解每种模式的核心机制、性能数据和适用场景。在深入 ToT 和 LATS 的分支搜索机制后，我会以我正在构建的 LogicAI2 系统为实例，展示这些学术概念如何映射为工程实践。

---

## 第一站：CoT —— 线性思维链，一切推理的基石

**Chain-of-Thought**（Wei et al., NeurIPS 2022）是所有后续推理模式的底层基础设施。核心思想极其简单：**让模型"写出解题步骤"而不是直接给答案**。

加入中间推理步骤后，模型的逻辑跳跃被拉成可追踪的链条，幻觉率显著下降。

**验证方式**：向任意 LLM 发送：

```text
请一步步思考：小明有 5 个苹果，吃了 2 个，又买了 3 个，给小红 1 个。他还有几个？
```

检查输出中是否出现显式的中间推理链（第一步、第二步……），而非直接蹦出数字。如果出现了，CoT 已生效。

CoT 在简单任务上表现出色，但它的上限很明显——在 Game of 24（用四个数字通过加减乘除得到 24）基准测试中，CoT 的成功率仅 **4%**。线性推理只走一条路，走错了就没有回头的机会。

---

## 第二站：ReAct —— 推理 + 行动循环，2026 年的绝对主流

**ReAct**（Yao et al., ICLR 2023, arXiv: 2210.03629）在 CoT 基础上增加了**与外部世界交互**的能力。它将 Agent 的每一步结构化为三拍循环：

```
Thought → Action → Observation → Thought → Action → Observation → ...
```

- **Thought**：用 CoT 思考该做什么
- **Action**：调用一个外部工具（搜索、计算器、API）
- **Observation**：观察工具返回结果，据此决定下一步

这是 2026 年**生产级 Agent 的绝对主流模式**。Claude Code、OpenAI Codex、Cursor 的底层推理引擎都是 ReAct 变体。它的优势在于简单可靠，缺点是每一步都需要调用一次 LLM——N 个工具调用意味着 N+1 次 LLM 调用，成本和延迟线性增长。

---

## 第三站：Plan-and-Execute —— 规划与执行分离

为了解决 ReAct 的成本问题，**Plan-and-Execute** 模式将推理拆为两个独立阶段：先由一个强模型生成完整计划，再由一个廉价模型（甚至无需 LLM）逐步执行。

**ReWOO**（Xu et al., 2023, arXiv: 2305.18323）是这一思路的极致版本。它在规划时使用变量占位符：

```text
Plan:
#E1 = Search["TypeScript 斐波那契实现"]
#E2 = Search["#E1 中提到的性能优化方法"]
#E3 = LLM["根据 #E1 和 #E2 写出最优实现"]
```

工具执行时自动替换变量，最终由一次 LLM 调用整合所有结果。三种模式的核心差异：

| 维度 | ReAct | Plan-and-Execute | ReWOO |
|------|-------|-------------------|-------|
| 规划方式 | 每步实时规划 | 一次性生成完整计划 | 一次性生成含占位符的计划 |
| 执行方式 | 每步调 LLM + 工具 | 廉价模型逐步执行 | 直接执行工具，0 次额外 LLM 调用 |
| 总 LLM 调用 | N+1 | 2–3 | **2**（规划+整合） |
| 成本 | 高 | 中 | **低（节省 30%–82%）** |

---

## 第四站：Tree of Thoughts —— 从线性到树形的跃迁

前三种模式都是**线性推理**——沿一条路走到底。当问题存在多种可能方案、需要"往前想几步再选最优路线"时，线性模式就力不从心了。

**Tree of Thoughts (ToT)**（Yao et al., NeurIPS 2023, arXiv: 2305.10601）在每个决策点同时展开多个候选方案分支，用 LLM 自评估每个分支的前景，剪枝保留最优路线。

### ToT 的四个核心组件

```
                    ToT 框架
                       │
        ┌──────────────┼──────────────┐──────────────┐
        │              │              │              │
   ① 思维分解      ② 思维生成      ③ 状态评估      ④ 搜索算法
  Decomposition    Generation     Evaluation      Search
```

**① 思维分解**：将问题拆成若干步骤，每步称为一个"思维单元"。关键是粒度——太粗则失去搜索意义，太细则组合爆炸。

**② 思维生成**：两种策略：
- **独立采样（Sample）**：用 temperature > 0 采样 k 次，生成 k 个独立候选。适合思维空间丰富的场景
- **提议式生成（Propose）**：一个 Prompt 一次性提出 k 个不同方案。适合有约束的场景

**③ 状态评估**：两种方式：
- **投票（Vote）**：给出 k 个候选，LLM 投票选最优
- **打分（Value）**：LLM 对每个状态打分（sure / likely / impossible），用于剪枝

**④ 搜索算法**：
- **BFS（广度优先）**：逐层展开，每层保留 top-b 个最佳节点
- **DFS（深度优先）**：沿一条路走到底，遇到 "impossible" 回溯

### Game of 24 搜索实例

```
输入：数字 [1, 5, 6, 7]，目标得到 24

第 1 层（生成 5 个候选）：
├── T1.1: 7 - 1 = 6  → 剩 [5, 6, 6]    评估: sure ✅
├── T1.2: 5 + 1 = 6  → 剩 [6, 6, 7]    评估: sure ✅
├── T1.3: 7 * 1 = 7  → 剩 [5, 6, 7]    评估: likely ⚠️
├── T1.4: 6 - 1 = 5  → 剩 [5, 5, 7]    评估: likely ⚠️
└── T1.5: 5 * 1 = 5  → 剩 [5, 6, 7]    评估: likely ⚠️

BFS 保留 top-3：T1.1, T1.2, T1.3

第 2 层（从 T1.2 展开）：
├── T2.1: 6 * 6 = 36 → 剩 [7, 36]      评估: impossible ❌
├── T2.2: 6 + 6 = 12 → 剩 [7, 12]      评估: likely ⚠️
├── T2.3: 7 - 6 = 1  → 剩 [1, 6]       评估: impossible ❌
└── ...

继续搜索直到找到可行解路径...
```

### 性能数据

| 任务 | IO Prompting | CoT | CoT-SC (k=100) | **ToT** |
|------|-------------|-----|-----------------|---------|
| Game of 24 | 7.3% | 4.0% | 9.0% | **74%** |
| Creative Writing | 6.19 | 6.93 | 7.56 | **7.56** |
| Mini Crossword | 15.6% | 15.6% | 20% | **60%** |

数据来源：Yao et al., NeurIPS 2023

Game of 24 从 CoT 的 4% 跃升至 ToT 的 74%——这就是"从线性到树形"的威力。

---

## 第五站：LATS —— 蒙特卡洛树搜索 + 自我反思

**LATS（Language Agent Tree Search）**（Zhou et al., ICML 2024, arXiv: 2310.04406）是 ToT 的重大升级。它引入了 **MCTS（蒙特卡洛树搜索）**——与 AlphaGo 同源的搜索算法，并融合了 Reflexion 的自我反思机制。

### MCTS 的四步循环

理解 LATS 必须先理解经典 MCTS。这套算法最初在围棋中大放异彩，其核心是用**统计采样替代穷举搜索**：

```
┌─────────┐   ┌─────────┐   ┌──────────┐   ┌────────────────┐
│ Selection│──→│Expansion│──→│Simulation│──→│Backpropagation │
│ (选择)   │   │ (扩展)  │   │ (模拟)   │   │(反向传播)      │
└─────────┘   └─────────┘   └──────────┘   └────────────────┘
     ↑                                             │
     └─────────────── 重复 N 次迭代 ───────────────┘
```

**Step 1 — Selection（选择）**：从根节点出发，用 **UCB 公式**选择子节点，一直走到叶节点：

```
UCB(node) = Q(node)/N(node) + c × √(ln(N_parent) / N(node))
             ───────────────   ────────────────────────────────
              exploitation               exploration
           (利用：选价值高的)       (探索：选访问少的)
```

- `Q(node)`: 该节点累计奖励值
- `N(node)`: 该节点被访问次数
- `N_parent`: 父节点被访问次数
- `c`: 探索常数，通常取 **1.4**（√2 ≈ 1.414）

c 值越大，越倾向于探索未知路径；c 值越小，越倾向于深挖已知好路径。

**Step 2 — Expansion（扩展）**：在选中的叶节点上，生成 N 个可能的子节点。

**Step 3 — Simulation（模拟）**：从新扩展的节点出发，进行一次完整的"快速走棋"直到终态，获得奖励值。在 AlphaGo 中是随机走棋到终局；在 LATS 中是让 LLM 完整回答问题。

**Step 4 — Backpropagation（反向传播）**：将模拟结果沿路径回传，更新所有祖先节点的 Q 值和访问次数 N。

### LLM 的三重角色

LATS 的革命性在于：**一个 LLM 同时扮演三个角色**：

| 角色 | 经典 MCTS（AlphaGo） | LATS（LLM Agent） |
|------|---------------------|-------------------|
| **行动者** (Actor) | 棋步生成器 | LLM 生成 N 个候选动作 |
| **评估者** (Value Function) | 神经网络评分 | LLM 对当前状态打分（0–1） |
| **反思者** (Critic) | ❌ 不存在 | LLM 生成自然语言自我反思 |

第三个角色"反思者"来自 **Reflexion**（Shinn et al., NeurIPS 2023, arXiv: 2303.11366）。传统强化学习在失败后只用数值梯度更新权重；Reflexion 让 LLM 用自然语言总结失败原因，存入记忆，下次重试时参考：

```text
反思示例：
"上次递归方案失败是因为没处理大数溢出，
且 O(2^n) 复杂度在 n>30 时超时。
下次应该用迭代方案，并考虑 BigInt。"
```

LATS 在每次模拟失败后生成类似的反思文本，附加到后续迭代的上下文中。这让搜索过程具备了**跨迭代学习能力**，避免重复犯同样的错误。

### 完整执行流程示例

以编程任务"实现 TypeScript 斐波那契函数"为例：

```
迭代 1：
├── [Selection] 根节点 → UCB 选择（首次都是 ∞，随机选）
├── [Expansion] LLM 生成 5 个候选方案：
│   ├── A: 递归实现
│   ├── B: 动态规划（数组）
│   ├── C: 动态规划（两变量优化）
│   ├── D: 矩阵快速幂
│   └── E: 记忆化递归
├── [Simulation] 方案 A → 完整代码 → 运行测试
│   结果：通过 3/5 测试（大数溢出）
│   → LLM 评分：0.6
│   → LLM 反思："递归没处理大数，性能也差"
├── [Backpropagation] A: Q=0.6, N=1

迭代 2：
├── [Selection] UCB 计算：
│   ├── A: 0.6 + 1.4×√(ln1/1) = 0.6（已访问）
│   ├── B: ∞（未访问）← 选这个
├── [Simulation] 方案 B → 通过 5/5 测试
│   → LLM 评分：0.95
│   → 反思："DP 方案高效，O(n) 时间"
├── [Backpropagation] B: Q=0.95, N=1

迭代 3：
├── [Selection] UCB：B 得分最高 → 从 B 深入
├── [Expansion] B 的子方案：
│   ├── B.1: 改用两变量滚动（空间优化）
│   ├── B.2: 加 BigInt 支持
│   └── B.3: 加输入验证
├── [Simulation] B.1 → 5/5 通过 + 性能更优
│   → LLM 评分：0.98
├── [Backpropagation] 更新整条路径

最终输出：沿最高 Q 值路径回溯 → 方案 B.1
```

### 基准性能对比

| 方法 | HotpotQA (EM) | HumanEval (pass@1) | WebShop (score) |
|------|---------------|---------------------|-----------------|
| CoT | 0.34 | 46.9% | — |
| ReAct | 0.32 | 56.9% | 53.8 |
| ToT | 0.55 | 54.4% | — |
| Reflexion | 0.51 | 68.1% | 64.2 |
| **LATS** | **0.71** | **83.8%** | **75.9** |

以上数据均使用 GPT-3.5。LATS 在 GPT-4 上达到 **HumanEval pass@1 = 92.7%**。

数据来源：Zhou et al., ICML 2024

### 补充：Graph of Thoughts —— 超越树的图搜索

**GoT**（Besta et al., AAAI 2024, arXiv: 2308.09687）进一步放开拓扑约束，允许节点之间的合并、循环与聚合：

```
CoT:  ●→●→●→●         （链）
ToT:  ●→●→●            （树）
         ↘●→●
GoT:  ●→●→●            （有向图）
         ↗↘
      ●→● →●            支持合并、循环、聚合
```

GoT 的核心操作包括**生成**（展开子节点）、**聚合**（合并多个独立结果）、**精炼**（迭代改进）和**蒸馏**（压缩为关键路径）。排序任务上 GoT 比 ToT 质量提升 62%，成本降低 31%。但其实现复杂度远高于 ToT/LATS，目前工程采用率较低。

---

## 第六站：Reasoning Tokens —— 推理时算力的动态控制

2024 年底 OpenAI o1 的发布标志着一个根本性的范式转换：**推理质量不再只取决于训练时的参数量，还取决于推理时（test-time）投入的算力**。

模型在输出最终答案前，先生成大量"隐藏的思考 token"（Reasoning Tokens），这些 token 不展示给用户，但会被计费为输出 token。到 2026 年，三大厂商都提供了推理预算控制 API：

| 厂商 | 控制方式 | 参数 |
|------|---------|------|
| OpenAI (o3/GPT-5) | `reasoning_effort` | `low` / `medium` / `high` |
| Anthropic (Claude) | `budget_tokens` | 最小 1024，上不封顶 |
| Google (Gemini 2.5) | `thinkingBudget` | 0（关闭）到 -1（自动） |

**核心洞察**：2026 年生产级 Agent 最大的成本错误，是让所有请求都走推理模型。正确做法是**按任务难度路由**——简单查询走快速模型，复杂推理才走深度思考模型。

---

## 成本与适用场景速查

### Token 成本现实

| 模式 | 单任务 LLM 调用次数 | 大致 Token 消耗 | 估算成本（GPT-4 级） |
|------|-------------------|----------------|---------------------|
| CoT | 1 | ~2K | ~$0.01 |
| ReAct（5 步） | 6 | ~10K | ~$0.05 |
| ToT（3 层, b=5） | ~20 | ~50K | ~$0.25 |
| LATS（10 迭代, n=5） | ~60 | ~150K | ~$0.75 |
| LATS（50 迭代, n=5） | ~300 | ~750K | ~$3.75 |

### 适用场景判断

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| 简单问答/检索 | CoT | 线性足够，成本最低 |
| 需要工具调用的任务 | ReAct | 标准 Agent 循环 |
| 有明确正确答案的复杂推理 | ToT | 需要分支但不需外部反馈 |
| 代码生成 + 测试 | LATS | 有外部反馈（测试结果），MCTS 优势最大 |
| 多步架构设计 | LATS | 高价值决策，值得高成本 |
| 实时对话 | ReAct / CoT | LATS 延迟太高，不适合交互 |

---

## 从学术到工程：LogicAI2 的类比迁移与落地实践

以上六种推理模式并非只存在于论文中。我正在构建的 **LogicAI2** 系统——一个多角色协作的 AI Agent 平台——恰好是这些理论概念的工程映射。这一章将展示两件事：哪些概念已经在 LogicAI2 中自然落地了，哪些还没有，以及我计划如何渐进式地引入分支搜索能力。

### 已有的对应关系

LogicAI2 的多角色架构与大脑层推理模式之间存在清晰的映射：

| 大脑层概念 | LogicAI2 对应 | 说明 |
|-----------|--------------|------|
| **CoT** | 刘邦 `handleChat` 的 `<think>` 推理块 | 单轮对话中的线性推理，模型输出中间思考过程 |
| **ReAct** | 韩信 `chatWithTools` 循环 | Thought→调用工具→读取结果→继续，标准的 Agent 执行引擎 |
| **Plan-and-Execute** | 张良规划蓝图 → 韩信逐步执行 | 张良先输出完整 plan.md，韩信按计划步骤执行，规划与执行天然分离 |
| **多模型路由** | Router 角色分发 | 根据用户意图分发给刘邦/韩信/张良/萧何/InfoScout，本质是按任务类型路由到不同"推理策略" |
| **Reasoning Tokens 预算** | `handleChat` vs `chatWithTools` | 刘邦走轻量单轮（低推理预算），韩信/张良走重量级 Agent 循环（高推理预算）——虽然尚未显式使用 `reasoning_effort` API 参数，但架构上已经做了分层 |

### 尚未覆盖的差距

三个关键能力在当前架构中**完全缺失**：

**1. 分支搜索**：所有角色都是线性推理。张良规划时只产出一个方案，不会同时提出三个方案再比选。韩信调试时猜一个原因就直接改，不会系统性排除多种可能。

**2. 动态推理预算**：所有角色使用相同的模型参数，没有根据任务复杂度动态调节 `reasoning_effort` 或 `budget_tokens`。简单问答和复杂架构设计消耗相同的推理资源。

**3. 跨迭代学习**：当韩信执行失败后，不会像 Reflexion 那样生成结构化的反思文本供下一次尝试参考。失败经验没有被系统性积累。

### 为什么存在这些差距

这不是疏忽，而是**有意识的工程权衡**：

- LogicAI2 是工程实践系统，追求**可控性和确定性**。用硬编码角色分工替代模型自主规划，降低了不确定性和调试难度。
- ToT/LATS 的 **10–100 倍 token 开销**在个人项目中性价比不高——一次 LATS 搜索可能花掉 $0.75–$3.75。
- 推理预算控制是纯 API 层的能力，改动量小但需要配合效果评估体系才能真正发挥价值。

### 渐进式集成路线

我设计了三阶段渐进方案，从零代码到完整引擎：

#### Phase 1：Prompt 级 ToT（零代码改动，立即可用）

不改系统架构，仅在特定场景的 System Prompt 中加入 ToT 式指令。例如修改张良的规划 Prompt：

```markdown
## 规划策略

在制定架构方案时，你必须：
1. 先提出 3 个不同的方案方向（分支探索）
2. 对每个方案从以下维度评估：
   - 实现复杂度 (1-5)
   - 可维护性 (1-5)
   - 性能影响 (1-5)
   - 与现有架构的兼容性 (1-5)
3. 选择综合评分最高的方案
4. 解释为什么放弃了其他方案
5. 仅对选中方案输出详细实施计划
```

**预期收益**：规划质量提升（避免"第一个想到的就是最终方案"的偏差），决策过程透明可审计，零成本零风险。

#### Phase 2：ToT 执行引擎（中等改动，~200 行代码）

在 `chatWithTools` 循环内部，为特定步骤插入"分支展开 → 评估 → 选择"子流程：

```typescript
// src/ai/strategies/treeSearch.ts

interface ThoughtNode {
  id: string;
  parentId: string | null;
  thought: string;          // 推理内容
  score: number;            // LLM 评估分 (0-1)
  children: ThoughtNode[];
  depth: number;
}

interface TreeSearchConfig {
  maxDepth: number;         // 最大搜索深度（默认 3）
  branchFactor: number;     // 每层展开数（默认 3）
  searchAlgo: 'bfs' | 'dfs';
  evaluationPrompt: string;
}

async function treeOfThoughts(
  problem: string,
  config: TreeSearchConfig,
  llm: LLMClient
): Promise<ThoughtNode> {
  const root: ThoughtNode = {
    id: 'root', parentId: null,
    thought: problem, score: 0,
    children: [], depth: 0
  };

  for (let depth = 0; depth < config.maxDepth; depth++) {
    const leaves = getLeaves(root);
    for (const leaf of leaves) {
      // 生成 k 个候选
      const candidates = await generateThoughts(
        llm, leaf, config.branchFactor
      );
      // 评估并剪枝
      for (const c of candidates) {
        c.score = await evaluateThought(
          llm, c, config.evaluationPrompt
        );
      }
      leaf.children = candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, config.branchFactor);
    }
  }
  return getBestPath(root);
}
```

**触发条件**：张良接到复杂架构设计请求、韩信遇到多种可能方案的 Bug、用户显式要求"帮我比较几种方案"。

#### Phase 3：完整 LATS 引擎（重大改动，~500 行代码）

实现完整的 MCTS 搜索循环，包含 UCB 选择、模拟、反向传播和 Reflexion：

```typescript
// src/ai/strategies/lats.ts

class LATSEngine {
  private root: MCTSNode;
  private reflectionMemory: string[] = [];

  async search(
    problem: string,
    config: LATSConfig
  ): Promise<Solution> {
    this.root = new MCTSNode(problem);

    for (let i = 0; i < config.maxIterations; i++) {
      const selected = this.select(this.root);   // UCB
      const children = await this.expand(selected);
      for (const child of children) {
        const result = await this.simulate(child);
        this.backpropagate(child, result.score);
        // Reflexion: 失败时生成自我反思
        if (result.score < 0.5) {
          const reflection = await this.reflect(
            child, result
          );
          this.reflectionMemory.push(reflection);
        }
        if (result.score >= 0.95) {
          return this.extractSolution(child);
        }
      }
    }
    return this.extractBestSolution(this.root);
  }

  private ucbScore(node: MCTSNode): number {
    if (node.visits === 0) return Infinity;
    return node.totalReward / node.visits
      + 1.4 * Math.sqrt(
        Math.log(node.parent!.visits) / node.visits
      );
  }
}
```

Phase 3 需要配合**外部反馈环境**（如代码测试运行器、编译器）才能发挥 LATS 的全部威力——因为 MCTS 的模拟阶段需要真实的环境反馈来计算奖励值。

### 实施优先级

| 阶段 | 改动量 | 预期收益 | 建议时间线 |
|------|--------|---------|-----------|
| Phase 1 | 仅改 Prompt 文本 | 中（规划质量提升） | 立即可做 |
| Phase 2 | ~200 行新模块 | 高（复杂任务质量跃升） | 1–2 周 |
| Phase 3 | ~500 行 + 测试环境 | 很高（需配合反馈环境） | 1–2 月 |

**我的判断**：先做 Phase 1，在实际使用中验证"分支搜索"对规划质量的提升是否显著。然后根据体验决定是否投入 Phase 2。Phase 3 是长期目标，适合在 LogicAI2 接入代码执行沙箱后再启动。

---

## 全景速查

```
                      Brain & Planning 层
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    推理模式              搜索策略            算力控制
         │                   │                   │
   ┌─────┴─────┐       ┌────┴────┐        ┌────┴────┐
   │           │       │         │        │         │
  CoT       ReAct    ToT      LATS    reasoning  budget
 (线性)  (工具循环) (树搜索)  (MCTS)   _effort   _tokens
   │           │       │         │
   └─────┬─────┘       └────┬────┘
         │                  │
   Plan-and-Execute       GoT
   (规划执行分离)        (图搜索)
         │
       ReWOO
  (极致成本优化)
```

---

## 文献索引

| 论文 | 作者 | 发表 | arXiv |
|------|------|------|-------|
| Chain-of-Thought Prompting | Wei et al. | NeurIPS 2022 | — |
| ReAct: Synergizing Reasoning and Acting | Yao et al. | ICLR 2023 | 2210.03629 |
| Tree of Thoughts | Yao et al. | NeurIPS 2023 | 2305.10601 |
| Language Agent Tree Search (LATS) | Zhou et al. | ICML 2024 | 2310.04406 |
| Graph of Thoughts | Besta et al. | AAAI 2024 | 2308.09687 |
| Reflexion | Shinn et al. | NeurIPS 2023 | 2303.11366 |
| ReWOO | Xu et al. | 2023 | 2305.18323 |
