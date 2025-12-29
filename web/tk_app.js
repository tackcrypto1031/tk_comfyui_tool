import { api } from "../../scripts/api.js";
import { ToolkitUI } from "./tk_ui.js";

export const ToolkitApp = {
    // --- CACHE ---
    presetsCache: null,
    historyCache: null,
    isListening: false,

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

    onExecuted(e) {
        // Refresh gallery if open
        const gallery = document.getElementById('tk-gallery-container');
        if (gallery) {
            this.renderGallery(gallery.parentElement); // Re-render
        }

        // Hide progress if done
        const bar = document.getElementById('tk-progress-area');
        if (bar) {
            document.getElementById('tk-progress-percent').innerText = '100%';
            document.getElementById('tk-progress-fill').style.width = '100%';
            setTimeout(() => {
                if (document.getElementById('tk-queue-count').innerText === 'Waiting: 0') {
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
            const filtered = this.presetsCache.filter(p => p.category === category);
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

                if (!isNaN(value) && value.trim() !== '') {
                    if (value.includes('.')) value = parseFloat(value);
                    else value = parseInt(value);
                }

                if (workflow[nodeId] && workflow[nodeId].inputs) {
                    workflow[nodeId].inputs[inputName] = value;
                }
            });

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

                statusMsg.innerHTML = `✅ 已成功加入隊列！<br><span style="font-size:0.8em; color:var(--tk-emerald-400); cursor:pointer; text-decoration:underline;" onclick="document.querySelector('[data-tab=gallery]').click()">👉 前往「我的作品」查看進度</span>`;

                setTimeout(() => {
                    btn.disabled = false;
                    btn.innerHTML = '<span style="font-size: 1.2rem;">⚡</span> 生成圖片 (Generate)';
                    statusContainer.classList.add('tk-hidden');
                }, 4000);

                // Force progress bar show
                const bar = document.getElementById('tk-progress-area');
                if (bar) bar.classList.remove('tk-hidden');

            } else {
                throw new Error("API Error: " + response.status);
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

            // Process history to get images
            const items = await Promise.all(history.map(async (item) => {
                // If we don't have an image url recorded, try to find it from Comfy API
                // Note: Ideally we store the image path when 'executed' event fires, but for now we fetch it
                if (!item.image_url) {
                    try {
                        const hRes = await api.fetchApi('/history/' + item.prompt_id);
                        if (hRes.ok) {
                            const hData = await hRes.json();
                            const data = hData[item.prompt_id];
                            if (data && data.outputs) {
                                // Find first image
                                for (const nodeId in data.outputs) {
                                    const images = data.outputs[nodeId].images;
                                    if (images && images.length > 0) {
                                        const img = images[0];
                                        item.image_url = `/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`;
                                        break;
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

                // Changed click handler to openImageModal
                const imgHtml = item.image_url
                    ? `<img src="${item.image_url}" class="tk-gallery-img" style="cursor:pointer;" onclick="ToolkitApp.openImageModal('${item.image_url}')">`
                    : `<div class="tk-gallery-img" style="display:flex;align-items:center;justify-content:center;color:var(--tk-zinc-600);font-size:2rem;">⏳</div>`;

                // Add "Make Same Style" button (Yellow button at bottom right)
                // Using inline styles to match the request quickly
                const makeSameStyleBtn = item.image_url ? `
                    <button class="tk-make-same-style-btn" 
                            title="做同款 (Make Same Style)"
                            onclick="ToolkitApp.loadHistorySettings('${item.id}')"
                            style="
                                position: absolute;
                                bottom: 44px; 
                                right: 8px;
                                width: 32px;
                                height: 32px;
                                border-radius: 50%;
                                background: var(--tk-amber-500, #f59e0b);
                                border: 2px solid #18181b;
                                color: #000;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                cursor: pointer;
                                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
                                transition: transform 0.1s;
                                z-index: 10;
                            "
                            onmouseover="this.style.transform='scale(1.1)'"
                            onmouseout="this.style.transform='scale(1)'"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                        </svg>
                    </button>
                ` : '';

                card.innerHTML = `
                    ${imgHtml}
                    ${makeSameStyleBtn}
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

            presets.forEach(p => {
                const item = document.createElement('div');
                item.style.cssText = "display:flex; align-items:center; gap:0.75rem; background:rgba(39,39,42,0.4); padding:0.75rem; border-radius:12px; border:1px solid var(--tk-border); transition: all 0.2s; position: relative; overflow: hidden;";
                item.innerHTML = `
                    <div style="width:40px; height:40px; border-radius:8px; background:var(--tk-zinc-900); overflow:hidden; border:1px solid var(--tk-border);">
                        <img src="${p.previewImageUrl}" style="width:100%; height:100%; object-fit:cover; opacity: 0.8;">
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

            parameters.push({
                nodeId,
                nodeTitle: "Node " + nodeId,
                inputName,
                visible: true,
                displayName: displayName || inputName,
                defaultValue
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
