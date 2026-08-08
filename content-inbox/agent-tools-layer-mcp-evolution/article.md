---
title: "Agent 工具与行动层：从 Function Calling 到 MCP 与 GUI Agent 的进化之路"
description: "系统拆解 Agent 架构工具与行动层的进化主线——从 Toolformer 自监督工具学习、Function Calling API 与 /v1/chat/completions 协议解剖，到新一代 Responses API，再到工具学习与检索（Gorilla/ToolLLM/APIGen/Tool RAG）、MCP 协议标准化与 GUI Agent 全能之手，并以 LogicAI2 为例给出工具层落地的真实进展：ToolRegistry 与官方 SDK MCP 接入已完成，统一执行网关与全量审计正在推进。"
tags: ["Agent","Function Calling","Responses API","MCP","Tool Use","Toolformer","Gorilla","BFCL","GUI Agent","ToolRegistry","Tool Executor","LogicAI"]
slug: "agent-tools-layer-mcp-evolution"
series: "Agent 架构演化系列"
pubDate: "2026-08-01"
seriesOrder: 3
articleStyle: technical
lang: zh
---

## 引言：大脑想好了，谁来动手？

前两篇我们解决了 Agent 的"怎么想"（大脑层：CoT → ReAct → ToT → LATS）和"记得住"（记忆层：CoALA 四类记忆 → RAG 三代演进 → 记忆平台）。但一个只会思考和回忆、不会动手的 Agent，充其量是个高级聊天机器人。

**工具与行动层（Tools & Actions）** 决定了 Agent 能否真正改变世界：把思考结果变成搜索、写文件、发邮件、操控浏览器、执行代码等一系列外部动作。用 CoALA 框架（arXiv:2309.02427）的话说，这一层定义的是 Agent 的**外部行动空间**（external actions）——通过 grounding 与环境交互。

这一层的进化主线同样清晰：

```
Toolformer（模型自监督学会用工具）
  → Function Calling API（厂商将工具调用标准化为消息协议）
    → 工具学习与检索（Gorilla / ToolLLM / APIGen / Tool RAG）
      → MCP（工具接入协议标准化，2024.11）
        → GUI Agent（工具层走向"全能之手"，2024.10 起）
```

这篇文章沿着这条主线，逐站拆解工具层的核心机制、性能数据与工程陷阱。我们会先解剖 Function Calling 诞生的现场——`/v1/chat/completions` 端点，再看它如何演进为新一代 Responses API；随后进入工具学习、MCP 协议与 GUI Agent；在评测基准（BFCL）与工程实践两站之后，我会以 LogicAI2 为例，展示工具层从"硬编码函数"到"ToolRegistry 注册中心"、再到"官方 SDK 的 MCP 接入"的真实落地过程，以及下一步统一执行网关、Tool RAG 与 MCP Server 化的推进路线。

---

## 第一站：工具调用的诞生 —— 从"文本补全"到"行动接口"

### Toolformer：让模型自己学会用工具

2023 年 2 月，Meta AI 的 **Toolformer**（Schick et al., arXiv:2302.04761）第一次系统性地提出：**语言模型可以自监督地学会何时调用工具**。

核心思路是"自举"：模型在文本中插入特殊的 `[API]` 标记来请求工具调用，然后**执行工具、拿到结果、评估这次调用是否降低了后续文本的困惑度**——只有"有帮助"的调用才被保留为训练样本。

```
输入：美国新冠病例数最近上升，[QA("近期美国新冠病例趋势？") → 纽约时报数据显示...
```

训练管线分四步：

```
① 采样候选调用位置（模型自己想在哪调用）
② 执行工具并拿到结果
③ 判断"用了工具后预测下一步的困惑度是否下降"
④ 只保留确实有帮助的 (位置, 调用, 结果) 三元组，加入训练语料
```

在多个基准上，Toolformer 显著提升了 GPT-J（6.7B）的工具使用能力：

| 基准 | GPT-J | Toolformer | GPT-3 (175B, 无工具) |
|------|-------|-----------|---------------------|
| WebQS | 18.5 | **26.3** | 29.0 |
| SQuAD | 17.8 | **33.8** | 26.8 |
| TriviaQA | 43.9 | **48.8** | 65.9 |

数据来源：Schick et al., arXiv:2302.04761

但论文自己也承认一个关键局限：**Toolformer 无法链式使用工具**——它一次只支持一个 API 调用，不能把工具 A 的输出喂给工具 B。这个"链式调用"能力，要等 Function Calling API 和 ReAct 循环来解决。

### Function Calling API：工具调用的"官方接口"

2023 年 6 月 13 日，OpenAI 发布 **Function Calling**（官方博客 "Function calling and other API updates"）：在 `/v1/chat/completions` 新增 `functions` 与 `function_call` 参数，允许开发者用 **JSON Schema** 描述函数，模型可以返回结构化的"该调用哪个函数、参数是什么"，而不是把工具调用混在自然语言里。

这是一次关键的**协议化**：工具调用从"提示词里的隐式约定"变成了"消息协议里的显式字段"。此后各家 API 相继跟进（Anthropic 的 `tool_use`/`tool_result` 块、Google 的 function calling），消息格式逐步统一为：

```
用户消息
  → 模型输出 assistant 消息，内含 tool_call：{ name, arguments }
  → 系统执行工具，把结果作为 tool_result 消息回填
  → 模型基于工具结果继续推理
```

一个典型的工具循环（TypeScript 伪代码）：

```typescript
type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };
type ToolResult = { tool_call_id: string; content: string };

async function agentLoop(messages: Message[], tools: Tool[]): Promise<Message> {
  for (let step = 0; step < MAX_STEPS; step++) {
    const resp = await llm.chat({ messages, tools });   // 模型选工具
    if (resp.toolCalls.length === 0) return resp;        // 不再调用 → 完成

    const results: ToolResult[] = [];
    for (const call of resp.toolCalls) {
      const fn = registry.get(call.name);                // 工具注册表查找
      const output = await fn(call.arguments);           // 执行工具
      results.push({ tool_call_id: call.id, content: JSON.stringify(output) });
    }
    messages = [...messages, resp, ...results];          // 回填结果
  }
  throw new Error("达到最大步数");
}
```

到这里，工具层的第一块基石已经打下：**模型能选工具、能传参数、能消费结果**。但新问题随之而来——工具越来越多时，模型怎么保证"选对"？

在进入工具学习之前，值得先把 Function Calling 诞生的现场——`/v1/chat/completions` 这个端点——彻底解剖一遍。它是整个行业工具调用协议的事实基准，至今仍是最广泛使用的接口；理解了它，就理解了所有工具调用框架的底层循环。

### 解剖 `/v1/chat/completions`：工具调用的"总入口"

#### 请求全貌

一次完整的工具调用请求，body 长这样：

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "你是一个天气助手" },
    { "role": "user",   "content": "北京今天冷不冷？" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "查询指定城市的实时天气。仅当用户询问天气时使用。",
        "parameters": {
          "type": "object",
          "properties": {
            "city": { "type": "string", "description": "城市名，如 北京" },
            "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
          },
          "required": ["city"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

四个关键部分：

| 字段 | 作用 |
|---|---|
| `model` | 用哪个模型 |
| `messages` | 对话历史（含工具结果回填） |
| `tools` | 工具定义列表（JSON Schema） |
| `tool_choice` | 控制模型如何选择工具 |

#### messages 数组：四种角色

工具调用闭环里，消息一共四种角色，构成完整上下文：

| role | 谁发的 | 内容 |
|---|---|---|
| `system` | 开发者 | 系统指令、行为约束 |
| `user` | 用户 | 提问/指令 |
| `assistant` | 模型 | 文本回复 **或** 工具调用请求（`tool_calls`） |
| `tool` | 系统 | 工具执行结果，**必须** 与某次 `tool_calls` 的 id 对应 |

关键规则：**`tool` 消息必须紧跟它对应的 `assistant` 消息**，且顺序不能乱——模型靠这个顺序理解"这次调用的结果"。

#### tools 参数：JSON Schema 是工具的灵魂

每个工具就是一个 JSON Schema 描述，模型**只凭这段文字**决定要不要调用、传什么参数：

- **`name`**：机器标识，`snake_case`，模型调用的唯一凭据；
- **`description`**：**最重要的字段**——模型读这段文字来决定"何时用、何时不用"。写得越场景化、边界越清楚，调用越准；
- **`parameters`**：JSON Schema 定义参数。`required` 必填、`enum` 枚举、`type` 类型，模型生成参数时严格遵守。

> 这就是后文"基石一"的依据：工具调用准确率的主要来源是描述文字，不是字段类型。

#### 响应：模型返回的不是文本，是"调用意图"

当模型决定调用工具，它不会返回 `content` 文本，而是返回 `tool_calls`：

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_abc123",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\"city\": \"北京\", \"unit\": \"celsius\"}"
          }
        }
      ]
    },
    "finish_reason": "tool_calls"
  }]
}
```

注意三个细节：

1. **`arguments` 是字符串**，不是对象——需要 `JSON.parse` 才能用；
2. **`id`（call_abc123）是回填时对账用的凭证**，工具结果要挂在这个 id 上；
3. **`finish_reason` 变成 `"tool_calls"`**——程序看到这个值就知道"模型要工具了，去执行"，而不是对话结束。

#### 完整闭环：四步循环

```
Step 1  发送 messages（含 tools 定义）
        ↓
Step 2  模型返回 tool_calls（要调 get_weather，city=北京）
        ↓
Step 3  你的代码执行 get_weather("北京")，拿到真实天气
        ↓
Step 4  把结果以 role="tool" 消息回填，再发给模型
        ↓
Step 5  模型基于结果生成最终回复（或继续调下一个工具）
```

Step 4 的回填消息长这样：

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "{\"city\": \"北京\", \"temp\": 12, \"condition\": \"多云\"}"
}
```

然后带着**全部历史**（原消息 + assistant 的 tool_calls + tool 结果）再次请求，模型这次会基于 12°C 的真实数据回复："北京今天 12 度，有点凉，建议穿外套。"

> **为什么必须回填完整历史？** 因为模型是无状态的——它不记得上次说了什么。`tool_calls` + `tool` 消息对账，是它理解"我自己调过工具、结果是这样"的唯一方式。

#### 多工具并行调用

一次响应可以带**多个** `tool_calls`（并行调用），回填时每条 `tool` 消息各挂各的 id：

```json
"tool_calls": [
  { "id": "call_1", "function": { "name": "get_weather", "arguments": "{\"city\":\"北京\"}" } },
  { "id": "call_2", "function": { "name": "get_weather", "arguments": "{\"city\":\"上海\"}" } }
]
```

```json
{ "role": "tool", "tool_call_id": "call_1", "content": "北京 12°C" },
{ "role": "tool", "tool_call_id": "call_2", "content": "上海 18°C" }
```

程序侧可以 `Promise.all` 并发执行——这是工具层做并行的标准姿势。

#### tool_choice：三种控制模式

| 值 | 行为 |
|---|---|
| `"auto"` | 模型自己决定调不调、调哪个（默认） |
| `"none"` | 禁止调用工具，强制纯文本回复 |
| `{"type": "function", "function": {"name": "get_weather"}}` | **强制**调用指定工具（即使不需要） |

生产场景里，`"none"` 常用于不需要工具的闲聊轮次以省 token；强制指定用于流程编排。

#### 一套最小的 TypeScript 实现

把上面的循环串成代码——这就是后文 ToolRegistry 要抽象掉的"手写循环"：

```typescript
type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

async function runAgent(initial: ChatMessage[], tools: ToolDef[]) {
  const messages = [...initial];

  for (let i = 0; i < 10; i++) {                      // 最多 10 轮工具循环
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o", messages, tools }),
    }).then(r => r.json());

    const msg = resp.choices[0].message;

    if (!msg.tool_calls) return msg;                  // 没有工具调用 → 对话完成
    messages.push(msg);                               // ① 记下 assistant 的 tool_calls

    for (const call of msg.tool_calls) {
      const fn = registry.get(call.function.name);    // ② 查注册表
      const args = JSON.parse(call.function.arguments);
      const result = await fn(args);                  // ③ 执行工具
      messages.push({                                 // ④ 回填 tool 结果
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
  throw new Error("工具循环超过上限");
}
```

### 新一代：Responses API —— 把"回填对账"从手工活变成自动活

`/v1/chat/completions` 统治了工具调用协议两年，但它有一个明显的痛点：**每次请求都要手动维护消息数组、手动拼 `tool` 回填消息、手动保证顺序正确**——这堆"胶水"代码在复杂 Agent 里会迅速膨胀。

2025 年 3 月 11 日，OpenAI 发布新一代 **Responses API**（`/v1/responses`），官方定位"生产首选"，目标是解决 Chat Completions 的手工活。它带来了一个根本性的数据模型变化。

#### 核心变化：Messages → Items

Chat Completions 的世界里只有一个扁平的 `messages` 数组，文本和工具调用"粘"在同一个 message 对象里。Responses API 则引入 **Items**——一个联合类型，把模型的各种行为拆成相互独立的条目：

```text
Item 类型（部分）：
  message              ← 模型的文本回复
  function_call        ← 一次工具调用请求（name / arguments / call_id）
  function_call_output ← 一次工具调用的结果
  web_search_call      ← 内建网页搜索
  reasoning            ← 推理过程条目
  ...
```

响应体从 `choices[0].message` 变成了类型化的 `response` 对象，其 `output` 字段是一个 Items 数组，每种 item 独立出现。官方迁移指南（developers.openai.com/api/docs/guides/migrate-to-responses）明确说：Chat Completions 把很多关注点"粘"在一个对象里，而 Items 让它们彼此分离、更忠实于模型的实际动作序列。

#### 工具调用循环：不需要再手动对账

在 Responses API 里，一次工具调用循环变成：

```typescript
const input: ResponseItem[] = [
  { type: "message", role: "user", content: "北京今天冷不冷？" },
];

for (let step = 0; step < 10; step++) {
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: "gpt-4o", input, tools }),
  }).then(r => r.json());

  input.push(...resp.output);                        // ① 直接把整个 output 追加进 input（含 function_call）

  const calls = resp.output.filter((i: any) => i.type === "function_call");
  if (calls.length === 0) break;                     // 没有工具调用 → 完成

  for (const call of calls) {                        // ② 执行并回填
    const fn = registry.get(call.name);
    const out = await fn(JSON.parse(call.arguments));
    input.push({
      type: "function_call_output",                  // ③ 不再需要 role="tool" + tool_call_id 对账
      call_id: call.call_id,
      output: JSON.stringify(out),
    });
  }
}
```

对比 Chat Completions 的手写循环，差异一目了然：

| 维度 | Chat Completions | Responses API |
|---|---|---|
| 数据结构 | 扁平的 Messages 数组，文本与工具调用粘在一起 | 类型化 **Items**（message / function_call / function_call_output 独立） |
| 工具结果回填 | 手写 `role: "tool"` + `tool_call_id` 对账 | 直接 `input.push(response.output)`，用 `function_call_output` 条目 |
| 系统指令 | `messages` 里的 `system` 角色 | `instructions` 参数（顶层字段） |
| 有状态对话 | 无——每次重发全部历史 | `store: true` + `previous_response_id` 引用，状态托管在 OpenAI 侧 |
| 内建工具 | 无（纯文本 + 工具） | web_search / code_interpreter / file_search 开箱即用 |
| 结果提取 | `choices[0].message.content` | SDK 提供 `output_text` helper |
| 存储 | 默认存储（新账号） | 默认存储，可 `store: false` 关闭 |
| 状态 | 兼容保留、生态最广 | 官方"生产首选"，新功能主推方向 |

#### previous_response_id：把"上下文管理"外包给服务端

Responses API 最有想象力的特性是**有状态对话**：

```json
{
  "model": "gpt-4o",
  "input": [{ "type": "message", "role": "user", "content": "那上海呢？" }],
  "store": true,
  "previous_response_id": "resp_xxx123"
}
```

开启 `store: true` 后，OpenAI 在服务端保存对话状态；后续请求只需传 `previous_response_id` 引用之前的响应，**无需重发全部历史**。这让 Agent 循环的上下文管理从"客户端手工拼装"外包给了服务端。

但注意两个社区反复踩到的坑（OpenAI 开发者论坛 2025 年多个帖子）：

- **计费不减**：即使只传 `previous_response_id`，输入 token 仍按整段历史计费——省的是请求体积，不是钱；
- **延迟更高**：stateful 模式（用 `previous_response_id` 或开启 store）实测比 Chat Completions 明显更慢，多个开发者反馈"至少慢一倍"；不用引用时能回到 2–3 秒。2025 年官方承认正在优化，但生产选型时需实测权衡。

#### 旧 API 的归宿

随着 Responses API 成熟，旧接口开始退场：**Assistants API（2023 DevDay 发布的 beta 接口）将在 2026 年上半年日落**，官方建议迁移到 Responses API——它用更简单的机制（`previous_response_id`）解决了 Assistants 用 Thread / Message / Run 三件套才能解决的问题。而 `/v1/chat/completions` 作为行业事实标准仍会长期兼容（各家厂商克隆了它的形状），但它不再是新功能的主战场。

> **一句话总结**：Chat Completions 是"你手写循环"；Responses API 是"框架帮你循环"。前者理解成本低、生态最广、延迟稳定；后者省胶水、有内建工具、有状态托管——但要注意延迟与计费口径。

---

## 第二站：工具学习与组合 —— 模型如何学会"选对工具"

### Gorilla：检索增强的 API 调用

2023 年 5 月，UC Berkeley 的 **Gorilla**（Patil et al., arXiv:2305.15334, NeurIPS 2024）发布。它构建了 **APIBench**——超过 11,000 条"指令-API"配对，覆盖 HuggingFace、TorchHub、TensorHub 三大 API 库，用来评估模型生成准确 API 调用的能力。

Gorilla 的两个关键洞察：

1. **零样本 API 调用精度大幅超越 GPT-4**：在 TorchHub 等基准上，Gorilla 的零样本准确率显著超过当时闭源的 GPT-3.5 / GPT-4。
2. **检索器是抗幻觉的解药**：论文发现 API 文档频繁更新会导致"文档漂移"——模型记住了旧接口。Gorilla 引入文档检索器，把**最新的 API 文档检索出来再生成调用**，既提升准确率，又让模型能跟上接口迭代。这也是今天 Tool RAG 思想的雏形。

### ToolLLM：让开源模型掌握 16000+ 真实 API

2023 年 7 月，清华/OpenBMB 的 **ToolLLM**（Qin et al., arXiv:2307.16789, ICLR 2024 Spotlight）把工具学习的规模推上一个量级：

- 从 RapidAPI Hub 收集了 **16,464 个真实 RESTful API**，覆盖 49 个类别；
- 用 ChatGPT 自动生成单工具与多工具指令，并搜索出**合法调用路径**；
- 提出 **DFSDT（深度优先搜索决策树）**：让模型在工具调用遇到死胡同时可以回溯重试，而不是一条道走到黑；
- 发布自动评估器 **ToolEval**（Pass Rate / Win Rate 双指标）；
- 微调出的 ToolLLaMA 在 ToolEval 上**达到与 ChatGPT 相当的水平**，且能泛化到未见过的 API。

关键实验数据（ToolEval Pass Rate，%）：ReAct 下 GPT-4 平均 64.4、Claude-2 平均 34.4；而引入 DFSDT 后，各模型在复杂指令（I3）上的表现普遍大幅提升——**"选错路能回头"比"一条路走到底"重要得多**。这与第一篇讲的 ToT/LATS 分支搜索是同一哲学在工具层的落地。

### APIGen：用"可验证数据"喂出顶尖工具模型

2024 年 6 月，Salesforce 的 **APIGen**（Liu et al., arXiv:2406.18518, NeurIPS 2024）回答了另一个问题：工具模型训练数据从哪来？

APIGen 构建了一条自动化数据生产管线：从 **3,673 个可执行 API（21 个类别）**出发，多阶段生成 + **三层验证**（格式检查 → 真实执行 → 语义校验），产出约 **60,000 条高质量函数调用样本**。

效果惊人：仅 7B 参数的模型在 BFCL 上**超过多个 GPT-4 模型**；1B 模型超过 GPT-3.5-Turbo 和 Claude-3 Haiku。"数据质量 + 可验证性"比"模型规模"更能决定工具调用能力——这是工具层特有的规律。

### Tool RAG：工具太多时，"全量加载"是灾难

工具学习的终点不是堆数量。2025 年以来的生产实践研究（如 zylos.ai 2026-04 的调研《Tool-Augmented LLM Agents: Production Architecture》转引多项 2025 研究）给出了残酷的退化曲线：

| 可用工具数量 | 前端模型选对工具的平均准确率 |
|-------------|------------------------------|
| ~50 个 | 84%–95% |
| ~200 个 | 41%–83% |
| ~740 个 | 接近 0% |

退化机制与记忆层的 **Lost in the Middle** 效应同源：工具定义列表越长，排在**上下文中间位置（40%–60% 处）**的工具越容易被忽略——其选中准确率可跌到 22%–52%，而列表两端的工具仍有 31%–32%。而且退化不是平滑的，存在"从 207 个到 417 个突然崩盘"的临界点。

所以生产系统的标准模式是**两阶段工具检索**：

```
第一阶段：模型调用一个"工具搜索器"（Tool Searcher），从目录中检索相关工具
第二阶段：只把检索到的 top-k 工具定义注入上下文，供模型实际选择
```

但 Tool RAG 不是"检索出什么就注入什么"——正确的过滤链应该是：

```
混合召回（向量 + 关键词/BM25）
  → 角色授权过滤（该 Agent 无权使用的工具直接剔除）
  → 可用状态过滤（连接断开、禁用中的 MCP 工具不注入）
  → 风险策略过滤（高风险工具按策略标注或降权）
  → Top-K Schema 注入
```

检索只是缩小候选集，**授权与可用性过滤才是安全底线**——否则可能因一次检索失误，把高风险工具注入上下文，或把关键工具"检索丢了"。

另外一个工程现实是：**Tool RAG 有明确触发条件，不应提前引入**。当单角色实际暴露给模型的工具数仍在 20 个以内时，显式白名单（role.toolNames）更简单、更确定、更容易审计；只有当单角色工具数稳定超过 30～40 个、或出现可复现的"明明有工具但模型选不到/选错相近工具"、或工具 Schema 导致上下文显著膨胀时，才值得引入向量检索 + 召回评估的整套复杂度。这与第二篇讲的 RAG 混合检索、上下文压缩是同一套上下文工程思想。

---

## 第三站：MCP —— 工具调用的 USB-C

### 为什么需要它：N 对 N 的集成爆炸

在 MCP 出现之前，每个 AI 应用要接 N 个数据源/工具，就得写 N 套定制集成；每个工具也要适配 M 个 AI 应用。这是典型的 **N×M 集成矩阵**问题——维护成本随连接数平方增长。

2024 年 11 月 25 日，Anthropic 开源 **Model Context Protocol（MCP）**，定位正是"AI 应用的 USB-C 接口"：**一套协议，标准连接 AI 应用与外部数据、工具、能力**。此后 OpenAI 于 2025 年 3 月宣布采用，协议从"Anthropic 的提议"变成了"行业事实标准"。

### 架构：Host / Client / Server 三件套

MCP 采用 **JSON-RPC 2.0** 消息格式，定义了三个角色：

```
┌──────────────┐      JSON-RPC 2.0       ┌──────────────────┐
│   Host       │                         │    MCP Server    │
│ (LLM 应用)   │──── initialize ────────▶│  (工具/数据提供方) │
│   │          │◀───── capabilities ─────│                  │
│   ▼          │                         │  ┌──────────────┐ │
│  MCP Client  │──── tools/list ────────▶│  │ Tool A       │ │
│ (连接器)     │◀──── tool 定义 ──────────│  │ Tool B       │ │
│   │          │──── tools/call ────────▶│  │ Resource     │ │
│   └──────────┘◀──── 结构化结果 ────────│  │ Prompt 模板   │ │
└──────────────┘                         └──────────────────┘
```

- **Host**：发起连接的 LLM 应用（如 Claude Desktop、IDE）；
- **Client**：Host 内部的连接器，负责协议会话；
- **Server**：暴露能力的服务，通过三种核心原语对外提供：**Tools**（可执行动作）、**Resources**（可读取的上下文数据）、**Prompts**（可复用的提示词模板）。

一个典型的 MCP 工具调用流程：

```
① 模型发现自己的能力不足以回答 → 向 MCP Client 请求工具发现
② Client 调 tools/list，从各 MCP Server 拉取工具定义
③ 模型生成结构化调用 → Client 调 tools/call 转发给对应 Server
④ Server 执行并返回结构化结果 → 模型基于结果继续推理
```

### 规范的快速演进：两年三次大版本

MCP 的迭代速度在协议史上堪称激进（来源：MCP 官方规范时间线 + Speakeasy 版本记录）：

| 版本 | 时间 | 关键变化 |
|------|------|---------|
| 初始版 | 2024-11-25 | 确立 Host/Client/Server 模型与 Tools/Resources/Prompts 三大原语 |
| 2025-03-26 | 2025-03 | 引入 **Streamable HTTP 传输** 与 **OAuth 2.1** 授权 |
| 2025-06-18 | 2025-06 | 新增**结构化工具输出**、elicitation（服务器可向用户追问信息）、资源链接；服务器升级为 OAuth Resource Server（RFC 8707 资源指示器）；移除 JSON-RPC batching |
| 2025-11-25 | 2025-11 | 一周年修订：完善授权发现流程 |
| 2026-07-28 (RC) | 2026-07 | Roots / Sampling / Logging 进入弃用窗口，新实现建议不再依赖 |

其中 2025-06-18 版本的安全强化值得注意：**每个访问令牌必须绑定到特定 MCP 服务器（resource 参数）**，防止恶意方把令牌重定向到未授权端点——这是面向企业级部署的安全底线。

### 生态与安全：从 C# SDK 到 NSA 指南

- **生态渗透**：微软与 Anthropic 合作发布官方 C# SDK；OpenAI 弃用 Assistants API，转向 MCP（2026 年年中日落）；到 2026 年，MCP 已成为工具接入的事实标准。
- **安全觉醒**：2026 年 5 月 20 日，美国 NSA 人工智能安全中心（AISC）发布《MCP: Security Design Considerations for AI-Driven Automation》——这是国家级安全机构首次为 AI 工具协议发布专门设计指南，标志着 MCP 从"开发者协议"升级为"基础设施"。

对**接入方（Host/Client）**而言，2025–2026 年生产实践的共识安全基线包括：

- **SSRF 防护**：Streamable HTTP 传输默认拒绝 localhost、内网 IP 与私网 DNS 解析结果，防止恶意 Server 借 Agent 打内网；
- **OAuth 2.1 + PKCE**：远程 Server 授权走标准 Web 授权码流程，授权码与令牌不经聊天通道传递；每个访问令牌绑定到特定 MCP Server（RFC 8707 resource 参数），防止令牌被重定向到未授权端点；
- **风险分级**：对 Server 暴露的每个工具标注 read / write / dangerous，非只读操作默认进入人工审批；
- **参数脱敏与审计**：调用日志对 token、cookie、password、secret、authorization code 等字段脱敏，超长参数/结果只记录长度与哈希摘要。

---

## 第四站：GUI Agent —— 工具层的"全能之手"

MCP 解决的是"如何接入工具"的协议问题，但还留着一个更野的设想：**能不能不给模型定义工具，直接让它操控整个电脑/手机？** 这就是 GUI Agent（计算机使用 Agent）。

### Claude Computer Use：视觉驱动的桌面自动化

2024 年 10 月，Anthropic 随 Claude 3.5 Sonnet 发布 **Computer Use** 公共测试版——首个面向公众开放的"操作电脑"能力。它通过三个工具工作：

- **computer**：截屏 + 模拟鼠标/键盘（点击、输入、滚动、缩放）
- **text_editor**：文件读写
- **bash**：执行系统命令

它的关键差异是**纯视觉驱动**：模型不看 DOM、不看 API，只看屏幕截图，"像人一样"看屏幕、点按钮。这也意味着它的行动空间不是 JSON Schema，而是"屏幕上的一堆像素"。

### OpenAI CUA：一个通用行动空间吃遍所有环境

2025 年 1 月 23 日，OpenAI 发布 **Computer-Using Agent（CUA）**，用于驱动 Operator 产品。CUA 用一个统一的行动空间（鼠标、键盘、滚轮），在三个基准上刷新了纪录：

| 基准 | CUA 成功率 | 说明 |
|------|-----------|------|
| OSWorld | **38.1%** | 完整桌面任务（SOTA） |
| WebArena | **58.1%** | 真实网页任务 |
| WebVoyager | **87%** | 网页导航任务 |

数据来源：OpenAI 官方博客 "Computer-Using Agent"

### Project Mariner：浏览器特化路线

Google 的 **Project Mariner**（基于 Gemini 2.0）则选择了"浏览器特化"路线：不操控整个桌面，只操控浏览器。在评估多模态屏幕理解的 **ScreenSpot** 基准上得分 **84.0%**，在真实网页任务 **WebVoyager** 上达 **83.5%**，2025 年 5 月向美国地区 Gemini AI Ultra 订阅用户开放。

### GUI Agent 的安全红线

GUI Agent 的能力越强，风险越高。业内共识（Anthropic 官方文档 + 多项研究）：

- **必须在虚拟机/容器中运行**，最小权限原则；
- **prompt injection 是头号威胁**：网页上的恶意文字可能劫持 Agent 执行危险操作；
- Anthropic 明确承认：滚动、拖拽、缩放等人类无意识动作，对 Computer Use 仍是难点；
- 建议从低风险任务（如填写表单、整理文件）起步。

GUI Agent 让"工具层"第一次真正逼近了"人机交互的终极形态"——不再有 API 边界，屏幕就是工具面。

---

## 第五站：让工具调用可靠的四块基石

无论底层模型多强，工具层的可靠性最终落在几个工程细节上。以下是 2025–2026 年生产实践（含多篇工程指南）的共识：

### 基石一：Schema 设计 —— description 是给模型看的

工具定义中**最影响调用准确率的是描述文字**，不是字段类型：

- **name**：`snake_case`、动词开头（`get_weather`、`create_ticket`），一眼看懂做什么；
- **description**：**场景化**而非**功能化**——不仅写"做什么"，更要写"何时用、何时不用"（边界条件）。例如在 `search_products` 的描述里写明："仅用于商品搜索；若用户询问订单状态，请用 get_order_status"；
- **参数**：明确必填项、类型、枚举值、单位、格式。每个字段的描述都是模型生成参数时的决策信号。

Gorilla 论文与多项工程研究都发现：**API 文档描述精度与调用准确率存在强正相关**。描述写得不清楚，模型就会"猜"，一猜就错。

### 基石二：错误处理 —— 告诉模型"能不能重来"

工具调用必然失败：网络超时、参数非法、权限不足。关键是把错误信息**结构化地回填给模型**：

```
成功：{ ok: true, data: ... }
可恢复失败：{ ok: false, error: "rate_limit", retryable: true, hint: "请等待 30 秒后重试" }
不可恢复失败：{ ok: false, error: "not_found", retryable: false }
```

- **可恢复错误**：给出重试提示，让模型决定是否重试或换方案；
- **不可恢复错误**：阻止无意义的循环重试，引导模型换工具或如实告知用户；
- **幂等性设计**：LLM 可能会重试工具，危险操作（转账、删除）必须设计为幂等或需要二次确认；
- 不要吞掉错误信息——把错误留在上下文里，能让 Agent 避免重复犯同样的错。

### 基石三：上下文治理 —— 工具结果也会污染上下文

工具结果、错误信息、中间输出都会持续膨胀上下文（第二篇讲过：上下文超过 ~500K tokens 后有效推理质量退化）。生产实践要点：

- **工具结果压缩/摘要**：长输出（日志、网页正文）返回前先截断或摘要；
- **结果 offload**：把大结果写入外部存储，只把引用 ID 留在上下文；
- **错误保留**：压缩可以激进，但错误信息值得保留——它是 Agent 学习的素材。

### 基石四：统一执行网关与全量审计 —— 权限边界是生命线

- **绝不让 LLM 直接调用有无限权限的工具**：所有工具调用必须经过唯一执行入口（Tool Executor / Execution Gateway），统一注入参数校验、角色权限、工作区策略、审批流与审计日志；
- **目录与执行分离**：工具注册中心（Registry）只负责"登记、查找、生成 Schema"；执行网关（Executor）负责"校验、审批、执行、审计"。前者是通讯录，后者是门禁 + 收银台 + 流水系统；
- **审计要记录"尝试"，不只记录成功**：参数非法、权限拒绝、审批拒绝、工具异常、用户取消——每次"试图调用"都应落盘，否则出事时你无法知道 Agent 曾经企图做什么；
- **对写操作默认拒绝，需显式授权**；发布、删除、合并、推送、改权限等 destructive 操作应走二次确认或 typed confirmation；
- **审计日志本身要防泄露**：token、cookie、password、secret、authorization code 一律脱敏；超过阈值（如 2,000 字符）的参数与结果不存原文，只记录 length + SHA-256 摘要。

---

## 附站：评测基准 —— 怎么量化"会用工具"

### BFCL：从工具调用到 Agentic 评测

**Berkeley Function Calling Leaderboard（BFCL）**（Patil et al., ICML 2025, PMLR v267）是事实上的行业标准。它用**抽象语法树（AST）**对比模型生成的调用与标准答案，能扩展到数千个函数；并随版本演进覆盖了越来越复杂的场景：

- **V1**：单轮、单/多工具调用（串行 + 并行）；
- **V2**：多轮对话、参数类型多样性；
- **V3**：更多真实场景 + **幻觉检测**（模型调用了不存在的工具）；
- **V4**：向 **Agentic 评测**演进——不只是"调用对不对"，而是"任务完成没"。

2025 年 10 月的榜单前列（自报数据，来源：Klavis 2025 年度综述）：

| 模型 | BFCL 综合得分 |
|------|--------------|
| GLM-4.5 (FC) | **70.85%** |
| Claude Opus 4.1 | 70.36% |
| Claude Sonnet 4 | 70.29% |
| GPT-5 | 59.22% |

（注：此类榜单多为厂商自报，横向对比时需注意版本与口径差异。）

### MCPMark：真实 MCP 场景的成本效率

MCPMark 用真实 MCP 工具组合压测模型的多步调用能力。2025 年数据中，GPT-5 以约 **$127.46/次基准运行**的成本领先，显著低于 Claude Sonnet 4 的 **$252.41**——在工具调用评测里，**成本效率（pass@1 / 美元）**正在成为比绝对准确率更重要的指标。

---

## 与 LogicAI2 的结合：从硬编码函数到 MCP 时代（2026-08 落地实录）

以我正在构建的 LogicAI2 系统为例，这一节展示工具层规划的完整闭环：当初的三阶段路线图，哪些已落地、哪些正在推进、以及踩过的真实取舍。

### 当初的三阶段规划

```
Phase 1：ToolRegistry —— 工具注册中心（零依赖，一天内完成）
Phase 2：MCP Client —— 接入 MCP 生态（即插即用外部 Server）
Phase 3：Tool RAG + 沙箱审计 —— 规模化（工具检索 + 统一执行 + 审计）
```

### Phase 1：ToolRegistry ✅ 已落地

规划时的核心结构（元数据 + 实现分离、统一注册与查找）已落地为 `src/tools/registry.ts`：

- `register() / registerAll()`：注册内置工具；
- `get() / has() / getAll() / resolveNames()`：查找与解析；
- `toDefinitions()`：把工具元数据转成 LLM 可用的 JSON Schema；
- `createBaseRegistry()`：默认内置工具集（web_search、url_read、retrieve_papers 等）统一注册。

工具注册中心解决的是**目录问题**：模型能查到哪些工具、参数长什么样，都从这里来。它让散落的工具函数从"角色代码里硬编码"升级为"元数据 + 实现"的注册结构——这是后面所有安全与检索能力的地基。

### Phase 2：MCP Client（官方 SDK v2）✅ 已落地

原规划是手写极简 JSON-RPC 客户端；实际落地时选择了**迁移到官方 `@modelcontextprotocol/sdk` v2**，并超额完成了安全基线：

| 能力 | 落地情况 |
|---|---|
| 传输 | stdio（本地）+ Streamable HTTP（公网）双支持 |
| 认证 | OAuth 2.1 + PKCE Web 授权流程，授权码不经 Telegram/微信 |
| 工具发现 | `ManagedMcpToolCatalog`：发现、缓存、按角色过滤、风险标注 |
| 工具命名 | 外部工具以 `mcp__{server}__{tool}` 注册进统一目录 |
| 风险模型 | 每工具标注 read / write / dangerous，非只读触发人工审批 |
| SSRF 防护 | 拒绝 localhost / 内网 IP / 私网 DNS，防止借 Agent 打内网 |
| 审计 | `McpAuditLogger` 写 `logs/mcp-audit.jsonl`，敏感字段脱敏 |
| 入口覆盖 | CLI / Web / Telegram / 微信四端统一，审批过程中断链自动恢复 |

这一阶段让 LogicAI2 从"只能用自己的函数"变成"能接入生态里任意标准 MCP Server"。

### Phase 3：拆解为三条线，正在推进

原规划的 Phase 3 三件事，在落地时被拆成三条节奏完全不同的线：

**3a. 统一 Tool Executor + 全量审计（当前优先）**

现状：MCP 调用已有审计，但内置工具（bash / read / write / edit 等）还没有同等级的统一持久化审计；安全策略分散在 Router、工具实现与 MCP 层，新增入口时容易漏掉审批或审计。

目标调用链：

```
Router
  → ToolExecutor.call()
      → 工具查找（Registry）
      → 角色白名单校验（allowedToolNames）
      → Schema 参数校验
      → 工作区 / 风险策略
      → 审批（需要时）
      → tool.execute() / MCP bridge
      → 统一审计落盘（logs/tool-audit.jsonl）
```

审计记录所有"尝试"：成功、参数非法、工具不可用、策略拒绝、审批拒绝、执行异常、取消，一条不落；参数与结果统一脱敏 + 超长截断（length + SHA-256 摘要）。内置工具与 MCP 工具从此拥有同一套证据链。

**3b. Tool RAG（按触发条件启动，不提前引入）**

当前每角色实际暴露的工具数仍在舒适区内，显式白名单（role.toolNames）更简单可靠。启动条件：单角色工具数稳定超过 30～40 个，或出现可复现的"有工具但模型选不到"。届时按上文的安全过滤链实现（混合召回 → 角色过滤 → 可用性过滤 → 风险过滤 → Top-K 注入），而不是裸向量检索。

**3c. MCP Server 化（生态扩展，暂缓）**

把 LogicAI2 的信源检索、论文检索、角色调度包装成 MCP Server，反向供 Claude Desktop / Cursor 等调用。前提是先完成 3a 的统一执行网关——对外暴露的每个工具都必须复用同一套权限与审计链路；且初期只暴露只读窄工具（search_sources / search_papers / list_roles）。

### 一张表看现状

| 能力 | 状态 |
|---|---|
| ToolRegistry 工具注册中心 | ✅ 已完成 |
| MCP Client（官方 SDK v2 + OAuth PKCE + SSRF） | ✅ 已完成 |
| MCP 调用审计（脱敏 + 结果摘要） | ✅ 已完成 |
| 内置工具全量审计 | 🚧 Tool Executor 阶段 |
| 统一执行网关（所有调用必经） | 🚧 Tool Executor 阶段 |
| Tool RAG（工具检索） | ⏸️ 达到工具规模后启动 |
| MCP Server 化（对外提供能力） | ⏸️ 3a 完成后评估 |

### 经验教训

1. **规划要拆节奏**：Phase 3 原计划三件事并行，落地时发现它们的触发条件完全不同——统一执行网关是"接入更多工具前就该有"的安全底座，Tool RAG 是"工具真的多了"才需要，MCP Server 化是"有人要用你的能力"才需要。混在一起做，要么过度设计，要么安全欠账。
2. **目录与执行分离**：ToolRegistry 管"有什么工具"，ToolExecutor 管"能不能执行、怎么留痕"。把执行塞进注册表，职责会爆炸。
3. **审计的粒度是"尝试"**：拒绝和失败同样要落盘——审计链回答的不是"Agent 做成了什么"，而是"Agent 试图做什么"。

---

## 总结

工具与行动层的进化，本质是三条线的合流：

1. **能力线**：Toolformer 证明模型能学会用工具 → Function Calling 把调用协议化（`/v1/chat/completions` 成为事实标准）→ Responses API 把回填对账自动化 → 工具学习（Gorilla/ToolLLM/APIGen）让开源模型也能掌握海量 API → GUI Agent 让屏幕成为终极工具面；
2. **协议线**：从 N×M 定制集成 → MCP 统一标准（2024.11 发布 → 2025 年 OpenAI 采用 → 2026 年 NSA 安全指南），工具接入从"手写胶水"变成"即插即用"；
3. **工程线**：工具不是越多越好——50 个是舒适区，200 个开始退化，700 个崩盘。Tool RAG、Schema 设计、错误处理、统一执行网关与审计，才是工具层可靠性的真正保障。

对 LogicAI2 而言，工具层的 Phase 1（ToolRegistry）与 Phase 2（MCP Client）已落地，正在推进的是统一执行网关与全量审计；Tool RAG 与 MCP Server 化则按触发条件择机启动。大脑层负责"想清楚"，记忆层负责"记得住"，工具层负责"做得到"——三层齐备，Agent 才真正完成从"聊天"到"行动"的跨越。

---

## 参考文献

- Toolformer: Language Models Can Teach Themselves to Use Tools — arXiv:2302.04761
- Gorilla: Large Language Model Connected with Massive APIs — arXiv:2305.15334 (NeurIPS 2024)
- ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs — arXiv:2307.16789 (ICLR 2024 Spotlight)
- APIGen: Automated Pipeline for Generating Verifiable and Diverse Function-Calling Datasets — arXiv:2406.18518 (NeurIPS 2024)
- Cognitive Architectures for Language Agents (CoALA) — arXiv:2309.02427
- The Berkeley Function Calling Leaderboard (BFCL): From Tool Use to Agentic Evaluation — ICML 2025, PMLR v267
- OpenAI: Function calling and other API updates（2023-06-13）
- OpenAI: Computer-Using Agent（2025-01-23）
- OpenAI: Introducing the Responses API / Migrate to the Responses API — developers.openai.com/api/docs/guides/migrate-to-responses
- OpenAI: Function calling 官方指南（Responses API 形态）— developers.openai.com/api/docs/guides/function-calling
- Simon Willison: Responses vs. Chat Completions（2025-03-11）
- OpenAI Developer Community: Stateful Responses API latency / previous_response_id 计费讨论（2025）
- Anthropic: Model Context Protocol 官方规范 — modelcontextprotocol.io/specification
- Anthropic: Model Context Protocol TypeScript SDK — github.com/modelcontextprotocol/typescript-sdk
- RFC 8707: Resource Indicators for OAuth 2.0
- Anthropic: Computer use tool 官方文档 — platform.claude.com
- NSA AISC: MCP Security Design Considerations for AI-Driven Automation（2026-05-20）
- The Dawn of GUI Agent: A Preliminary Case Study with Claude 3.5 Computer Use — arXiv:2411.10323
- Tool-Augmented LLM Agents: Production Architecture（zylos.ai 2026-04，转引多项 2025 工具退化研究）
