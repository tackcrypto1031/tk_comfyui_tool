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

## 🔧 Recent Fixes (2026-02-21)

- **Security hardening for file routes**:
  - Added filename sanitization and safe path-join guards to prevent path traversal.
  - Applied to workflow upload, preview image upload, and local image serving endpoints.
- **History behavior is now configurable**:
  - Default behavior is now to **preserve history on startup**.
  - Added new admin setting: **"Clear history on startup"**.
  - Added backend settings endpoints: `GET /tk/settings`, `POST /tk/save_settings`.
- **Chain workflow validation improved**:
  - Added backend validation for `nextWorkflows` to prevent:
    - self-reference,
    - references to non-`post_image` workflows,
    - circular dependency chains.
  - Keeps API behavior consistent even if frontend checks are bypassed.
- **Execution robustness improved**:
  - Added strict validation for `LoadImageFromPath` image/path inputs when execution requires an image.
  - Removed fragile output-node class whitelist check before chaining; chaining now relies on real execution outputs.
- **History restore reliability improved**:
  - Saved `preset_id` into history records.
  - History replay now matches by `preset_id` first, then falls back to name.
- **Frontend hardening and cleanup**:
  - Removed duplicated `openImageModal` definition in `tk_app.js`.
  - Reduced inline click handlers in gallery and escaped dynamic text/attributes for safer rendering.
- **Third-round stability/security fixes**:
  - Deleting a preset now automatically removes stale references from other presets' `nextWorkflows`.
  - Hardened text rendering in modal/text preview paths to avoid raw HTML injection.
  - Admin "next workflow" selector now uses DOM option creation instead of string-concatenated HTML.
  - Escaped dynamic values used by form rendering/inline handlers to reduce injection risk from untrusted workflow data.
- **Fourth-round maintainability refactor (behavior-equivalent)**:
  - Replaced remaining inline handlers in user/admin forms (`onclick`/`onchange`/drag-drop attrs) with centralized event binding via JavaScript.
  - Replaced remaining inline image fallback handlers (`onerror`) with programmatic handlers.
  - Preserved existing UX/flow while reducing CSP friction and improving maintainability.
- **Fifth-round security hardening (admin parameter panel)**:
  - Refactored admin node/parameter rendering in `parseAndShowConfig` from string-based `innerHTML` injection to DOM-safe node construction (`textContent`/`value`/`dataset`).
  - Prevents workflow-sourced node/parameter/default-value text from being interpreted as executable HTML.
- **Sixth-round security hardening (model admin UI)**:
  - Escaped dynamic model data in model list, ratio editor rows, and admin model dropdown options.
  - Added defensive handling when model `ratios` is missing/non-array to avoid editor crash on malformed model data.
- **Seventh-round security hardening (size selector rendering)**:
  - Replaced resolution option rendering in `tk_ui.js` from string-concatenated `innerHTML` to DOM option creation.
  - Prevents model-sourced width/height values from becoming HTML injection vectors in the size selector.
- **Eighth-round display robustness (LoadImageFromPath preview)**:
  - Added path-aware preview source selection for `LoadImageFromPath` inputs.
  - Absolute paths now try `/tk/view_upload/{basename}` first, then fallback to standard `/view` preview, and finally fallback to placeholder icon if both fail.
- **Ninth-round selector robustness (special-char-safe dataset lookup)**:
  - Replaced dynamic attribute selectors built from node/input IDs with dataset-based matching helpers in `tk_app.js`.
  - Prevents failures when IDs/keys contain selector-breaking characters (quotes/brackets/special symbols), improving restore/upload/seed-toggle reliability.
- **Tenth-round full-pass review fixes (single batch)**:
  - Fixed upload state persistence mismatch by dispatching both `input` and `change` when programmatically updating form values after upload/restore.
  - Removed `loadHistorySettings` timing race (`setTimeout`-based) by switching to awaited render flow and safer source workflow handling.
  - Tightened chained image target detection: removed fallback to arbitrary scalar input keys; now only known image path keys are eligible.
  - Encoded Comfy `/view` URL parts when building image preview URLs from execution history.
  - Hardened model ID generation in admin model editor (empty/duplicate ID handling).
  - Added backend model payload validation/normalization for `save_models` and resilient cleanup/fallback logic in `get_models`.

### ✅ Validation

- Python unit tests: `13/13` passing (`tests/test_tack_server.py`)
- JS utility tests: `6/6` passing (`tests/tk_workflow_utils.test.mjs`)

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

*Made with 🍌 by Tack (tack1031@gmail.com).*
