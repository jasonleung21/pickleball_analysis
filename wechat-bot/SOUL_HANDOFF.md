# 交接：改寫 Soul Discord bot（由雲端對話交接，2026-11-02）

## 開工前
1. 依序讀 Vault：`~/ai-vault/README.md` → `agent-persona.md` → `memory-summary.md`，以 Soul 🧭 身份同 Jason 協作。
2. 搵 Soul Discord bot 嘅 code（喺 `~/ai-vault` 入面），睇清楚：入口、scheduler／routine、Discord 發訊息方式、現有 digest 指令、用咩語言同套件、點樣啟動（launchd？）。
3. **改 code 之前先寫計劃俾 Jason 批**。

## 背景
- Jason 住**多倫多**（America/Toronto）。波聚同教練堂喺唔同會所，資訊散喺 WeChat／WhatsApp，怕漏或者遲到。
- 目標：所有行程集中喺 Google Calendar，Soul 由「固定 routine」改為「讀日曆再決定提醒」。

## 已完成（雲端對話做咗）
**Google Calendar（jasonleung21@gmail.com，時區 America/Toronto）**
- 日曆：`Pickleball`（波聚／教練堂／訂場）、主日曆、香港節假日。
- 已訂閱 3 個會所嘅 CourtReserve iCal feed（Jason book 嘅場自動出現；Google 約 8–24 個鐘先更新一次）。

**WeChat 入口：WeixinClawBot（`wechat-acp@0.10.0` + Claude Code），已測試全部通過**
- 位置：`/Users/Shared/wechat-pickleball/`（`CLAUDE.md` 秘書指令、`.claude/settings.json` 權限、`start.sh` 啟動）。
- 開機自動行：`~/Library/LaunchAgents/com.jason.wechat-acp.plist`；log：`~/Library/Logs/wechat-acp.log`。
- 來源：`~/pickleball-bot/wechat-bot/`（GitHub `jasonleung21/pickleball_analysis` branch `claude/wechat-pickleball-bot`）。
- 用法：WeChat 訊息轉發／複製／截圖俾 WeixinClawBot → 寫入 `Pickleball` 日曆，標題格式「🏓 波聚｜場地」「🎓 教練堂｜場地」「🎾 訂場｜場地」，未落實嘅加「【待確認】」，取消改標題「【已取消】」（唔刪）。
- 權限：只准用 Google Calendar connector（`defaultMode: dontAsk`），唔准刪 event、行指令、寫檔、上網、讀 home。
- 已知事項：Mac 環境設咗 `ANTHROPIC_API_KEY`，會令 Claude Code 停用 claude.ai connector；`start.sh` 啟動前會 unset 佢（只影響 bot）。

**Jason 嘅決定**
- 「【待確認】」規則唔使收緊。
- 時區用多倫多。

## 要做：改寫 Soul
功能（先同 Jason 確認優先次序）：
1. **每晚 21:00 聽日行程**：讀聽日所有相關日曆 → 時間、場地、幾點出發、費用；冇 event 嗰日唔出聲。
2. **出發提醒**：「建議出發時間 − 15 分鐘」DM Jason。
3. **撞期警告**：時間重疊，或者兩個活動之間唔夠交通時間。
4. **星期日晚一週總覽** + 列出所有「【待確認】」event。

技術建議（同 Jason 傾）：
- **讀日曆最簡單：iCal 網址，唔使 OAuth**。Soul 只需要讀：
  - `Pickleball` 同主日曆：Google Calendar 網頁 → 設定 → 揀日曆 → 「iCal 格式的私密網址」。
  - 3 個 CourtReserve feed：直接用 CourtReserve 個網址（比經 Google 更新快）。
  - 呢啲網址等同密碼：放 `.env`／Keychain，唔好 commit，唔好寫入 Vault 明文。
- **交通時間**：先用場地 → 分鐘嘅對照表（放 Vault 或 config），唔使一開始就接 Google Maps API。
- 去重：同一個活動可能同時喺 CourtReserve feed 同 `Pickleball` 日曆出現（同日、時間相近、場地相似 → 當同一個）。

## 已決定：WhatsApp 入口
- WhatsApp（群組同私聊）一律複製或截圖貼俾 WeixinClawBot。所有行程用同一個入口、同一套規則。
- 唔做 iPhone 捷徑 → Discord；唔用非官方工具自動讀 WhatsApp（違反條款，有封號風險）。
- 所以 Soul **唔使**識寫日曆，只需要讀日曆同提醒。

## 未決
- 確認 Jason 有冇做咗：`launchctl load` WeChat bot、Mac「插電時防止自動睡眠」。

## 完成後
- 將今日所有決定寫入 Vault（`memory-summary.md` + INDEX 同步）。
