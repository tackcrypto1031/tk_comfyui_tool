import { app } from "../../scripts/app.js";
import { ToolkitUI } from "./tk_ui.js";
import { ToolkitApp } from "./tk_app.js";

console.log("🍌 Toolkit Extension: Loading...");

app.registerExtension({
    name: "Comfy.Toolkit",
    async setup() {
        console.log("🍌 Toolkit Extension: Setup started");

        // Inject CSS
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = "extensions/tk_comfyui_tooldesign/tk_style.css";
        document.head.appendChild(link);

        // Create Floating Button
        const floatBtn = document.createElement("div");
        floatBtn.className = "tk-floating-btn";
        floatBtn.textContent = "🍌";
        floatBtn.title = "Open Toolkit";

        floatBtn.onclick = () => {
            ToolkitApp.init();
            ToolkitUI.open();
        };

        document.body.appendChild(floatBtn);
        console.log("🍌 Toolkit: Floating button added to body");
    }
});
