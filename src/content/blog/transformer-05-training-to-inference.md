---
title: 'Transformer 原理（五）：从训练到推理 —— 损失函数、KV Cache 与注意力优化'
description: 'Transformer 系列最终篇。拆解交叉熵损失如何驱动模型学习、KV Cache 如何将推理从 O(n²) 降到 O(n)、MQA/GQA 如何压缩 KV Cache 的显存占用、Flash Attention 如何用分块计算突破显存瓶颈。'
category: 'tech'
tags: ['Transformer', 'AI', '深度学习', '推理优化']
pubDate: '2026-06-07'
heroImage: '../../assets/transformer-05-training-to-inference-hero.png'
lang: 'zh'
---

这是 **Transformer 原理系列**的最终篇。前四篇我们从宏观到微观拆解了 Transformer 的每一个组件——Self-Attention、Multi-Head Attention、位置编码、残差连接、LayerNorm、FFN、Causal Mask、三种架构。

本篇聚焦两个关键问题：**模型怎么学**（损失函数）和**模型怎么快**（推理优化）。

---

## 交叉熵损失（Cross-Entropy Loss）

### 从概率到损失

第四篇我们说过，Decoder-only 模型在每个位置输出一个**词表大小的概率分布**，训练目标是让正确答案的概率尽可能高。那"尽可能高"这个目标，数学上到底怎么定义？

答案就是**交叉熵损失**。

### 数学公式

对于单个位置，模型输出词表上的概率分布 $\hat{y} = [\hat{y}_1, \hat{y}_2, \ldots, \hat{y}_V]$（$V$ 是词表大小），正确答案是一个 one-hot 向量 $y$（只有正确词的位置为 1，其余为 0）。交叉熵定义为：

$$
\mathcal{L} = -\sum_{i=1}^{V} y_i \log \hat{y}_i
$$

因为 $y$ 是 one-hot 的（只有第 $c$ 个位置为 1），这个求和坍缩成：

$$
\mathcal{L} = -\log \hat{y}_c = -\log P(\text{正确词})
$$

就是第四篇给的那个直觉公式——**正确词的概率越高，损失越小**。

### 具体计算例子

```
词表：["我", "爱", "北京", "天安门", "的", ...]  （共 50,000 个词）
正确答案：第 2 个词 "爱"（index = 1）

模型输出的 logits（Softmax 前的原始分数）：
  [2.1, 5.3, 1.8, 0.4, -0.2, ...]

第一步：Softmax 转概率
  P("我")   = e^2.1 / Σ = 0.03
  P("爱")   = e^5.3 / Σ = 0.82    ← 正确词
  P("北京") = e^1.8 / Σ = 0.02
  ...

第二步：算损失
  L = -log P("爱") = -log(0.82) ≈ 0.20

如果模型不自信：
  P("爱") = 0.15  →  L = -log(0.15) ≈ 1.90   ← 损失大，梯度大，模型被大力纠正
  P("爱") = 0.01  →  L = -log(0.01) = 4.61    ← 损失巨大

如果模型很自信：
  P("爱") = 0.95  →  L = -log(0.95) ≈ 0.05   ← 损失很小，几乎不用调
  P("爱") = 0.99  →  L = -log(0.99) ≈ 0.01   ← 接近完美
```

### 整个序列的损失

一个长度为 $n$ 的训练序列，模型在 $n-1$ 个位置各预测一个词，总损失是所有位置的**平均**：

$$
\mathcal{L}_{total} = -\frac{1}{n-1}\sum_{t=1}^{n-1} \log P(x_{t+1} \mid x_1, x_2, \ldots, x_t)
$$

```
序列："今天 天气 真 好"

位置 1：P("天气" | "今天")     = 0.60  →  L₁ = 0.51
位置 2：P("真" | "今天 天气")  = 0.45  →  L₂ = 0.80
位置 3：P("好" | "今天 天气 真") = 0.82  →  L₃ = 0.20

总损失 = (0.51 + 0.80 + 0.20) / 3 = 0.50
```

> 这个平均损失也叫**困惑度（Perplexity）**的对数形式。困惑度 $\text{PPL} = e^{\mathcal{L}_{total}}$，直觉上表示"模型在每个位置平均在几个词之间犹豫"。PPL = 1 表示完全确定（完美），PPL = 50000 表示完全随机猜（最差）。GPT-4 级别的模型在通用文本上 PPL 约 3-8。

### 为什么用交叉熵而不是 MSE？

你可能想：为什么不直接用均方误差（MSE）$\|y - \hat{y}\|^2$？

```
假设词表有 50,000 个词，正确答案是第 42 个词：

one-hot 目标：[0, 0, ..., 0, 1, 0, ..., 0]  （第 42 位是 1）
模型输出：    [0.001, 0.001, ..., 0.82, 0.001, ..., 0.001]

MSE = (0-0.001)² + (0-0.001)² + ... + (1-0.82)² + ... 
    = 49999 × 0.001² + 0.18²
    ≈ 0.0325

问题：49999 个"不是正确答案"的位置贡献的梯度淹没了唯一正确位置的梯度。
     信噪比极低，训练极慢。
```

交叉熵只关注**正确答案的概率** $-\log P(\text{正确词})$，不浪费梯度在其他 49999 个错误选项上——信号集中、训练高效。

---

## KV Cache：推理加速的核心

### 推理的瓶颈：重复计算

第四篇讲过，推理时模型是**自回归**的——每生成一个新词，都要把整个已生成序列重新喂一遍：

```
生成第 1 个词：输入 [BOS]               → 算 Q₁, K₁, V₁ → 输出 "今天"
生成第 2 个词：输入 [BOS, "今天"]        → 算 Q₁,Q₂, K₁,K₂, V₁,V₂ → 输出 "天气"
生成第 3 个词：输入 [BOS, "今天", "天气"] → 算 Q₁,Q₂,Q₃, K₁,K₂,K₃, V₁,V₂,V₃ → 输出 "真"

注意：Q₁, K₁, V₁ 在第 2 步和第 3 步被重新算了！完全浪费！
```

生成第 $n$ 个词时，要对前 $n-1$ 个词的 K 和 V 全部重算。总计算量：

$$
\text{总计算} \propto \sum_{t=1}^{n} t = \frac{n(n+1)}{2} = O(n^2)
$$

### 解决方案：缓存 K 和 V

**核心观察**：由于 Causal Mask 的存在，每个位置的 K 和 V **一旦算出来就不会再变**。位置 1 的 $K_1 = x_1 W^K$ 和 $V_1 = x_1 W^V$ 不管后面生成了什么词，值都是一样的。

所以我们可以**把已算过的 K 和 V 缓存起来**，每一步只算新 token 的 Q、K、V：

```
第 1 步：输入 [BOS]
  算 Q₁, K₁, V₁
  缓存：KV_cache = {K: [K₁], V: [V₁]}
  用 Q₁ 对 [K₁] 做 Attention → 输出 "今天"

第 2 步：输入 ["今天"]  ← 只喂新 token！
  只算 Q₂, K₂, V₂
  缓存更新：KV_cache = {K: [K₁, K₂], V: [V₁, V₂]}
  用 Q₂ 对 [K₁, K₂] 做 Attention → 输出 "天气"

第 3 步：输入 ["天气"]  ← 只喂新 token！
  只算 Q₃, K₃, V₃
  缓存更新：KV_cache = {K: [K₁, K₂, K₃], V: [V₁, V₂, V₃]}
  用 Q₃ 对 [K₁, K₂, K₃] 做 Attention → 输出 "真"
```

每一步只需要算**一个 token** 的 Q、K、V，然后和缓存中的所有 K、V 做注意力计算。总计算量从 $O(n^2)$ 降到 $O(n)$。

### KV Cache 的显存代价

速度快了，但显存涨了——因为要存所有层、所有头的 K 和 V。

```
KV Cache 显存计算（以 LLaMA 3 70B 为例）：

层数 L = 80
注意力头数 h = 64
每个头的维度 d_k = 128
序列长度 n = 4096
精度：float16（2 bytes）

每层每个 token 的 KV 大小：
  K: h × d_k = 64 × 128 = 8,192 个数 × 2 bytes = 16 KB
  V: 同上 = 16 KB
  每层每 token：32 KB

所有层：
  80 层 × 32 KB = 2,560 KB ≈ 2.5 MB / token

整个序列：
  4,096 tokens × 2.5 MB = 10 GB  ← 仅 KV Cache 就要 10 GB！

batch_size = 32：
  32 × 10 GB = 320 GB  ← 需要多张 GPU 光存 KV Cache
```

> **KV Cache 的显存占用已经成为大模型推理的主要瓶颈**——模型权重可以多个请求共享，但 KV Cache 是每个请求独占的。这就是为什么需要 MQA/GQA 来压缩它。

---

## MQA / GQA：压缩 KV Cache

### 回顾：标准 Multi-Head Attention (MHA)

第三篇讲过，MHA 中每个头有**独立的** $W^Q_i, W^K_i, W^V_i$。8 个头就有 8 套独立的 K 和 V：

```
标准 MHA（8 头）：
  Head 1: Q₁, K₁, V₁   ← 独立的 K₁, V₁
  Head 2: Q₂, K₂, V₂   ← 独立的 K₂, V₂
  Head 3: Q₃, K₃, V₃   ← 独立的 K₃, V₃
  ...
  Head 8: Q₈, K₈, V₈   ← 独立的 K₈, V₈

KV Cache 大小 ∝ 头数 × 2（K 和 V）
```

### Multi-Query Attention (MQA)

MQA（2019，Google）的想法很激进：**所有头共享一套 K 和 V**，只有 Q 保留独立。

```
MQA（8 头）：
  Head 1: Q₁, K_shared, V_shared   ← 共享！
  Head 2: Q₂, K_shared, V_shared   ← 共享！
  Head 3: Q₃, K_shared, V_shared   ← 共享！
  ...
  Head 8: Q₈, K_shared, V_shared   ← 共享！

KV Cache 缩小到 1/h = 1/8！
```

**直觉**：每个头的 Q 仍然不同——它们用不同的"问题"去查询同一份"知识库"（共享的 K 和 V）。就像 8 个记者参加同一场新闻发布会（共享的 KV），但各自关注不同的角度（独立的 Q）。

**代价**：模型质量会有轻微下降——因为不同头被迫从同一份 KV 中提取信息，表达能力受限。

### Grouped-Query Attention (GQA)

GQA（2023，Google）是 MHA 和 MQA 的折中：**把头分成若干组，每组共享一套 K 和 V**。

```
GQA（8 头，2 组，每组 4 头）：
  ┌─ Group 1 ──────────────────────┐
  │ Head 1: Q₁, K_g1, V_g1        │
  │ Head 2: Q₂, K_g1, V_g1        │ ← 4 个头共享 K_g1, V_g1
  │ Head 3: Q₃, K_g1, V_g1        │
  │ Head 4: Q₄, K_g1, V_g1        │
  └────────────────────────────────┘
  ┌─ Group 2 ──────────────────────┐
  │ Head 5: Q₅, K_g2, V_g2        │
  │ Head 6: Q₆, K_g2, V_g2        │ ← 4 个头共享 K_g2, V_g2
  │ Head 7: Q₇, K_g2, V_g2        │
  │ Head 8: Q₈, K_g2, V_g2        │
  └────────────────────────────────┘

KV Cache 缩小到 2/8 = 1/4！
```

### 三种注意力的对比

| | MHA | GQA | MQA |
|---|---|---|---|
| KV 组数 | $h$（每头独立） | $g$（$1 < g < h$） | **1**（全共享） |
| KV Cache 大小 | $h \times d_k$ | $g \times d_k$ | $d_k$ |
| 相对 MHA 的 Cache 比例 | 100% | $g/h$ | $1/h$ |
| 模型质量 | 最好 | 接近 MHA | 略有下降 |
| 代表模型 | 原始 Transformer, GPT-2 | **LLaMA 2/3, Gemma** | PaLM, StarCoder |

> **LLaMA 3 70B 的 GQA 配置**：64 个 Q 头，8 个 KV 组（每组 8 个 Q 头共享 KV）。KV Cache 缩小到 MHA 的 $8/64 = 1/8$——前面算的 10 GB 变成了约 **1.25 GB**，一下子可控了。

### 显存对比（LLaMA 3 70B，序列长度 4096）

```
              KV Cache 大小   batch=32 时
MHA（64组）：   10.0 GB         320 GB     ← 不可行
GQA（8组）：    1.25 GB          40 GB     ← 2 张 A100 可搞定
MQA（1组）：    0.16 GB          5 GB      ← 极省，但质量有损
```

---

## Flash Attention：突破显存瓶颈

### 标准 Attention 的显存问题

回忆 Attention 的计算：$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right) V$

标准实现中，$QK^T$ 会产生一个 $n \times n$ 的注意力矩阵（$n$ 是序列长度）：

```
序列长度 n = 4,096：
  注意力矩阵大小 = 4096 × 4096 = 16,777,216 个数
  float16 存储 = 32 MB（每个头）
  64 个头 = 2 GB（一层）
  80 层 = 160 GB  ← 光存注意力矩阵就爆了

序列长度 n = 128,000（Claude/GPT-4 级别）：
  注意力矩阵 = 128000² ≈ 160 亿个数
  → 完全不可能整个存下来
```

**问题的根源**：标准实现把 $n \times n$ 的注意力矩阵**完整物化到显存（HBM）**中，然后再做 Softmax 和乘 V。这是 $O(n^2)$ 的显存消耗。

### GPU 显存层次

要理解 Flash Attention，需要先了解 GPU 的存储层次：

```
┌──────────────────────────────────┐
│         HBM（主显存）              │
│   容量大（80 GB），速度慢           │
│   带宽 ~2 TB/s                   │
│                                  │
│   ┌──────────────────────┐       │
│   │    SRAM（片上缓存）     │       │
│   │  容量小（~20 MB）      │       │
│   │  速度极快              │       │
│   │  带宽 ~19 TB/s         │       │
│   └──────────────────────┘       │
└──────────────────────────────────┘

标准 Attention：
  Q, K, V 在 HBM → 算 QK^T → 写回 HBM → 读出来做 Softmax → 写回 HBM → 读出来乘 V
  大量 HBM 读写 → 速度瓶颈是 IO，不是计算

Flash Attention 的核心思路：
  把计算搬到 SRAM 里，分块做，避免把 n×n 矩阵写到 HBM
```

### Flash Attention 的分块策略

Flash Attention（2022，Tri Dao）的核心思路：**不把 $n \times n$ 矩阵存到 HBM，而是分成小块在 SRAM 中计算**。

```
标准 Attention（需要物化 n×n 矩阵）：
  ① 算完整 S = QK^T        → 存到 HBM（n×n）
  ② 对 S 做 Softmax         → 存到 HBM（n×n）
  ③ 算 P × V               → 存到 HBM（n×d）

Flash Attention（分块计算，不物化）：
  把 Q 分成 B_r 行的小块，K/V 分成 B_c 行的小块
  
  对每个 Q 的小块 Q_i：
    对每个 K/V 的小块 K_j, V_j：
      ① 在 SRAM 中算小块 S_ij = Q_i × K_j^T    （B_r × B_c，很小）
      ② 在 SRAM 中做局部 Softmax
      ③ 在 SRAM 中累加 P_ij × V_j 到输出
    用 online softmax 技巧把局部结果正确合并
```

**关键数学技巧——Online Softmax**：

标准 Softmax 需要先算出所有分数的最大值（数值稳定）和总和（归一化），这似乎需要看到完整的一行。但 Online Softmax 通过维护一个**运行中的最大值**和**运行中的指数和**，可以分块递增计算：

$$
m_{new} = \max(m_{old}, m_{block})
$$

$$
\ell_{new} = \ell_{old} \cdot e^{m_{old} - m_{new}} + \ell_{block} \cdot e^{m_{block} - m_{new}}
$$

每处理一个新的 K/V 块，就用上面的公式更新全局统计量，最终得到的结果和标准 Softmax **数学上完全等价**——不是近似，是精确的。

### 效果

```
标准 Attention               Flash Attention
──────────────────           ──────────────────
显存：O(n²)                  显存：O(n)  ← 不存 n×n 矩阵
速度：被 HBM IO 瓶颈限制      速度：减少 HBM 读写，快 2-4×
精度：标准                   精度：数学等价（精确）
```

| 序列长度 | 标准 Attention 显存 | Flash Attention 显存 | 加速比 |
|---------|-------------------|---------------------|--------|
| 2K | 16 MB/head | ~KB 级 | 1.5× |
| 8K | 256 MB/head | ~KB 级 | 2.5× |
| 128K | 64 GB/head | ~KB 级 | 4×+ |

> **Flash Attention 不是近似算法**——它算的结果和标准 Attention 一模一样，只是换了一种计算顺序（分块 + Online Softmax），避免了 $n \times n$ 矩阵的物化。这就像算 $1+2+3+\ldots+100$，你可以先全部展开再加（标准），也可以用高斯公式 $\frac{n(n+1)}{2}$（Flash）——结果一样，过程不同。

### Flash Attention 2 & 3

- **Flash Attention 2**（2023）：优化了 GPU 线程的工作分配，减少非计算开销（non-matmul FLOPs），比 v1 再快约 2×。
- **Flash Attention 3**（2024）：利用 H100 GPU 的新硬件特性（FP8 Tensor Cores、异步执行），在 H100 上比 v2 再快 1.5-2×。

现在几乎所有大模型推理框架（vLLM、TensorRT-LLM、llama.cpp）都默认使用 Flash Attention。

---

## 全系列回顾

五篇文章，我们从零拆解了 Transformer 的每一个组件：

```
第一篇：Transformer 全景
  为什么需要 Transformer → RNN/LSTM 的瓶颈 → Attention 的直觉
  → Encoder-Decoder 架构 → Embedding → 自回归生成

第二篇：Self-Attention 深度拆解
  Q/K/V 的来源和含义 → 点积相似度 → √d_k 缩放 → Softmax 归一化
  → 加权求和 → 完整数值计算 → 复杂度分析

第三篇：Multi-Head Attention 与位置编码
  为什么要多头 → 参数拆解 → W^O 的角色
  → 为什么需要位置信息 → 正弦编码 → RoPE

第四篇：砖与瓦——基础组件
  梯度消失/爆炸的本质（Jacobian 连乘）→ 残差连接（+I 打破指数效应）
  → LayerNorm → FFN（升维→非线性→降维）→ 激活函数进化（ReLU→GELU→SwiGLU）
  → Causal Mask → Teacher Forcing → BERT/T5/GPT 三种架构对比

第五篇：从训练到推理（本篇）
  交叉熵损失 → KV Cache → MQA/GQA → Flash Attention
```

从第一篇的"Attention Is All You Need"到第五篇的推理优化，Transformer 的设计哲学始终如一：

1. **用最简单的操作**（矩阵乘法 + Softmax）构建核心机制
2. **用工程技巧**（残差、LayerNorm、KV Cache）让它实际可用
3. **用 Scaling Law**（堆参数 + 堆数据）释放它的全部潜力

这套架构从 2017 年的机器翻译模型，演化成了今天驱动 GPT-4、Claude、Gemini、LLaMA 的通用智能引擎。而你现在，已经理解了它的每一个零件。

---

*本系列参考：[The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) by Jay Alammar（CC BY-NC-SA 4.0），[Attention Is All You Need](https://arxiv.org/abs/1706.03762) by Vaswani et al.，[FlashAttention](https://arxiv.org/abs/2205.14135) by Tri Dao et al.，[GQA: Training Generalized Multi-Query Transformer Models](https://arxiv.org/abs/2305.13245) by Ainslie et al.*
