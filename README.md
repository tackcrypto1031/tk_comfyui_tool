# 🍌 ComfyUI Toolkit Node

A custom node extension for ComfyUI that provides a rich UI menu for managing and executing workflows with ease.

## Features
- **Graphic Interface**: In-app modal for managing workflows (T2I, I2I, Editing).
- **Admin Mode**: Configure presets, parameter visibility, and default values.
- **Workflow Protection**: Users only see what they need to see; complex logic is hidden.
- **Direct Execution**: Uses ComfyUI API to queue prompts directly.

## Installation

### Method 1: Copy Folder (Recommended for Dev)
1.  Locate your ComfyUI installation directory.
2.  Go to `ComfyUI/custom_nodes/`.
3.  Copy the entire `tk_comfyui_tooldesign` folder into `custom_nodes/`.
    - **IMPORTANT**: The folder name MUST be `tk_comfyui_tooldesign` for the styling to load correctly.
    - Final path should look like: `.../ComfyUI/custom_nodes/tk_comfyui_tooldesign/`
4.  Restart ComfyUI.

### Method 2: Git Clone (If hosted)
```bash
cd ComfyUI/custom_nodes/
git clone <repository_url>
```

## Usage

1.  **Open Toolkit**: Click the **"🍌 Toolkit"** button in the ComfyUI menu bar.
2.  **Admin Setup**:
    - Go to the **Admin** tab.
    - Upload a `workflow_api.json` (Save as API Format in ComfyUI Dev mode).
    - Set a name, category, and preview image URL.
    - Check the parameters you want to expose to users.
    - Click **Save Preset**.
3.  **Generate**:
    - Go to the category tab (e.g., Text to Image).
    - Select your preset.
    - Adjust parameters and click **Generate**.
