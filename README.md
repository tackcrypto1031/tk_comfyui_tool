# 🍌 ComfyUI Toolkit

![Status](https://img.shields.io/badge/Status-Open--Source-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

**Transform complex ComfyUI workflows into sleek, user-friendly applications.**

ComfyUI Toolkit is an "Application Layer Framework" designed to bridge the gap between workflow developers and end-users. It allows you to wrap complex node graphs into a clean, intuitive modal interface, shielding users from the underlying complexity while providing a powerful tool for generation.

---

## ✨ Key Features

- **🎨 Professional UI Shell**: A minimalist, high-performance modal that floats right on top of your ComfyUI workspace.
- **🏗️ Admin Configuration**: Easily define which parameters (prompts, seeds, sliders) to expose to users. Rename variables into human-friendly terms.
- **📦 Preset Management**: Organize workflows into categories (e.g., Text-to-Image, Inpainting) with custom preview images and descriptions.
- **🛡️ Logic Isolation**: Protect your complex node logic from accidental tampering. Users only see what they need to see.
- **🕒 Real-time History**: Built-in generation history with instant preview and parameter recall.
- **🚀 One-Click Execution**: Direct integration with ComfyUI's API for low-latency prompt queuing.

---

## 🛠️ Installation

### Prerequisites
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) installed and running.

### Standard Installation
1.  Navigate to your ComfyUI's `custom_nodes` directory:
    ```bash
    cd YourPathTo/ComfyUI/custom_nodes/
    ```
2.  Clone the repository:
    ```bash
    git clone https://github.com/tackcrypto1031/tk_comfyui_tool.git tk_comfyui_tooldesign
    ```
    > [!IMPORTANT]
    > The folder name must be exactly `tk_comfyui_tooldesign` for styles and assets to load correctly.
3.  Restart ComfyUI.

---

## 📖 How to Use

### 1. For Admins (Workflow Designers)
1.  **Prepare Workflow**: In ComfyUI, enable "Dev mode" and save your workflow as **API Format** (`workflow_api.json`).
2.  **Open Toolkit**: Click the **"🍌 Toolkit"** button on the right sidebar.
3.  **Create Preset**:
    - Go to the **Admin** tab.
    - Upload your `workflow_api.json`.
    - Set a name, category, and an attractive preview image.
    - Select the nodes and widgets you want to expose to the user.
    - Click **Save Preset**.

### 2. For Users
1.  **Select Workflow**: Browse categories and select the desired tool.
2.  **Input Parameters**: Fill in prompts or adjust sliders as defined by the admin.
3.  **Generate**: Click **"Generate"**. Your results will appear in the preview area and the **History** tab.

---

## 🧬 Technical Architecture

- **Backend**: Python-based extension for ComfyUI, handling preset persistence and image asset management.
- **Frontend**: Lightweight, vanilla JavaScript and CSS for maximum compatibility and speed. Responsive design for various screen sizes.
- **API**: Seamless communication with ComfyUI's prompt execution engine.

---

## 🤝 Contributing

Contributions are welcome! Whether it's adding new features, improving the UI, or fixing bugs, feel free to open an issue or submit a pull request.

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

---

*Made with 🍌 by the TK Team.*
