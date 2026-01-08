import { api } from "../../scripts/api.js";
import { ToolkitUI } from "./tk_ui.js";

export const ToolkitApp = {
    // --- CACHE ---
    historyCache: null,
    isListening: false,
    currentPromptId: null,
    stateCache: {}, // Stores inputs and preview per preset ID

    init() {
        if (this.isListening) return;
        this.isListening = true;

        // Expose to window for inline HTML events
        window.ToolkitApp = this;

        api.addEventListener('progress', (e) => this.onProgress(e));
        api.addEventListener('status', (e) => this.onStatus(e));
        api.addEventListener('executed', (e) => this.onExecuted(e));
    },

    onProgress(e) {
        const { value, max } = e.detail;
        const progress = Math.floor((value / max) * 100);
        const bar = document.getElementById('tk-progress-area');
        if (bar) {
            bar.classList.remove('tk-hidden');
            document.getElementById('tk-progress-percent').innerText = progress + '%';
            document.getElementById('tk-progress-fill').style.width = progress + '%';
        }
    },

    onStatus(e) {
        if (!e.detail || !e.detail.exec_info) return;
        const count = e.detail.exec_info.queue_remaining;
        const queueElem = document.getElementById('tk-queue-count');
        if (queueElem) queueElem.innerText = `Waiting: ${count}`;

        if (count === 0) {
            // Optional: Hide progress bar after a delay?
            // document.getElementById('tk-progress-area').classList.add('tk-hidden');
        }
    },

    async onExecuted(e) {
        // Refresh gallery if open
        const gallery = document.getElementById('tk-gallery-container');
        if (gallery) {
            this.renderGallery(gallery.parentElement); // Re-render
        }

        // Handle Preview Update (Image or Text)
        if (this.currentPromptId && e.detail.prompt_id === this.currentPromptId) {
            try {
                const hRes = await api.fetchApi('/history/' + this.currentPromptId);
                if (hRes.ok) {
                    const hData = await hRes.json();
                    const data = hData[this.currentPromptId];
                    if (data && data.outputs) {
                        let foundImage = null;
                        let foundText = null;

                        for (const nodeId in data.outputs) {
                            const out = data.outputs[nodeId];
                            // Check for Images
                            if (out.images && out.images.length > 0) {
                                const img = out.images[0];
                                foundImage = `/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`;
                                break; // Prioritize image
                            }
                            // Check for Text (common keys: text, string, value)
                            if (!foundImage && (out.text || out.string || out.value)) {
                                foundText = out.text || out.string || out.value;
                                if (Array.isArray(foundText)) foundText = foundText.join('\n');
                            }
                        }

                        if (foundImage) {
                            ToolkitUI.updatePreview('image', foundImage);
                            this.savePresetState(this.currentPresetId, { preview: { type: 'image', content: foundImage } });
                        } else if (foundText) {
                            ToolkitUI.updatePreview('text', foundText);
                            this.savePresetState(this.currentPresetId, { preview: { type: 'text', content: foundText } });
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch execution result for preview", err);
            }
            this.currentPromptId = null; // Reset
            this.currentPresetId = null; // Reset
        }

        // Hide progress if done
        const bar = document.getElementById('tk-progress-area');
        if (bar) {
            document.getElementById('tk-progress-percent').innerText = '100%';
            document.getElementById('tk-progress-fill').style.width = '100%';
            setTimeout(() => {
                // Only hide if queue is empty
                const queueElem = document.getElementById('tk-queue-count');
                if (queueElem && (queueElem.innerText === 'Waiting: 0' || queueElem.innerText === '')) {
                    bar.classList.add('tk-hidden');
                }
                document.getElementById('tk-progress-fill').style.width = '0%';
            }, 1000);
        }
    },

    // --- UTILS ---
    uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    // --- USER MODE ---

    async loadPresets(category, sidebarList, mainPanel) {
        try {
            if (!this.presetsCache) {
                const response = await api.fetchApi('/tk/presets');
                this.presetsCache = await response.json();
            }

            // Define Category Mapping
            const catMap = {
                'image': ['t2i', 'i2i', 'edit'],
                'video': ['t2v', 'i2v', 'v2v'],
                'reverse': ['rev_image', 'rev_video']
            };

            let filtered = [];
            if (catMap[category]) {
                filtered = this.presetsCache.filter(p => catMap[category].includes(p.category));
            } else {
                // Fallback for direct match or other
                filtered = this.presetsCache.filter(p => p.category === category);
            }

            ToolkitUI.renderPresetList(filtered, sidebarList, mainPanel, category);
        } catch (e) {
            console.error(e);
            sidebarList.innerHTML = '<div style="color:red; padding: 20px;">載入失敗</div>';
        }
    },

    async executeWorkflow(preset) {
        const btn = document.getElementById('tk-generate-btn');
        const statusContainer = document.getElementById('tk-status-container');
        const statusMsg = document.getElementById('tk-status-msg');

        btn.disabled = true;
        btn.innerHTML = '<div class="tk-badge-pulse" style="display:inline-block; margin-right:8px;"></div> Generating...';

        statusContainer.classList.remove('tk-hidden');
        statusMsg.className = 'tk-status-msg tk-status-emerald';
        statusMsg.textContent = "🚀 正在準備工作流...";

        try {
            let workflow = JSON.parse(JSON.stringify(preset.workflow));
            const inputs = document.querySelectorAll('.tk-form-input');

            inputs.forEach(input => {
                const nodeId = input.dataset.node;
                const inputName = input.dataset.input;
                let value = input.value;

                const randomToggle = document.querySelector(`.tk-random-seed-toggle[data-node="${nodeId}"][data-input="${inputName}"]`);

                // 1. Random Seed
                if (randomToggle && randomToggle.checked) {
                    value = Math.floor(Math.random() * 100000000000000);
                }
                // 2. Explicit Type Handling
                else if (input.dataset.type === 'number') {
                    if (value.includes('.')) value = parseFloat(value);
                    else value = parseInt(value);
                }
                else if (input.dataset.type === 'string' || input.dataset.nodeClass === 'LoadImage') {
                    // Keep as string
                    value = String(value);
                }
                // 3. Fallback Heuristic (Legacy)
                else {
                    if (!isNaN(value) && value.trim() !== '') {
                        if (value.includes('.')) value = parseFloat(value);
                        else value = parseInt(value);
                    }
                }

                if (workflow[nodeId] && workflow[nodeId].inputs) {
                    workflow[nodeId].inputs[inputName] = value;

                    // CRITICAL FIX for LoadImageFromPath
                    // If the UI knows this is LoadImageFromPath (via preset), but the underlying workflow 
                    // still says LoadImage (due to stale preset data), validation will fail.
                    // We FORCE the class_type to match what the UI logic expects.
                    if (input.dataset.nodeClass === 'LoadImageFromPath') {
                        // Ensure we update it so ComfyUI knows to check for absolute path input
                        console.log(`🔧 Auto-Correcting Node ${nodeId} class_type to LoadImageFromPath`);
                        workflow[nodeId].class_type = 'LoadImageFromPath';
                        // Remove potential 'upload' or 'subfolder' keys that LoadImageFromPath doesn't need
                        if (workflow[nodeId].inputs['upload']) delete workflow[nodeId].inputs['upload'];
                        if (workflow[nodeId].inputs['subfolder']) delete workflow[nodeId].inputs['subfolder'];
                    }
                }
            });

            // Validation & Sanitization: LoadImage nodes
            for (const nodeId in workflow) {
                const node = workflow[nodeId];
                if (node.class_type === 'LoadImage') {
                    // 1. Force 'image' to be a string
                    if (node.inputs && node.inputs['image']) {
                        node.inputs['image'] = String(node.inputs['image']).trim();
                    }

                    // 2. Explicitly set subfolder to empty string if missing or null, to match standard API behavior
                    if (!node.inputs['subfolder']) {
                        node.inputs['subfolder'] = "";
                    }

                    const val = node.inputs['image'];
                    if (!val || val === '') {
                        alert(`❌ Node ${nodeId} (${node._meta?.title || 'LoadImage'}) requires an image! Please upload one.`);
                        btn.disabled = false;
                        btn.innerHTML = '重試 (Retry)';
                        statusContainer.classList.add('tk-hidden');
                        return; // Stop execution
                    }

                    // Log the sanitized node for debugging
                    console.log(`🧹 Sanitized LoadImage Node ${nodeId}:`, JSON.stringify(node.inputs));
                }
            }

            // Detailed debug logging
            console.log("🚀 Executing Workflow:", workflow);

            // Check for output nodes
            const outputTypes = ['SaveImage', 'PreviewImage', 'ShowText', 'ShowText|pysssss', 'TK_ShowText'];
            const outputNodes = [];
            for (const nodeId in workflow) {
                const node = workflow[nodeId];
                if (outputTypes.includes(node.class_type)) {
                    outputNodes.push({ id: nodeId, type: node.class_type, inputs: node.inputs });
                }
            }
            console.log("📤 Output Nodes Found:", outputNodes);

            if (outputNodes.length === 0) {
                alert("❌ Warning: No SaveImage/PreviewImage nodes found in workflow! This will cause ComfyUI to reject the prompt.");
                console.error("No output nodes in workflow. ComfyUI requires at least one SaveImage or PreviewImage node.");
            }

            // Also log LoadImage nodes specifically
            console.log("🖼️ LoadImage Nodes:");
            for (const nodeId in workflow) {
                const node = workflow[nodeId];
                if (node.class_type === 'LoadImage') {
                    console.log(`  Node ${nodeId}:`, JSON.stringify(node.inputs));
                }
            }

            statusMsg.textContent = "📡 正在發送到 ComfyUI...";

            const p = {
                prompt: workflow,
                client_id: api.clientId
            };

            const response = await api.fetchApi('/prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p)
            });

            if (response.ok) {
                const resData = await response.json();

                // Save to history
                try {
                    await api.fetchApi('/tk/save_history', {
                        method: 'POST',
                        body: JSON.stringify({
                            id: this.uuidv4(),
                            prompt_id: resData.prompt_id,
                            preset_name: preset.name,
                            timestamp: Date.now(),
                            workflow: workflow, // Save the Modified workflow with user inputs
                            status: 'queued'
                        })
                    });
                } catch (err) { console.error("Failed to save history", err); }

                // Set current prompt ID for onExecuted listener
                this.currentPromptId = resData.prompt_id;
                this.currentPresetId = preset.id; // Track which preset started this

                statusMsg.innerHTML = `✅ 已成功加入隊列！<br><span style="font-size:0.8em; color:var(--tk-emerald-400); cursor:pointer; text-decoration:underline;" onclick="document.querySelector('[data-tab=gallery]').click()">👉 前往「我的作品」查看進度</span>`;

                setTimeout(() => {
                    btn.disabled = false;
                    btn.innerHTML = '<span style="font-size: 1.2rem;">⚡</span> 生成 (Generate)';
                    statusContainer.classList.add('tk-hidden');
                }, 4000);

                // Force progress bar show
                const bar = document.getElementById('tk-progress-area');
                if (bar) bar.classList.remove('tk-hidden');

            } else {
                let errText = response.statusText;
                try {
                    const errJson = await response.json();
                    if (errJson && errJson.error) errText = JSON.stringify(errJson.error);
                    else if (errJson) errText = JSON.stringify(errJson);
                } catch (e2) {
                    const txt = await response.text();
                    if (txt) errText = txt;
                }
                throw new Error(`API Error ${response.status}: ${errText}`);
            }

        } catch (e) {
            console.error(e);
            statusMsg.className = 'tk-status-msg tk-status-error';
            statusMsg.textContent = "❌ 發生錯誤: " + e.message;
            btn.disabled = false;
            btn.innerHTML = '重試 (Retry)';
        }
    },

    async renderGallery(container) {
        container.innerHTML = `
            <div id="tk-gallery-container" style="height:100%; display:flex; flex-direction:column;">
                <h3 class="tk-sidebar-label" style="font-size:1.2rem; margin-bottom:1rem;">我的作品 (My Creations)</h3>
                <div id="tk-gallery-grid" class="tk-gallery-grid">
                    Loading...
                </div>
            </div>
        `;

        try {
            // Fetch TK history
            const res = await api.fetchApi('/tk/history');
            const history = await res.json();

            // Process history to get images or text
            const items = await Promise.all(history.map(async (item) => {
                // If we don't have an image url recorded, try to find it from Comfy API
                // Note: Ideally we store the image path when 'executed' event fires, but for now we fetch it
                if (!item.image_url && !item.text_content) {
                    try {
                        const hRes = await api.fetchApi('/history/' + item.prompt_id);
                        if (hRes.ok) {
                            const hData = await hRes.json();
                            const data = hData[item.prompt_id];
                            if (data && data.outputs) {
                                // 1. Try to find Image
                                for (const nodeId in data.outputs) {
                                    const out = data.outputs[nodeId];
                                    if (out.images && out.images.length > 0) {
                                        const img = out.images[0];
                                        item.image_url = `/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`;
                                        break;
                                    }
                                }
                                // 2. If no image, try to find Text
                                if (!item.image_url) {
                                    for (const nodeId in data.outputs) {
                                        const out = data.outputs[nodeId];
                                        if (out.text || out.string || out.value) {
                                            let txt = out.text || out.string || out.value;
                                            if (Array.isArray(txt)) txt = txt.join('\n');
                                            item.text_content = txt;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) { }
                }
                return item;
            }));

            const grid = document.getElementById('tk-gallery-grid');
            if (!grid) return;

            grid.innerHTML = '';

            if (items.length === 0) {
                grid.innerHTML = '<div style="padding:2rem; color:var(--tk-zinc-500);">尚無生成紀錄</div>';
                return;
            }

            items.forEach(item => {
                const card = document.createElement('div');
                card.className = 'tk-gallery-item';
                // Add relative positioning for button placement
                card.style.position = 'relative';

                const date = new Date(item.timestamp).toLocaleString();

                // Changed click handler to openImageModal or openTextModal
                let contentHtml = '';

                if (item.image_url) {
                    contentHtml = `<img src="${item.image_url}" class="tk-gallery-img" style="cursor:pointer;" onclick="ToolkitApp.openImageModal('${item.image_url}')">`;
                } else if (item.text_content) {
                    const safeText = encodeURIComponent(item.text_content);
                    contentHtml = `
                        <div class="tk-gallery-img" 
                             style="display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--tk-zinc-400); font-size:0.8rem; background:rgba(255,255,255,0.02); cursor:pointer; padding:12px; text-align:center;"
                             onclick="ToolkitApp.openTextModal(decodeURIComponent('${safeText}'))">
                             <span style="font-size:2rem; margin-bottom:4px;">📝</span>
                             <span style="overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; text-overflow:ellipsis; width:100%;">${item.text_content.substring(0, 50)}...</span>
                        </div>
                    `;
                } else {
                    contentHtml = `<div class="tk-gallery-img" style="display:flex;align-items:center;justify-content:center;color:var(--tk-zinc-600);font-size:2rem;">⏳</div>`;
                }

                // Button Logic: "Make Same Style" for Images OR "Copy Prompt" for Text
                let actionBtn = '';
                if (item.image_url) {
                    actionBtn = `
                        <button class="tk-make-same-style-btn" 
                                title="做同款 (Make Same Style)"
                                onclick="ToolkitApp.loadHistorySettings('${item.id}')"
                                style="position: absolute; bottom: 44px; right: 8px; width: 32px; height: 32px; border-radius: 50%; background: var(--tk-amber-500, #f59e0b); border: 2px solid #18181b; color: #000; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5); transition: transform 0.1s; z-index: 10;"
                                onmouseover="this.style.transform='scale(1.1)'"
                                onmouseout="this.style.transform='scale(1)'"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                        </button>`;
                } else if (item.text_content) {
                    // For text, we use a Copy button
                    const safeTextForCopy = encodeURIComponent(item.text_content);
                    actionBtn = `
                        <button class="tk-copy-history-btn" 
                                title="複製提示詞 (Copy Prompt)"
                                onclick="ToolkitApp.copyText('${safeTextForCopy}', this)"
                                style="position: absolute; bottom: 44px; right: 8px; width: 32px; height: 32px; border-radius: 50%; background: var(--tk-emerald-500, #10b981); border: 2px solid #18181b; color: #000; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5); transition: transform 0.1s; z-index: 10;"
                                onmouseover="this.style.transform='scale(1.1)'"
                                onmouseout="this.style.transform='scale(1)'"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>`;
                }

                card.innerHTML = `
                    ${contentHtml}
                    ${actionBtn}
                    <div class="tk-gallery-meta">
                        <span class="tk-gallery-tag">${item.preset_name || 'Unknown'}</span>
                        <div style="color:var(--tk-zinc-500); font-size:0.65rem;">${date}</div>
                    </div>
                 `;
                grid.appendChild(card);
            });

        } catch (e) {
            console.error(e);
            container.innerHTML = `<div style="color:red;">載入失敗: ${e.message}</div>`;
        }
    },

    openImageModal(imageUrl) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            cursor: zoom-out; animation: tk-fade-in 0.2s;
        `;
        modal.innerHTML = `
            <img src="${imageUrl}" style="max-width:95%; max-height:95%; object-fit:contain; box-shadow:0 0 20px rgba(0,0,0,0.5); border-radius:4px;">
        `;
        modal.onclick = () => modal.remove();
        document.body.appendChild(modal);
    },

    openTextModal(text) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            animation: tk-fade-in 0.2s;
        `;
        modal.innerHTML = `
            <div style="background:#18181b; border:1px solid var(--tk-border); border-radius:12px; width:80%; max-width:600px; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                <div style="padding:1rem; border-bottom:1px solid var(--tk-border); display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.1rem; color:var(--tk-zinc-100);">完整提示詞</h3>
                    <button class="tk-close-modal-btn" style="background:none; border:none; color:var(--tk-zinc-400); cursor:pointer;">✕</button>
                </div>
                <div style="padding:1.5rem; overflow-y:auto; color:var(--tk-zinc-300); white-space:pre-wrap; font-family:monospace; line-height:1.6;">${text}</div>
                <div style="padding:1rem; border-top:1px solid var(--tk-border); display:flex; justify-content:flex-end;">
                     <button class="tk-generate-btn" style="min-width:auto; padding:8px 16px;" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(text)}')).then(() => alert('已複製！'))">
                        📋 複製內容
                     </button>
                </div>
            </div>
        `;

        modal.querySelector('.tk-close-modal-btn').onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        document.body.appendChild(modal);
    },

    copyText(encodedText, btn) {
        const text = decodeURIComponent(encodedText);
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = btn.innerHTML;
            const originalBg = btn.style.background;
            btn.innerHTML = '✅';
            btn.style.background = '#059669'; // darker emerald
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = originalBg;
            }, 1000);
        });
    },

    // --- STATE MANAGEMENT ---
    savePresetState(presetId, partialState) {
        if (!this.stateCache[presetId]) {
            this.stateCache[presetId] = { inputs: {}, preview: null };
        }
        if (partialState.inputs) {
            this.stateCache[presetId].inputs = { ...this.stateCache[presetId].inputs, ...partialState.inputs };
        }
        if (partialState.preview) {
            this.stateCache[presetId].preview = partialState.preview;
        }
    },

    getPresetState(presetId) {
        return this.stateCache[presetId];
    },

    // --- ADMIN MODE ---

    editingPresetId: null,
    currentWorkflow: null,

    renderAdminPanel(container) {
        container.innerHTML = `
            <div class="tk-admin-panel animate-in fade-in duration-300">
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 2rem;">
                    <div>
                        <h2 class="tk-admin-title" style="margin:0;">工作流管理員</h2>
                        <p style="font-size: 0.875rem; color: var(--tk-zinc-500);">配置預設工作流、參數可見性與默認值。</p>
                    </div>
                    <button class="tk-generate-btn" id="tk-trigger-upload" style="min-width: unset; padding: 0.6rem 1.2rem; background: rgba(16, 185, 129, 0.1); color: var(--tk-emerald-400); border: 1px solid rgba(16, 185, 129, 0.3);">
                        📤 上傳 JSON
                    </button>
                    <input type="file" id="tk-upload-json" accept=".json" style="display:none;">
                </div>

                <div style="display:grid; grid-template-columns: 320px 1fr; gap: 2rem;">
                    <!-- Left Pane: Manage -->
                    <div class="tk-admin-section">
                        <h3 class="tk-sidebar-label">已保存預設</h3>
                        <div id="tk-admin-preset-list" style="display:flex; flex-direction:column; gap:8px;">
                            Loading...
                        </div>
                    </div>

                    <!-- Right Pane: Config -->
                    <div id="tk-config-area" class="tk-admin-section tk-hidden">
                        <div style="display:flex; align-items:center; gap:0.5rem; color: var(--tk-emerald-400); margin-bottom:1.5rem;">
                            <span style="font-size: 1.25rem;">⚙️</span>
                            <h3 id="tk-config-title" style="font-weight:700; margin:0;">配置預設</h3>
                        </div>

                        <div class="tk-form-grid" style="margin-bottom: 2rem;">
                            <div class="tk-form-group">
                                <label class="tk-label">顯示名稱</label>
                                <input type="text" id="tk-config-name" class="tk-input" placeholder="例如：夢幻人像 V2">
                            </div>
                            <div class="tk-form-group">
                                <label class="tk-label">分類</label>
                                <select id="tk-config-category" class="tk-input">
                                    <option value="t2i">文生圖 (T2I)</option>
                                    <option value="i2i">圖生圖 (I2I)</option>
                                    <option value="edit">圖片編輯 (Edit)</option>
                                    <option value="t2v">文生影片 (T2V)</option>
                                    <option value="i2v">圖生影片 (I2V)</option>
                                    <option value="v2v">影片生影片 (V2V)</option>
                                    <option value="rev_image">圖片反推 (Rev Img)</option>
                                    <option value="rev_video">影片反推 (Rev Vid)</option>
                                </select>
                            </div>
                        </div>

                        <div class="tk-form-group" style="margin-bottom: 2rem;">
                            <label class="tk-label">預覽圖片</label>
                            <div style="display:flex; gap:0.5rem;">
                                <input type="text" id="tk-config-image" class="tk-input" placeholder="圖片連結或上傳" style="flex:1;">
                                <button class="tk-tab-btn" onclick="document.getElementById('tk-upload-img-input').click()" style="background: var(--tk-zinc-800);">上傳檔案</button>
                            </div>
                            <input type="file" id="tk-upload-img-input" accept="image/*" style="display:none;">
                        </div>

                        <h4 class="tk-sidebar-label" style="margin-top: 2rem;">節點與參數配置</h4>
                        <div id="tk-node-list" style="display:flex; flex-direction:column; gap: 1rem;"></div>

                        <div style="display:flex; justify-content:flex-end; gap:1rem; margin-top:2.5rem; pt: 1.5rem; border-top: 1px solid var(--tk-border);">
                            <button id="tk-cancel-edit" class="tk-tab-btn">取消</button>
                            <button id="tk-save-preset" class="tk-generate-btn" style="min-width: 140px;">保存預設</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Bind Actions
        const fileInput = container.querySelector('#tk-upload-json');
        container.querySelector('#tk-trigger-upload').onclick = () => fileInput.click();
        fileInput.onchange = (e) => this.handleJsonUpload(e.target.files[0]);

        container.querySelector('#tk-save-preset').onclick = () => this.savePreset();
        container.querySelector('#tk-cancel-edit').onclick = () => {
            document.getElementById('tk-config-area').classList.add('tk-hidden');
            this.editingPresetId = null;
            this.currentWorkflow = null;
            fileInput.value = '';
        };

        // Image Upload
        container.querySelector('#tk-upload-img-input').onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('image', file);
            try {
                const res = await api.fetchApi('/tk/upload_image', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.status === 'success') {
                    document.getElementById('tk-config-image').value = data.url;
                } else alert('上傳失敗: ' + data.message);
            } catch (err) { alert('上傳錯誤: ' + err.message); }
        };

        this.loadAdminPresetList();
    },

    async loadAdminPresetList() {
        const listContainer = document.getElementById('tk-admin-preset-list');
        if (!listContainer) return;

        try {
            if (!this.presetsCache) {
                const response = await api.fetchApi('/tk/presets');
                this.presetsCache = await response.json();
            }
            const presets = this.presetsCache;

            listContainer.innerHTML = '';
            if (presets.length === 0) listContainer.innerHTML = '<div style="color:var(--tk-zinc-600); font-size: 0.875rem; text-align:center; padding: 2rem;">尚無預設項目</div>';

            const categories = {
                't2i': '🖼️ 文生圖 (T2I)',
                'i2i': '🎨 圖生圖 (I2I)',
                'edit': '🔨 圖片編輯 (Edit)',
                't2v': '🎥 文生影片 (T2V)',
                'i2v': '🎞️ 圖生影片 (I2V)',
                'v2v': '📹 影片生影片 (V2V)',
                'rev_image': '🔍 圖片反推',
                'rev_video': '📼 影片反推',
                'other': '📁 其他'
            };

            // Group by category
            const grouped = {};
            presets.forEach(p => {
                const cat = p.category || 'other';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(p);
            });

            // Render groups
            for (const [catArgs, catName] of Object.entries(categories)) {
                const groupPresets = grouped[catArgs];
                if (!groupPresets || groupPresets.length === 0) continue;

                const groupHeader = document.createElement('h4');
                groupHeader.style.cssText = "color: var(--tk-zinc-400); font-size: 0.8rem; margin: 1rem 0 0.5rem 0; padding-left: 4px; text-transform: uppercase; letter-spacing: 0.05em;";
                groupHeader.textContent = catName;
                listContainer.appendChild(groupHeader);

                groupPresets.forEach(p => {
                    const item = document.createElement('div');
                    item.style.cssText = "display:flex; align-items:center; gap:0.75rem; background:rgba(39,39,42,0.4); padding:0.75rem; border-radius:12px; border:1px solid var(--tk-border); transition: all 0.2s; position: relative; overflow: hidden; margin-bottom: 8px;";
                    item.innerHTML = `
                        <div style="width:40px; height:40px; border-radius:8px; background:var(--tk-zinc-900); overflow:hidden; border:1px solid var(--tk-border); display:flex; align-items:center; justify-content:center;">
                            ${p.previewImageUrl ? `<img src="${p.previewImageUrl}" style="width:100%; height:100%; object-fit:cover; opacity: 0.8;" onerror="this.remove(); this.parentElement.innerText='🍌';">` : '<span style="font-size:1.2rem;">🍌</span>'}
                        </div>
                        <div style="flex:1; min-width:0;">
                             <div style="font-size:0.875rem; font-weight:600; color:var(--tk-zinc-200); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${p.name}</div>
                             <div style="font-size:0.65rem; color:var(--tk-zinc-500); text-transform:uppercase;">${p.category}</div>
                        </div>
                        <div style="display:flex; gap:6px;">
                             <button class="tk-edit-mini" style="background:var(--tk-emerald-500); border:none; color:#000; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; transition:all 0.2s;">🔏 編輯</button>
                             <button class="tk-del-mini" style="background:rgba(239,68,68,0.2); border:1px solid rgba(239,68,68,0.3); color:#f87171; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:600; transition:all 0.2s;">🗑️ 刪除</button>
                        </div>
                    `;

                    item.querySelector('.tk-edit-mini').onmouseover = (e) => e.target.style.transform = 'scale(1.05)';
                    item.querySelector('.tk-edit-mini').onmouseout = (e) => e.target.style.transform = 'scale(1)';
                    item.querySelector('.tk-del-mini').onmouseover = (e) => e.target.style.background = 'rgba(239,68,68,0.3)';
                    item.querySelector('.tk-del-mini').onmouseout = (e) => e.target.style.background = 'rgba(239,68,68,0.2)';

                    item.querySelector('.tk-edit-mini').onclick = () => this.loadPresetForEditing(p);
                    item.querySelector('.tk-del-mini').onclick = async () => {
                        if (confirm(`確定要刪除 "${p.name}" 嗎？`)) {
                            await api.fetchApi('/tk/delete_preset', { method: 'POST', body: JSON.stringify({ id: p.id }) });
                            this.presetsCache = null; // Clear cache
                            this.loadAdminPresetList();
                        }
                    };

                    listContainer.appendChild(item);
                });
            }
        } catch (e) {
            listContainer.innerHTML = `<div style="color:red; font-size:0.75rem;">載入失敗: ${e.message}</div>`;
        }
    },

    loadPresetForEditing(preset) {
        this.editingPresetId = preset.id;
        this.currentWorkflow = preset.workflow;

        this.parseAndShowConfig(preset.workflow);

        document.getElementById('tk-config-name').value = preset.name;
        document.getElementById('tk-config-category').value = preset.category;
        document.getElementById('tk-config-image').value = preset.previewImageUrl;
        document.getElementById('tk-config-title').textContent = "編輯預設項目";

        preset.parameters.forEach(p => {
            const checkbox = document.querySelector(`.tk-param-visible[data-node="${p.nodeId}"][data-key="${p.inputName}"]`);
            if (checkbox) {
                checkbox.checked = p.visible;
                const row = checkbox.closest('.tk-node-param-admin');
                row.querySelector('.tk-param-name-admin').value = p.displayName;
                row.querySelector('.tk-param-default-admin').value = p.defaultValue;
            }
        });

        document.getElementById('tk-config-area').scrollIntoView({ behavior: 'smooth' });
    },

    handleJsonUpload(file) {
        if (!file) return;
        this.editingPresetId = null;
        document.getElementById('tk-config-title').textContent = "新建預設項目";

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                this.currentWorkflow = json;
                this.parseAndShowConfig(json);
                document.getElementById('tk-config-name').value = '';
                document.getElementById('tk-config-image').value = '';
            } catch (err) { alert("無效的 JSON 檔案"); }
        };
        reader.readAsText(file);
    },

    parseAndShowConfig(workflow) {
        const configArea = document.getElementById('tk-config-area');
        const nodeList = document.getElementById('tk-node-list');
        configArea.classList.remove('tk-hidden');
        nodeList.innerHTML = '';

        for (const [nodeId, nodeData] of Object.entries(workflow)) {
            if (!nodeData.inputs) continue;

            const nodeDiv = document.createElement('div');
            nodeDiv.style.cssText = "background:rgba(9,9,11,0.2); border:1px solid var(--tk-border); border-radius:16px; overflow:hidden;";

            nodeDiv.innerHTML = `
                <div style="background:rgba(63,63,70,0.2); padding:0.5rem 1rem; font-size:10px; font-weight:800; color:var(--tk-zinc-500); display:flex; justify-content:space-between; text-transform:uppercase; letter-spacing:0.05em;">
                    <span>NODE ID: ${nodeId}</span>
                    <span style="color:var(--tk-emerald-500); opacity:0.6;">${nodeData.class_type}</span>
                </div>
                <div class="tk-node-params-body" style="padding:1rem; display:flex; flex-direction:column; gap:0.75rem;"></div>
            `;

            const paramsBody = nodeDiv.querySelector('.tk-node-params-body');
            let hasInputs = false;

            for (const [key, val] of Object.entries(nodeData.inputs)) {
                if (Array.isArray(val)) continue;

                hasInputs = true;
                const paramDiv = document.createElement('div');
                paramDiv.className = 'tk-node-param-admin';
                paramDiv.style.cssText = "display:flex; align-items:center; gap:1rem;";

                paramDiv.innerHTML = `
                    <input type="checkbox" class="tk-param-visible" data-node="${nodeId}" data-key="${key}" style="accent-color: var(--tk-emerald-500);">
                    <span style="font-size:0.875rem; color:var(--tk-zinc-300); width:120px; overflow:hidden; text-overflow:ellipsis;">${key}</span>
                    <input type="text" class="tk-input tk-param-name-admin" placeholder="顯示名稱" value="${key}" style="padding:0.4rem 0.8rem; flex:1; font-size:0.75rem;">
                    <input type="text" class="tk-input tk-param-default-admin" placeholder="默認值" value="${val}" style="padding:0.4rem 0.8rem; width:120px; font-size:0.75rem;">
                `;
                paramsBody.appendChild(paramDiv);
            }

            if (hasInputs) nodeList.appendChild(nodeDiv);
        }
    },

    async savePreset() {
        const name = document.getElementById('tk-config-name').value;
        const category = document.getElementById('tk-config-category').value;
        const image = document.getElementById('tk-config-image').value;

        if (!name) { alert("請輸入名稱"); return; }
        if (!this.currentWorkflow) { alert("未載入工作流"); return; }

        const parameters = [];
        document.querySelectorAll('.tk-param-visible:checked').forEach(checkbox => {
            const row = checkbox.closest('.tk-node-param-admin');
            const nodeId = checkbox.dataset.node;
            const inputName = checkbox.dataset.key;
            const displayName = row.querySelector('.tk-param-name-admin').value;
            let defaultValue = row.querySelector('.tk-param-default-admin').value;

            if (!isNaN(defaultValue) && defaultValue.trim() !== '') {
                if (defaultValue.includes('.')) defaultValue = parseFloat(defaultValue);
                else defaultValue = parseInt(defaultValue);
            }

            const nodeData = this.currentWorkflow[nodeId];
            const nodeClass = nodeData ? nodeData.class_type : "";

            parameters.push({
                nodeId,
                nodeTitle: "Node " + nodeId,
                inputName,
                visible: true,
                displayName: displayName || inputName,
                defaultValue,
                nodeClass
            });
        });

        const presetData = {
            id: this.editingPresetId || this.uuidv4(),
            name,
            category,
            previewImageUrl: image,
            workflow: this.currentWorkflow,
            parameters
        };

        const res = await api.fetchApi('/tk/save_preset', { method: 'POST', body: JSON.stringify(presetData) });
        if (res.ok) {
            alert("保存成功！");
            this.presetsCache = null; // Clear cache
            document.getElementById('tk-config-area').classList.add('tk-hidden');
            this.editingPresetId = null;
            this.currentWorkflow = null;
            this.loadAdminPresetList();
        } else alert("保存失敗");
    },

    async loadHistorySettings(historyId) {
        try {
            // 1. Ensure presets are loaded
            if (!this.presetsCache) {
                const response = await api.fetchApi('/tk/presets');
                this.presetsCache = await response.json();
            }

            // 2. Fetch history item details
            const hRes = await api.fetchApi('/tk/history');
            const history = await hRes.json();
            const item = history.find(h => h.id === historyId);

            if (!item) throw new Error("找不到該歷史記錄");

            // 3. Find corresponding preset
            const preset = this.presetsCache.find(p => p.name === item.preset_name);
            if (!preset) throw new Error(`找不到原預設項目 "${item.preset_name}" (可能已被刪除)`);

            // 4. Fetch actual workflow from ComfyUI history to get the real inputs used
            let sourceWorkflow = item.workflow;
            try {
                if (item.prompt_id) {
                    const cRes = await api.fetchApi('/history/' + item.prompt_id);
                    if (cRes.ok) {
                        const cData = await cRes.json();
                        const cHistory = cData[item.prompt_id];
                        // ComfyUI history stores the graph in 'prompt' (array-like object) or 'extra_data' depending on version/context
                        // Typically it is in cHistory.prompt which has the structure { node_id: { inputs: ... } }
                        // Note: ComfyUI history output is strictly the "prompt" structure sent to API.
                        if (cHistory && cHistory.prompt) {
                            // ComfyUI history might return the prompt as an array: [number, uuid, {node_graph}, {client_info}, [outputs]]
                            if (Array.isArray(cHistory.prompt) && cHistory.prompt.length > 2) {
                                sourceWorkflow = cHistory.prompt[2];
                            } else {
                                sourceWorkflow = cHistory.prompt;
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch ComfyUI history, falling back to stored workflow", err);
            }

            // 5. Switch Tab and Render
            ToolkitUI.switchTab(preset.category);

            // Wait for DOM
            setTimeout(() => {
                const mainPanel = document.getElementById('tk-main-panel');
                ToolkitUI.renderUserForm(preset, mainPanel);

                // Highlight in sidebar
                const sidebarList = document.getElementById('tk-sidebar-list');
                if (sidebarList) {
                    const cards = sidebarList.querySelectorAll('.tk-preset-card');
                    cards.forEach(c => {
                        if (c.querySelector('.tk-preset-name').textContent === preset.name) {
                            c.classList.add('active');
                            c.scrollIntoView({ block: 'center' });
                        } else {
                            c.classList.remove('active');
                        }
                    });
                }

                // 6. Populate Values from Source Workflow
                let matchCount = 0;
                // sourceWorkflow is { nodeId: { inputs: { ... } } }

                // Debug logging
                console.log("Restoring from workflow:", sourceWorkflow);

                preset.parameters.forEach(param => {
                    // sourceWorkflow uses string keys for node IDs
                    const node = sourceWorkflow[param.nodeId] || sourceWorkflow[parseInt(param.nodeId)];

                    if (node && node.inputs) {
                        const val = node.inputs[param.inputName];
                        if (val !== undefined) {
                            const inputElem = document.querySelector(`.tk-form-input[data-node="${param.nodeId}"][data-input="${param.inputName}"]`);
                            if (inputElem) {
                                inputElem.value = val;
                                matchCount++;
                            }
                        }
                    }
                });

                this.showToast(`已套用同款參數 (${matchCount})`, 'success');
            }, 200); // Increased timeout to 200ms just to be safe

        } catch (e) {
            console.error(e);
            this.showToast(e.message, 'error');
        }
    },

    async uploadInputImage(inputElement, nodeId, inputName) {
        const file = inputElement.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        const previewContainer = document.getElementById(`preview-${nodeId}-${inputName}`);
        if (previewContainer) {
            previewContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100px;"><div class="tk-badge-pulse" style="width:20px;height:20px;"></div></div>';
        }

        try {
            // Use custom upload endpoint that saves to local image_upload folder
            const response = await api.fetchApi('/tk/upload_input_image', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.status !== 'success') {
                throw new Error(data.message || 'Upload failed');
            }

            // data format: {status: "success", filename: "xxx.png", abs_path: "D:/...", relative_url: "extensions/..."}
            // data format: {status: "success", filename: "img_xxx.png", abs_path: "...", ...}
            const customFilename = data.filename;
            console.log("📤 Custom Upload Success:", customFilename);

            // Determine Node Type
            const inputEl = document.querySelector(`.tk-form-input[data-node="${nodeId}"][data-input="${inputName}"]`);
            const nodeClass = inputEl ? inputEl.dataset.nodeClass : '';
            const isLoadImageFromPath = nodeClass === 'LoadImageFromPath';

            if (isLoadImageFromPath) {
                // CASE A: LoadImageFromPath -> Use Absolute Path
                console.log("📂 Detected LoadImageFromPath. Using absolute path.");
                const absPath = data.abs_path;

                if (!absPath) {
                    throw new Error("Backend did not return absolute path for LoadImageFromPath.");
                }

                // Update Input directly
                if (inputEl) {
                    inputEl.value = absPath;
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // Update Preview (Standard API won't see this file, so use our custom route)
                if (previewContainer) {
                    previewContainer.innerHTML = `<img src="${data.preview_url}" style="max-width:100%; max-height:200px; border-radius:8px; margin-bottom:8px; box-shadow:0 4px 6px rgba(0,0,0,0.2);">`;
                }

            } else {
                // CASE B: Standard LoadImage -> Use Two-Step Upload (Plan B)
                // We take the SAME file data but upload it via standard API using the NEW name
                try {
                    const standardFormData = new FormData();
                    const renamedFile = new File([file], customFilename, { type: file.type });
                    standardFormData.append('image', renamedFile);
                    standardFormData.append('overwrite', 'true');

                    const standardRes = await api.fetchApi('/upload/image', {
                        method: 'POST',
                        body: standardFormData
                    });
                    const standardData = await standardRes.json();

                    const finalFilename = standardData.name;
                    console.log("✅ Standard Upload Success:", finalFilename);

                    const hiddenInput = document.querySelector(`.tk-form-input[data-node="${nodeId}"][data-input="${inputName}"]`);
                    if (hiddenInput) {
                        hiddenInput.value = finalFilename;
                        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    if (previewContainer) {
                        const url = `/view?filename=${encodeURIComponent(finalFilename)}&type=input`;
                        previewContainer.innerHTML = `<img src="${url}" style="max-width:100%; max-height:200px; border-radius:8px; margin-bottom:8px; box-shadow:0 4px 6px rgba(0,0,0,0.2);">`;
                    }

                } catch (stdErr) {
                    console.error("Standard upload failed", stdErr);
                    throw new Error("Standard upload failed: " + stdErr.message);
                }
            }

            // Old valid logic removed. New logic handles everything above.

        } catch (e) {
            console.error(e);
            if (previewContainer) previewContainer.innerHTML = `<div style="color:#ef4444; font-size:0.8rem; padding:10px;">上傳失敗 (Upload Failed): ${e.message}</div>`;
            alert("Upload failed: " + e.message);
        }
    },

    // --- Drag and Drop Handlers ---
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        const area = e.currentTarget;
        area.style.background = 'var(--tk-zinc-800)';
        area.style.borderColor = 'var(--tk-emerald-500)';
    },

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        const area = e.currentTarget;
        area.style.background = 'var(--tk-zinc-900)';
        area.style.borderColor = 'var(--tk-border)';
    },

    handleDrop(e, nodeId, inputName) {
        e.preventDefault();
        e.stopPropagation();
        const area = e.currentTarget;
        area.style.background = 'var(--tk-zinc-900)';
        area.style.borderColor = 'var(--tk-border)';

        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            // Emulate input element
            this.uploadInputImage({ files: files }, nodeId, inputName);
        }
    },

    openImageModal(imageUrl) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.2s;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            position: relative;
            max-width: 90vw;
            max-height: 90vh;
            background: #18181b;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
        `;

        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.cssText = `
            display: block;
            max-width: 100%;
            max-height: 85vh;
            object-fit: contain;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            padding: 12px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.6), transparent);
        `;

        const downloadBtn = document.createElement('a');
        downloadBtn.href = imageUrl;
        downloadBtn.download = `image_${Date.now()}.png`;
        downloadBtn.target = '_blank';
        downloadBtn.className = 'tk-generate-btn';
        downloadBtn.style.cssText = `
            min-width: auto; padding: 6px 12px; font-size: 0.8rem;
            background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(4px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: white; text-decoration: none; display: flex; align-items: center; gap: 6px;
        `;
        downloadBtn.innerHTML = '<span>⬇️</span> 下載 (Download)';

        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = `
            background: rgba(0, 0, 0, 0.5); border: none; color: white;
            width: 32px; height: 32px; border-radius: 50%;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            font-size: 1.2rem;
        `;
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
        };

        header.appendChild(downloadBtn);
        header.appendChild(closeBtn);
        content.appendChild(img);
        content.appendChild(header);
        overlay.appendChild(content);

        document.body.appendChild(overlay);

        requestAnimationFrame(() => overlay.style.opacity = '1');

        overlay.onclick = (e) => {
            if (e.target === overlay) closeBtn.click();
        };
    },

    showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        const bg = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#3b82f6');
        toast.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(20px);
            background: ${bg}; color: white; padding: 8px 16px; border-radius: 8px;
            font-size: 0.875rem; font-weight: 500; box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            opacity: 0; transition: all 0.3s; z-index: 11000; pointer-events: none;
        `;
        toast.innerText = msg;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
            toast.style.opacity = '1';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};
