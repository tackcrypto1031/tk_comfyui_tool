import { api } from "../../scripts/api.js";
import { ToolkitUI } from "./tk_ui.js";

export const ToolkitApp = {
    // --- USER MODE ---

    async loadPresets(category, sidebar, mainPanel) {
        try {
            const response = await api.fetchApi('/tk/presets');
            const presets = await response.json();
            const filtered = presets.filter(p => p.category === category);
            ToolkitUI.renderPresetList(filtered, sidebar, mainPanel, category);
        } catch (e) {
            console.error(e);
            sidebar.innerHTML = '<div style="color:red">Failed to load presets</div>';
        }
    },

    async executeWorkflow(preset) {
        const btn = document.getElementById('tk-generate-btn');
        const status = document.getElementById('tk-status-msg');
        btn.disabled = true;
        btn.textContent = "Generating...";
        status.textContent = "Preparing workflow...";

        try {
            // 1. Deep copy original workflow
            let workflow = JSON.parse(JSON.stringify(preset.workflow));

            // 2. Gather inputs
            const inputs = document.querySelectorAll('.tk-form-input');
            inputs.forEach(input => {
                const nodeId = input.dataset.node;
                const inputName = input.dataset.input;
                let value = input.value;

                // Simple type inference
                if (!isNaN(value) && value.trim() !== '') {
                    if (value.includes('.')) value = parseFloat(value);
                    else value = parseInt(value);
                }

                if (workflow[nodeId] && workflow[nodeId].inputs) {
                    workflow[nodeId].inputs[inputName] = value;
                }
            });

            // 3. Send to ComfyUI (Using Raw Fetch to avoid monkeypatches)
            status.textContent = "Sending to ComfyUI...";

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
                status.textContent = "Sent successfully! Check ComfyUI queue.";
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = "生成圖片 (Generate)";
                }, 2000);
            } else {
                throw new Error("API Error: " + response.status + " " + response.statusText);
            }

        } catch (e) {
            console.error(e);
            status.textContent = "Error: " + e.message;
            btn.disabled = false;
            btn.textContent = "Error (Retry)";
        }
    },

    // --- ADMIN MODE ---

    // Config State
    editingPresetId: null, // If editing existing
    currentWorkflow: null, // Temp store for uploaded json

    renderAdminPanel(container) {
        container.innerHTML = `
            <div class="tk-admin-panel">
                <h2>Admin Configuration</h2>
                
                <!-- Manage Existing -->
                <div style="background:#252525; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #333;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <h3 style="margin:0;">Manage Existing Presets</h3>
                        <button class="tk-btn tk-btn-secondary" onclick="this.closest('.tk-admin-panel').querySelector('#tk-admin-preset-list').classList.toggle('tk-hidden')">Toggle List</button>
                    </div>
                    <div id="tk-admin-preset-list" style="max-height: 200px; overflow-y: auto; display:flex; flex-direction:column; gap:5px;">
                        Loading...
                    </div>
                </div>

                <!-- Create New -->
                <div style="background:#2d2d2d; padding:15px; border-radius:8px; margin-bottom:20px;">
                    <h3>Upload New Workflow API JSON</h3>
                    <input type="file" id="tk-upload-json" accept=".json" style="margin-bottom:10px;">
                    <p style="color:#888; font-size:12px;">Ensure you uploaded a valid "API Format" JSON from ComfyUI (Dev Mode).</p>
                </div>

                <!-- Config Area -->
                <div id="tk-config-area" class="tk-hidden">
                    <h3 id="tk-config-title" style="color:#4CAF50;">Configure Preset</h3>
                    
                    <div class="tk-form-group">
                        <label class="tk-form-label">Display Name</label>
                        <input type="text" id="tk-config-name" class="tk-form-input" placeholder="e.g. Dreamy Portrait">
                    </div>
                    
                    <div class="tk-form-group" style="margin-top:10px;">
                        <label class="tk-form-label">Category</label>
                        <select id="tk-config-category" class="tk-form-input">
                            <option value="t2i">文生圖 (Text to Image)</option>
                            <option value="i2i">圖生圖 (Image to Image)</option>
                            <option value="edit">圖片編輯 (Image Edit)</option>
                        </select>
                    </div>
                    
                    <div class="tk-form-group" style="margin-top:10px;">
                        <label class="tk-form-label">Preview Image</label>
                        <div style="display:flex; gap:10px;">
                            <input type="text" id="tk-config-image" class="tk-form-input" placeholder="Image URL (or upload below)" style="flex:1;">
                            <input type="file" id="tk-upload-img-input" accept="image/*" style="display:none;">
                            <button class="tk-btn tk-btn-secondary" onclick="document.getElementById('tk-upload-img-input').click()">Upload</button>
                        </div>
                    </div>

                    <h3 style="margin-top:20px;">Parameter Visibility & Defaults</h3>
                    <div id="tk-node-list"></div>

                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <button class="tk-btn tk-btn-primary" id="tk-save-preset" style="flex:1;">Save Preset</button>
                        <button class="tk-btn tk-btn-secondary" id="tk-cancel-edit" style="width:100px;">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        // Bind Events
        container.querySelector('#tk-upload-json').onchange = (e) => this.handleJsonUpload(e.target.files[0]);
        container.querySelector('#tk-save-preset').onclick = () => this.savePreset();
        container.querySelector('#tk-cancel-edit').onclick = () => {
            document.getElementById('tk-config-area').classList.add('tk-hidden');
            this.editingPresetId = null;
            this.currentWorkflow = null;
            document.getElementById('tk-upload-json').value = '';
        };

        // Image Upload
        container.querySelector('#tk-upload-img-input').onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('image', file);
            try {
                const res = await api.fetchApi('/tk/upload_image', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.status === 'success') {
                    document.getElementById('tk-config-image').value = data.url;
                } else {
                    alert('Image upload failed: ' + data.message);
                }
            } catch (err) {
                alert('Upload error: ' + err.message);
            }
        };

        // Load List
        this.loadAdminPresetList();
    },

    async loadAdminPresetList() {
        const listContainer = document.getElementById('tk-admin-preset-list');
        if (!listContainer) return;

        try {
            const response = await api.fetchApi('/tk/presets');
            const presets = await response.json();

            listContainer.innerHTML = '';
            if (presets.length === 0) listContainer.innerHTML = '<div style="color:#777;">No presets found.</div>';

            presets.forEach(p => {
                const item = document.createElement('div');
                item.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#111; padding:8px; border-radius:4px;";
                item.innerHTML = `
                    <span>[${p.category}] <b>${p.name}</b></span>
                    <div style="display:flex; gap:5px;">
                        <button class="tk-btn-edit tk-btn-secondary" style="font-size:12px; padding:4px 8px;">Edit</button>
                        <button class="tk-btn-del" style="background:#c62828; color:white; border:none; border-radius:3px; cursor:pointer; padding:4px 8px;">Delete</button>
                    </div>
                `;

                // Edit
                item.querySelector('.tk-btn-edit').onclick = () => this.loadPresetForEditing(p);

                // Delete
                item.querySelector('.tk-btn-del').onclick = async () => {
                    if (confirm(`Delete preset "${p.name}"?`)) {
                        await api.fetchApi('/tk/delete_preset', {
                            method: 'POST',
                            body: JSON.stringify({ id: p.id })
                        });
                        this.loadAdminPresetList(); // Refresh
                    }
                };

                listContainer.appendChild(item);
            });
        } catch (e) {
            listContainer.innerHTML = `<div style="color:red">Error loading list: ${e.message}</div>`;
        }
    },

    loadPresetForEditing(preset) {
        this.editingPresetId = preset.id;
        this.currentWorkflow = preset.workflow;

        // Show Config Area
        this.parseAndShowConfig(preset.workflow);

        // Fill Values
        document.getElementById('tk-config-name').value = preset.name;
        document.getElementById('tk-config-category').value = preset.category;
        document.getElementById('tk-config-image').value = preset.previewImageUrl;
        document.getElementById('tk-config-title').textContent = "Editing Preset: " + preset.name;

        // Fill Params
        preset.parameters.forEach(p => {
            const checkbox = document.querySelector(`.tk-param-visible[data-node="${p.nodeId}"][data-key="${p.inputName}"]`);
            if (checkbox) {
                checkbox.checked = p.visible;
                const row = checkbox.closest('.tk-node-param');
                row.querySelector('.tk-param-name').value = p.displayName;
                row.querySelector('.tk-param-default').value = p.defaultValue;
            }
        });

        // Scroll to edit
        document.getElementById('tk-config-area').scrollIntoView({ behavior: 'smooth' });
    },

    handleJsonUpload(file) {
        if (!file) return;
        this.editingPresetId = null; // Reset ID for new upload
        document.getElementById('tk-config-title').textContent = "Configure New Preset";

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                this.currentWorkflow = json;
                this.parseAndShowConfig(json);
                // Clear inputs
                document.getElementById('tk-config-name').value = '';
                document.getElementById('tk-config-image').value = '';
            } catch (err) {
                alert("Invalid JSON file");
            }
        };
        reader.readAsText(file);
    },

    parseAndShowConfig(workflow) {
        const configArea = document.getElementById('tk-config-area');
        const nodeList = document.getElementById('tk-node-list');
        configArea.classList.remove('tk-hidden');
        nodeList.innerHTML = '';

        // Iterate Nodes
        for (const [nodeId, nodeData] of Object.entries(workflow)) {
            if (!nodeData.inputs) continue;

            const nodeDiv = document.createElement('div');
            nodeDiv.className = 'tk-node-group';
            nodeDiv.innerHTML = `<div class="tk-node-header">[${nodeId}] ${nodeData.class_type}</div>`;

            let hasInputs = false;
            for (const [key, val] of Object.entries(nodeData.inputs)) {
                // Skip non-primitive inputs (links are arrays in Comfy API format)
                if (Array.isArray(val)) continue; // Connection link

                hasInputs = true;
                const paramDiv = document.createElement('div');
                paramDiv.className = 'tk-node-param';

                paramDiv.innerHTML = `
                    <div style="width:150px; overflow:hidden; text-overflow:ellipsis;">${key}</div>
                    <div class="tk-param-config">
                        <label><input type="checkbox" class="tk-param-visible" data-node="${nodeId}" data-key="${key}"> Visible</label>
                        <input type="text" class="tk-admin-input tk-param-name" placeholder="Display Name" value="${key}">
                        <input type="text" class="tk-admin-input tk-param-default" placeholder="Default Value" value="${val}">
                    </div>
                `;
                nodeDiv.appendChild(paramDiv);
            }

            if (hasInputs) nodeList.appendChild(nodeDiv);
        }
    },

    async savePreset() {
        const name = document.getElementById('tk-config-name').value;
        const category = document.getElementById('tk-config-category').value;
        const image = document.getElementById('tk-config-image').value;

        if (!name) { alert("Please enter a name"); return; }
        if (!this.currentWorkflow) { alert("No workflow loaded"); return; }

        // Gather Parameters
        const parameters = [];
        document.querySelectorAll('.tk-param-visible:checked').forEach(checkbox => {
            const row = checkbox.closest('.tk-node-param');
            const nodeId = checkbox.dataset.node;
            const inputName = checkbox.dataset.key;
            const displayName = row.querySelector('.tk-param-name').value;
            let defaultValue = row.querySelector('.tk-param-default').value;

            // Try to parse default value to original type if number
            if (!isNaN(defaultValue) && defaultValue.trim() !== '') {
                if (defaultValue.includes('.')) defaultValue = parseFloat(defaultValue);
                else defaultValue = parseInt(defaultValue);
            }

            parameters.push({
                nodeId,
                nodeTitle: "Node " + nodeId, // Simplified
                inputName,
                visible: true,
                displayName: displayName || inputName,
                defaultValue
            });
        });

        const presetData = {
            id: this.editingPresetId || crypto.randomUUID(), // Use existing ID if editing
            name,
            category,
            previewImageUrl: image,
            workflow: this.currentWorkflow,
            parameters
        };

        const res = await api.fetchApi('/tk/save_preset', {
            method: 'POST',
            body: JSON.stringify(presetData)
        });

        if (res.ok) {
            alert("Preset Saved Successfully!");

            // Cleanup UI
            document.getElementById('tk-config-area').classList.add('tk-hidden');
            this.editingPresetId = null;
            this.currentWorkflow = null;
            document.getElementById('tk-upload-json').value = '';

            // Refresh list
            this.loadAdminPresetList();
        } else {
            alert("Failed to save preset");
        }
    }
};
