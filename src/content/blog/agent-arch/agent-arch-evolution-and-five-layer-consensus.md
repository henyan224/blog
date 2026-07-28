---
title: "Agent 架构演进与行业共识图谱：从经典三要素到现代五层架构"
description: "总结 2023-2026 年 Agent 架构核心演化：从 Lilian Weng 经典三要素到现代五层架构，涵盖 MCP、A2A 协议及 12 个核心概念的解毒与锚点跳转指南。"
tags: ["Agent","Architecture","MCP","LLM"]
slug: "agent-arch-evolution-and-five-layer-consensus"
series: "Agent 架构演化系列"
pubDate: "2026-07-28"
seriesOrder: 1
articleStyle: technical
lang: zh
---

# Agent 架构演进与行业共识图谱：从经典三要素到现代五层架构

## 引言：为什么我们需要统一的 Agent 架构共识？

在 Large Language Model (LLM) 迅猛发展的今天，“Agent”（智能体）已完成从实验室探路到大规模产业部署的跨越。

然而，从简单的 Prompt Engineering 到真正能自主完成复杂长链路任务的生产级 Agent，行业经历了一场从“散沙探路”到“标准协议规范化”的剧烈演进。

本文顺着 AI 工业界与学术界的演化脉络（2023–2026），系统化梳理 Agent 架构 Core 共识：**从经典三要素，到 Agentic Patterns，再到现代生产级五层架构图谱、主流工程框架选型，以及按文中出场顺序排布的核心概念解毒与跳转指南**。

---

## 一、 经典奠基阶段：Lilian Weng 与 Agent 经典三要素 (2023)

2023 年 6 月，前 OpenAI 安全负责人 Lilian Weng 发表划时代综述 **《LLM Powered Autonomous Agents》** [1]，首次给出了公式化的工程定义：

$$\text{Agent} = \text{LLM (Brain/Planning)} + \text{Memory} + \text{Tool Use}$$

### 1. Brain & Planning（大脑与规划）
- 核心功能：负责目标拆解、子任务规划与推理迭代。
- 关键突破：
  - Yao 等人的 [**ReAct (ICLR 2023)**](#concept-react) [2] 实现了“推理与行动”的交替闭环。
  - Wei 等人的 [**CoT (NeurIPS 2022)**](#concept-cot) [3] 奠定了步骤推理基础。

### 2. Memory（记忆系统）
- 短时记忆：依赖 LLM 的 Context Window 维持对话上下文。
- 长时记忆：利用 Vector DB + MIPS（最大内积搜索）与 [**MemoryOS 机制**](#concept-memoryos) 实现情境记忆检索。

### 3. Tool Use（工具调用）
- 关键突破：Schick 等人的 [**Toolformer 与 Function Calling (NeurIPS 2023)**](#concept-function-calling) [4]，验证了 LLM 自主决定 API 调用的能力。

---

## 二、 模式突破阶段：吴恩达与 Agentic Reasoning 四大模式 (2024)

2024 年，吴恩达 (Andrew Ng) 提出“智能体推理工作流 (Agentic Reasoning Workflows)”能带来超越单纯参数量堆叠的性能飞跃 [5]。行业收敛出四大通用模式：

### 1. 反思 ([Reflection](#concept-reflection))
- 机制：Agent 评估自身输出并自我纠偏。
- 代表工作：Self-Refine [6]、Reflexion (NeurIPS 2023) [7]。

### 2. 工具使用 ([Tool Use / Function Calling](#concept-function-calling))
- 机制：通过结构化函数调用（Function Calling）扩展能力边界。
- 代表工作：Gorilla (Patil et al., 2023) [8]。

### 3. 规划 (Planning)
- 机制：从单链推理转向图搜索与树状探索。
- 代表工作：[**Tree of Thoughts (ToT, NeurIPS 2023)**](#concept-tot-lats) [9]、[**LATS (ICML 2024)**](#concept-tot-lats) [10]。

### 4. 多 Agent 协作 ([Multi-Agent SOP](#concept-multi-agent-sop))
- 机制：将复杂岗位角色化，通过 Role-play 与协作完成多步骤交付。
- 代表工作：AutoGen (Wu et al., 2023) [11]、MetaGPT (ICLR 2024) [12]。

---

## 三、 协议标准化与基础设施落地：MCP、A2A 与 Agent OS (2025–2026)

进入 2025–2026 年，Agent 架构迎来了三次划时代的规范化变革：

### 1. 工具与上下文层协议化：[Anthropic MCP Standard](#concept-mcp) (2024.11–2026)
- **Model Context Protocol (MCP)** [13] 彻底取代了传统的硬编码工具回调与临时 API 封装。
- 建立了类似于 Web 时代 **HTTP 协议** 的统一标准接口，解耦了数据源、IDE、开发工具与 Agent 引擎 [14]。

### 2. 多智能体通信协议化：[Google Agent-to-Agent (A2A) Protocol](#concept-a2a) (2025)
- 跨系统多 Agent 交互从框架级硬编码走向开放网络传输层协议。
- 智能体间通过统一的认证、握手与 JSON-RPC/Event-Stream 机制实现跨域远程任务委派 [15]。

### 3. Agent 运行环境操作系统化：[Agent Harness & Runtime 沙箱](#concept-harness-sandbox) (Meng et al., 2026)
- 2026 年最新综述表明 [16]，生产级 Agent 已普遍具备操作系统级的调度能力：
  - [**MemoryOS 抽象**](#concept-memoryos) 与动态上下文压缩
  - [**Agent Runtime 沙箱隔离 (Docker / gVisor)**](#concept-harness-sandbox)
  - 算力经济学与安全鉴权隔离

---

## 四、 现代生产级五层架构图谱 (2026 产业共识)

综合 2023–2026 年的文献与生产落地标准，收敛出的现代五层架构如下：

### 第 5 层：控制与协议层 (Control & Protocols)
- 人工干预与安全熔断 (Human-in-the-Loop)
- 分布式多智能体通信协议 ([Google A2A Standard](#concept-a2a))
- 图工作流与持久化状态机 ([State Graph & Checkpoint](#concept-state-graph))

### 第 4 层：感知与输入层 (Perception & Input)
- 多模态 [**VLM 视觉感知映射与 Computer Use**](#concept-vlm-computer-use)
- 系统与 UI 交互操作 (Anthropic Computer Use / DOM / ADB)

### 第 3 层：工具与执行层 (Tools & Execution)
- 统一工具与上下文连接标准 ([Anthropic MCP Standard](#concept-mcp))
- [**安全沙箱执行环境 (Docker / gVisor / WASM)**](#concept-harness-sandbox)
- 智能重试与熔断降级

### 第 2 层：记忆与知识管理层 (Memory & RAG)
- 上下文窗口动态压缩与摘要
- 混合检索 (Hybrid RAG: Dense + Sparse + Knowledge Graph)
- [**MemoryOS 分层记忆体系**](#concept-memoryos) (Episodic & Procedural Memory)

### 第 1 层：大脑与推理计划层 (Brain & Planning)
- 任务拆解与逻辑推理 (Task Decomposition)
- 树状与图状规划搜索 ([LATS / MCTS](#concept-tot-lats) / [ReAct](#concept-react))
- 多模型协同路由与 Reasoning Tokens 控制

---

## 五、 主流工程模式与代表框架选型 (2026 实践落地)

在实际工程落地的过程中，现代 Agent 架构主要落地为 3 种主流工程范式：

### 1. 状态图模式 ([State Graph & Workflow](#concept-state-graph)) —— 工业级落地绝对主流
- **核心机制**：将 Agent 逻辑显式表示为“有向图 (DAG)”，节点为计算与工具调用，边为逻辑分支与状态转移。
- **代表框架**：
  - **LangGraph** (LangChain 团队)：生产落地首选，支持状态持久化 ([Checkpoint](#concept-state-graph))、时间旅行调试与人工干预 (Human-in-the-Loop)。
  - **LlamaIndex Workflows**：基于事件驱动 (Event-Driven) 的图流程，与 RAG 知识检索深度绑定。
- **适用场景**：金融审批、政企长流程自动化、高稳定性要求的商业系统。

### 2. 多智能体协作模式 ([Multi-Agent Collaboration / SOP](#concept-multi-agent-sop)) —— 复杂任务拆解首选
- **核心机制**：将复杂岗位角色化，通过 [SOP（标准作业程序）](#concept-multi-agent-sop) 或对话消息传递完成交付。
- **代表框架**：
  - **CrewAI**：提出“角色 (Role) + 任务 (Task) + 团队 (Crew)”的高层抽象，上手门槛低。
  - **AutoGen / AG2** (微软)：底层的消息传递框架，支持高自由度多智能体群聊。
  - **MetaGPT**：将软件工程 SOP 融入 Agent，可直接生成完整代码仓库。
- **适用场景**：自动化代码生成、深度市场调研、多视角协同分析。

### 3. 协议驱动接入模式 (Protocol-Driven Standard) —— 生态解耦标配
- **核心机制**：通过统一协议将 Agent 执行引擎与具体的工具、外部 Agent 解耦。
- **代表框架与规范**：
  - [**Anthropic MCP SDK**](#concept-mcp)：本地/远程数据源与 API 的标准对接。
  - [**Google A2A SDK**](#concept-a2a)：跨网络、跨系统 Agent 的远程通信握手。
- **适用场景**：IDE 开发插件（Cursor/Cline）、企业中台连接、跨部门 Agent 协作。

---

## 六、 核心概念解毒与现实类比指南

为了避免技术术语停留于抽象大词，本节将整篇文章中涉及的所有核心技术概念，**严格按照其在正文中首次出现的先后顺序**集中汇总，提供“极简定义 + 现实类比 + 动手验证”。在正文中点击任何高亮概念均可自动跳转至此处。

---

### <span id="concept-react"></span>1. ReAct (Reasoning + Acting)
- **正文出现位置**：第一章（大脑与规划）
- **极简定义**：一种让 Agent 兼具“思考”与“行动”的循环推理框架（Thought -> Action -> Observation）。
- **现实类比**：**解复杂数学题时的草稿纸**。不能只拍脑门直接写答案（容易幻觉），必须按“思考第一步 -> 用计算器算出数值 -> 查看结果 -> 思考第二步”的节奏推进。
- **动手验证**：向 LLM 提问并要求：“必须严格使用【Thought】思考下一步、【Action】调用工具、【Observation】观察结果的格式一步步解答。”观察模型的推理日志。

---

### <span id="concept-cot"></span>2. CoT (Chain-of-Thought, 思维链)
- **正文出现位置**：第一章（大脑与规划）
- **极简定义**：通过引入中间推理步骤（Let's think step by step），引导大模型将复杂问题拆解为多步连续推导。
- **现实类比**：**解数学大题时要求“写出解题步骤”**。不直接抄最终答案，写明第一步、第二步，既便于自己推演，也避免脑补逻辑跳跃。
- **动手验证**：对 LLM 输入“小明有 5 个苹果，吃了 2 个后又买了 3 个，给小红 1 个，他还有几个？请一步步思考并给出解题步骤。”观察中间推理链路。

---

### <span id="concept-memoryos"></span>3. MemoryOS 与动态上下文压缩
- **正文出现位置**：第一章（记忆系统）
- **极简定义**：一种在有限上下文窗口（Context Window）限制下，兼顾“短期对话”与“长期知识检索（RAG/MIPS）”的记忆操作系统。
- **现实类比**：**人类的长短期记忆机制**。今天早饭吃了什么（短期记忆，几天后自动过期）；你的专业知识与技能（长期档案，随时检索）。
- **动手验证**：在连续对话 30 轮后，触发系统的 Summary 压缩机制，然后询问：“我们在第 2 轮提到的核心需求是什么？”验证其能否通过压缩摘要或长时检索调回细节。

---

### <span id="concept-function-calling"></span>4. Function Calling 与 Toolformer
- **正文出现位置**：第一章（工具调用）
- **极简定义**：模型不再直接返回自然语言文本，而是按照 Schema 格式输出 API 名称及参数，交由宿主环境安全执行。
- **现实类比**：**填单交差**。模型不直接拿锤子去修墙，而是把“维修工具名”和“坐标位置”填在工单里交给工人去跑。
- **动手验证**：给 LLM 定义一个 `get_weather(location: string)` 的函数定义，向其提问“北京天气如何？”，检查模型是否返回标准的 JSON 结构而非普通文本。

---

### <span id="concept-reflection"></span>5. Reflection（反思与自我纠偏）
- **正文出现位置**：第二章（Agentic Reasoning 四大模式）
- **极简定义**：Agent 在输出最终答案前，自我检查错误并进行二次修订的推理过程。
- **现实类比**：**交卷前检查试卷的学霸**。写完作文后自己重新读一遍，发现有一处语法错误和事实漏洞，主动划掉并修正。
- **动手验证**：提示词中加入：“请先生成初稿，然后扮演一位严格的审核员指出初稿的三个缺点，最后输出修改后的终稿。”

---

### <span id="concept-tot-lats"></span>6. Tree of Thoughts (ToT) 与 LATS (语言智能体树搜索)
- **正文出现位置**：第二章（规划模式）
- **极简定义**：将单一的线性推理扩展为树状/图状分支探索，结合搜索算法（如 MCTS）评估最佳路径。
- **现实类比**：**下围棋时的“复盘与往前想五步”**。遇到岔路口时，同时思考方案 A、B、C 之后的三步走法，选择胜率最高的一条路线推进。
- **动手验证**：让模型解决一道逻辑推理解密题，要求：“针对当前局面提出 3 个不同的猜测方向，分别推演其可能后果，最后选择最合理的一个方向继续。”

---

### <span id="concept-multi-agent-sop"></span>7. Multi-Agent SOP (多智能体协作)
- **正文出现位置**：第二章（多 Agent 协作）
- **极简定义**：将企业中的 SOP（标准作业程序）拆解给多个专职 Agent，通过规则化的消息路由完成复杂交付。
- **现实类比**：**流水线工厂**。产品经理 Agent 写需求 -> 架构师 Agent 设计图纸 -> 程序员 Agent 写代码 -> 测试员 Agent 跑测试，环环相扣。
- **动手验证**：在 CrewAI 中定义 Researcher 和 Writer 两个角色，给 Researcher 分配搜索任务，将其 Output 自动传递给 Writer 作为输入生成文章。

---

### <span id="concept-mcp"></span>8. Anthropic MCP (Model Context Protocol)
- **正文出现位置**：第三章（工具与上下文层协议化）
- **极简定义**：一种将“大模型”与“外部工具/数据”解耦的标准接口协议。
- **现实类比**：**电子设备上的 Type-C 接口**。以前每个软件都需要手写专属的接头（胶水代码）；有了 MCP，只要把 Server 插件插上，所有 Agent 都能直接读写文件或数据库。
- **动手验证**：在支持 MCP 的 IDE（如 Cursor）中开启一个本地 File MCP Server。在对话框输入“总结 `src/` 下的代码结构”，观察模型是否能在不手动复制粘贴的前提下，直接读取本地文件。

---

### <span id="concept-a2a"></span>9. Google A2A Protocol (Agent-to-Agent)
- **正文出现位置**：第三章（多智能体通信协议化）
- **极简定义**：跨厂商、跨框架智能体在网络上传输任务与协同消息的传输层协议规范。
- **现实类比**：**互联网上的 HTTP 协议**。腾讯的服务器和百度的服务器技术栈不同，但通过 HTTP 就能互相发送 JSON 请求。A2A 让 LangGraph 的 Agent 能无缝调用 AutoGen 的 Agent。
- **动手验证**：在代码中建立“程序员 Agent”与“审核员 Agent”。程序员 Agent 生成代码后封装为标准化 Payload 传给审核员 Agent，审核员反馈修改意见后再送回，观察双智能体通信日志。

---

### <span id="concept-harness-sandbox"></span>10. Agent Harness & Runtime 沙箱 (Docker / gVisor)
- **正文出现位置**：第三章（Agent Harness & OS）
- **极简定义**：为 Agent 执行代码或操作系统命令时提供的安全隔离运行环境与生命周期调度器。
- **现实类比**：**化学实验室的通风橱与防爆隔离罩**。Agent 在里面做危险实验（如运行未知 Python 脚本、删除文件），就算爆炸也不会破坏外面的宿主系统。
- **动手验证**：在 Docker 容器内运行由 Agent 生成的 Bash 脚本，执行完毕后销毁容器，确保宿主机环境零污染。

---

### <span id="concept-state-graph"></span>11. State Graph & Checkpoint (状态图与断点恢复)
- **正文出现位置**：第四章（控制层）/ 第五章（工程模式）
- **极简定义**：用图论表示 Agent 的执行路径，并通过 Checkpoint 技术保存每一步的状态节点。
- **现实类比**：**单机游戏里的“随时存档 (Save/Load)”**。玩到半路突然断电或报错，可以加载上一个存档点继续玩，而不需要从头开始。
- **动手验证**：在 LangGraph 中定义一个包含 5 个节点的图，在第 3 个节点故意抛出异常，触发 Checkpoint 加载第 2 节点的状态并重新运行。

---

### <span id="concept-vlm-computer-use"></span>12. VLM 视觉感知映射与 Computer Use
- **正文出现位置**：第四章（感知与输入层）
- **极简定义**：Agent 利用多模态视觉模型直接识别屏幕 UI 元素（DOM 树 / 坐标 / ADB），像人类一样操作鼠标和键盘。
- **现实类比**：**给 AI 装上一双眼睛和一只手**。看着电脑屏幕点击按钮、输入文本，而不是依赖底层数据 API。
- **动手验证**：向具备 Vision 能力的 Agent 传入一张网页截图，命令其“点击右上角的登录按钮”，观察其返回的相对坐标 (X, Y)。

---

## 七、 参考文献与权威标准

- [1] Weng, Lilian. (2023). "LLM-powered Autonomous Agents". *Lil'Log*.
- [2] Yao, S., et al. (2023). "ReAct: Synergizing Reasoning and Acting in Language Models". *ICLR 2023*.
- [3] Wei, J., et al. (2022). "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models". *NeurIPS 2022*.
- [4] Schick, T., et al. (2023). "Toolformer: Language Models Can Teach Themselves to Use Tools". *NeurIPS 2023*.
- [5] Ng, Andrew. (2024). "The Four Design Patterns for AI Agentic Workflows". *DeepLearning.AI*.
- [6] Madaan, A., et al. (2023). "Self-Refine: Iterative Refinement with Self-Feedback". *NeurIPS 2023*.
- [7] Shinn, N., et al. (2023). "Reflexion: Language Agents with Verbal Reinforcement Learning". *NeurIPS 2023*.
- [8] Patil, S. G., et al. (2023). "Gorilla: Large Language Model Connected with Massive APIs". *arXiv:2305.15334*.
- [9] Yao, S., et al. (2023). "Tree of Thoughts: Deliberate Problem Solving with Large Language Models". *NeurIPS 2023*.
- [10] Zhou, A., et al. (2024). "Language Agent Tree Search (LATS)". *ICML 2024*.
- [11] Wu, Q., et al. (2023). "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation". *arXiv:2308.08155*.
- [12] Hong, S., et al. (2024). "MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework". *ICLR 2024*.
- [13] Anthropic. (Nov 2024 - 2026). "Introducing the Model Context Protocol (MCP)". *Anthropic Official Announcement & Specification*.
- [14] Murag, Mahesh. (2025). "Building Agents with Model Context Protocol". *AI Engineer Summit*.
- [15] Gravitee / Google. (2025–2026). "Google's Agent-to-Agent (A2A) Protocol Standard Definition".
- [16] Meng, Qianyu., et al. (Mar 2026). "Agent Harness for Large Language Model Agents: A Survey". *arXiv Preprints (doi:10.20944/preprints202604.0428.v3)*.
