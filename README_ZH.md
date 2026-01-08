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
    git clone https://github.com/tackcrypto1031/tk_comfyui_tool.git tk_comfyui_tooldesign
    ```
    > [!IMPORTANT]
    > 資料夾名稱必須準確為 `tk_comfyui_tooldesign`，否則樣式與資產將無法正確載入。
3.  重啟 ComfyUI。

---

## 📖 使用指南

### 1. 針對管理員 (工作流設計者)
1.  **準備工作流**：在 ComfyUI 中開啟「開發者模式 (Dev mode)」，並將工作流儲存為 **API 格式** (`workflow_api.json`)。
2.  **開啟 Toolkit**：點擊右側邊欄的 **"🍌 Toolkit"** 按鈕。
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

*Made with 🍌 by the TK Team.*
