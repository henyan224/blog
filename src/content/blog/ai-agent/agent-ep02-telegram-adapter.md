---
slug: 'agent-ep02-telegram-adapter'
title: 'LogicAI × Telegram：我的 AI 智能体能做什么'
description: 'LogicAI2 系列第二篇。梳理 Telegram Adapter 的核心能力：命令系统、审批流程、实时进度、Git 代码审核，以及后续多平台适配的设计基线。'
category: 'tech'
tags: ['Agent', 'LogicAI2', 'Telegram', 'AI']
series: 'LogicAI'
seriesOrder: 2
pubDate: '2026-06-24'
articleStyle: 'narrative'
lang: 'zh'
---

鍦ㄤ笂涓€绡囨枃绔犱腑锛屾垜鑱婁簡涓轰粈涔堣鍋氫竴涓睘浜庤嚜宸辩殑 AI 鏅鸿兘浣撱€傝繖涓€绡囷紝鎴戞兂鍏蜂綋灞曠ず涓€涓嬶細**閫氳繃 Telegram锛屾垜鐨勬櫤鑳戒綋鍒板簳鑳藉仛浠€涔堛€?*

LogicAI2 鐨勮璁＄悊蹇垫槸**骞冲彴鏃犲叧**鈥斺€旀牳蹇?Agent 閫昏緫涓庡叿浣撶殑鑱婂ぉ骞冲彴瑙ｈ€︺€俆elegram 鏄垜绗竴涓畬鏁村疄鐜扮殑 adapter锛屽悗缁細鎵╁睍鍒板井淇°€丏iscord 绛夊叾浠栧钩鍙般€傛墍浠ヨ繖绡囨枃绔犱篃鏄竴浠?*璁捐鍩虹嚎**锛岃褰曚笅 Telegram adapter 鐨勫叏閮ㄨ兘鍔涳紝浣滀负鍚庣画閫傞厤鐨勫弬鑰冦€?
---

## 鏋舵瀯锛氫竴灞備竴灞傛媶寮€鐪?
鍏堢湅鏁翠綋鏋舵瀯銆備竴鏉＄敤鎴锋秷鎭粠杩涘叆鍒拌澶勭悊锛岀粡杩囦簡杩欎簺灞傦細

```
鐢ㄦ埛娑堟伅 鈫?Telegram Bot API (grammy)
                鈹?                鈹溾攢鈹€ middleware/auth.ts     鈫?鐧藉悕鍗曢壌鏉?                鈹溾攢鈹€ handlers/commands.ts   鈫?/command 澶勭悊
                鈹溾攢鈹€ handlers/callbacks.ts  鈫?inline button 鍥炶皟
                鈹斺攢鈹€ handlers/messages.ts   鈫?鏅€氭枃鏈秷鎭?                        鈹?                        鈻?               services/dispatch.ts        鈫?鏍稿績璋冨害
                        鈹?              鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?              鈻?        鈻?        鈻?        run-lock.ts  approval.ts  task-review.ts
        (骞跺彂閿?     (瀹℃壒娴?     (Git 瀹℃牳)
                        鈹?                        鈻?                 runtime.runTurn()          鈫?骞冲彴鏃犲叧鐨?Agent 鏍稿績
```

鍏抽敭鎬濇兂锛?*鎵€鏈夊钩鍙扮壒瀹氱殑閫昏緫閮藉湪 adapter 灞?*锛宍runtime.runTurn()` 瀵瑰钩鍙颁竴鏃犳墍鐭ャ€傝繖鎰忓懗鐫€鎹竴涓钩鍙帮紝鍙渶瑕侀噸鏂板疄鐜?adapter 灞傜殑浜や簰閫昏緫锛屾牳蹇?Agent 涓嶇敤鍔ㄣ€?
### 妯″潡娓呭崟

| 妯″潡 | 璺緞 | 鑱岃矗 |
|------|------|------|
| **鍏ュ彛** | `index.ts` | 鍔犺浇 .env锛屽垵濮嬪寲 runtime + MCP锛屽惎鍔?bot |
| **缁勮** | `app.ts` | 娉ㄥ唽 middleware 鈫?commands 鈫?callbacks 鈫?messages |
| **閴存潈** | `middleware/auth.ts` | 鎸?`TELEGRAM_ALLOWED_USERS` 鐧藉悕鍗曡繃婊?|
| **鍛戒护** | `handlers/commands.ts` | 9 涓?`/command` |
| **鍥炶皟** | `handlers/callbacks.ts` | inline keyboard 鎸夐挳浜嬩欢 |
| **娑堟伅** | `handlers/messages.ts` | 鏅€氭枃鏈?鈫?dispatchTelegramTurn |
| **璋冨害** | `services/dispatch.ts` | agentic loop 鎵ц + 瀹炴椂杩涘害 + 缁撴灉鍒嗗彂 |
| **骞跺彂閿?* | `services/run-lock.ts` | 姣忎釜 chat 鍚屼竴鏃堕棿鍙兘璺戜竴涓换鍔?|
| **瀹℃壒** | `services/approval.ts` | 宸ュ叿璋冪敤鍓嶇殑浜哄伐纭 |
| **浼氳瘽缁戝畾** | `services/session-binding.ts` | chatId 鈫?sessionId 鏄犲皠 |
| **Git 瀹℃牳** | `services/task-review.ts` | wip commit / 鎻愪氦涓诲垎鏀?/ 绉诲叆 review 鍒嗘敮 |
| **UI: 閿洏** | `ui/keyboards.ts` | 鏋勫缓 inline keyboard |
| **UI: 鍙戦€?* | `ui/sender.ts` | 闀挎秷鎭垎鍓层€佸彂鍥剧墖/鏂囦欢銆佸畨鍏ㄧ紪杈?|
| **UI: 鏂囨湰** | `ui/text.ts` | 鍚勭鎻愮ず鏂囨湰妯℃澘 |
| **UI: Markdown** | `ui/markdown.ts` | Markdown 鈫?Telegram HTML 杞崲 |

---

## 鍛戒护绯荤粺

Telegram 鐨勪竴澶т紭鍔挎槸鍘熺敓鏀寔 `/command`銆傛垜涓€鍏辨敞鍐屼簡 9 涓懡浠わ紝鍒嗕袱绫伙細

### 浼氳瘽绠＄悊

| 鍛戒护 | 鍔熻兘 | 璇存槑 |
|------|------|------|
| `/start` | 鍒濆鍖?鎭㈠浼氳瘽 | 浼樺厛鎭㈠宸叉湁缁戝畾锛屾病鏈夊氨鏂板缓 |
| `/new` | 鏂板缓浼氳瘽 | 寮哄埗鍒涘缓鏂?session |
| `/sessions` | 鏌ョ湅/鍒囨崲浼氳瘽 | 鍒楀嚭鏈€杩?10 涓紝閫氳繃 inline keyboard 鐐归€夊垏鎹?|
| `/rename <鍚嶇О>` | 閲嶅懡鍚嶅綋鍓嶄細璇?| 鏂逛究鏍囪涓嶅悓鐢ㄩ€旂殑浼氳瘽 |
| `/clear` | 娓呯┖褰撳墠浼氳瘽鍘嗗彶 | 淇濈暀 session 鏈韩锛屽彧娓呮秷鎭?|
| `/info` | 褰撳墠浼氳瘽淇℃伅 | 鏄剧ず鏍囬銆佹秷鎭暟銆佸垱寤烘椂闂寸瓑 |

### 浠诲姟鎺у埗

| 鍛戒护 | 鍔熻兘 | 璇存槑 |
|------|------|------|
| `/stop` | 涓褰撳墠浠诲姟 | 瑙﹀彂 `AbortController`锛宎gentic loop 浼橀泤閫€鍑?|
| `/resume` | 鎭㈠涓柇鐨勪换鍔?| 鍒楀嚭鎵€鏈夎涓鐨?task锛岄€夋嫨鍚庝粠鏂偣缁х画 |
| `/reset` | 閲嶇疆瑙掕壊璺敱 | 涓嬩竴鏉℃秷鎭噸鏂拌蛋璺敱鍒嗛厤锛屼笉鍐嶆部鐢ㄤ笂涓€涓鑹?|

---

## 娑堟伅澶勭悊锛氫粠杈撳叆鍒拌緭鍑?
鐢ㄦ埛鍙戦€佷竴鏉℃櫘閫氭枃鏈秷鎭悗锛屽畬鏁寸殑澶勭悊閾捐矾锛?
```
1. auth middleware 鈫?妫€鏌ョ敤鎴锋槸鍚﹀湪鐧藉悕鍗?2. isChatRunning(chatId) 鈫?濡傛灉鏈変换鍔″湪璺戯紝鍥炲"鈴?璇风瓑寰?
3. getOrCreateSession() 鈫?鑾峰彇鎴栧垱寤?session
4. startChatRun() 鈫?鑾峰彇骞跺彂閿侊紙鍚屼竴 chat 鍙厑璁镐竴涓换鍔★級
5. ctx.reply("馃摐 鑷ｇ瓑姝ｅ湪鍔姏锛岃澶х帇绋嶅€?..") 鈫?鍙戦€?thinking 娑堟伅
6. dispatchTelegramTurn() 鈫?寮傛鎵ц锛屼笉闃诲 bot polling
```

### Agent 鎵ц杩囩▼

```
1. wipCommit() 鈫?濡傛灉鏄?admin锛屽厛鎶婂伐浣滃尯鑴忔枃浠?commit锛堜繚鎶ょ幇鍦猴級
2. runTurn() 鈫?鎵ц agentic loop
   鈹溾攢鈹€ 璺敱閫夋嫨瑙掕壊锛堝垬閭?闊╀俊/寮犺壇/钀т綍/...锛?   鈹溾攢鈹€ 寰幆鎵ц宸ュ叿璋冪敤
   鈹?  鈹溾攢鈹€ llm_start 鈫?鏇存柊 thinking 娑堟伅锛?鈴?姝ラ 1/10"
   鈹?  鈹溾攢鈹€ llm_text 鈫?杩藉姞鎽樿锛?姝ｅ湪鍒嗘瀽椤圭洰缁撴瀯"
   鈹?  鈹溾攢鈹€ tool_call 鈫?璁板綍鍙傛暟
   鈹?  鈹斺攢鈹€ tool_done 鈫?杩藉姞缁撴灉锛?鉁?read(src/index.ts) (45ms)"
   鈹斺攢鈹€ 杩斿洖鏈€缁堢粨鏋?3. 鍒犻櫎 thinking 娑堟伅
4. 鍙戦€佷骇鐗╋紙鍥剧墖/鏂囦欢锛?5. 鍙戦€佹牸寮忓寲鍥炲锛氥€愯鑹插悕銆? 鍐呭 + token 缁熻
6. 濡傛灉鏄?admin 涓旀湁浠ｇ爜鍙樻洿 鈫?杩涘叆 Git 瀹℃牳娴?7. finishChatRun() 鈫?閲婃斁骞跺彂閿?```

---

## 瀹炴椂杩涘害

杩欐槸鎴戞渶鍠滄鐨勫姛鑳戒箣涓€銆傚湪 agentic loop 杩愯鏈熼棿锛宐ot 浼?*瀹炴椂缂栬緫** thinking 娑堟伅锛岃浣犵煡閬?Agent 鍦ㄥ仛浠€涔堬細

```
銆愰煩淇°€戔彸 姝ラ 1/10锛氭鍦ㄥ垎鏋愰」鐩粨鏋?  鉁?glob(src/**/*.ts) (120ms)
  鉁?read(/src/index.ts) (45ms)
  鉂?bash(npm test) (3200ms)
```

杩欎笉鏄瓑浠诲姟缁撴潫鍚庣殑鎬荤粨鈥斺€旀槸**姣忎竴姝ラ兘鍦ㄦ洿鏂?*銆備綘鍙互瀹炴椂鐪嬪埌 Agent 姝ｅ湪璇诲摢涓枃浠躲€佹墽琛屼粈涔堝懡浠ゃ€佸摢涓€姝ュけ璐ヤ簡銆?
### 浜嬩欢绫诲瀷

| 浜嬩欢 | 瑙﹀彂鏃舵満 | UI 琛屼负 |
|------|----------|---------|
| `loop_start` | 瑙掕壊纭畾 | 璁板綍褰撳墠瑙掕壊鍚?|
| `llm_start` | 姣忎竴姝?LLM 璋冪敤寮€濮?| 鏄剧ず"鈴?姝ラ N/M" |
| `llm_text` | LLM 杈撳嚭鏂囨湰鐗囨 | 鎴彇鍓?80 瀛楃浣滀负鎽樿 |
| `tool_call` | 宸ュ叿琚皟鐢?| 缂撳瓨鍙傛暟 |
| `tool_done` | 宸ュ叿鎵ц瀹屾垚 | 杩藉姞 鉁?鉂?+ 宸ュ叿鍚?+ 鍏抽敭鍙傛暟 + 鑰楁椂 |

---

## 瀹℃壒娴侊細Human-in-the-Loop

褰?Agent 瑕佹墽琛屾晱鎰熸搷浣滄椂锛屼笉浼氱洿鎺ユ墽琛岋紝鑰屾槸鍏堝彂涓€涓甫鎸夐挳鐨勬秷鎭浣犵‘璁わ細

```
鈿狅笍 宸ュ叿 "bash" 闇€瑕佺‘璁?
馃挕 鎰忓浘锛氬畨瑁呬緷璧?
馃搵 鍙傛暟:
  {"command": "npm install lodash"}

[鉁?纭鎵ц]  [鉂?璺宠繃]
         [馃洃 涓浠诲姟]
```

涓変釜閫夐」锛?- **纭鎵ц** 鈥?Agent 缁х画鎵ц璇ュ伐鍏?- **璺宠繃** 鈥?璺宠繃杩欎釜宸ュ叿璋冪敤锛岀户缁悗缁楠?- **涓浠诲姟** 鈥?鏁翠釜 agentic loop 閫€鍑?
瓒呮椂 60 绉掕嚜鍔ㄥ彇娑堛€傝繖纭繚浜嗗嵆浣夸綘涓嶅湪鎵嬫満鏃侊紝Agent 涔熶笉浼氭棤闄愭湡绛夊緟銆?
---

## Git 浠ｇ爜瀹℃牳

杩欎釜鍔熻兘浠呭 admin 鐢ㄦ埛鐢熸晥銆傚綋 Agent 瀹屾垚浜嗕竴涓秹鍙婁唬鐮佷慨鏀圭殑浠诲姟鍚庯細

1. 鑷姩瀵规瘮 `src/` 鐩綍鐨?`git diff`
2. 鍙戦€佸鏍告秷鎭紝灞曠ず鍙樻洿鎽樿锛?
```
馃搵 浠诲姟瀹屾垚锛岃瀹℃牳鍙樻洿锛?
 src/tools/index.ts     | 5 +++--
 src/router/index.ts    | 12 +++++++-----
 2 files changed, 10 insertions(+), 7 deletions(-)

[鉁?鎻愪氦鍒颁富鍒嗘敮]  [鉂?绉诲叆 review 鍒嗘敮]
```

- **鎻愪氦鍒颁富鍒嗘敮** 鈥?`git add + commit` 鍒板綋鍓嶅垎鏀?- **绉诲叆 review 鍒嗘敮** 鈥?鍙樻洿琚?stash 鍒?`review` 鍒嗘敮锛屼富鍒嗘敮淇濇寔骞插噣
- **5 鍒嗛挓瓒呮椂** 鈥?鑷姩绉诲叆 review 鍒嗘敮锛堝畨鍏ㄤ紭鍏堬級

浠诲姟寮€濮嬪墠杩樹細鎵ц `wipCommit()`锛屽厛鎶婂伐浣滃尯鐨勮剰鏂囦欢 commit 涓€娆★紝閬垮厤 Agent 鐨勪慨鏀瑰拰浣犺嚜宸辩殑淇敼娣峰湪涓€璧枫€?
---

## 浼氳瘽绠＄悊

### 缁戝畾妯″瀷

```
Telegram chatId 鈫愨啋 LogicAI2 sessionId
                       鈹?                       鈹溾攢鈹€ 鍐呭瓨缂撳瓨: activeSessions Map锛堝揩閫熸煡鎵撅級
                       鈹斺攢鈹€ 鎸佷箙鍖? DB binding锛堥噸鍚悗鎭㈠锛?```

### 澶氫細璇?
姣忎釜鐢ㄦ埛鍙互鏈?*澶氫釜 session**銆傚吀鍨嬬敤娉曪細
- 涓€涓?session 涓撻棬鑱婁唬鐮?- 涓€涓?session 涓撻棬鍋氫俊鎭悳闆?- 涓€涓?session 鐢ㄤ簬闈㈣瘯缁冧範

閫氳繃 `/sessions` 鏌ョ湅鍒楄〃锛岀偣鍑?inline keyboard 涓€閿垏鎹€傜涓€鏉℃秷鎭嚜鍔ㄦ埅鍙栧墠 10 瀛楃浣滀负鏍囬锛屼篃鍙互鐢?`/rename` 鎵嬪姩淇敼銆?
---

## 骞跺彂鎺у埗

```typescript
const runningTurns = new Map<chatId, RunningTurn>();
```

璁捐寰堢畝鍗曚絾寰堝繀瑕侊細**姣忎釜 chat 鍚屼竴鏃堕棿鍙兘鏈変竴涓换鍔″湪璺戙€?*

濡傛灉鐢ㄦ埛鍦ㄤ换鍔¤繍琛屼腑鍙戞秷鎭紝鐩存帴鍥炲"鈴?璇风瓑寰?銆侴it 瀹℃牳鏈熼棿閿佷篃涓嶄細閲婃斁鈥斺€斿繀椤荤瓑鐢ㄦ埛鍋氬嚭瀹℃牳鍐冲畾鍚庢墠鑳藉彂鏂颁换鍔°€?
---

## 娑堟伅杈撳嚭

### 闀挎秷鎭垎鍓?
Telegram 鍗曟潯娑堟伅闄愬埗 4096 瀛楃銆侫gent 鐨勫洖澶嶇粡甯歌秴杩囪繖涓暱搴︼紝鎵€浠ラ渶瑕佽嚜鍔ㄥ垎鍓诧細

```typescript
// 鎵炬渶鍚庝竴涓崲琛岀浣滀负鍒嗗壊鐐癸紝閬垮厤鍦ㄥ彞瀛愪腑闂存柇寮€
let splitAt = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
```

### 鏍煎紡鍖?
- **Markdown 鈫?HTML** 杞崲锛圱elegram 鏀寔 HTML 鏍煎紡锛?- **瑙掕壊鍓嶇紑**锛歚銆愰煩淇°€慲 + 绌鸿 + 姝ｆ枃
- **Token 缁熻**锛歚鈫?234锛堝懡涓?00锛?鈫?67`锛岃浣犵煡閬撴瘡娆″璇濈殑 token 娑堣€?
### 澶氬獟浣?
Agent 鍙互鐢熸垚鍥剧墖鍜屾枃浠朵綔涓轰骇鐗╋紙artifacts锛夛紝閫氳繃 `sendPhotoFile` 鍜?`sendDocumentFile` 鑷姩鍙戦€併€?
---

## 鏉冮檺浣撶郴

| 灞傜骇 | 閰嶇疆 | 鑳藉姏 |
|------|------|------|
| **鐧藉悕鍗曠敤鎴?* | `TELEGRAM_ALLOWED_USERS` | 鍩虹瀵硅瘽銆佷細璇濈鐞嗐€佷换鍔℃帶鍒?|
| **绠＄悊鍛?* | `TELEGRAM_ADMIN_IDS` | 浠ヤ笂 + Git 瀹℃牳 + 涓嶅彈鏂囦欢娌欑闄愬埗 |
| **闈炵櫧鍚嶅崟** | 鈥?| 鐩存帴琚?auth middleware 鎷︽埅 |

鏅€氱敤鎴风殑鏂囦欢鎿嶄綔琚檺鍒跺湪 `workspace/userspace/telegram_<chatId>/` 鐩綍鍐咃紝admin 鐢ㄦ埛鍒欎笉鍙楅檺鍒躲€?
---

## 浠诲姟鎭㈠

褰撲换鍔¤ `/stop` 涓鍚庯紝涓婁笅鏂囦笉浼氫涪澶憋細

1. 淇濆瓨鏈€杩?10 鏉?loop messages 鍒版暟鎹簱
2. 淇 dangling tool calls锛堢粰鏈搷搴旂殑 tool_call 琛?"Cancelled" 鍝嶅簲锛?3. 鐢ㄦ埛闅忔椂鍙互鎵ц `/resume`锛岄€夋嫨瑕佹仮澶嶇殑浠诲姟
4. 鎭㈠鏃惰烦杩?`buildHistory()`锛岀洿鎺ヤ粠淇濆瓨鐨勪笂涓嬫枃缁х画

杩欐剰鍛崇潃浣犲彲浠ユ斁蹇冧腑姝竴涓暱鏃堕棿杩愯鐨勪换鍔★紝鍥炲ご鍐嶇户缁紝涓嶉渶瑕佷粠澶村紑濮嬨€?
---

## 涓嬩竴姝ワ細閫傞厤寰俊

鏈変簡 Telegram 浣滀负鍩虹嚎锛屼笅涓€姝ュ氨鏄妸杩欏鑳藉姏鎼埌寰俊涓娿€備絾寰俊鐨?iLink API 鍜?Telegram Bot API 鏈夋湰璐ㄥ樊寮傦細

| 鑳藉姏 | Telegram | 寰俊 iLink |
|------|----------|-----------|
| 鍙戦€佹秷鎭?| 鉁?| 鉁?|
| 缂栬緫宸插彂娑堟伅 | 鉁?| 鉂?|
| Inline 鎸夐挳 + 鍥炶皟 | 鉁?| 鉂?|
| 鍙戦€佸浘鐗?鏂囦欢 | 鉁?| 鉂?寰呴獙璇?|
| 鍛戒护娉ㄥ唽 | 鉁?`/command` | 鉂?闇€鍏抽敭璇嶅尮閰?|
| 瀵屾枃鏈牸寮?| 鉁?HTML | 鉂?绾枃鏈?|

鏍稿績鎸戞垬鏄?*娌℃湁 inline keyboard**鈥斺€旀墍鏈夌殑浜や簰寮忔搷浣滐紙瀹℃壒銆佷細璇濆垏鎹€佷换鍔℃仮澶嶏級閮介渶瑕佹敼閫犳垚鏂囧瓧浜や簰銆傝繖涓細鍦ㄤ笅涓€绡囪缁嗗睍寮€銆?
---

杩欏氨鏄洰鍓?LogicAI 脳 Telegram 鐨勫叏閮ㄥ姛鑳姐€備粠涓€涓畝鍗曠殑鑱婂ぉ bot锛屽埌鍏峰瀹炴椂杩涘害銆佸鎵规祦銆丟it 瀹℃牳銆佷换鍔℃仮澶嶇殑瀹屾暣 Agent 骞冲彴鈥斺€旇繖涓€鍒囬兘杩愯鍦ㄤ綘鐨勬墜鏈轰笂锛岄殢鏃跺彲鐢ㄣ€?