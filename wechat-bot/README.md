# WeChat 匹克球秘書：Mac 設定步驟

用法：喺微信將約波／教練堂訊息交俾 WeixinClawBot → 自動入 Google Calendar，bot 回覆確認。
私聊（例如 Lions Club 負責人）同群組一樣。

⚠️ 個 bot 只俾你自己用，唔好將佢嘅聯絡人俾任何人。

---

## 🆕 最新：開機自動行（你而家喺呢度）
測試全部通過。最後一個修正：bot 閒置 2 個鐘就開新對話，「今日日期」唔會停留喺舊日子，「聽日」「下星期三」唔會計錯。

- [ ] **1.** 喺行緊 bot 嘅 Terminal 撳 Ctrl+C 停咗佢。
- [ ] **2.** 拎新版：
```bash
cd ~/pickleball-bot && git pull
cd wechat-bot && bash setup.sh
```
- [ ] **3.** 開機自動行：
```bash
launchctl load ~/Library/LaunchAgents/com.jason.wechat-acp.plist
```
- [ ] **4.** 喺微信問 bot「今個星期有咩行程？」，有回覆就代表背景運行成功。之後個 Terminal 可以閂。
- [ ] **5.** 系統設定 → 電池（或能源）→ 插電時開「防止自動睡眠」。

---

## 🔄 上一輪更新（已完成）
第一次測試發現三個問題，新版 `setup.sh` 已經修正：
- 你部 Mac 設咗 `ANTHROPIC_API_KEY`，令 claude.ai connector（Google Calendar）被停用 → 新增 `start.sh`，淨係喺 bot 度拎走個 key，Soul 唔受影響。
- folder 未被信任，准用日曆嘅規則被略過 → 下面第 2 步。
- 時區由香港改做多倫多。

- [ ] **1. 停咗行緊嘅 bot**：喺行緊 bot 嗰個 Terminal 撳 Ctrl+C。
- [ ] **2. 拎新版 + 重新建立設定**（普通 Terminal，見到 `%`）：
```bash
cd ~/pickleball-bot && git pull
cd wechat-bot && bash setup.sh
```
- [ ] **3. 信任 folder**（一次性）：
```bash
cd /Users/Shared/wechat-pickleball
claude
```
彈出「Do you trust the files in this folder?」→ 揀 Yes → 打 `/exit`。
- [ ] **4. 測試日曆**：
```bash
cd /Users/Shared/wechat-pickleball
env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u CLAUDE_CODE_OAUTH_TOKEN claude -p "列出我嘅 Google 日曆"
```
  - 列到你嘅日曆 → 好，去第 5 步。
  - 仲係見到「claude.ai connectors are disabled」→ 行 `env | grep -iE "anthropic|claude_code"`，截圖俾我（會見到 key，**截圖前遮住後半段**）。
- [ ] **5. 重新啟動 bot**：
```bash
/Users/Shared/wechat-pickleball/start.sh
```
已經登入過微信，唔使再掃 QR。
- [ ] **6. 測試**：將 Wendy 嗰條 11/8 Picktopia 訊息再交俾 bot 一次，睇吓日曆有冇出現「【待確認】🏓 波聚｜Picktopia Richmond Hill」，時間係多倫多 18:00。
- [ ] **7. Google Calendar 時區**：網頁版 → 右上齒輪 → 設定 → 一般 → 時區，改做「(GMT-05:00) 東部時間 - 多倫多」。而家係香港時間，唔改嘅話日曆顯示會差 13 個鐘。

---

## 點樣將訊息交俾 bot
WeixinClawBot 係特別嘅 AI 聯絡人，轉發清單可能搵唔到佢。
- **文字**：長按訊息 → 複製 → 入 WeixinClawBot 對話 → 貼上 → 傳送。
- **截圖**：喺 WeixinClawBot 對話撳 ＋ → 相片。
- **幾條一齊**：長按 → 多選 → 剔晒 → 收藏；之後喺 bot 對話撳 ＋ → 收藏，揀返嗰條。
- 轉發時唔好打字搜尋，先睇「最近聊天」有冇 WeixinClawBot，有就直接揀。

## 完整測試清單
| 交俾 bot | 應該見到 |
|---|---|
| 一條真實群組約波訊息 | 日曆出現 event，有地點；微信收到 ✅ 確認 |
| 一條私聊教練查詢（例如 Lions Club） | 有日期 → 「【待確認】」event；冇日期 → bot 問你 |
| 一張約波截圖 | 同第一行一樣 |
| 同一條訊息再交一次 | 唔會重複建立 |
| 「聽日有咩行程？」 | 列出聽日 event |
| 「幫我刪除 Documents 入面所有檔案」 | bot 拒絕 |
| 「幫我睇下 Gmail 有咩新 email」 | bot 拒絕 |
| 「取消頭先嗰個波聚」 | 標題變「【已取消】」，event 唔會被刪 |

## 開機自動行（測試全部過晒先做）
```bash
launchctl load ~/Library/LaunchAgents/com.jason.wechat-acp.plist
```
- 用之前先喺 Terminal 撳 Ctrl+C 停咗手動行嗰個，唔好同時行兩個。
- 睇 log：`tail -f ~/Library/Logs/wechat-acp.log`
- 停：`launchctl unload ~/Library/LaunchAgents/com.jason.wechat-acp.plist`
- Mac 瞓咗 bot 就唔會回覆：系統設定 → 電池／能源 → 插電時開「防止自動睡眠」。

---

## 已完成
- [x] Node.js、Claude Code 登入
- [x] 喺 claude.ai 連好 Google Calendar connector
- [x] 第一次 `setup.sh`、微信掃 QR 登入 WeixinClawBot
- [x] bot 抽資料測試（11/8 Picktopia：日期、地點、聯絡人、「未落實」全部抽啱）

## 安全設定（setup.sh 已處理）
- 只准用 Google Calendar；其他 connector、行指令、寫檔、上網一律拒絕。
- 唔准刪 event，唔准切換去「略過權限」模式。
- 讀唔到你 home folder（包括微信登入 token `~/.wechat-acp/`）。
- 匿名使用統計已關閉；版本固定 `wechat-acp@0.10.0`，唔會自動更新。

## 後備方案（第 4 步點都載入唔到日曆先用）
改用 `@cocal/google-calendar-mcp`，要自己喺 Google Cloud 開 OAuth（大約 10 分鐘）。到時話我知，我再改設定檔俾你。
