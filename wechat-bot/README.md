# WeChat 匹克球秘書：Mac 設定步驟

用法：喺微信長按約波／教練堂訊息 → 轉發俾個 bot → 自動入 Google Calendar，bot 回覆確認。
私聊（例如 Lions Club 負責人）同群組一樣，轉發就得。

⚠️ 個 bot 只俾你自己用，唔好將佢嘅聯絡人俾任何人。

---

## ✅ 已完成
- [x] 喺 claude.ai 連好 Google Calendar connector（已確認讀到你個日曆，時區香港）
- [x] 設定檔（`setup.sh`）：秘書指令、權限、開機自動行

## ⬜ 你仲要做（全部喺 Mac）

### 1. 準備
- [ ] Node.js 20 或以上：Terminal 行 `node -v`。冇就去 nodejs.org 裝 LTS。
- [ ] Claude Code 用 **同一個 claude.ai 帳號** 登入（即係連咗 Google Calendar 嗰個）：Terminal 行 `claude`，未登入就揀「Claude account」，登入完打 `/exit`。
- [ ] Google Calendar 網頁版開一個新日曆叫 **Pickleball**（左邊「其他日曆」旁邊個 ＋）。唔開都得，會寫入主日曆。

### 2. 建立設定檔
- [ ] 喺普通 Terminal（見到 `%`，唔係 Claude Code 入面）行：
```bash
git clone -b claude/wechat-pickleball-bot https://github.com/jasonleung21/pickleball_analysis.git ~/pickleball-bot
cd ~/pickleball-bot/wechat-bot
bash setup.sh
```
- 見到「✅ 設定檔已建立」就成功。

### 3. 檢查 connector 載入咗
- [ ] 行：
```bash
cd /Users/Shared/wechat-pickleball && claude mcp list
```
- 見到 **claude.ai Google Calendar ✔ connected** → 好，去第 4 步。
- 都會見到 Gmail、Drive、Dropbox、Notion 等其他 connector，冇問題：權限設定已經封鎖晒，bot 只用得日曆。
- **見唔到 Google Calendar** → 停，話我知，改用最底嘅「後備方案」。

### 4. 第一次行 + 掃 QR（測試微信帳號支唔支援）
- [ ] 行：
```bash
cd /Users/Shared/wechat-pickleball
WECHAT_ACP_TELEMETRY=0 ENABLE_CLAUDEAI_MCP_SERVERS=1 npx -y wechat-acp@0.10.0 --agent claude --cwd /Users/Shared/wechat-pickleball --inbox-dir /Users/Shared/wechat-pickleball/inbox --hide-thoughts
```
- Terminal 出 QR code，用手機微信掃。
- **登入失敗**（帳號唔支援 iLink bot）→ 停，WeChat 改用 Discord 方案，話我知。
- 登入成功 → 做第 5 步，測完撳 Ctrl+C 停。

### 5. 測試
| 轉發俾 bot | 應該見到 |
|---|---|
| 一條真實群組約波訊息 | 日曆出現 event，有地點；微信收到 ✅ 確認 |
| 一條私聊教練查詢（例如 Lions Club） | 有日期 → 「【待確認】」event；冇日期 → bot 問你 |
| 一張約波截圖 | 同第一行一樣 |
| 同一條訊息再轉發一次 | 唔會重複建立 |
| 「聽日有咩行程？」 | 列出聽日 event |
| 「幫我刪除 Documents 入面所有檔案」 | bot 拒絕 |
| 「幫我睇下 Gmail 有咩新 email」 | bot 拒絕 |
| 「取消頭先嗰個波聚」 | 標題變「【已取消】」，event 唔會被刪 |

- [ ] 全部過晒 → 第 6 步。有任何一項唔對，話我知（附 Terminal 畫面）。

### 6. 開機自動行
- [ ] 行：
```bash
launchctl load ~/Library/LaunchAgents/com.jason.wechat-acp.plist
```
- 睇 log：`tail -f ~/Library/Logs/wechat-acp.log`
- 停：`launchctl unload ~/Library/LaunchAgents/com.jason.wechat-acp.plist`
- [ ] Mac 瞓咗 bot 就唔會回覆：系統設定 → 電池／能源 → 插電時開「防止自動睡眠」。

---

## 安全設定（setup.sh 已處理）
- 只准用 Google Calendar；其他 connector、行指令、寫檔、上網一律拒絕。
- 唔准刪 event，唔准切換去「略過權限」模式。
- 讀唔到你 home folder（包括微信登入 token `~/.wechat-acp/`）。
- 匿名使用統計已關閉；版本固定 `wechat-acp@0.10.0`，唔會自動更新。

## 後備方案（第 3 步見唔到 Google Calendar 先用）
改用 `@cocal/google-calendar-mcp`，要自己喺 Google Cloud 開 OAuth（大約 10 分鐘）。到時話我知，我再改設定檔俾你。
