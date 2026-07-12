---
slug: 'transformer-03-multi-head-and-position'
title: 'Transformer 原理（三）：多头注意力与位置编码 —— 从多角度理解到感知顺序'
description: 'Transformer 系列第三篇。拆解多头注意力的设计哲学与参数量真相，并追溯位置编码从 Sinusoidal 到 RoPE 的进化史。'
category: 'tech'
tags: ['Transformer', 'AI', '深度学习', 'Multi-Head Attention', 'RoPE']
series: 'Transformer 原理'
seriesOrder: 3
pubDate: '2026-06-05'
heroImage: '../../../assets/transformer-03-multi-head-hero.png'
lang: 'zh'
---

这是 **Transformer 原理系列**的第三篇。[上一篇](../transformer-02-self-attention)我们完整拆解了 Self-Attention 的五步计算流程，理解了 Q、K、V 的设计哲学和缩放因子的数学证明。

本篇展开两个关键组件：**Multi-Head Attention（多头注意力）** 和 **位置编码（Positional Encoding）**。

---

## 从单头到多头：为什么一个 Attention 不够？

上一篇的 Self-Attention 其实只是**单头（Single-Head）** Attention——一组 Q、K、V 权重矩阵，从一个角度理解句子。

但自然语言中的关系是多维度的。看这个例子：

```
"The cat sat on the mat because it was comfortable."

这一句话中同时存在多种关系：
  ① 指代关系：  "it" → "mat"（什么东西 comfortable？）
  ② 主谓关系：  "cat" → "sat"（谁在坐？）
  ③ 动作-地点：  "sat" → "on the mat"（坐在哪里？）
  ④ 属性修饰：  "comfortable" → "mat"（什么是舒适的？）
```

一组 Q、K、V 只能学到**一种**关注模式。如果这组权重学会了"指代关系"（it → mat），它就很难同时兼顾"主谓关系"（cat → sat）——因为同一个 Q 向量不可能同时编码"我在找指代对象"和"我在找主语"。

**Multi-Head Attention 的思想**：与其让一个 Attention 承担所有任务，不如拆成多个小的 Attention（称为"头"），让每个头专注于不同的关系模式。

> **类比**：评审论文时，一个评委（单头）要同时评判创新性、实验设计、写作质量……难免顾此失彼。更好的做法是请 8 个评委（8 头），每人从自己擅长的角度打分，最后综合。

---

## Multi-Head Attention 的计算流程

### 核心公式

$$
\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \ldots, \text{head}_h) \cdot W^O
$$

其中每个头独立做一次 Scaled Dot-Product Attention：

$$
\text{head}_i = \text{Attention}(X W_i^Q,\; X W_i^K,\; X W_i^V)
$$

### 逐步计算：一个完整的例子

延续第二篇的风格，用具体数字走一遍。为了让你清楚看到**不同头如何产生不同的注意力模式**，我们会完整展开每个头的计算。

```
d_model = 4（简化为 4 维，方便手算）
h = 2（2 个头）
d_k = d_v = d_model / h = 2（每个头处理 2 维）
```

#### 输入

假设句子 "猫 坐" 经过 Embedding + 位置编码后得到：

$$
X = \begin{bmatrix} 1 & 0 & 1 & 1 \\ 0 & 1 & 1 & 0 \end{bmatrix} \quad (2 \times 4)
$$

第一行是"猫"的向量 $[1, 0, 1, 1]$，第二行是"坐"的向量 $[0, 1, 1, 0]$。

#### Step 1：为每个头生成独立的 Q、K、V

**头 1** 使用权重矩阵 $W_1^Q, W_1^K, W_1^V$（形状 $4 \times 2$）：

$$
W_1^Q = \begin{bmatrix} 1 & 0 \\ 0 & 1 \\ 1 & 0 \\ 0 & 0 \end{bmatrix}, \quad
W_1^K = \begin{bmatrix} 0 & 1 \\ 1 & 0 \\ 0 & 1 \\ 1 & 0 \end{bmatrix}, \quad
W_1^V = \begin{bmatrix} 1 & 1 \\ 0 & 0 \\ 1 & 0 \\ 0 & 1 \end{bmatrix}
$$

计算头 1 的 Q、K、V：

$$
Q_1 = X \cdot W_1^Q = \begin{bmatrix} 1 & 0 & 1 & 1 \\ 0 & 1 & 1 & 0 \end{bmatrix} \cdot \begin{bmatrix} 1 & 0 \\ 0 & 1 \\ 1 & 0 \\ 0 & 0 \end{bmatrix} = \begin{bmatrix} 2 & 0 \\ 1 & 1 \end{bmatrix}
$$

$$
K_1 = X \cdot W_1^K = \begin{bmatrix} 1 & 0 & 1 & 1 \\ 0 & 1 & 1 & 0 \end{bmatrix} \cdot \begin{bmatrix} 0 & 1 \\ 1 & 0 \\ 0 & 1 \\ 1 & 0 \end{bmatrix} = \begin{bmatrix} 1 & 2 \\ 1 & 1 \end{bmatrix}
$$

$$
V_1 = X \cdot W_1^V = \begin{bmatrix} 1 & 0 & 1 & 1 \\ 0 & 1 & 1 & 0 \end{bmatrix} \cdot \begin{bmatrix} 1 & 1 \\ 0 & 0 \\ 1 & 0 \\ 0 & 1 \end{bmatrix} = \begin{bmatrix} 2 & 2 \\ 1 & 0 \end{bmatrix}
$$

---

**头 2** 使用**完全不同的**权重矩阵 $W_2^Q, W_2^K, W_2^V$（形状同样 $4 \times 2$）：

$$
W_2^Q = \begin{bmatrix} 0 & 1 \\ 1 & 0 \\ 0 & 0 \\ 1 & 1 \end{bmatrix}, \quad
W_2^K = \begin{bmatrix} 1 & 0 \\ 0 & 0 \\ 1 & 1 \\ 0 & 1 \end{bmatrix}, \quad
W_2^V = \begin{bmatrix} 0 & 1 \\ 1 & 0 \\ 0 & 1 \\ 1 & 0 \end{bmatrix}
$$

计算头 2 的 Q、K、V：

$$
Q_2 = X \cdot W_2^Q = \begin{bmatrix} 1 & 0 & 1 & 1 \\ 0 & 1 & 1 & 0 \end{bmatrix} \cdot \begin{bmatrix} 0 & 1 \\ 1 & 0 \\ 0 & 0 \\ 1 & 1 \end{bmatrix} = \begin{bmatrix} 1 & 2 \\ 1 & 0 \end{bmatrix}
$$

$$
K_2 = X \cdot W_2^K = \begin{bmatrix} 1 & 0 & 1 & 1 \\ 0 & 1 & 1 & 0 \end{bmatrix} \cdot \begin{bmatrix} 1 & 0 \\ 0 & 0 \\ 1 & 1 \\ 0 & 1 \end{bmatrix} = \begin{bmatrix} 2 & 2 \\ 1 & 1 \end{bmatrix}
$$

$$
V_2 = X \cdot W_2^V = \begin{bmatrix} 1 & 0 & 1 & 1 \\ 0 & 1 & 1 & 0 \end{bmatrix} \cdot \begin{bmatrix} 0 & 1 \\ 1 & 0 \\ 0 & 1 \\ 1 & 0 \end{bmatrix} = \begin{bmatrix} 1 & 2 \\ 1 & 1 \end{bmatrix}
$$

> **观察**：同样的输入 X，因为权重矩阵不同，两个头得到的 Q、K、V 完全不同——这就是多头的关键。

#### Step 2：每个头独立做 Attention

现在按第二篇的流程，分别走完两个头的完整计算。

**━━━ 头 1 的 Attention ━━━**

**点积：**

$$
Q_1 K_1^T = \begin{bmatrix} 2 & 0 \\ 1 & 1 \end{bmatrix} \cdot \begin{bmatrix} 1 & 1 \\ 2 & 1 \end{bmatrix} = \begin{bmatrix} 2 & 2 \\ 3 & 2 \end{bmatrix}
$$

**缩放**（$\div \sqrt{d_k} = \sqrt{2} \approx 1.41$）：

$$
\frac{Q_1 K_1^T}{\sqrt{2}} \approx \begin{bmatrix} 1.41 & 1.41 \\ 2.12 & 1.41 \end{bmatrix}
$$

**Softmax**（对每行归一化）：

```
第一行 [1.41, 1.41]：e^1.41 ≈ 4.10, 总和=8.20 → [0.50, 0.50]
第二行 [2.12, 1.41]：e^2.12 ≈ 8.33, e^1.41 ≈ 4.10, 总和=12.43 → [0.67, 0.33]
```

$$
A_1 = \begin{bmatrix} 0.50 & 0.50 \\ 0.67 & 0.33 \end{bmatrix}
$$

**加权求和**（$A_1 \times V_1$）：

$$
\text{head}_1 = \begin{bmatrix} 0.50 & 0.50 \\ 0.67 & 0.33 \end{bmatrix} \cdot \begin{bmatrix} 2 & 2 \\ 1 & 0 \end{bmatrix} = \begin{bmatrix} 1.50 & 1.00 \\ 1.67 & 1.34 \end{bmatrix}
$$

> **头 1 的注意力模式**："猫"对两个词的关注各 50%（均匀分布）；"坐"67% 关注"猫"、33% 关注自己——**头 1 学到了"动词找主语"的模式**。

---

**━━━ 头 2 的 Attention ━━━**

**点积：**

$$
Q_2 K_2^T = \begin{bmatrix} 1 & 2 \\ 1 & 0 \end{bmatrix} \cdot \begin{bmatrix} 2 & 1 \\ 2 & 1 \end{bmatrix} = \begin{bmatrix} 6 & 3 \\ 2 & 1 \end{bmatrix}
$$

**缩放**（$\div \sqrt{2}$）：

$$
\frac{Q_2 K_2^T}{\sqrt{2}} \approx \begin{bmatrix} 4.24 & 2.12 \\ 1.41 & 0.71 \end{bmatrix}
$$

**Softmax**：

```
第一行 [4.24, 2.12]：e^4.24 ≈ 69.4, e^2.12 ≈ 8.33, 总和=77.7 → [0.89, 0.11]
第二行 [1.41, 0.71]：e^1.41 ≈ 4.10, e^0.71 ≈ 2.03, 总和=6.13 → [0.67, 0.33]
```

$$
A_2 = \begin{bmatrix} 0.89 & 0.11 \\ 0.67 & 0.33 \end{bmatrix}
$$

**加权求和**（$A_2 \times V_2$）：

$$
\text{head}_2 = \begin{bmatrix} 0.89 & 0.11 \\ 0.67 & 0.33 \end{bmatrix} \cdot \begin{bmatrix} 1 & 2 \\ 1 & 1 \end{bmatrix} = \begin{bmatrix} 1.00 & 1.89 \\ 1.00 & 1.67 \end{bmatrix}
$$

> **头 2 的注意力模式**："猫"89% 关注自己、仅 11% 看"坐"——**头 2 学到了"名词关注自身属性"的模式**，和头 1 完全不同！

#### 对比两个头的注意力分布

```
        头 1 注意力                     头 2 注意力
       Key→  "猫"  "坐"               Key→  "猫"  "坐"
Query↓                         Query↓
"猫"        0.50  0.50          "猫"        0.89  0.11
"坐"        0.67  0.33          "坐"        0.67  0.33

头 1：均匀关注 → 捕捉词间关系      头 2：聚焦自身 → 保留自身特征
```

**这就是多头的核心价值**：同一个输入，不同的权重矩阵让不同的头自动学到不同的关注模式。

#### Step 3：拼接（Concat）

把两个头的输出沿最后一维拼起来：

$$
\text{Concat} = [\text{head}_1 ; \text{head}_2] = \begin{bmatrix} 1.50 & 1.00 & | & 1.00 & 1.89 \\ 1.67 & 1.34 & | & 1.00 & 1.67 \end{bmatrix} \quad (2 \times 4)
$$

> 每个头输出 2 维，2 个头拼起来恰好回到 4 维（= $d_{model}$）。

#### Step 4：线性投影（乘以 $W^O$）

最后乘一个输出权重矩阵 $W^O$（$4 \times 4$），把多个头的信息融合：

$$
\text{Output} = \text{Concat} \cdot W^O \quad (2 \times 4)
$$

$W^O$ 的作用是让模型学习**如何组合不同头的结果**——头 1 捕捉到的词间关系 + 头 2 保留的自身特征，通过 $W^O$ 融合成每个词的最终表示。

### 流程总结

```
输入 X (n × d_model)
  │
  ├──→ 头1: X·W₁Q, X·W₁K, X·W₁V → Attention → head₁ (n × d_k)
  ├──→ 头2: X·W₂Q, X·W₂K, X·W₂V → Attention → head₂ (n × d_k)
  ├──→ ...
  └──→ 头h: X·WₕQ, X·WₕK, X·WₕV → Attention → headₕ (n × d_k)
           │
           ▼
     Concat [head₁; head₂; ...; headₕ]  (n × d_model)  ← 把所有头的结果拼起来
           │
           ▼
     × W^O  (d_model × d_model)  ← 输出投影：融合不同头的信息（见下方解释）
           │
           ▼
     输出 (n × d_model)  ← 维度和输入完全一致
```

> **$W^O$ 是什么？** O = Output（输出）。Concat 只是把多个头的结果"物理拼接"在一起——前 $d_k$ 维来自头 1，接下来 $d_k$ 维来自头 2……各头的信息还是隔离的。$W^O$ 做一次线性变换，让不同头的信息**互相混合**：头 1 发现的"动词找主语"关系 + 头 2 保留的"名词自身属性"，通过 $W^O$ 融合成每个词最终的综合表示。它是一个可训练的参数矩阵，模型会自动学习最优的融合方式。

---

## 📌 深入理解：参数量分析——多头的参数开销

一个常见的误解：8 个头 = 8 倍参数？实际上远没有那么多。

### 单头 vs 多头参数量对比

**单头**（一个大 Attention，$d_k = d_{model}$）：

$$
W_Q: (d \times d), \quad W_K: (d \times d), \quad W_V: (d \times d) \quad \Rightarrow \quad 3d^2 \text{ 参数}
$$

**多头**（$h$ 个小 Attention，每头 $d_k = d/h$）：

$$
\text{每头}: W_i^Q: (d \times \frac{d}{h}), \quad W_i^K: (d \times \frac{d}{h}), \quad W_i^V: (d \times \frac{d}{h})
$$

$$
\text{每头参数} = 3 \times d \times \frac{d}{h} = \frac{3d^2}{h}
$$

$$
\text{h 个头总参数} = h \times \frac{3d^2}{h} = 3d^2
$$

再加上输出矩阵 $W^O: (d \times d) = d^2$

$$
\text{多头总参数} = 3d^2 + d^2 = 4d^2
$$

### 原始论文的实际配置

| 参数 | 值 |
|------|-----|
| $d_{model}$ | 512 |
| $h$（头数） | 8 |
| $d_k = d_v$ | 512 / 8 = 64 |
| 单头参数量 | $3 \times 512^2$ = 786,432 |
| 多头参数量 | $4 \times 512^2$ = 1,048,576 |

**Q/K/V 的参数量完全不变**（都是 $3d^2$），多头只是额外增加了一个 $W^O$ 矩阵（$d^2$ 参数），总共多了约 **33%** 的参数开销。但换来的是从 1 个视角变成 8 个视角——性价比极高。

> **一句话总结**：Multi-Head 不是"复制 8 份完整的 Attention"（那样参数会翻 8 倍），而是"把一份 Attention 拆成 8 份小的，再加一个融合矩阵"。每个头在更低维的子空间中工作，用 33% 的额外参数换来了 8 倍的表达多样性。

### 为什么很多资料说"参数量不变"？

你可能在其他教程中见过"多头不增加参数量"的说法。这并非错误，而是**对比基准不同**。

在实际的深度学习框架（如 PyTorch）中，$W^O$ 是 Attention 模块的**标配组件**——即使只用 1 个头，也会带上 $W^O$：

```python
# PyTorch 中，不管 num_heads 是多少，参数量都是 4d²
nn.MultiheadAttention(embed_dim=512, num_heads=8)   # 4d²
nn.MultiheadAttention(embed_dim=512, num_heads=1)   # 也是 4d²
```

所以在实际实现中，**参数量确实不随头数变化**（都是 $4d^2$），改变头数只是改变了"拆分方式"。那些教程说的"不增加参数"，对比的是实际代码中 h=1 和 h=8 的区别。

而我们上面的对比（$3d^2$ vs $4d^2$），是从论文的纯理论角度出发——"完全不要 $W^O$ 的单头"vs"带 $W^O$ 的多头"。两种说法都对，只是基准不同。

---

## 📌 深入理解：多头到底学到了什么？

不同的头在训练后会自动分化出不同的关注模式——这不是人为设定的，而是模型在训练中自然涌现的。

研究者通过可视化注意力权重，发现不同头倾向于捕捉不同类型的语言关系：

```
头 1（语法头）：   关注主语-动词关系     "cat" ←→ "sat"
头 2（指代头）：   关注指代消解          "it" → "mat"
头 3（局部头）：   关注相邻词            每个词主要看左右邻居
头 4（修饰头）：   关注形容词-名词       "comfortable" → "mat"
头 5（长距离头）： 关注句子首尾          捕捉全局依赖
头 6（标点头）：   关注句子边界          句号、逗号等分隔符
...
```

> **这就是 Multi-Head 的价值**：不是简单的"冗余"，而是让模型的"理解力"变得多维度。就像人类理解一句话时，同时在处理语法、语义、语境、情感……Multi-Head 让 Transformer 也具备了这种多维度的理解能力。

### 📌 如果减少头数会怎样？

原始论文（Table 3）做了消融实验：

| 头数 h | $d_k$ | BLEU 分数 |
|--------|-------|----------|
| 1 | 512 | 降低约 0.9 |
| 4 | 128 | 接近最优 |
| **8** | **64** | **最优** |
| 16 | 32 | 略有下降 |
| 32 | 16 | 明显下降 |

- 太少（h=1）：视角单一，表达能力不足
- 太多（h=32）：每个头只有 16 维，子空间太小，每个头的"理解力"太弱
- **h=8 是甜区**，在"视角多样性"和"单头表达力"之间取得平衡

---

## 位置编码：让 Transformer 感知词序

### 为什么需要位置编码？

第一篇我们提过："我爱你"和"你爱我"含义完全不同。但 Self-Attention 的计算中，**没有任何一步用到了位置信息**。

用公式来严格验证这一点。设输入序列为 $X = [x_1, x_2, \ldots, x_n]$，Self-Attention 对第 $i$ 个词的输出是：

$$
\text{out}_i = \sum_{j=1}^{n} \alpha_{ij} \cdot (x_j W_V)
$$

其中注意力权重 $\alpha_{ij}$ 是：

$$
\alpha_{ij} = \frac{\exp\left(\frac{(x_i W_Q)(x_j W_K)^T}{\sqrt{d_k}}\right)}{\sum_{l=1}^{n} \exp\left(\frac{(x_i W_Q)(x_l W_K)^T}{\sqrt{d_k}}\right)}
$$

**关键观察**：$\alpha_{ij}$ 只取决于 $x_i$ 和 $x_j$ 的**内容**，和它们在句子中的位置 $i$、$j$ 完全无关。

现在假设我们把 "我 爱 你" 打乱成 "你 爱 我"（交换 $x_1$ 和 $x_3$）：

```
原始输入：  x₁="我"  x₂="爱"  x₃="你"
打乱输入：  x₁="你"  x₂="爱"  x₃="我"

对于"爱"这个词（位置 2）：
  原始：out₂ = α("爱","我")·V_"我" + α("爱","爱")·V_"爱" + α("爱","你")·V_"你"
  打乱：out₂ = α("爱","你")·V_"你" + α("爱","爱")·V_"爱" + α("爱","我")·V_"我"

求和是可交换的 → 两个结果完全相同！
```

**Self-Attention 的输出是对所有词的加权求和（$\sum$），而加法满足交换律**——打乱顺序不影响求和结果。数学上这叫**置换等变性（Permutation Equivariance）**：打乱输入，输出只是跟着被打乱了，每个词得到的向量内容完全不变。

> **所以 "我爱你" 和 "你爱我" 在 Self-Attention 眼里是一样的——这显然不对。** 必须额外注入位置信息，让模型知道每个词在句子中的位置。

接下来我们追溯位置编码的进化史。

---

## Sinusoidal 位置编码（原始论文方案）

### 公式

原始 Transformer 论文使用不同频率的正弦和余弦函数来编码位置：

$$
PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d_{model}}}\right)
$$

$$
PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_{model}}}\right)
$$

其中：
- $pos$ = 词在句子中的位置（0, 1, 2, ...）
- $i$ = 维度索引（0, 1, 2, ..., $d_{model}/2 - 1$）
- $d_{model}$ = 模型维度（如 512）

### 直觉理解：二进制时钟类比

把位置编码想象成一个"时钟"系统。二进制表示数字时，每一位的变化频率不同：

```
位置    个位(最快)  第2位   第3位   第4位(最慢)
  0        0        0       0        0
  1        1        0       0        0
  2        0        1       0        0
  3        1        1       0        0
  4        0        0       1        0
  5        1        0       1        0
  6        0        1       1        0
  7        1        1       1        0
```

个位每步都变，第 2 位每 2 步变一次，第 3 位每 4 步变一次……

Sinusoidal 位置编码做的事情类似，只不过用**连续的正弦波**替代了离散的 0/1：
- 低维度（$i$ 小）：高频正弦波，变化快 → 编码精细的位置差异
- 高维度（$i$ 大）：低频正弦波，变化慢 → 编码粗粒度的位置信息

### 关键性质：相对位置可线性表示

Sinusoidal 编码有一个优雅的数学性质：**位置 $pos+k$ 的编码可以由位置 $pos$ 的编码通过线性变换得到**。

证明依赖三角恒等式：

$$
\sin(a + b) = \sin a \cos b + \cos a \sin b
$$

$$
\cos(a + b) = \cos a \cos b - \sin a \sin b
$$

设 $\omega_i = 1/10000^{2i/d}$，则：

$$
\begin{bmatrix} \sin(\omega_i(pos+k)) \\ \cos(\omega_i(pos+k)) \end{bmatrix} = \begin{bmatrix} \cos(\omega_i k) & \sin(\omega_i k) \\ -\sin(\omega_i k) & \cos(\omega_i k) \end{bmatrix} \begin{bmatrix} \sin(\omega_i \cdot pos) \\ \cos(\omega_i \cdot pos) \end{bmatrix}
$$

右边的旋转矩阵**只依赖偏移量 $k$**，不依赖绝对位置 $pos$。

> **含义**：模型可以通过学习一个线性变换来捕捉"这两个词相距 $k$ 个位置"——无论它们出现在句子的开头还是结尾。

### 注入方式

位置编码直接**加到** Embedding 上：

$$
\text{输入} = \text{Embedding}(x) + PE_{pos}
$$

### Sinusoidal 的局限

**局限一：加法注入的信息干扰**

位置信息和语义信息直接相加：

$$
h_i = \text{Emb}(x_i) + PE_{pos_i}
$$

当后续计算注意力分数时：

$$
q_i \cdot k_j = (h_i W_Q)(h_j W_K)^T = \underbrace{(\text{Emb}_i W_Q)(\text{Emb}_j W_K)^T}_{\text{语义-语义交互}} + \underbrace{(PE_i W_Q)(PE_j W_K)^T}_{\text{位置-位置交互}} + \underbrace{\text{交叉项}}_{\text{语义-位置混合}}
$$

展开后出现了**交叉项**——语义和位置的信息互相干扰。模型必须额外学习如何把它们分离开，增加了学习负担。

**局限二：外推能力有限**

虽然 Sinusoidal 公式可以对任意 $pos$ 生成编码，但实际中训练时只见过 $pos \in [0, L_{train})$。问题出在**频率分布**上：

$$
\omega_i = \frac{1}{10000^{2i/d}}
$$

低维度的 $\omega_i$ 很大（高频），正弦波周期短。当 $pos$ 超出训练范围后，高频维度的值虽然周期循环不会溢出，但模型在训练中**从未见过这些维度组合模式**——就像一把尺子上的刻度能外推，但你从没练过读那么远的刻度。

```
训练时 pos ∈ [0, 512)：模型学会了 PE₀ ~ PE₅₁₁ 的模式
推理时 pos = 1000：  PE₁₀₀₀ 的各维度值仍在 [-1,1]，但维度间的组合
                    模式是模型从未见过的 → 性能下降
```

**局限三：绝对位置 vs 相对位置**

Sinusoidal 编码的是"第 $pos$ 个位置"这种**绝对位置**。虽然前面证明了 $PE_{pos+k}$ 可以由 $PE_{pos}$ 线性变换得到，但这个性质**不会自动体现在注意力分数中**。

理想情况下，我们希望注意力分数只依赖相对位置 $(i-j)$：

$$
q_i \cdot k_j = f(x_i, x_j, \underbrace{i - j}_{\text{相对位置}})
$$

但 Sinusoidal + 加法注入后，注意力分数实际上是：

$$
q_i \cdot k_j = f(x_i, x_j, \underbrace{i}_{\text{绝对}}, \underbrace{j}_{\text{绝对}})
$$

模型需要**自己从绝对位置中学会提取相对关系**，而不是天然内建的。这就是后来 RoPE 要解决的核心问题。

---

## Learned 位置编码（BERT / GPT-2 方案）

Sinusoidal 用手工设计的三角函数公式来编码位置。一个自然的想法是：**既然词的语义可以通过 Embedding 学出来，位置信息为什么不能也学出来？**

### 核心思想：位置也是一种 Embedding

回顾第一篇的词 Embedding：每个词有一个 ID，用 ID 去查找表里查出一个向量。Learned 位置编码做的事完全一样——**把"位置"当成另一种"词"**：

$$
\text{词 Embedding}: \quad \text{词 ID} \xrightarrow{\text{查表}} \text{语义向量} \quad W_{emb} \in \mathbb{R}^{|V| \times d}
$$

$$
\text{位置 Embedding}: \quad \text{位置编号} \xrightarrow{\text{查表}} \text{位置向量} \quad W_{pos} \in \mathbb{R}^{L_{max} \times d}
$$

$W_{pos}$ 就是一个形状为 $(L_{max} \times d)$ 的矩阵，第 $pos$ 行就是位置 $pos$ 的编码向量。

### 训练过程

**第一步：随机初始化。** $W_{pos}$ 的每个数字一开始都是随机的，位置 0 和位置 1 的向量没有任何有意义的关系。

```
初始化时（随机，无意义）：
PE[0] = [0.12, -0.34, 0.56, ...]
PE[1] = [0.78, 0.23, -0.45, ...]
PE[2] = [-0.91, 0.67, 0.03, ...]
...
PE[511] = [0.44, -0.12, 0.88, ...]
```

**第二步：加到词 Embedding 上。** 和 Sinusoidal 一样，位置向量直接加到词向量上：

$$
h_i = \text{Emb}(x_i) + W_{pos}[i]
$$

**第三步：随模型一起训练。** $W_{pos}$ 和模型的其他参数（$W_Q, W_K, W_V$ 等）一起，通过反向传播更新。训练过程中，模型会发现：

- 如果 $W_{pos}[0]$ 和 $W_{pos}[1]$ 的差异能帮助它区分"第一个词"和"第二个词"→ 保留这种差异
- 如果相邻位置的编码相似，有助于理解局部语序 → 相邻位置的向量被推向相近的方向
- 如果某些维度对远距离关系有用 → 那些维度会自动编码距离信息

> **本质区别**：Sinusoidal 的 PE 是**固定的**（公式算出来就不变了），Learned 的 PE 是**可训练的参数**（像权重一样在训练中被优化）。

### 致命缺点：无法外推

BERT 的 $L_{max} = 512$，GPT-2 的 $L_{max} = 1024$。这意味着 $W_{pos}$ 矩阵只有 512 行（或 1024 行）。

$$
W_{pos} \in \mathbb{R}^{512 \times d} \quad \Rightarrow \quad \text{只有 } W_{pos}[0] \sim W_{pos}[511] \text{ 存在}
$$

推理时输入 513 个词？$W_{pos}[512]$ 根本不存在——直接越界报错。不像 Sinusoidal 至少能用公式算出一个值（虽然不准），Learned PE 连值都没有。

| 对比 | Sinusoidal | Learned |
|------|-----------|---------|
| 设计方式 | 手工公式 | 可训练参数 |
| 灵活性 | 固定模式 | 更灵活，自动适应数据 |
| 外推能力 | 理论可以，实际差 | **完全不能**（越界报错） |
| 额外参数 | 0（公式生成） | $L_{max} \times d$（BERT: 512×768 ≈ 39万参数） |
| 采用者 | 原始 Transformer | BERT, GPT-2 |

两种方案都有明显缺陷。核心问题在于：它们编码的都是**绝对位置**，而自然语言更依赖**相对位置**。

---

## RoPE：旋转位置编码——现代大模型的标配

**RoPE（Rotary Position Embedding，旋转位置编码）** 由苏剑林于 2021 年提出，被 LLaMA、Qwen、Mistral、Gemma 等主流大模型广泛采用。它是目前位置编码的事实标准。

### 核心思想

> **用旋转来编码位置**，使得两个词的注意力分数**天然只依赖它们的相对位置**。

### 直觉理解：旋转一个向量

把 Q、K 向量想象成二维平面上的箭头。RoPE 做的事就是：根据词的位置，把箭头旋转不同的角度。

```
位置 0 的词：Q₀ 不旋转           → Q₀
位置 1 的词：Q₁ 旋转角度 θ       → Q₁ 转了 θ
位置 2 的词：Q₂ 旋转角度 2θ      → Q₂ 转了 2θ
位置 m 的词：Qₘ 旋转角度 mθ      → Qₘ 转了 mθ
```

当计算位置 $m$ 和位置 $n$ 的注意力分数时（$Q_m \cdot K_n$）：
- 两个向量之间的夹角差 = 原始语义夹角 + $(m - n) \times \theta$
- $(m-n)$ 就是**相对位置**
- 只要相对位置相同，角度贡献就相同 → **注意力分数只依赖相对位置**

### 数学公式

对于每一对维度（$2i$, $2i+1$），位置 $m$ 的旋转操作是：

$$
R_{m\theta_i} = \begin{bmatrix} \cos(m\theta_i) & -\sin(m\theta_i) \\ \sin(m\theta_i) & \cos(m\theta_i) \end{bmatrix}
$$

其中 $\theta_i = 10000^{-2i/d}$（和 Sinusoidal 用的频率一样）。

对 Q 和 K 分别施加旋转：

$$
\tilde{q}_m = R_{m\theta} \cdot q_m, \quad \tilde{k}_n = R_{n\theta} \cdot k_n
$$

### 📌 关键性质证明：注意力分数只依赖相对位置

计算旋转后的点积：

$$
\tilde{q}_m^T \tilde{k}_n = (R_{m\theta} q_m)^T (R_{n\theta} k_n) = q_m^T R_{m\theta}^T R_{n\theta} k_n
$$

由于旋转矩阵的性质 $R_a^T = R_{-a}$：

$$
R_{m\theta}^T R_{n\theta} = R_{-m\theta} R_{n\theta} = R_{(n-m)\theta}
$$

所以：

$$
\tilde{q}_m^T \tilde{k}_n = q_m^T R_{(n-m)\theta} k_n
$$

**结果只包含 $(n-m)$，即相对位置差！** 绝对位置 $m$ 和 $n$ 各自消失了。

### RoPE vs Sinusoidal vs Learned 对比

| 特性 | Sinusoidal | Learned | RoPE |
|------|-----------|---------|------|
| 编码类型 | 绝对位置 | 绝对位置 | **相对位置（内建）** |
| 注入方式 | 加法（PE + Embedding） | 加法 | **乘法（旋转 Q/K）** |
| 外推能力 | 差 | 无 | **好（可配合 NTK/YaRN 扩展）** |
| 信息干扰 | 有（加法混合） | 有 | **无（只改变方向，不改变模长）** |
| 长上下文 | ❌ | ❌ | **✅** |
| 主流采用 | 仅原论文 | BERT/GPT-2 | **LLaMA/Qwen/Mistral/Gemma** |

### 📌 深入理解：加法 vs 乘法

Sinusoidal 用加法注入位置（PE + Embedding），这意味着位置信息和语义信息被混在同一个向量中，高层网络难以分离。

RoPE 用乘法注入位置（旋转 Q 和 K），有两个优势：
1. **不改变向量模长**：旋转只改变方向，保留了语义信息的"强度"
2. **直接作用于注意力计算**：位置信息在 $QK^T$ 的点积中自然体现为角度差，不需要模型额外学习如何从混合向量中提取位置

> **一句话**：加法是"把位置信息混进去，让模型自己分辨"；乘法是"把位置信息优雅地编码在向量的方向上"。

---

## 小结

本篇完整拆解了 Multi-Head Attention 和位置编码：

1. **Multi-Head Attention**：将单头拆成多头，每头在低维子空间中独立做 Attention，最后拼接融合。参数量几乎不变（只多一个 $W^O$），但表达能力大增——不同头自动分化出语法、指代、修饰等不同的关注模式。

2. **Sinusoidal 位置编码**：用不同频率的正弦/余弦波编码绝对位置，通过三角恒等式支持相对位置的线性表示。加法注入，外推能力有限。

3. **Learned 位置编码**：用可训练矩阵替代公式，更灵活但完全不能外推，被 BERT/GPT-2 采用。

4. **RoPE**：用旋转矩阵编码位置，注意力分数天然只依赖相对位置（数学证明：旋转矩阵相乘后绝对位置消失）。乘法注入不干扰语义，外推能力强，是 LLaMA/Qwen/Mistral 等现代大模型的标配。

**下一篇**，我们将拆解 Transformer 的"砖与瓦"——残差连接（Residual Connection）、层归一化（Layer Normalization）、前馈网络（FFN）、因果掩码（Causal Mask），以及 Decoder-only 架构为什么成为当下大模型的主流选择。

---

*本系列参考：[The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) by Jay Alammar（CC BY-NC-SA 4.0），[RoFormer: Enhanced Transformer with Rotary Position Embedding](https://arxiv.org/abs/2104.09864) by Su et al.*
