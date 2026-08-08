---
title: "Agent 感知与输入层：从多模态 VLM 到 GUI Agent 的\"眼睛\"进化之路"
description: "系统拆解 Agent 五层架构第 4 层——感知与输入层：从多模态 VLM 的发展历程（CLIP→Flamingo/BLIP-2/LLaVA→Gemini/GPT-4o 原生多模态）与视觉 tokenization 底座，到 GUI 感知三条接口（DOM/AXTree/截图），再到 OmniParser 屏幕解析与 UI-TARS 原生 GUI Agent 模型，以及感知评测基准与工程挑战，并以 LogicAI2 为例给出文本型 Agent 的感知扩展路径。"
tags: ["Agent","Perception","VLM","GUI Agent","UI-TARS","OmniParser","多模态","CLIP","LLaVA","GPT-4o","LogicAI2"]
slug: "agent-perception-layer-input-evolution"
series: "Agent 架构演化系列"
pubDate: "2026-08-03"
seriesOrder: 5
articleStyle: technical
lang: zh
---

## 引言：会想、会记、会动手，但还"看不见"

前四篇我们依次拆解了 Agent 的大脑层（怎么想）、记忆层（怎么记）、工具层（怎么做）。但一个只会想、记、做的 Agent，如果**看不见**环境，就永远只能活在文本世界里——它读不了屏幕、看不懂图表、无法理解一个网页长什么样，更不可能像人一样操作电脑或手机。

这正是五层架构中的**第 4 层：感知与输入层（Perception & Input）**。它位于大脑层与真实世界之间，是 Agent 的"眼睛和耳朵"：负责把视觉、语音、视频、文档等非语言信号，转换成大脑层能够推理的结构化表示。

这一层的进化主线比前三层更陡峭，因为它在短短三年内完成了从"外挂文本转换器"到"端到端原生感知模型"的跨越：

```
多模态 VLM 底座（CLIP → 拼接式 VLM → 原生多模态，模型学会"看图"）
  → GUI 感知三接口（DOM / Accessibility Tree / 截图）
    → 屏幕解析器（OmniParser：像素 → 结构化元素）
      → 原生 GUI Agent 模型（UI-TARS：感知与行动合一）
        → 感知评测基准（ScreenSpot / OSWorld / AndroidWorld）
```

这篇文章沿着这条线逐站拆解：多模态感知的底座原理与其发展历程、GUI 感知的三条技术路线、纯视觉路线的技术栈解剖、原生 GUI Agent 模型的演进与数据、感知评测基准的口径陷阱、以及感知层的工程挑战。最后以 LogicAI2 为例，讨论一个纯文本型 Agent 如何逐步扩展出自己的"感知"。

---

## 第一站：感知的底座 —— VLM 如何"看见"世界

### 一切从"模态翻译"开始

语言模型只能消费 Token。要让 Agent 感知图像，本质上只有两条路——CoALA（arXiv:2309.02427）把它概括为**两种不同的 tokenization 方案**：

| 方案 | 机制 | 代表 | 特点 |
|---|---|---|---|
| **模块化（Modular）** | 用独立的 image-to-text 模型把图像先转成文字描述，再喂给语言模型 | 早期 GUI Agent 的 GUI Perceiver、OCR + 描述管线 | 简单、兼容任意 LLM，但有损（丢失空间细节） |
| **集成式（Integrated）** | 把图像 Patch 直接投影进 LLM 的表示空间，模型原生理解像素 | GPT-4V、Gemini、Qwen-VL、UI-TARS | 保真、支持 grounding，但推理与感知深度耦合 |

CoALA 明确指出：模块化方案"绕过了有损的图像到文本转换"，但代价是"把推理和规划过程与模型的输入模态紧紧绑定"。用更直白的话说——**感知不是附加功能，而是模型架构的一部分**。这就是为什么多模态 VLM 是感知层的底座。

而现实世界的演进，恰好沿着"从模块化到集成式"这条理论路径完成了三级跳——过去三年多模态模型的进化史，就是感知层底座能力的历史。

### 多模态 VLM 的三年进化：从"看懂"到"原生"

```
CLIP（对齐时代，2021.01）           模型学会"图文配对"
  → Flamingo / BLIP-2 / LLaVA（拼接时代，2022–2023）
                                    视觉编码器 + 桥接层 + LLM（组装电脑）
    → Gemini / GPT-4o / GPT-5（原生时代，2023.12–）
                                    统一架构原生处理所有模态（一体化设计）
```

#### 第一幕：对齐时代（2021）—— 让模型"看懂"图文关系

2021 年 1 月，OpenAI 发布 **CLIP**（arXiv:2103.00020），用**对比学习**在大规模图文对上训练：拉近"图片 + 正确描述"的表示、推远"图片 + 错误描述"的表示，最终得到一个图文共享的语义空间。它让模型第一次具备**零样本图像分类**能力——用自然语言描述类别即可分类，无需任务专属标注，这直接改变了工业界"每个任务标一批数据"的成本结构。

但 CLIP 有根本局限：它只能做图文**匹配与检索**，无法开放式视觉问答（VQA）或生成描述。用行业的话说：**CLIP 让模型"看得懂"，但说不出来**。要"看懂并说出来"，需要下一代视觉语言模型（VLM）。

#### 第二幕：拼接时代（2022–2023）—— 组装电脑

2022–2023 年，三条几乎平行的路线把"看懂"升级为"看懂 + 会说 + 能答"：

**Flamingo（2022.04，DeepMind，arXiv:2204.14198）**：开创"冻结大模型 + 桥接"范式——冻结预训练 LLM 不动，用 **Perceiver Resampler（交叉注意力）**把视觉特征压缩成少量 token 注入 LLM 各层，实现少样本视觉对话。它的意义在于证明：**无需重训 LLM，也能获得多模态能力**。

**BLIP-2（2023.01，Salesforce，arXiv:2301.12597）**：把"桥接"进一步抽象为 **Q-Former**——一个轻量信息瓶颈，用少量可学习 query 从冻结的视觉编码器中"萃取"关键特征，再映射给冻结的 LLM。论文报告它在 VQAv2 零样本上比 Flamingo-80B 高 8.7 个点，而可训练参数少 54 倍——**四两拨千斤**。

**LLaVA（2023，视觉指令微调，arXiv:2304.08485）**：确立**视觉指令微调**范式——用 GPT-4 构造图文指令数据，CLIP ViT + 线性投影层 + Vicuna（LLaMA 微调）两阶段训练（先对齐特征、再指令微调）。它把"指令微调"从纯文本世界复制到多模态世界，是开源多模态的引爆点；后续 MiniGPT-4、InstructBLIP 均沿用此范式。

同期，**GPT-4 于 2023 年 3 月发布**（接受文本 + 图像输入），**2023 年 9 月 25 日图像能力以 GPT-4V 形式向 ChatGPT 开放、11 月 6 日开放 API**——商用级视觉理解由此走向大众，也成为 GUI Agent 早期事实上的感知引擎。

拼接式的本质是"**组装电脑**"：视觉编码器（显卡）、LLM（CPU）、投影层（主板总线）都是现成的，便宜灵活、迭代快。但代价也很明确：信息有损（视觉特征要压成少量 token）、模态间协作弱、延迟高（音频要"语音→文本→LLM→文本→语音"接力）。

#### 第三幕：原生时代（2023.12 至今）—— 一体化设计

2023 年 12 月 6 日，Google 发布 **Gemini 1.0**——首个宣称"**原生多模态**"（Natively Multimodal）的模型家族：从设计之初就在文本、图像、音频、视频上联合训练，而不是拼接单模态模型。两个多月后（2024.02.15）**Gemini 1.5 Pro** 把上下文推到百万 token（详见下节）。

2024 年 5 月 13 日，OpenAI 发布 **GPT-4o**（"o" = omni）：**首个端到端训练的原生多模态模型**，文本/图像/音频统一进一个模型，实现实时语音对话（无需"语音→文本"接力），MMLU 88.7（GPT-4 为 86.5），128K 上下文，支持 50+ 语言、覆盖约 97% 说话人口。

2025 年 8 月 7 日，**GPT-5** 把多模态与推理统一进一个系统：实时路由器在"快速模型"与"深度思考模型（GPT-5 thinking）"之间动态调度，400K 上下文——多模态不再是一个"能力标签"，而是基础模型的默认形态。至 2026 年，Gemini 3 / GPT-5.5 / Claude 4.5 等已把"原生多模态"变成行业标配，实时交互与 3D 理解成为新战场。

原生式的本质是"**一体化设计**"（类比：组装电脑 → SoC 异构融合）：统一 tokenizer + 联合训练，信息无损、模态协同、低延迟。代价是训练与推理成本远高于拼接式——这也是 2025 年《Scaling Laws for Native Multimodal Models》（arXiv:2504.07951）集中研究的问题。

#### 三大对齐技术：让不同模态"说同一种语言"

无论拼接还是原生，"多模态对齐"都是核心难题。行业沉淀出三大技术路线：

| 对齐技术 | 代表 | 机制 |
|---|---|---|
| **对比学习** | CLIP | 拉近图文对、推远非配对，学共享语义空间 |
| **交叉注意力** | Flamingo | Perceiver Resampler 把视觉特征压缩成少量 token，注入 LLM 各层 |
| **信息瓶颈** | BLIP-2 | Q-Former 用少量可学习 query 从视觉编码器中萃取关键特征 |

这三条路线后来统一收敛：拼接时代的桥接层，在原生时代被"直接投影进统一表示空间"取代——但"压缩视觉信息、对齐到语言空间"的核心思想一直延续至今。

#### 为什么这对 GUI 感知至关重要

这段演进对 Agent 感知层的意义是决定性的：**拼接式 VLM 的感知是"二手转述"（视觉 → 少量 token → LLM），原生 VLM 的感知是"一手的"（像素直接进模型）**。GUI grounding 恰恰需要最高的感知保真度——1 个像素的偏差就点错按钮。这就是为什么 GUI Agent 赛道几乎全部押注原生多模态（UI-TARS、GPT-4o、Gemini），而早期依赖 OCR + 描述的 GUI Perceiver 路线被快速淘汰。理解这条"从对齐到原生"的主线，是理解后面所有 GUI 感知技术的前提。

### 视觉 Patch 与百万 Token 上下文

集成式 VLM 的处理管线本质上是：图像 → 切块（Patch）→ 视觉编码器（ViT）→ 投影到文本表示空间 → 与文本 Token 一起进入 Transformer。图像在这里被"数字化"了：一张图 = 一组视觉 Token，与文本 Token 交错输入。

这个能力在 Gemini 1.5 上被推到极致：通过将视觉 Patch 稀疏化压缩，Gemini 1.5 Pro 实现了**百万级 Token 上下文**，能一口气处理 1 小时视频、11 小时音频或超长文档（arXiv:2403.05530）。这意味着 Agent 的"感知视野"从单张截图扩展到了整段视频、整本 PDF——感知层不再只是"看一眼"，而是"看很久、看很多"。

### 为什么 GUI 是感知层最难的战场

但自然图像理解 ≠ 界面理解。一张猫的照片和一个登录页面对模型的要求完全不同：

- 自然图像：理解"这是什么"即可；
- GUI 界面：必须精确定位"哪个像素属于哪个可交互元素"、理解元素语义（按钮/输入框/图标）、并把意图动作映射到**坐标**。

这就是 **GUI Grounding（界面锚定）**——感知层最硬核的子问题。它要求模型不仅"看懂"，还要"指得准"。

---

## 第二站：GUI 感知的三条路 —— Agent 怎么看屏幕

ACL 2025 的 GUI Agent 综述（arXiv:2411.04890）把 GUI 感知接口归纳为**四类**：accessibility-based、HTML/DOM-based、screen-visual-based、以及混合型。前三条是主路线：

### 路线一：HTML / DOM 解析（网页特化）

直接抓取网页的 DOM 树或 HTML 结构，把可交互元素（链接、按钮、表单）序列化为文本喂给模型。

- **优点**：信息完整、元素关系清晰、零视觉误差；
- **缺点**：只适用于网页；桌面应用、手机 App、Canvas/WebGL 渲染的内容拿不到 DOM；DOM 往往冗长，需要精心的降噪与剪枝。

### 路线二：Accessibility Tree（系统级语义）

操作系统为辅助功能（读屏软件）提供的语义树，描述每个 UI 元素的角色、名称、状态（如 `Button "提交"`、`Checkbox "已阅读"`）。

- **优点**：跨应用统一（Windows UIA、Android Accessibility、macOS AX API）；比 DOM 更接近"人类可理解的语义层级"；**比截图更便宜**——不需要视觉编码；
- **缺点**：依赖应用正确实现无障碍接口；自定义渲染的控件（游戏、Canvas、部分桌面应用）在树里不可见。

### 路线三：纯视觉截图（像人一样看）

直接把屏幕截图交给 VLM，让模型从像素中自己发现元素。

- **优点**：跨平台通用，不依赖任何环境接口；对自定义渲染界面也有效；最接近人类的使用方式；
- **缺点**：对模型感知能力要求最高；高分屏小图标是难点；推理成本最高（视觉 Token 昂贵）。

### 关键洞察：感知的"内化"趋势

GUI Agent 综述里有一个重要概念——**GUI Perceiver**：负责把屏幕转成模型可理解输入的模块。早期单模态 LLM 的 GUI Agent 必须有显式的 Perceiver 模块；而多模态 LLM 出现后，"界面感知变成了模型自身的能力"。

```
显式模块（早期）：截图 → OCR/解析器 → 文本 → 单模态 LLM
模型内化（现在）：截图 → Patch → 多模态 LLM（直接理解）
```

但"内化"不等于"解决"。即便是 GPT-4V 级别的模型，面对高分辨率屏幕上的小图标，定位精度也远不够用——这正是第三站屏幕解析器存在的理由。

---

## 第三站：纯视觉路线的技术栈 —— 从像素到可操作元素

### OmniParser：给通用 VLM 配一副"读屏眼镜"

2024 年 10 月，微软研究院发布 **OmniParser**（arXiv:2409.11103），核心命题非常朴素：**GPT-4V 这类模型的 GUI 能力被严重低估了，缺的只是可靠的屏幕解析**。OmniParser 是一个轻量屏幕解析模块，把 UI 截图转换成结构化元素，再交给任意 VLM 生成可精确锚定的动作。

它由两个微调模型构成：

```
UI 截图
  ├─ 交互式区域检测模型（Detector）
  │    找出所有"可交互元素"的边界框（bbox）
  └─ 图标语义描述模型（Captioner）
       给每个检测到的元素写功能描述（"这是搜索按钮"）
  ↓
结构化元素列表（bbox + 类型 + 语义 + 可交互性）
  ↓
交给 VLM：模型基于元素列表生成动作，而非凭空猜坐标
```

效果立竿见影：**GPT-4V + OmniParser 在 SeeAssign 上的定位准确率从 70.5% 提升到 93.8%**；在 ScreenSpot 上文本/图标识别准确率提升超过 20%，并超越了 SeeClick、CogAgent、Fuyu 等专门微调的 GUI 模型——**用轻量解析器 + 通用模型，打败了专用模型**。

### OmniParser V2：解析更小、更快、更准

2025 年 2 月发布的 **V2** 进一步强化：

- 更大的交互元素检测数据与图标功能描述数据，能捕捉更高分辨率屏幕上的更小图标；
- 缩小图标描述模型的图像尺寸，**推理延迟降低 60%**；
- 在全新 grounding 基准 **ScreenSpot Pro**（高分辨率 + 微小目标图标）上，**OmniParser V2 + GPT-4o 平均准确率 39.6，而 GPT-4o 裸跑仅 0.8**——相差近 50 倍。

配套的 **OmniTool** 把 OmniParser 与 OpenAI（4o/o1/o3-mini）、DeepSeek（R1）、Qwen（2.5VL）、Anthropic（Sonnet）等模型打包进一个 Docker 化的 Windows 11 虚拟机，开箱即用。

### 坐标 grounding 的两种哲学

屏幕解析最终要解决"动作落在哪"。行业分化出两种哲学：

1. **坐标 grounding（像素级）**：模型输出绝对/相对坐标，如 `click (x=512, y=340)`。优点是直接；缺点是分辨率变化、窗口缩放都会破坏坐标有效性——**坐标是脆弱的**。
2. **语义 grounding / 坐标无关**：模型输出"点击名为'提交'的按钮"这种语义定位，由执行层负责把语义映射回真实坐标。微软 2026 年的 **GUI-Actor** 走的就是这条路线：其 7B 模型 + Verifier 在 ScreenSpot 上平均 89.7，超过 UI-TARS-7B 的 89.5，且对布局变化更鲁棒。

---

## 第四站：原生 GUI Agent —— 感知与行动合一

如果说 OmniParser 是"外挂眼镜"，那么 **UI-TARS** 系列代表的是另一条路线：**把感知、推理、grounding、记忆全部融进一个端到端 VLM**，直接看图、直接输出动作。字节跳动 Seed 团队的这套模型是目前 GUI Agent 感知与执行一体化的标杆。

### UI-TARS-1（2025.01）：原生 GUI Agent 的开山之作

UI-TARS-1（arXiv:2501.12326）提出一个关键论断：**纯截图输入 + 人类式交互（键盘/鼠标），端到端训练，可以打败依赖大量提示词工程包装的商业模型框架**。它通过大规模屏幕截图数据增强感知，在 10+ 个 GUI 基准上取得 SOTA：

| 基准 | UI-TARS-1 | 对比 |
|---|---|---|
| OSWorld（50 步） | **24.6** | Claude 22.0 |
| AndroidWorld | **46.6** | GPT-4o 34.5 |

### UI-TARS-1.5（2025.04）：开源 7B，能力跃升

| 基准 | UI-TARS-1.5 |
|---|---|
| OSWorld（100 步） | **42.5** |
| Windows Agent Arena（50 步） | **42.1** |
| Android World | **64.2** |
| WebVoyager | **84.8** |
| Online-Mind2Web | **75.8** |

### UI-TARS-2（2025.09）：多轮强化学习，全面超越

UI-TARS-2（arXiv:2509.02544）用**多轮强化学习（Multi-Turn RL）**解决了数据规模化、训练稳定性、环境稳定性三大挑战，在所有基准上全面超越前代与闭源对手：

| 基准 | UI-TARS-2 | 对比 |
|---|---|---|
| OSWorld | **47.5** | Claude 3.7 为 28，OpenAI CUA 为 36.4 |
| Windows Agent Arena | **50.6** | 前代 SOTA 29.8 |
| AndroidWorld | **73.3** | 前代 SOTA 59.5 |
| Online-Mind2Web | **88.2** | OpenAI CUA 为 71 |
| 15 款游戏平均 | **59.8** | 约为人类水平的 60% |

技术报告里还有几个工程要点值得记录：

- **PPO 稳定优于 GRPO**：在多轮 GUI Agent RL 中，PPO 的稳定性与奖励质量全面胜过 GRPO——这与 DeepSeek-R1 在推理场景偏好 GRPO 形成了有趣的对照，说明 RL 算法的选择高度依赖任务形态；
- **GUI-SDK 混合环境**：让模型同时学习"纯 GUI 操作"与"GUI + SDK（文件系统/终端）"两种接口，知识可以迁移，OSWorld 提升 +10.5%、AndroidWorld +8.7%；
- **W4A8 量化**：把生成速度从 29.6 提升到 47 tokens/s、单轮延迟从 4.0 秒降到 2.5 秒，OSWorld 仅从 47.5 微降到 44.4——**感知模型的部署成本正在快速下降**。

### 生态全景：不止 UI-TARS

感知层已经是一个拥挤的赛道：

| 模型/项目 | 机构 | 定位 |
|---|---|---|
| CogAgent | 清华/智谱 | 18B GUI VLM，高分辨率编码（2023.12） |
| SeeClick | 阿里 | 截图为唯一输入的 grounding 模型（2024.01） |
| Ferret-UI | Apple | 移动 UI 理解，引用 + grounding（2024.04） |
| OS-Atlas | — | 通用 GUI grounding 基础模型 |
| Qwen2.5-VL | 阿里 | 开源多模态，含 GUI grounding 能力 |
| Open-AutoGLM | 智谱 | 开源手机端 Phone Use Agent，视觉驱动 App 交互 |
| UI-Venus | 阿里 | RFT 训练的高性能 UI Agent（2025.08） |

---

## 第五站：怎么量化"看得懂" —— 感知评测基准

感知层的评测基准有一个重要分野：**测"指得准"（grounding）还是测"办得成"（task completion）**。

### Grounding 类：测感知精度

- **ScreenSpot**：600+ 条截图推断，覆盖移动/桌面/网页三平台，测文本与图标元素的定位准确率；
- **ScreenSpot Pro**：高分辨率屏幕 + 微小目标图标，难度陡增——GPT-4o 裸跑仅 0.8，是感知精度的试金石；
- **SeeAssign / GUI-Opedia**：GUI 元素理解与分配类基准。

### 任务完成类：测感知 + 规划 + 执行的综合能力

- **OSWorld**：桌面完整任务（打开文件、编辑文档、操作系统设置），是 Computer Use 的事实标准；
- **Windows Agent Arena**：Windows 环境的多任务基准；
- **AndroidWorld / AndroidArena / MobileWorld（ACL 2026）**：手机端任务，MobileWorld 强调真实 App 与确定性评估；
- **Online-Mind2Web / WebVoyager**：真实网页任务。

### 评测口径陷阱

对比模型时必须警惕三类差异：

1. **步数限制**：UI-TARS-1 在 OSWorld 50 步得 24.6，UI-TARS-1.5 在 100 步得 42.5——步数预算翻倍，得分可以差近一倍；
2. **环境版本**：OSWorld 的 Windows 镜像、App 版本不同，结果不可直接比较；
3. **自报 vs 第三方**：厂商自报数据与第三方复现常有出入，横向对比需回到同一评测脚本。

---

## 第六站：感知层的工程挑战

### 挑战一：分辨率与"小图标困境"

高分屏（4K、Retina）上的小图标对视觉编码是灾难：Patch 切分后图标可能只占几个 Token 的像素。ScreenSpot Pro 上 GPT-4o 的 0.8 分就是这一困境的极端体现。解法包括更高分辨率的动态编码、检测模型的预定位（如 OmniParser 先圈出可交互区域，再放大识别）。

### 挑战二：动态内容与长时序

滚动、弹窗、加载动画、页面跳转——屏幕是**动态**的。一次截图只是快照，Agent 需要连续观测才能理解状态变化。GUI-World 等视频级基准开始把感知从"单帧"推向"视频流"，对模型的时序理解提出新要求。

### 挑战三：多模态融合的性价比

混合感知（截图 + DOM/AXTree）通常比纯视觉更准（UFO2 等系统把 UIA 树与 OmniParser 融合，OSWorld-W 成功率从 14.3% 提到 22.4%），但成本更高、管线更复杂。工程上的核心决策是：**在哪个环节用哪种模态**——静态元素用 AXTree（便宜），自定义渲染用视觉（兜底）。

### 挑战四：延迟与成本

视觉 Token 是文本 Token 的好几倍贵。UI-TARS-2 的 W4A8 量化、OmniParser V2 的 60% 延迟削减，都是感知层降本的典型手段。生产系统通常需要"感知预算"：能不用视觉就不用，用了就尽量少用。

### 挑战五：感知幻觉与信任

视觉模型同样会幻觉——把不存在的按钮"看"出来，或把按钮语义理解错。感知错误会直接传导为行动错误，且比文本幻觉更难被发现。信任机制（置信度输出、执行前校验、人工确认）是感知层上线的必备件。

---

## 与 LogicAI2 的结合：纯文本 Agent 的感知扩展路径

### 当前状态：文本感知的"单通道"

LogicAI2 目前是**文本/工具型 Agent**：它的"感知"来自 `web_search`（检索网页文本）、`url_read`（读取页面正文）、`retrieve_papers`（检索论文库）——本质上都是把世界转成文本再喂给大脑层。这在信息检索场景足够，但面对图像、截图、视频、GUI 环境时，感知通道完全缺失。

### 扩展路径：三阶段渐进

**Phase A：文本感知增强（低门槛，立即可做）**

- 用 `url_read` 解析网页时保留结构化信息（标题层级、表格、链接），而不是只取正文；
- 对 PDF/文档类输入做版面解析，把"图片 + 表格 + 正文"结构化后再检索；
- 这是现有 ToolRegistry 能力的延伸，不需要视觉模型。

**Phase B：静态图像理解（接入视觉模型）**

- 在工具层注册一个 `understand_image` 工具：传入图片 URL/路径，调用视觉模型返回"内容描述 + 元素定位"；
- 应用场景与你正在做的 AI 内容创作直接相关：截图理解、素材分析、AI 漫剧分镜的画面语义提取；
- 多模态底座选型可直接参考第一站的演进结论：优先选原生多模态 API（GPT-4o 级或 Gemini 级），避免走"OCR + 描述"的拼接老路——拼接路线在有损信息下做素材语义提取，精度天花板太低；
- 注意按第三篇的统一执行网关设计：视觉调用作为只读工具注册，纳入审计。

**Phase C：GUI 自动化（依托安全底座）**

- 参考 OmniParser + 通用 VLM 的组合，或直接采用 UI-TARS / Open-AutoGLM 等开源原生模型；
- 前置条件：统一 Tool Executor（3a）与沙箱策略必须先落地——GUI 操作是写权限动作，必须走审批与审计；
- 可先做"感知只读"场景：让 Agent 截图 + 理解界面，输出操作建议，由人工执行；再逐步放开自动操作。

### 一张表看感知层现状

| 感知能力 | 状态 |
|---|---|
| 文本检索感知（web_search / url_read / retrieve_papers） | ✅ 已有 |
| 结构化文档感知（PDF/表格版面解析） | 🚧 Phase A |
| 静态图像理解（截图描述 + 元素定位） | 🚧 Phase B |
| GUI 实时感知（截图 → 结构化元素） | ⏸️ Phase C（依赖统一执行网关） |
| 原生 GUI Agent 模型（UI-TARS 类） | ⏸️ Phase C（生态引入） |

### 经验教训

1. **感知是有损的，设计时要留"校验口"**：无论走哪条感知路线，从像素到语义的转换都会丢信息。生产系统应在关键动作前增加确认或二次感知（换一个解析器交叉验证）。
2. **不要迷信纯视觉**：DOM/AXTree 在可用时远比视觉便宜可靠；视觉是兜底与泛化手段，不是默认手段。
3. **感知与执行的边界要清晰**：感知层负责"看懂"，执行层负责"做对"。把感知结果直接当行动依据，等于跳过校验——这正是 GUI Agent 事故的主要来源。
4. **选底座要看清"拼接 vs 原生"**：多模态模型的发展史就是"从组装电脑到一体化设计"的收敛史。短期省钱走拼接路线可以，但一旦任务需要高保真感知（GUI、细粒度视觉理解），原生多模态是绕不开的终点——选型时别在旧路线上过度投入。

---

## 总结

感知与输入层的进化，是三条线的合流：

1. **底座线**：从 CLIP 的图文对齐，到 Flamingo/BLIP-2/LLaVA 的拼接式 VLM，再到 Gemini/GPT-4o 的原生多模态——Agent 从"读描述"进化为"看图"，且感知保真度随"拼接→原生"的架构收敛持续提升（Gemini 1.5 百万 Token 多模态是这条线的里程碑）；
2. **接口线**：GUI 感知从 DOM/AXTree 结构化解析，走向纯视觉截图——跨平台通用，但把难题抛给了模型；
3. **模型线**：从"通用 VLM + 外挂解析器"（OmniParser）到"原生 GUI Agent 模型"（UI-TARS 系列），感知、推理、grounding、记忆在模型内部合一，并在多轮 RL 的驱动下持续刷新 OSWorld、AndroidWorld 等基准。

五层架构到这里已经讲完四层：大脑层负责"想清楚"，记忆层负责"记得住"，工具层负责"做得到"，感知层负责"看得见"。**看得见，是做得到的前提**——没有精准的感知，再强的规划与工具也只是盲人摸象。而感知层的最后一块拼图——如何把感知、行动与人工干预编织进一个可控的运行框架——正是第 5 层"控制与协议层"要回答的问题。

---

## 参考文献

- Learning Transferable Visual Models From Natural Language Supervision (CLIP) — arXiv:2103.00020
- Flamingo: a Visual Language Model for Few-Shot Learning — arXiv:2204.14198
- BLIP-2: Bootstrapping Language-Image Pre-training with Frozen Image Encoders and Large Language Models — arXiv:2301.12597
- Visual Instruction Tuning (LLaVA) — arXiv:2304.08485
- GPT-4V(ision) System Card — OpenAI（2023-09）
- Introducing Gemini: our largest and most capable AI model — Google（2023-12-06）
- Gemini 1.5: Unlocking Multimodal Understanding Across Millions of Tokens — arXiv:2403.05530
- Hello GPT-4o — OpenAI（2024-05-13）
- GPT-5 — OpenAI（2025-08-07）
- Scaling Laws for Native Multimodal Models — arXiv:2504.07951
- Cognitive Architectures for Language Agents (CoALA) — arXiv:2309.02427
- OmniParser: A Unified Framework for Text-Guided Object Detection and Screen Parsing — arXiv:2409.11103
- OmniParser V2: Turning Any LLM into a Computer Use Agent（Microsoft Research, 2025-02）
- UI-TARS: Pioneering Automated GUI Interaction with Native Agents — arXiv:2501.12326
- UI-TARS-2 Technical Report: Advancing GUI Agent with Multi-Turn Reinforcement Learning — arXiv:2509.02544
- GUI Agents: A Survey — ACL 2025 Findings (arXiv:2411.04890)
- A Survey on (M)LLM-Based GUI Agents — arXiv:2504.13865
- The Dawn of GUI Agent: A Preliminary Case Study with Claude 3.5 Computer Use — arXiv:2411.10323
- GUI-Actor: Coordinate-Free Visual Grounding for GUI Agents（Microsoft）
- Open-AutoGLM（智谱开源手机端 Agent）— github.com/zai-org/Open-AutoGLM
- ScreenSpot / ScreenSpot Pro 基准（microsoft.github.io/OmniParser）
- OSWorld / Windows Agent Arena / AndroidWorld / Online-Mind2Web / MobileWorld 基准文档
- OSU NLP Group: GUI Agents Paper List — github.com/OSU-NLP-Group/GUI-Agents-Paper-List
