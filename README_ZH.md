# 🍌 ComfyUI Toolkit

![Status](https://img.shields.io/badge/狀態-已開源-brightgreen)
![License](https://img.shields.io/badge/授權-MIT-blue)

**將複雜的 ComfyUI 工作流轉換為精緻且易於使用的應用介面。**

ComfyUI Toolkit 是一款「應用層封裝框架」，旨在縮短工作流開發者與最終用戶之間的距離。它讓您能將複雜的節點圖封裝成簡潔、直觀的彈出式介面，使用戶無需面對背後的複雜邏輯，同時提供強大的生成工具。

---

## ✨ 核心特徵

- **🎨 專業 UI 外殼**：一個極簡且高效能的彈出視窗，直接懸浮在您的 ComfyUI 工作區之上。
- **🏗️ Admin 管理配置**：輕鬆定義要開放給用戶的參數（提示詞、種子、拉桿等），並能將變數重新命名為通俗易懂的名稱。
- **📦 預設管理系統**：將工作流按類別（如：文生圖、局部重繪）進行組織，並支援自定義預覽圖與描述。
- **🛡️ 邏輯隔離保護**：保護您的複雜節點邏輯不被意外修改。用戶只會看到他們需要操作的部分。
- **🕒 即時歷史紀錄**：內建生成歷史功能，支援即時預覽與參數回填。
- **🚀 一鍵執行**：與 ComfyUI API 無縫整合，實現低延遲的任務排隊。

## 🔧 近期修正（2026-02-21）

- **檔案路徑安全強化**：
  - 針對檔名新增安全化處理與目錄邊界檢查，避免路徑穿越（Path Traversal）。
  - 已套用於工作流上傳、預覽圖上傳、以及本地上傳圖片的讀取端點。
- **歷史紀錄行為可設定**：
  - 啟動時預設改為 **保留歷史紀錄**。
  - 管理員介面新增 **「啟動時清空歷史紀錄」** 開關。
  - 後端新增設定 API：`GET /tk/settings`、`POST /tk/save_settings`。
- **鏈式工作流驗證加強**：
  - 後端新增 `nextWorkflows` 驗證，防止：
    - 指向自己（self-reference）、
    - 指向非 `post_image` 類別工作流、
    - 形成循環依賴（cycle）。
  - 即使繞過前端檢查，API 也會阻擋不合法資料。
- **執行穩定性提升**：
  - 在需要圖片輸入時，對 `LoadImageFromPath` 增加必填路徑檢查。
  - 移除鏈式執行前脆弱的輸出節點白名單，改為依實際執行輸出判斷。
- **歷史回填更準確**：
  - 歷史紀錄新增儲存 `preset_id`。
  - 還原「做同款」時，優先以 `preset_id` 匹配，再退回 `preset_name`。
- **前端安全與可維護性整理**：
  - 移除 `tk_app.js` 內重複定義的 `openImageModal`。
  - Gallery 降低 inline click handler 依賴，並補上動態文字/屬性轉義。
- **第三輪穩定性/安全修正**：
  - 刪除 preset 時，會自動清理其他 preset 中失效的 `nextWorkflows` 參照。
  - Modal 與文字預覽改為安全文字輸出，避免原樣 HTML 注入。
  - 管理員「後續工作流」選單改為 DOM 建立 option，避免字串拼接 HTML 風險。
  - 表單渲染與 inline handler 的動態值改為轉義輸出，降低不可信 workflow 資料造成注入的風險。
- **第四輪可維護性重構（行為等價）**：
  - 將使用者/管理員表單中剩餘 inline handler（`onclick`/`onchange`/拖放屬性）改為 JS 集中事件綁定。
  - 將圖片 fallback 的 inline `onerror` 改為程式化綁定。
  - 在不改流程與互動行為前提下，降低 CSP 相容阻力並提升維護性。
- **第五輪安全強化（管理員參數面板）**：
  - 將 `parseAndShowConfig` 的管理員節點/參數渲染，從字串 `innerHTML` 拼接改為 DOM 安全建立（`textContent`/`value`/`dataset`）。
  - 避免 workflow 來源的節點名稱、參數名稱、預設值被瀏覽器當成可執行 HTML 解讀。
- **第六輪安全強化（模型管理介面）**：
  - 模型列表、比例編輯列、管理員模型下拉選單中的動態資料改為安全轉義輸出。
  - 補上 `ratios` 缺失或格式異常時的防禦式處理，避免模型編輯器因壞資料崩潰。
- **第七輪安全強化（尺寸選單渲染）**：
  - 將 `tk_ui.js` 中解析度 option 的渲染，從字串拼接 `innerHTML` 改為 DOM 建立 option。
  - 避免模型來源的寬高值在尺寸選單中成為 HTML 注入向量。
- **第八輪顯示穩定性（LoadImageFromPath 預覽）**：
  - 為 `LoadImageFromPath` 輸入加入路徑感知的預覽來源選擇。
  - 遇到絕對路徑時，優先嘗試 `/tk/view_upload/{basename}`，失敗再 fallback 到 `/view`，仍失敗則改顯示占位圖示。
- **第九輪選擇器穩定性（特殊字元安全 dataset 查找）**：
  - 將 `tk_app.js` 中由 node/input 動態拼接的 attribute selector，改為 dataset 比對 helper。
  - 避免 ID/鍵名含引號、中括號或其他特殊符號時 selector 失效，提升回填、上傳、seed 切換等流程穩定性。
- **第十輪全量 review 一次性修正**：
  - 修正上傳後程式化賦值僅觸發 `input` 導致狀態未保存問題，改為同步觸發 `input` 與 `change`。
  - 將 `loadHistorySettings` 從 `setTimeout` 時序依賴改為可等待的渲染流程，並補上來源 workflow 安全處理。
  - 收緊鏈式接圖目標判定：移除「任意 scalar 欄位」fallback，僅允許已知圖片路徑鍵。
  - 由執行歷史組合 Comfy `/view` 圖片 URL 時，補上各段編碼處理。
  - 強化模型管理器的模型 ID 產生邏輯（處理空 ID 與重複 ID）。
  - 後端新增 `save_models/get_models` 的 models 結構驗證、正規化與壞資料回復邏輯。

### ✅ 驗證結果

- Python 單元測試：`13/13` 通過（`tests/test_tack_server.py`）
- JS 工具測試：`6/6` 通過（`tests/tk_workflow_utils.test.mjs`）

---

## 🛠️ 安裝說明

### 前提條件
- 已安裝並運行 [ComfyUI](https://github.com/comfyanonymous/ComfyUI)。

### 標準安裝
1.  進入您的 ComfyUI `custom_nodes` 目錄：
    ```bash
    cd 您的路徑/ComfyUI/custom_nodes/
    ```
2.  複製此儲存庫：
    ```bash
    git clone https://github.com/tackcrypto1031/tk_comfyui_tool.git
    ```
    樣式與上傳的預覽圖會自動使用實際安裝資料夾，不需要改名；原有的 `tk_comfyui_tooldesign` 安裝方式也能正常使用。
3.  重啟 ComfyUI，再於瀏覽器按 `Ctrl+F5` 重新整理，即可看到畫面右側的 **🍌 Toolkit** 按鈕。

---

## 📖 使用指南

### 1. 針對管理員 (工作流設計者)
1.  **準備工作流**：在 ComfyUI 中開啟「開發者模式 (Dev mode)」，並將工作流儲存為 **API 格式** (`workflow_api.json`)。
2.  **開啟 Toolkit**：點擊畫面右側的 **🍌** 浮動按鈕。
3.  **建立預設 (Preset)**：
    - 切換至 **Admin** 標籤頁。
    - 上傳您的 `workflow_api.json`。
    - 設定名稱、類別及一張吸引人的預覽圖。
    - 勾選您想要開放給用戶調整的節點與參數。
    - 點擊 **Save Preset**。

### 2. 針對終端用戶
1.  **選擇工具**：瀏覽類別並選擇您想要使用的工具。
2.  **調整參數**：根據管理員的設定，輸入提示詞或調整拉桿。
3.  **開始生成**：點擊 **"Generate"**。結果將顯示在預覽區及 **History** 歷史紀錄分頁中。

---

## 🧬 技術架構

- **後端**：基於 Python 的 ComfyUI 擴充插件，負責處理預設持久化儲存與圖片資產管理。
- **前端**：使用輕量級原生 JavaScript 與 CSS 編寫，確保最高相容性與執行速度。支援多種螢幕尺寸的響應式設計。
- **API**：與 ComfyUI 的提示詞執行引擎進行無縫通訊。

---

## 🤝 參與貢獻

歡迎任何形式的貢獻！無論是新增功能、優化 UI 或是修復 Bug，都歡迎提交 Issue 或 Pull Request。

## 📄 授權協議

本項目採用 [MIT License](./LICENSE) 授權。

---

*Made with 🍌 by Tack (tack1031@gmail.com).*
