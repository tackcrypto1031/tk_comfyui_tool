import { api } from "../../scripts/api.js";
import { ToolkitUI } from "./tk_ui.js";
import { PreviewCropEditor, previewCropStyle } from "./tk_preview_crop.js";
import { extractFirstOutputImage, extractFirstOutputVideo, isVideoOutput, findCyclePath, findImageInputTargets, pickPrimaryImageInputTarget, resolvePresetPreviewUrl } from "./tk_workflow_utils.js";

export const ToolkitApp = {
    // --- CACHE ---
    historyCache: null,
    isListening: false,
    currentPromptId: null,
    executionErrorActive: false,
    settingsCache: null,
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
        if (this.executionErrorActive) return;
        const count = e.detail.exec_info.queue_remaining;
        const queueElem = document.getElementById('tk-queue-count');
        if (queueElem) {
            queueElem.style.color = '';
            queueElem.innerText = `Waiting: ${count}`;
        }

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

        // Handle preview updates from completed history.
        if (this.currentPromptId && e.detail.prompt_id === this.currentPromptId) {
            try {
                const hRes = await api.fetchApi('/history/' + this.currentPromptId);
                if (hRes.ok) {
                    const hData = await hRes.json();
                    const data = hData[this.currentPromptId];
                    if (data && data.outputs) {
                        this.updateResultPreview(this.extractOutputResult(data), this.currentPresetId);
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

    cloneWorkflow(workflow) {
        return JSON.parse(JSON.stringify(workflow || {}));
    },

    normalizeInputValue(rawValue, dataType, nodeClass) {
        if (dataType === 'number') {
            const strVal = String(rawValue ?? '').trim();
            if (strVal === '') return '';
            if (strVal.includes('.')) {
                const f = parseFloat(strVal);
                return Number.isNaN(f) ? strVal : f;
            }
            const i = parseInt(strVal, 10);
            return Number.isNaN(i) ? strVal : i;
        }

        if (dataType === 'string' || nodeClass === 'LoadImage' || nodeClass === 'LoadImageFromPath') {
            return String(rawValue ?? '');
        }

        const strVal = String(rawValue ?? '');
        if (!Number.isNaN(Number(strVal)) && strVal.trim() !== '') {
            if (strVal.includes('.')) return parseFloat(strVal);
            return parseInt(strVal, 10);
        }
        return rawValue;
    },

    findElementByDataset(selector, datasetFilters, root = document) {
        const candidates = root.querySelectorAll(selector);
        for (const el of candidates) {
            let matched = true;
            for (const [key, value] of Object.entries(datasetFilters || {})) {
                if (String(el.dataset[key] ?? '') !== String(value ?? '')) {
                    matched = false;
                    break;
                }
            }
            if (matched) return el;
        }
        return null;
    },

    applyUserInputsToWorkflow(baseWorkflow) {
        const workflow = this.cloneWorkflow(baseWorkflow);
        const inputs = document.querySelectorAll('.tk-form-input');

        inputs.forEach((input) => {
            const nodeId = input.dataset.node;
            const inputName = input.dataset.input;
            const nodeClass = input.dataset.nodeClass || '';
            const randomToggle = this.findElementByDataset('.tk-random-seed-toggle', {
                node: nodeId,
                input: inputName,
            });

            let value = input.value;
            if (randomToggle && randomToggle.checked) {
                value = Math.floor(Math.random() * 100000000000000);
            } else {
                value = this.normalizeInputValue(value, input.dataset.type, nodeClass);
            }

            if (!workflow[nodeId] || !workflow[nodeId].inputs) return;
            workflow[nodeId].inputs[inputName] = value;

            if (nodeClass === 'LoadImageFromPath') {
                workflow[nodeId].class_type = 'LoadImageFromPath';
                if (workflow[nodeId].inputs['upload']) delete workflow[nodeId].inputs['upload'];
                if (workflow[nodeId].inputs['subfolder']) delete workflow[nodeId].inputs['subfolder'];
            }
        });

        return workflow;
    },

    sanitizeLoadImageNodes(workflow, { requireImageInput = false } = {}) {
        for (const nodeId in workflow) {
            const node = workflow[nodeId];
            if (!node || !node.inputs) continue;

            if (node.class_type === 'LoadImage') {
                if (node.inputs['image'] !== undefined) {
                    node.inputs['image'] = String(node.inputs['image']).trim();
                }
                if (!node.inputs['subfolder']) {
                    node.inputs['subfolder'] = "";
                }
                if (requireImageInput && (!node.inputs['image'] || node.inputs['image'] === '')) {
                    throw new Error(`Node ${nodeId} (${node._meta?.title || 'LoadImage'}) requires an image.`);
                }
            }

            if (node.class_type === 'LoadImageFromPath') {
                const targets = ['image', 'image_path', 'path', 'file_path', 'filename'];
                let hasPathInput = false;
                for (const key of targets) {
                    if (node.inputs[key] !== undefined) {
                        node.inputs[key] = String(node.inputs[key]).trim();
                        if (node.inputs[key] !== '') hasPathInput = true;
                    }
                }
                if (requireImageInput && !hasPathInput) {
                    throw new Error(`Node ${nodeId} (${node._meta?.title || 'LoadImageFromPath'}) requires an image path.`);
                }
            }
        }
    },

    randomizeSeedInputs(workflow) {
        for (const nodeId in workflow) {
            const node = workflow[nodeId];
            if (!node || !node.inputs) continue;
            if (node.inputs['seed'] !== undefined) node.inputs['seed'] = Math.floor(Math.random() * 100000000000000);
            if (node.inputs['noise_seed'] !== undefined) node.inputs['noise_seed'] = Math.floor(Math.random() * 100000000000000);
        }
    },

    setProgressInfo(title, message, isError = false) {
        const bar = document.getElementById('tk-progress-area');
        const titleElem = document.getElementById('tk-progress-title');
        const queueElem = document.getElementById('tk-queue-count');
        if (bar) bar.classList.remove('tk-hidden');
        if (titleElem && title !== undefined) titleElem.innerText = title;
        if (queueElem && message !== undefined) {
            queueElem.style.color = isError ? 'var(--tk-rose-400, #f87171)' : '';
            queueElem.innerText = message;
        }
    },

    resetProgressInfo() {
        this.executionErrorActive = false;
        const titleElem = document.getElementById('tk-progress-title');
        const percentElem = document.getElementById('tk-progress-percent');
        const fillElem = document.getElementById('tk-progress-fill');
        const queueElem = document.getElementById('tk-queue-count');
        if (titleElem) titleElem.innerText = 'Generating...';
        if (percentElem) percentElem.innerText = '0%';
        if (fillElem) fillElem.style.width = '0%';
        if (queueElem) {
            queueElem.style.color = '';
            queueElem.innerText = 'Waiting: 0';
        }
    },

    setFormStatus(statusContainer, statusMsg, text, isError = false) {
        if (!statusContainer || !statusMsg) return;
        statusContainer.classList.remove('tk-hidden');
        statusMsg.className = isError ? 'tk-status-msg tk-status-error' : 'tk-status-msg tk-status-emerald';
        statusMsg.textContent = text;
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    escapeAttr(value) {
        return this.escapeHtml(value).replace(/`/g, '&#96;');
    },

    buildComfyViewImageUrl(imageMeta) {
        if (!imageMeta || !imageMeta.filename) return '';
        return `/view?filename=${encodeURIComponent(String(imageMeta.filename))}&subfolder=${encodeURIComponent(String(imageMeta.subfolder || ''))}&type=${encodeURIComponent(String(imageMeta.type || 'output'))}`;
    },

    extractFirstOutputText(historyEntry) {
        if (!historyEntry || !historyEntry.outputs || typeof historyEntry.outputs !== 'object') return '';

        const outputNodeIds = Object.keys(historyEntry.outputs);
        for (const nodeId of outputNodeIds) {
            const out = historyEntry.outputs[nodeId];
            if (!out || typeof out !== 'object') continue;
            let txt = out.text ?? out.string ?? out.value;
            if (txt === undefined || txt === null) continue;
            if (Array.isArray(txt)) txt = txt.join('\n');
            return String(txt);
        }
        return '';
    },

    async cacheOutputImageForHistory(imageMeta) {
        if (!imageMeta || !imageMeta.filename) return '';

        const imageUrl = this.buildComfyViewImageUrl(imageMeta);
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch output image: ${imageResponse.status}`);
        }

        const blob = await imageResponse.blob();
        const dotIndex = String(imageMeta.filename).lastIndexOf('.');
        const ext = dotIndex >= 0 ? String(imageMeta.filename).substring(dotIndex) : '.png';
        const tmpName = `history_${Date.now()}_${Math.floor(Math.random() * 100000)}${ext}`;
        const file = new File([blob], tmpName, { type: blob.type || 'image/png' });

        const formData = new FormData();
        formData.append('image', file);
        const customRes = await api.fetchApi('/tk/upload_input_image', {
            method: 'POST',
            body: formData
        });
        const customData = await customRes.json();
        if (!customRes.ok || customData.status !== 'success') {
            throw new Error(customData.message || 'Failed to persist history image.');
        }
        return String(customData.preview_url || '');
    },

    async persistHistoryResult(promptId, presetInfo, historyEntry) {
        const result = this.extractOutputResult(historyEntry);
        const { outputImage, outputVideo, videoUrl, textContent } = result;

        let comfyImageUrl = '';
        let persistedImageUrl = '';
        if (outputImage && !outputVideo) {
            comfyImageUrl = this.buildComfyViewImageUrl(outputImage);
            try {
                persistedImageUrl = await this.cacheOutputImageForHistory(outputImage);
            } catch (cacheErr) {
                console.warn('Failed to persist output image for history snapshot', cacheErr);
            }
        }

        const finalImageUrl = persistedImageUrl || comfyImageUrl;
        try {
            await api.fetchApi('/tk/save_history', {
                method: 'POST',
                body: JSON.stringify({
                    prompt_id: promptId,
                    preset_id: presetInfo.id,
                    preset_name: presetInfo.name,
                    status: 'completed',
                    image_meta: outputImage || null,
                    image_url: finalImageUrl || '',
                    persisted_image_url: persistedImageUrl || '',
                    video_meta: outputVideo,
                    video_url: videoUrl,
                    text_content: textContent || ''
                })
            });
        } catch (err) {
            console.error('Failed to persist history result snapshot', err);
        }

        return {
            ...result,
            imageUrl: finalImageUrl || ''
        };
    },

    extractOutputResult(historyEntry) {
        const outputVideo = extractFirstOutputVideo(historyEntry);
        const outputImage = extractFirstOutputImage(historyEntry);
        return {
            outputVideo,
            outputImage,
            videoUrl: this.buildComfyViewImageUrl(outputVideo),
            imageUrl: this.buildComfyViewImageUrl(outputImage),
            textContent: outputVideo || outputImage ? '' : this.extractFirstOutputText(historyEntry),
        };
    },

    updateResultPreview(result, presetId) {
        const type = result.videoUrl ? 'video' : result.imageUrl ? 'image' : 'text';
        const content = result.videoUrl || result.imageUrl || result.textContent;
        if (!content) return;
        ToolkitUI.updatePreview(type, content);
        this.savePresetState(presetId, { preview: { type, content } });
    },

    setFormInputValue(inputEl, nextValue) {
        if (!inputEl) return;
        inputEl.value = nextValue;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    },

    async ensurePresetsLoaded() {
        if (!this.presetsCache) {
            const response = await api.fetchApi('/tk/presets');
            this.presetsCache = (await response.json()).map(preset => ({
                ...preset,
                previewImageUrl: resolvePresetPreviewUrl(preset.previewImageUrl, import.meta.url),
            }));
        }
    },

    async ensureSettingsLoaded() {
        if (!this.settingsCache) {
            const response = await api.fetchApi('/tk/settings');
            const rawSettings = response.ok ? await response.json() : {};
            this.settingsCache = {
                clear_history_on_startup: !!(rawSettings && rawSettings.clear_history_on_startup)
            };
        }
    },

    async saveToolkitSettings(partialSettings) {
        await this.ensureSettingsLoaded();
        const payload = {
            ...this.settingsCache,
            ...(partialSettings || {})
        };

        const response = await api.fetchApi('/tk/save_settings', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.message || 'Save settings failed.');
        }

        this.settingsCache = {
            clear_history_on_startup: !!(data.settings && data.settings.clear_history_on_startup)
        };
    },

    async submitPrompt(workflow, presetInfo) {
        const payload = {
            prompt: workflow,
            client_id: api.clientId
        };

        const response = await api.fetchApi('/prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
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

        const resData = await response.json();
        const promptId = resData.prompt_id;
        if (!promptId) throw new Error('ComfyUI did not return prompt_id.');

        try {
            await api.fetchApi('/tk/save_history', {
                method: 'POST',
                body: JSON.stringify({
                    id: this.uuidv4(),
                    prompt_id: promptId,
                    preset_id: presetInfo.id,
                    preset_name: presetInfo.name,
                    timestamp: Date.now(),
                    workflow,
                    status: 'queued'
                })
            });
        } catch (err) {
            console.error("Failed to save history", err);
        }

        this.currentPromptId = promptId;
        this.currentPresetId = presetInfo.id;

        return promptId;
    },

    extractHistoryErrorMessage(historyEntry) {
        if (!historyEntry || typeof historyEntry !== 'object') return '';
        const status = historyEntry.status;
        if (!status) return '';

        if (Array.isArray(status.messages) && status.messages.length > 0) {
            const last = status.messages[status.messages.length - 1];
            if (typeof last === 'string') return last;
            try {
                return JSON.stringify(last);
            } catch (err) {
                return String(last);
            }
        }

        if (status.status_str && status.status_str !== 'success') {
            return String(status.status_str);
        }

        return '';
    },

    async waitForPromptResult(promptId, timeoutMs = 600000, pollMs = 800) {
        const start = Date.now();

        while ((Date.now() - start) < timeoutMs) {
            const response = await api.fetchApi('/history/' + promptId);
            if (response.ok) {
                const historyData = await response.json();
                const entry = historyData ? historyData[promptId] : null;
                if (entry) {
                    if (entry.status && entry.status.status_str === 'error') {
                        const reason = this.extractHistoryErrorMessage(entry);
                        throw new Error(reason || `Prompt ${promptId} execution failed.`);
                    }

                    if (entry.outputs && Object.keys(entry.outputs).length > 0) {
                        return entry;
                    }

                    if (entry.status && entry.status.completed && (!entry.outputs || Object.keys(entry.outputs).length === 0)) {
                        throw new Error(`Prompt ${promptId} completed but no outputs were found.`);
                    }
                }
            }

            await new Promise((resolve) => setTimeout(resolve, pollMs));
        }

        throw new Error(`等待執行結果超時 (${Math.floor(timeoutMs / 1000)} 秒)`);
    },

    async materializeImageSources(imageMeta) {
        if (!imageMeta || !imageMeta.filename) {
            throw new Error('No output image metadata found for chaining.');
        }

        const imageUrl = `/view?filename=${encodeURIComponent(imageMeta.filename)}&subfolder=${encodeURIComponent(imageMeta.subfolder || '')}&type=${encodeURIComponent(imageMeta.type || 'output')}`;
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch output image: ${imageResponse.status}`);
        }

        const blob = await imageResponse.blob();
        const dotIndex = String(imageMeta.filename).lastIndexOf('.');
        const ext = dotIndex >= 0 ? String(imageMeta.filename).substring(dotIndex) : '.png';
        const tmpName = `chain_${Date.now()}_${Math.floor(Math.random() * 100000)}${ext}`;
        const file = new File([blob], tmpName, { type: blob.type || 'image/png' });

        const customFormData = new FormData();
        customFormData.append('image', file);
        const customRes = await api.fetchApi('/tk/upload_input_image', {
            method: 'POST',
            body: customFormData
        });
        const customData = await customRes.json();
        if (!customRes.ok || customData.status !== 'success') {
            throw new Error(customData.message || 'Failed to cache image for chained workflow.');
        }

        let inputFilename = null;
        try {
            const standardFormData = new FormData();
            const renamedFile = new File([blob], customData.filename || tmpName, { type: blob.type || 'image/png' });
            standardFormData.append('image', renamedFile);
            standardFormData.append('overwrite', 'true');

            const standardRes = await api.fetchApi('/upload/image', {
                method: 'POST',
                body: standardFormData
            });
            if (standardRes.ok) {
                const standardData = await standardRes.json();
                inputFilename = standardData.name || null;
            }
        } catch (err) {
            console.warn('Failed to upload chained image to ComfyUI input folder', err);
        }

        return {
            absPath: customData.abs_path || null,
            inputFilename
        };
    },

    applyPresetDefaultParameters(workflow, preset) {
        if (!preset || !Array.isArray(preset.parameters)) return;

        preset.parameters.forEach((param) => {
            if (!param || !param.nodeId || !param.inputName) return;
            if (!workflow[param.nodeId] || !workflow[param.nodeId].inputs) return;
            workflow[param.nodeId].inputs[param.inputName] = param.defaultValue;
        });
    },

    buildFollowupWorkflow(preset, imageSources) {
        const workflow = this.cloneWorkflow(preset.workflow);
        this.applyPresetDefaultParameters(workflow, preset);
        this.sanitizeLoadImageNodes(workflow, { requireImageInput: false });

        const target = pickPrimaryImageInputTarget(workflow);
        if (!target) {
            throw new Error(`後續工作流「${preset.name}」沒有可接圖節點 (LoadImageFromPath / LoadImage)。`);
        }

        const node = workflow[target.nodeId];
        if (!node || !node.inputs) {
            throw new Error(`後續工作流「${preset.name}」目標節點無效: ${target.nodeId}`);
        }

        if (target.nodeClass === 'LoadImageFromPath') {
            if (!imageSources.absPath) {
                throw new Error(`後續工作流「${preset.name}」需要絕對路徑，但取得失敗。`);
            }
            node.class_type = 'LoadImageFromPath';
            node.inputs[target.inputName] = String(imageSources.absPath);
            if (node.inputs['upload']) delete node.inputs['upload'];
            if (node.inputs['subfolder']) delete node.inputs['subfolder'];
        } else {
            if (!imageSources.inputFilename) {
                throw new Error(`後續工作流「${preset.name}」需要 LoadImage 檔名，但取得失敗。`);
            }
            node.class_type = 'LoadImage';
            node.inputs[target.inputName] = String(imageSources.inputFilename);
            if (!node.inputs['subfolder']) {
                node.inputs['subfolder'] = "";
            }
        }

        this.sanitizeLoadImageNodes(workflow, { requireImageInput: true });
        return workflow;
    },

    async executePresetChain(preset, workflow, presetsById, context) {
        const chainStack = context.chainStack || [];
        const presetId = String(preset.id || '');
        if (presetId && chainStack.includes(presetId)) {
            const cycleNames = [...chainStack, presetId].map((id) => {
                const p = presetsById.get(String(id));
                return p ? p.name : id;
            });
            throw new Error(`偵測到循環工作流: ${cycleNames.join(' -> ')}`);
        }

        const nextContext = {
            ...context,
            chainStack: presetId ? [...chainStack, presetId] : [...chainStack]
        };

        this.setProgressInfo(
            `執行中 (${nextContext.batchIndex + 1}/${nextContext.batchCount})`,
            `▶ ${preset.name}`
        );
        this.setFormStatus(nextContext.statusContainer, nextContext.statusMsg, `⚙️ 正在執行：${preset.name}`);

        const promptId = await this.submitPrompt(workflow, { id: preset.id, name: preset.name });
        const historyEntry = await this.waitForPromptResult(promptId);
        const resultSnapshot = await this.persistHistoryResult(promptId, { id: preset.id, name: preset.name }, historyEntry);
        this.updateResultPreview(resultSnapshot, preset.id);
        const gallery = document.getElementById('tk-gallery-container');
        if (gallery) await this.renderGallery(gallery.parentElement);
        const nextIds = Array.isArray(preset.nextWorkflows) ? preset.nextWorkflows.map((id) => String(id)) : [];
        const outputImage = resultSnapshot.outputImage || extractFirstOutputImage(historyEntry);
        if (nextIds.length > 0 && !outputImage) {
            throw new Error(`工作流「${preset.name}」沒有輸出圖片，無法執行後續工作流。`);
        }

        let currentOutputImage = outputImage;
        for (let idx = 0; idx < nextIds.length; idx++) {
            const nextId = nextIds[idx];
            const nextPreset = presetsById.get(nextId);
            if (!nextPreset) {
                throw new Error(`找不到後續工作流 (ID: ${nextId})，請回管理員修正設定。`);
            }

            this.setProgressInfo(
                `後續流程 (${nextContext.batchIndex + 1}/${nextContext.batchCount})`,
                `➡ ${nextPreset.name} (${idx + 1}/${nextIds.length})`
            );
            this.setFormStatus(nextContext.statusContainer, nextContext.statusMsg, `➡ 後續工作流：${nextPreset.name}`);

            if (!currentOutputImage) {
                throw new Error(`工作流「${preset.name}」缺少輸出圖片，無法傳遞到「${nextPreset.name}」。`);
            }
            const imageSources = await this.materializeImageSources(currentOutputImage);
            const followupWorkflow = this.buildFollowupWorkflow(nextPreset, imageSources);
            currentOutputImage = await this.executePresetChain(nextPreset, followupWorkflow, presetsById, nextContext);
        }

        return currentOutputImage || null;
    },

    // --- USER MODE ---

    getUserSelectedFollowupIds(preset) {
        const adminOrderedIds = Array.isArray(preset?.nextWorkflows)
            ? preset.nextWorkflows.map((id) => String(id))
            : [];
        if (adminOrderedIds.length === 0) return [];

        const toggleNodes = Array.from(document.querySelectorAll('.tk-user-followup-toggle[data-followup-id]'));
        let selectedSet = null;
        if (toggleNodes.length > 0) {
            selectedSet = new Set(
                toggleNodes
                    .filter((node) => !!node.checked)
                    .map((node) => String(node.dataset.followupId || '').trim())
                    .filter((id) => id)
            );
        } else {
            const savedState = this.getPresetState(preset?.id);
            const savedFollowups = (savedState && typeof savedState.followups === 'object' && savedState.followups)
                ? savedState.followups
                : {};
            selectedSet = new Set(
                Object.entries(savedFollowups)
                    .filter(([, enabled]) => !!enabled)
                    .map(([id]) => String(id))
            );
        }

        return adminOrderedIds.filter((id) => selectedSet.has(String(id)));
    },

    async loadPresets(category, sidebarList, mainPanel) {
        try {
            await this.ensurePresetsLoaded();

            // Define Category Mapping
            const catMap = {
                'image': ['t2i', 'i2i', 'edit', 'post_image'],
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

        if (!btn || !statusContainer || !statusMsg) return;

        btn.disabled = true;
        btn.innerHTML = '<div class="tk-badge-pulse" style="display:inline-block; margin-right:8px;"></div> Generating...';

        this.resetProgressInfo();
        this.setProgressInfo('初始化中', '🚀 正在準備工作流...');
        this.setFormStatus(statusContainer, statusMsg, '🚀 正在準備工作流...');

        try {
            await this.ensurePresetsLoaded();
            const presetsById = new Map((this.presetsCache || []).map((p) => [String(p.id), p]));

            const rootPreset = {
                ...preset,
                nextWorkflows: this.getUserSelectedFollowupIds(preset)
            };
            if (rootPreset.id !== undefined && rootPreset.id !== null) {
                presetsById.set(String(rootPreset.id), rootPreset);
            }

            let workflow = this.applyUserInputsToWorkflow(rootPreset.workflow);
            this.sanitizeLoadImageNodes(workflow, { requireImageInput: true });

            // --- BATCH CONFIRMATION & VALIDATION ---
            const batchToggle = document.getElementById('tk-batch-toggle');
            const isBatch = batchToggle && batchToggle.checked;
            let batchCount = 1;

            if (isBatch) {
                const countInput = document.getElementById('tk-batch-count');
                batchCount = parseInt(countInput.value);
                if (isNaN(batchCount) || batchCount < 2 || batchCount > 10 || !Number.isInteger(batchCount)) {
                    alert('批量生成數量必須在 2 到 10 之間 (整數)。');
                    btn.disabled = false;
                    btn.innerHTML = '重試 (Retry)';
                    this.setFormStatus(statusContainer, statusMsg, '❌ 批量生成數量必須在 2 到 10 之間 (整數)。', true);
                    return;
                }
            }

            // --- EXECUTION LOOP (MAIN + FOLLOWUP CHAINS) ---
            for (let i = 0; i < batchCount; i++) {
                if (isBatch) {
                    this.setFormStatus(statusContainer, statusMsg, `📡 正在執行批量任務 (${i + 1}/${batchCount})...`);
                } else {
                    this.setFormStatus(statusContainer, statusMsg, "📡 正在執行工作流...");
                }
                this.setProgressInfo(`執行中 (${i + 1}/${batchCount})`, `📡 正在提交主工作流...`);

                const currentWorkflow = this.cloneWorkflow(workflow);
                if (isBatch) {
                    this.randomizeSeedInputs(currentWorkflow);
                }

                await this.executePresetChain(rootPreset, currentWorkflow, presetsById, {
                    statusContainer,
                    statusMsg,
                    batchIndex: i,
                    batchCount,
                    chainStack: []
                });
            }

            statusMsg.innerHTML = isBatch
                ? `✅ 批量與後續流程執行完成 (${batchCount}張)！<br><span class="tk-open-gallery-link" style="font-size:0.8em; color:var(--tk-emerald-400); cursor:pointer; text-decoration:underline;">👉 前往「我的作品」查看結果</span>`
                : `✅ 工作流與後續流程執行完成！<br><span class="tk-open-gallery-link" style="font-size:0.8em; color:var(--tk-emerald-400); cursor:pointer; text-decoration:underline;">👉 前往「我的作品」查看結果</span>`;
            const openGalleryLink = statusMsg.querySelector('.tk-open-gallery-link');
            if (openGalleryLink) {
                openGalleryLink.onclick = () => {
                    const galleryTab = document.querySelector('[data-tab=gallery]');
                    if (galleryTab) galleryTab.click();
                };
            }
            this.setProgressInfo('執行完成', '✅ 已完成全部工作流流程');

            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = '<span style="font-size: 1.2rem;">⚡</span> 生成 (Generate)';
                statusContainer.classList.add('tk-hidden');
            }, 4000);

        } catch (e) {
            console.error(e);
            const reason = e && e.message ? e.message : String(e);
            this.executionErrorActive = true;
            this.setFormStatus(statusContainer, statusMsg, "❌ 發生錯誤: " + reason, true);
            this.setProgressInfo('執行失敗', `❌ ${reason}`, true);
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

            // Prefer saved media metadata, then recover older entries from ComfyUI history.
            const items = await Promise.all(history.map(async (rawItem) => {
                const item = (rawItem && typeof rawItem === 'object') ? { ...rawItem } : {};
                item.image_url = String(item.persisted_image_url || item.image_url || '');
                item.video_url = String(item.video_url || this.buildComfyViewImageUrl(item.video_meta));

                if (!item.video_url && isVideoOutput(item.image_meta)) {
                    item.video_meta = item.image_meta;
                    item.video_url = this.buildComfyViewImageUrl(item.video_meta);
                    item.image_url = '';
                    item.image_meta = null;
                }

                if (!item.image_url && item.image_meta && item.image_meta.filename) {
                    item.image_url = this.buildComfyViewImageUrl(item.image_meta);
                }

                if (!item.video_url && !item.image_url && !item.text_content && item.prompt_id) {
                    try {
                        const hRes = await api.fetchApi('/history/' + item.prompt_id);
                        if (hRes.ok) {
                            const hData = await hRes.json();
                            const data = hData[item.prompt_id];
                            if (data && data.outputs) {
                                const result = this.extractOutputResult(data);
                                item.video_url = result.videoUrl;
                                item.video_meta = result.outputVideo;
                                item.image_url = result.imageUrl;
                                item.text_content = result.textContent;
                                if (result.outputVideo) {
                                    await this.persistHistoryResult(item.prompt_id, { id: item.preset_id, name: item.preset_name }, data);
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore single-item failures and keep rendering the rest.
                    }
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
                const safePresetName = this.escapeHtml(item.preset_name || 'Unknown');
                const safeDate = this.escapeHtml(date);

                let contentHtml = '';

                if (item.video_url) {
                    const safeVideoUrl = this.escapeAttr(item.video_url);
                    contentHtml = `
                        <video src="${safeVideoUrl}" class="tk-gallery-img tk-gallery-preview-video" controls playsinline preload="metadata" style="object-fit:contain;" aria-label="${safePresetName}"></video>
                        <a href="${safeVideoUrl}" download class="tk-video-download" style="display:block; padding:6px 8px; color:var(--tk-emerald-400); font-size:0.75rem;">⬇ 下載影片</a>
                    `;
                } else if (item.image_url) {
                    const safeImageUrl = this.escapeAttr(item.image_url);
                    contentHtml = `<img src="${safeImageUrl}" class="tk-gallery-img tk-gallery-preview-image" loading="lazy" style="cursor:pointer;">`;
                } else if (item.text_content) {
                    const safeText = encodeURIComponent(item.text_content);
                    const safeTextAttr = this.escapeAttr(safeText);
                    const safeSnippet = this.escapeHtml(`${String(item.text_content).substring(0, 50)}...`);
                    contentHtml = `
                        <div class="tk-gallery-img tk-gallery-preview-text"
                             data-text="${safeTextAttr}"
                             style="display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--tk-zinc-400); font-size:0.8rem; background:rgba(255,255,255,0.02); cursor:pointer; padding:12px; text-align:center;"
                        >
                             <span style="font-size:2rem; margin-bottom:4px;">📝</span>
                             <span style="overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; text-overflow:ellipsis; width:100%;">${safeSnippet}</span>
                         </div>
                    `;
                } else {
                    const placeholder = item.status === 'completed' ? '沒有可預覽的輸出' : '⏳';
                    contentHtml = `<div class="tk-gallery-img" style="display:flex;align-items:center;justify-content:center;color:var(--tk-zinc-600);">${placeholder}</div>`;
                }

                // Reuse media settings, or copy text output.
                let actionBtn = '';
                if (item.video_url || item.image_url) {
                    const safeHistoryId = this.escapeAttr(item.id || '');
                    actionBtn = `
                        <button class="tk-make-same-style-btn" 
                                data-history-id="${safeHistoryId}"
                                title="做同款 (Make Same Style)"
                                style="position: absolute; ${item.video_url ? 'top: 8px;' : 'bottom: 44px;'} right: 8px; width: 32px; height: 32px; border-radius: 50%; background: var(--tk-amber-500, #f59e0b); border: 2px solid #18181b; color: #000; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5); transition: transform 0.1s; z-index: 10;"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                        </button>`;
                } else if (item.text_content) {
                    // For text, we use a Copy button
                    const safeTextForCopy = encodeURIComponent(item.text_content);
                    const safeCopyAttr = this.escapeAttr(safeTextForCopy);
                    actionBtn = `
                        <button class="tk-copy-history-btn" 
                                data-copy-text="${safeCopyAttr}"
                                title="複製提示詞 (Copy Prompt)"
                                style="position: absolute; bottom: 44px; right: 8px; width: 32px; height: 32px; border-radius: 50%; background: var(--tk-emerald-500, #10b981); border: 2px solid #18181b; color: #000; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5); transition: transform 0.1s; z-index: 10;"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>`;
                }

                card.innerHTML = `
                    ${contentHtml}
                    ${actionBtn}
                    <div class="tk-gallery-meta">
                        <span class="tk-gallery-tag">${safePresetName}</span>
                        <div style="color:var(--tk-zinc-500); font-size:0.65rem;">${safeDate}</div>
                    </div>
                 `;

                const previewVideo = card.querySelector('.tk-gallery-preview-video');
                if (previewVideo) {
                    previewVideo.onerror = () => {
                        const download = card.querySelector('.tk-video-download');
                        download.textContent = '影片無法播放，請下載後開啟';
                    };
                }

                const previewImage = card.querySelector('.tk-gallery-preview-image');
                if (previewImage && item.image_url) {
                    previewImage.onclick = () => this.openImageModal(item.image_url);
                }

                const previewText = card.querySelector('.tk-gallery-preview-text');
                if (previewText) {
                    previewText.onclick = () => {
                        const encoded = previewText.dataset.text || '';
                        this.openTextModal(decodeURIComponent(encoded));
                    };
                }

                const sameStyleBtn = card.querySelector('.tk-make-same-style-btn');
                if (sameStyleBtn) {
                    sameStyleBtn.onclick = () => this.loadHistorySettings(String(sameStyleBtn.dataset.historyId || ''));
                    sameStyleBtn.onmouseenter = () => { sameStyleBtn.style.transform = 'scale(1.1)'; };
                    sameStyleBtn.onmouseleave = () => { sameStyleBtn.style.transform = 'scale(1)'; };
                }

                const copyBtn = card.querySelector('.tk-copy-history-btn');
                if (copyBtn) {
                    copyBtn.onclick = () => this.copyText(copyBtn.dataset.copyText || '', copyBtn);
                    copyBtn.onmouseenter = () => { copyBtn.style.transform = 'scale(1.1)'; };
                    copyBtn.onmouseleave = () => { copyBtn.style.transform = 'scale(1)'; };
                }

                grid.appendChild(card);
            });

        } catch (e) {
            console.error(e);
            container.innerHTML = `<div style="color:red;">載入失敗: ${this.escapeHtml(e.message)}</div>`;
        }
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
                <div class="tk-text-modal-content" style="padding:1.5rem; overflow-y:auto; color:var(--tk-zinc-300); white-space:pre-wrap; font-family:monospace; line-height:1.6;"></div>
                <div style="padding:1rem; border-top:1px solid var(--tk-border); display:flex; justify-content:flex-end;">
                     <button class="tk-generate-btn tk-text-modal-copy" style="min-width:auto; padding:8px 16px;">
                        📋 複製內容
                     </button>
                </div>
            </div>
        `;

        const textContainer = modal.querySelector('.tk-text-modal-content');
        if (textContainer) textContainer.textContent = String(text ?? '');

        const closeBtn = modal.querySelector('.tk-close-modal-btn');
        if (closeBtn) closeBtn.onclick = () => modal.remove();

        const copyBtn = modal.querySelector('.tk-text-modal-copy');
        if (copyBtn) {
            copyBtn.onclick = async () => {
                await navigator.clipboard.writeText(String(text ?? ''));
                alert('已複製！');
            };
        }

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
            this.stateCache[presetId] = { inputs: {}, preview: null, followups: {} };
        }
        if (partialState.inputs) {
            this.stateCache[presetId].inputs = { ...this.stateCache[presetId].inputs, ...partialState.inputs };
        }
        if (partialState.preview !== undefined) {
            this.stateCache[presetId].preview = partialState.preview;
        }
        if (partialState.sizeMode !== undefined) {
            this.stateCache[presetId].sizeMode = partialState.sizeMode;
        }
        if (partialState.followups) {
            const current = (typeof this.stateCache[presetId].followups === 'object' && this.stateCache[presetId].followups)
                ? this.stateCache[presetId].followups
                : {};
            this.stateCache[presetId].followups = { ...current, ...partialState.followups };
        }
    },

    getPresetState(presetId) {
        return this.stateCache[presetId];
    },

    // --- ADMIN MODE ---

    editingPresetId: null,
    currentWorkflow: null,

    // --- MODEL MANAGER ---

    modelsCache: null,
    editingModelId: null,

    async loadModels() {
        if (!this.modelsCache) {
            try {
                const res = await api.fetchApi('/tk/models');
                if (res.status === 404) throw new Error("API Route Not Found");
                this.modelsCache = await res.json();
            } catch (e) {
                console.warn("Failed to load models (API likely missing/reloading):", e);
                this.modelsCache = []; // Fallback
            }
        }
        return this.modelsCache;
    },

    async saveModels(models) {
        await api.fetchApi('/tk/save_models', { method: 'POST', body: JSON.stringify(models) });
        this.modelsCache = models;
    },

    async renderModelManager(container) {
        console.log("[TK] renderModelManager called, container:", container);
        const models = await this.loadModels();
        console.log("[TK] Models loaded:", models);

        container.innerHTML = `
            <div class="tk-admin-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem;">
                    <h3 class="tk-sidebar-label" style="margin:0;">模型清單 (Models)</h3>
                    <button class="tk-generate-btn" id="tk-add-model-btn" style="min-width:auto; padding:6px 12px; font-size:0.8rem;">+ 新增模型</button>
                </div>
                <div id="tk-model-list" style="display:flex; flex-direction:column; gap:12px;"></div>
            </div>

            <div id="tk-model-editor" class="tk-admin-section" style="display:none; margin-top: 2rem; border-top: 1px solid var(--tk-border); padding-top: 2rem;">
                <h3 class="tk-sidebar-label">編輯模型</h3>
                <div class="tk-form-group">
                    <label class="tk-label">模型名稱 (Name)</label>
                    <input type="text" id="tk-model-name" class="tk-input">
                </div>
                
                <h4 class="tk-sidebar-label" style="margin-top:1.5rem;">比例尺寸 (Aspect Ratios)</h4>
                <div style="display:grid; grid-template-columns: 1fr 80px 80px 40px; gap:8px; margin-bottom: 4px; padding-right: 8px;">
                    <div style="font-size:0.7rem; color:var(--tk-zinc-500);">比例名稱</div>
                    <div style="font-size:0.7rem; color:var(--tk-zinc-500);">寬 (W)</div>
                    <div style="font-size:0.7rem; color:var(--tk-zinc-500);">高 (H)</div>
                    <div></div>
                </div>
                <div id="tk-ratio-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:1rem;"></div>
                <button class="tk-tab-btn" id="tk-add-ratio-btn" style="width:100%; justify-content:center; margin-bottom:1.5rem;">+ 新增尺寸</button>

                <div style="display:flex; justify-content:flex-end; gap:1rem;">
                    <button class="tk-tab-btn" id="tk-cancel-model-edit">取消</button>
                    <button class="tk-generate-btn" id="tk-save-model-btn" style="min-width:120px;">保存模型</button>
                </div>
            </div>
        `;
        console.log("[TK] Model Manager HTML injected");

        const listDiv = container.querySelector('#tk-model-list');
        const editorDiv = container.querySelector('#tk-model-editor');

        const renderList = () => {
            listDiv.innerHTML = '';
            if (!models || models.length === 0) {
                listDiv.innerHTML = `
                    <div style="text-align:center; padding:2rem; color:var(--tk-zinc-500);">
                        <p>尚無模型資料</p>
                        <button class="tk-tab-btn" id="tk-restore-defaults" style="margin-top:1rem; border:1px dashed var(--tk-zinc-600);">
                            🔄 還原預設模型 (Restore Defaults)
                        </button>
                    </div>
                `;
                const btn = listDiv.querySelector('#tk-restore-defaults');
                if (btn) btn.onclick = async () => {
                    if (confirm("確定要重置為預設模型嗎？這將覆蓋現有設定。")) {
                        const defaults = [
                            {
                                "id": "sd15",
                                "name": "SD1.5",
                                "ratios": [
                                    { "name": "1:1", "width": 512, "height": 512 },
                                    { "name": "2:3", "width": 512, "height": 768 },
                                    { "name": "3:2", "width": 768, "height": 512 }
                                ]
                            },
                            {
                                "id": "sdxl",
                                "name": "SDXL",
                                "ratios": [
                                    { "name": "1:1", "width": 1024, "height": 1024 },
                                    { "name": "2:3", "width": 832, "height": 1216 },
                                    { "name": "3:2", "width": 1216, "height": 832 },
                                    { "name": "16:9", "width": 1344, "height": 768 },
                                    { "name": "9:16", "width": 768, "height": 1344 },
                                    { "name": "9:21", "width": 640, "height": 1536 },
                                    { "name": "21:9", "width": 1536, "height": 640 }
                                ]
                            },
                            {
                                "id": "flux",
                                "name": "FLUX",
                                "ratios": [
                                    { "name": "1:1", "width": 1448, "height": 1448 },
                                    { "name": "2:3", "width": 1152, "height": 1728 },
                                    { "name": "3:2", "width": 1728, "height": 1152 },
                                    { "name": "16:9", "width": 1920, "height": 1088 },
                                    { "name": "9:16", "width": 1088, "height": 1920 },
                                    { "name": "9:21", "width": 960, "height": 2176 },
                                    { "name": "21:9", "width": 2176, "height": 960 }
                                ]
                            },
                            {
                                "id": "qwen",
                                "name": "QwenImage",
                                "ratios": [
                                    { "name": "1:1", "width": 1328, "height": 1328 },
                                    { "name": "2:3", "width": 1056, "height": 1584 },
                                    { "name": "3:2", "width": 1584, "height": 1056 },
                                    { "name": "16:9", "width": 1664, "height": 928 },
                                    { "name": "9:16", "width": 928, "height": 1664 }
                                ]
                            },
                            {
                                "id": "zimage",
                                "name": "Zimage",
                                "ratios": [
                                    { "name": "1:1", "width": 1440, "height": 1440 },
                                    { "name": "1:1", "width": 1024, "height": 1024 },
                                    { "name": "2:3", "width": 1088, "height": 1600 },
                                    { "name": "3:2", "width": 1600, "height": 1088 },
                                    { "name": "16:9", "width": 1920, "height": 1088 },
                                    { "name": "9:16", "width": 1088, "height": 1920 }
                                ]
                            },
                            {
                                "id": "wan",
                                "name": "WAN",
                                "ratios": [
                                    { "name": "1:1", "width": 624, "height": 624 },
                                    { "name": "2:3", "width": 384, "height": 576 },
                                    { "name": "2:3", "width": 528, "height": 768 },
                                    { "name": "2:3", "width": 624, "height": 912 },
                                    { "name": "2:3", "width": 656, "height": 960 },
                                    { "name": "2:3", "width": 736, "height": 1072 },
                                    { "name": "2:3", "width": 784, "height": 1136 },
                                    { "name": "3:2", "width": 752, "height": 512 },
                                    { "name": "3:4", "width": 416, "height": 544 },
                                    { "name": "3:4", "width": 560, "height": 720 },
                                    { "name": "3:4", "width": 672, "height": 864 },
                                    { "name": "3:4", "width": 720, "height": 912 },
                                    { "name": "3:4", "width": 784, "height": 1008 },
                                    { "name": "3:4", "width": 848, "height": 1088 },
                                    { "name": "9:16", "width": 368, "height": 624 },
                                    { "name": "9:16", "width": 480, "height": 848 },
                                    { "name": "9:16", "width": 576, "height": 1008 },
                                    { "name": "9:16", "width": 608, "height": 1072 },
                                    { "name": "9:16", "width": 672, "height": 1184 },
                                    { "name": "9:16", "width": 720, "height": 1264 },
                                    { "name": "16:9", "width": 1280, "height": 720 },
                                    { "name": "16:9", "width": 624, "height": 368 },
                                    { "name": "16:9", "width": 848, "height": 480 },
                                    { "name": "16:9", "width": 1008, "height": 576 },
                                    { "name": "16:9", "width": 1072, "height": 608 },
                                    { "name": "16:9", "width": 1184, "height": 672 },
                                    { "name": "16:9", "width": 1264, "height": 720 }
                                ]
                            }
                        ];
                        models.length = 0;
                        models.push(...defaults);
                        await this.saveModels(models);
                        renderList();
                    }
                };
                return;
            }

            models.forEach(m => {
                const item = document.createElement('div');
                item.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:rgba(39,39,42,0.4); padding:1rem; border-radius:8px; border:1px solid var(--tk-border);";
                const safeModelName = this.escapeHtml(String(m.name || ''));
                const ratioCount = Array.isArray(m.ratios) ? m.ratios.length : 0;
                item.innerHTML = `
                    <div>
                        <div style="font-weight:600; color:var(--tk-zinc-200);">${safeModelName}</div>
                        <div style="font-size:0.75rem; color:var(--tk-zinc-500);">${ratioCount} ratios</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                         <button class="tk-edit-mini" style="background:var(--tk-emerald-500); border:none; color:#000; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:700;">編輯</button>
                         <button class="tk-del-mini" style="background:rgba(239,68,68,0.2); border:1px solid rgba(239,68,68,0.3); color:#f87171; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:600;">刪除</button>
                    </div>
                `;
                item.querySelector('.tk-edit-mini').onclick = () => openEditor(m);
                item.querySelector('.tk-del-mini').onclick = async () => {
                    if (confirm(`刪除模型 ${m.name}?`)) {
                        const idx = models.indexOf(m);
                        if (idx > -1) {
                            models.splice(idx, 1);
                            await this.saveModels(models);
                            renderList();
                        }
                    }
                };
                listDiv.appendChild(item);
            });
        };

        const renderRatios = (ratios) => {
            const ratioList = container.querySelector('#tk-ratio-list');
            ratioList.innerHTML = '';
            ratios.forEach((r, idx) => {
                const row = document.createElement('div');
                row.style.cssText = "display:grid; grid-template-columns: 1fr 80px 80px 40px; gap:8px; align-items:center;";
                const safeRatioName = this.escapeAttr(String(r.name ?? ''));
                const safeRatioW = this.escapeAttr(String(r.width ?? ''));
                const safeRatioH = this.escapeAttr(String(r.height ?? ''));
                row.innerHTML = `
                    <input type="text" class="tk-input ratio-name" value="${safeRatioName}" placeholder="Name (e.g. 1:1)">
                    <input type="number" class="tk-input ratio-w" value="${safeRatioW}" placeholder="W">
                    <input type="number" class="tk-input ratio-h" value="${safeRatioH}" placeholder="H">
                    <button class="tk-del-mini" style="background:rgba(239,68,68,0.2); border:none; color:#f87171; width:32px; height:32px; border-radius:4px; cursor:pointer;">×</button>
                `;
                row.querySelector('.tk-del-mini').onclick = () => {
                    row.remove();
                };
                ratioList.appendChild(row);
            });
        };

        const openEditor = (model) => {
            this.editingModelId = model ? model.id : null;
            editorDiv.style.display = 'block';

            const nameInput = container.querySelector('#tk-model-name');

            if (model) {
                nameInput.value = model.name;
                const modelRatios = Array.isArray(model.ratios) ? model.ratios : [];
                renderRatios(JSON.parse(JSON.stringify(modelRatios))); // Deep copy
            } else {
                nameInput.value = '';
                renderRatios([]);
            }
        };

        container.querySelector('#tk-add-model-btn').onclick = () => openEditor(null);

        container.querySelector('#tk-add-ratio-btn').onclick = () => {
            const ratioList = container.querySelector('#tk-ratio-list');
            const row = document.createElement('div');
            row.style.cssText = "display:grid; grid-template-columns: 1fr 80px 80px 40px; gap:8px; align-items:center;";
            row.innerHTML = `
                <input type="text" class="tk-input ratio-name" placeholder="Name">
                <input type="number" class="tk-input ratio-w" placeholder="W">
                <input type="number" class="tk-input ratio-h" placeholder="H">
                <button class="tk-del-mini" style="background:rgba(239,68,68,0.2); border:none; color:#f87171; width:32px; height:32px; border-radius:4px; cursor:pointer;">×</button>
            `;
            row.querySelector('.tk-del-mini').onclick = () => row.remove();
            ratioList.appendChild(row);
        };

        container.querySelector('#tk-cancel-model-edit').onclick = () => {
            editorDiv.style.display = 'none';
            this.editingModelId = null;
        };

        container.querySelector('#tk-save-model-btn').onclick = async () => {
            const name = container.querySelector('#tk-model-name').value.trim();
            if (!name) {
                alert('請輸入模型名稱');
                return;
            }
            // Auto-generate safe ID from name (lowercase, spaces to underscores)
            const normalizeModelId = (rawName) => String(rawName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            let id = this.editingModelId || normalizeModelId(name);
            if (!id) {
                id = `model_${this.uuidv4().slice(0, 8)}`;
            }
            if (!this.editingModelId) {
                const usedIds = new Set(models.map((m) => String(m.id || '')));
                const baseId = id;
                let idx = 2;
                while (usedIds.has(id)) {
                    id = `${baseId}_${idx}`;
                    idx += 1;
                }
            }

            // Gather ratios
            const ratios = [];
            container.querySelectorAll('#tk-ratio-list > div').forEach(row => {
                const rName = row.querySelector('.ratio-name').value;
                const rW = parseInt(row.querySelector('.ratio-w').value);
                const rH = parseInt(row.querySelector('.ratio-h').value);
                if (rName && rW && rH) ratios.push({ name: rName, width: rW, height: rH });
            });

            const newModel = { id, name, ratios };

            if (this.editingModelId) {
                // Update existing
                const idx = models.findIndex(m => m.id === this.editingModelId);
                if (idx > -1) models[idx] = newModel;
            } else {
                // Add new
                models.push(newModel);
            }

            await this.saveModels(models);
            editorDiv.style.display = 'none';
            renderList();
        };

        renderList();
    },

    async renderAdminPanel(container) {
        // Ensure models are loaded for the dropdown
        await this.loadModels();
        await this.ensureSettingsLoaded();

        container.innerHTML = `
            <div class="tk-admin-panel animate-in fade-in duration-300">
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 2rem;">
                    <div>
                        <h2 class="tk-admin-title" style="margin:0;">工作流管理員</h2>
                        <div style="display:flex; gap:1rem; margin-top:0.5rem;">
                            <button class="tk-tab-btn active" id="tk-admin-tab-presets" style="font-size:0.9rem;">工作流預設</button>
                            <button class="tk-tab-btn" id="tk-admin-tab-models" style="font-size:0.9rem;">模型管理</button>
                        </div>
                    </div>
                </div>

                <div class="tk-admin-section" style="margin-bottom: 1.5rem; display:flex; align-items:flex-start; justify-content:space-between; gap:1rem;">
                    <div>
                        <label class="tk-label" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                            <input type="checkbox" id="tk-clear-history-on-startup" ${this.settingsCache && this.settingsCache.clear_history_on_startup ? 'checked' : ''} style="accent-color: var(--tk-emerald-500); width:16px; height:16px;">
                            <span>啟動時清空歷史紀錄</span>
                        </label>
                        <p style="font-size:0.75rem; color:var(--tk-zinc-500); margin-top:4px; margin-left:24px;">預設為關閉。開啟後，下次啟動 ComfyUI 會清空 Toolkit 歷史。</p>
                    </div>
                    <span id="tk-settings-save-state" style="font-size:0.75rem; color:var(--tk-zinc-500); white-space:nowrap;"></span>
                </div>

                <!-- VIEW: PRESETS -->
                <div id="tk-admin-view-presets" style="display:grid; grid-template-columns: 320px 1fr; gap: 2rem;">
                    
                    <div class="tk-admin-section">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                            <h3 class="tk-sidebar-label" style="margin:0;">已保存預設</h3>
                             <button class="tk-generate-btn" id="tk-trigger-upload" style="min-width: unset; padding: 0.4rem 0.8rem; font-size:0.75rem; background: rgba(16, 185, 129, 0.1); color: var(--tk-emerald-400); border: 1px solid rgba(16, 185, 129, 0.3);">
                                📤 上傳 JSON
                            </button>
                            <input type="file" id="tk-upload-json" accept=".json" style="display:none;">
                        </div>
                        <div id="tk-admin-preset-list" style="display:flex; flex-direction:column; gap:8px;">
                            Loading...
                        </div>
                    </div>

                    <!-- Config Area -->
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
                                    <option value="post_image">圖片後處理 (Post)</option>
                                    <option value="t2v">文生影片 (T2V)</option>
                                    <option value="i2v">圖生影片 (I2V)</option>
                                    <option value="v2v">影片生影片 (V2V)</option>
                                    <option value="rev_image">圖片反推 (Rev Img)</option>
                                    <option value="rev_video">影片反推 (Rev Vid)</option>
                                </select>
                            </div>
                         </div>
                         
                         <div class="tk-form-group" style="margin-bottom: 2rem;">
                            <label class="tk-label">使用模型 (用於比例選擇)</label>
                            <select id="tk-config-model" class="tk-input">
                                <option value="">(無) 自行輸入尺寸</option>
                                ${this.modelsCache ? this.modelsCache.map(m => `<option value="${this.escapeAttr(String(m.id || ''))}">${this.escapeHtml(String(m.name || ''))}</option>`).join('') : ''}
                            </select>
                            <p style="font-size:0.75rem; color:var(--tk-zinc-500); margin-top:4px;">選擇此工作流使用的基礎模型，以便用戶可以使用預設的比例尺寸。</p>
                        </div>

                        <div class="tk-form-group" style="margin-bottom: 2rem;">
                            <label class="tk-label" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" id="tk-config-allow-batch" style="accent-color: var(--tk-emerald-500); width:16px; height:16px;">
                                <span>是否允許用戶生成多張圖片? (Allow Batch Config)</span>
                            </label>
                            <p style="font-size:0.75rem; color:var(--tk-zinc-500); margin-top:4px; margin-left:24px;">若勾選，用戶可在生成前選擇批量生成數量 (2-10張)。</p>
                        </div>

                        <div class="tk-form-group" style="margin-bottom: 2rem;">
                            <label class="tk-label">後續工作流 (可複選，僅限圖片後處理)</label>
                            <div style="display:flex; gap:8px;">
                                <div id="tk-config-next-workflows" class="tk-next-workflow-list" style="flex:1;"></div>
                                <div style="display:flex; flex-direction:column; gap:6px;">
                                    <button id="tk-next-workflow-up" type="button" class="tk-tab-btn" style="padding: 0.5rem 0.8rem;">↑</button>
                                    <button id="tk-next-workflow-down" type="button" class="tk-tab-btn" style="padding: 0.5rem 0.8rem;">↓</button>
                                </div>
                            </div>
                            <p style="font-size:0.75rem; color:var(--tk-zinc-500); margin-top:4px;">勾選即可啟用後續工作流；可用 ↑↓ 調整執行順序。執行時若需接圖，優先使用 LoadImageFromPath。</p>
                            <p id="tk-image-input-hint" style="display:none; font-size:0.75rem; color:var(--tk-amber-400); margin-top:6px;"></p>
                        </div>

                        <div class="tk-form-group" style="margin-bottom: 2rem;">
                            <label class="tk-label">預覽圖片</label>
                            <div style="display:flex; gap:0.5rem;">
                                <input type="text" id="tk-config-image" class="tk-input" placeholder="圖片連結或上傳" style="flex:1;">
                                <button id="tk-trigger-upload-img" type="button" class="tk-tab-btn" style="background: var(--tk-zinc-800);">上傳檔案</button>
                            </div>
                            <input type="file" id="tk-upload-img-input" accept="image/*" style="display:none;">
                            <div id="tk-preview-crop-editor"></div>
                        </div>

                        <h4 class="tk-sidebar-label" style="margin-top: 2rem;">節點與參數配置</h4>
                        <div id="tk-node-list" style="display:flex; flex-direction:column; gap: 1rem;"></div>

                        <div style="display:flex; justify-content:flex-end; gap:1rem; margin-top:2.5rem; pt: 1.5rem; border-top: 1px solid var(--tk-border);">
                            <button id="tk-cancel-edit" class="tk-tab-btn">取消</button>
                            <button id="tk-save-preset" class="tk-generate-btn" style="min-width: 140px;">保存預設</button>
                        </div>
                    </div>
                </div>

                <!-- VIEW: MODELS -->
                <div id="tk-admin-view-models" style="display:none; grid-template-columns: 1fr; gap: 2rem;">
                    <!-- Model Manager injected here -->
                </div>
            </div>
        `;

        // Bind Tabs
        const tabPresets = container.querySelector('#tk-admin-tab-presets');
        const tabModels = container.querySelector('#tk-admin-tab-models');
        const viewPresets = container.querySelector('#tk-admin-view-presets');
        const viewModels = container.querySelector('#tk-admin-view-models');

        tabPresets.onclick = () => {
            tabPresets.classList.add('active');
            tabModels.classList.remove('active');
            viewPresets.style.display = 'grid';
            viewModels.style.display = 'none';
        };

        tabModels.onclick = () => {
            console.log("[TK] Model Tab Clicked");
            tabModels.classList.add('active');
            tabPresets.classList.remove('active');
            viewModels.style.display = 'grid';
            viewPresets.style.display = 'none';
            // Initialize Model Manager View if not already initialized
            if (!viewModels.dataset.initialized) {
                viewModels.dataset.initialized = 'true';
                this.renderModelManager(viewModels);
            }
        };

        const clearHistoryToggle = container.querySelector('#tk-clear-history-on-startup');
        const settingsState = container.querySelector('#tk-settings-save-state');
        if (clearHistoryToggle) {
            clearHistoryToggle.onchange = async (e) => {
                const nextValue = !!e.target.checked;
                e.target.disabled = true;
                if (settingsState) settingsState.textContent = '儲存中...';
                try {
                    await this.saveToolkitSettings({ clear_history_on_startup: nextValue });
                    if (settingsState) settingsState.textContent = '已儲存';
                } catch (err) {
                    e.target.checked = !nextValue;
                    alert(`設定儲存失敗: ${err.message}`);
                    if (settingsState) settingsState.textContent = '儲存失敗';
                } finally {
                    e.target.disabled = false;
                    if (settingsState) {
                        setTimeout(() => { settingsState.textContent = ''; }, 1500);
                    }
                }
            };
        }

        // Bind Actions (Presets)
        const fileInput = container.querySelector('#tk-upload-json');
        container.querySelector('#tk-trigger-upload').onclick = () => fileInput.click();
        fileInput.onchange = (e) => this.handleJsonUpload(e.target.files[0]);
        const imageFileInput = container.querySelector('#tk-upload-img-input');
        const imageUploadTrigger = container.querySelector('#tk-trigger-upload-img');
        if (imageUploadTrigger && imageFileInput) {
            imageUploadTrigger.onclick = () => imageFileInput.click();
        }
        this.previewCropEditor = new PreviewCropEditor(container.querySelector('#tk-preview-crop-editor'));
        const previewImageInput = container.querySelector('#tk-config-image');
        previewImageInput.onchange = () => {
            previewImageInput.value = resolvePresetPreviewUrl(previewImageInput.value, import.meta.url);
            this.previewCropEditor.setImage(previewImageInput.value);
        };

        const nextWorkflowUpBtn = container.querySelector('#tk-next-workflow-up');
        const nextWorkflowDownBtn = container.querySelector('#tk-next-workflow-down');
        if (nextWorkflowUpBtn) nextWorkflowUpBtn.onclick = () => this.moveSelectedNextWorkflow('up');
        if (nextWorkflowDownBtn) nextWorkflowDownBtn.onclick = () => this.moveSelectedNextWorkflow('down');

        container.querySelector('#tk-save-preset').onclick = () => this.savePreset();
        container.querySelector('#tk-cancel-edit').onclick = () => {
            document.getElementById('tk-config-area').classList.add('tk-hidden');
            this.editingPresetId = null;
            this.currentWorkflow = null;
            fileInput.value = '';
            this.previewCropEditor.setImage('');
            this.renderNextWorkflowOptions([]);
        };

        // Image Upload
        imageFileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('image', file);
            try {
                const res = await api.fetchApi('/tk/upload_image', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.status === 'success') {
                    document.getElementById('tk-config-image').value = resolvePresetPreviewUrl(data.url, import.meta.url);
                    this.previewCropEditor.setImage(document.getElementById('tk-config-image').value);
                } else alert('上傳失敗: ' + data.message);
            } catch (err) { alert('上傳錯誤: ' + err.message); }
        };

        this.loadAdminPresetList();
        this.renderNextWorkflowOptions([]);
    },

    getNextWorkflowRows() {
        const container = document.getElementById('tk-config-next-workflows');
        if (!container) return [];

        return Array.from(container.querySelectorAll('.tk-next-workflow-row')).map((row) => {
            const checkbox = row.querySelector('.tk-next-workflow-check');
            return {
                id: String(row.dataset.workflowId || ''),
                name: String(row.dataset.workflowName || ''),
                selected: !!(checkbox && checkbox.checked)
            };
        }).filter((row) => row.id);
    },

    updateNextWorkflowOrderBadges() {
        const container = document.getElementById('tk-config-next-workflows');
        if (!container) return;

        let order = 1;
        Array.from(container.querySelectorAll('.tk-next-workflow-row')).forEach((row) => {
            const checkbox = row.querySelector('.tk-next-workflow-check');
            const badge = row.querySelector('.tk-next-workflow-order');
            const selected = !!(checkbox && checkbox.checked);
            row.classList.toggle('is-selected', selected);
            if (badge) {
                badge.textContent = selected ? String(order) : '-';
            }
            if (selected) order += 1;
        });
    },

    renderNextWorkflowOptions(selectedIds = [], excludePresetId = null, orderedIds = null) {
        const container = document.getElementById('tk-config-next-workflows');
        if (!container) return;

        const selectedSet = new Set((selectedIds || []).map((id) => String(id)));
        const selectedSorted = [...selectedSet];

        const allPresets = Array.isArray(this.presetsCache) ? this.presetsCache : [];
        const postProcessPresets = allPresets
            .filter((p) => p && p.category === 'post_image')
            .filter((p) => String(p.id) !== String(excludePresetId));
        const byId = new Map(postProcessPresets.map((p) => [String(p.id), p]));

        const options = [];
        const seen = new Set();

        if (Array.isArray(orderedIds) && orderedIds.length > 0) {
            orderedIds.forEach((id) => {
                const preset = byId.get(String(id));
                if (!preset) return;
                const presetId = String(preset.id);
                if (seen.has(presetId)) return;
                seen.add(presetId);
                options.push(preset);
            });
        } else {
            selectedSorted.forEach((id) => {
                const preset = byId.get(id);
                if (!preset) return;
                const presetId = String(preset.id);
                if (seen.has(presetId)) return;
                seen.add(presetId);
                options.push(preset);
            });
        }

        postProcessPresets.forEach((preset) => {
            const presetId = String(preset.id);
            if (seen.has(presetId)) return;
            seen.add(presetId);
            options.push(preset);
        });

        container.innerHTML = '';
        if (options.length === 0) {
            container.innerHTML = '<div class="tk-next-workflow-empty">目前沒有可用的圖片後處理工作流。</div>';
            return;
        }

        options.forEach((preset) => {
            const workflowId = String(preset.id);
            const row = document.createElement('label');
            row.className = 'tk-next-workflow-row';
            row.dataset.workflowId = workflowId;
            row.dataset.workflowName = String(preset.name || '');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'tk-next-workflow-check';
            checkbox.checked = selectedSet.has(workflowId);
            checkbox.addEventListener('change', () => this.updateNextWorkflowOrderBadges());

            const orderBadge = document.createElement('span');
            orderBadge.className = 'tk-next-workflow-order';
            orderBadge.textContent = '-';

            const nameText = document.createElement('span');
            nameText.className = 'tk-next-workflow-name';
            nameText.textContent = String(preset.name || '');

            row.appendChild(checkbox);
            row.appendChild(orderBadge);
            row.appendChild(nameText);
            container.appendChild(row);
        });

        this.updateNextWorkflowOrderBadges();
    },

    moveSelectedNextWorkflow(direction) {
        const rows = this.getNextWorkflowRows();
        if (rows.length === 0) return;

        const options = rows.map((row) => ({
            value: row.id,
            text: row.name,
            selected: row.selected
        }));

        if (direction === 'up') {
            for (let i = 1; i < options.length; i++) {
                if (options[i].selected && !options[i - 1].selected) {
                    const tmp = options[i - 1];
                    options[i - 1] = options[i];
                    options[i] = tmp;
                }
            }
        } else {
            for (let i = options.length - 2; i >= 0; i--) {
                if (options[i].selected && !options[i + 1].selected) {
                    const tmp = options[i + 1];
                    options[i + 1] = options[i];
                    options[i] = tmp;
                }
            }
        }

        const orderedIds = options.map((opt) => String(opt.value));
        const selectedAfterMove = options.filter((opt) => opt.selected).map((opt) => String(opt.value));
        this.renderNextWorkflowOptions(selectedAfterMove, this.editingPresetId, orderedIds);
    },

    getOrderedSelectedNextWorkflowIds() {
        return this.getNextWorkflowRows()
            .filter((row) => row.selected)
            .map((row) => String(row.id));
    },

    updateImageInputHint(workflow) {
        const hint = document.getElementById('tk-image-input-hint');
        if (!hint) return;
        hint.style.display = 'none';
        hint.textContent = '';

        const targets = findImageInputTargets(workflow);
        if (targets.length > 1) {
            const chosen = targets[0];
            hint.style.display = 'block';
            hint.textContent = `提示：偵測到 ${targets.length} 個可接圖節點；鏈式執行會自動選擇節點 ID 最小的 ${chosen.nodeId} (${chosen.nodeClass}/${chosen.inputName})。`;
        }
    },

    async loadAdminPresetList() {
        const listContainer = document.getElementById('tk-admin-preset-list');
        if (!listContainer) return;

        try {
            await this.ensurePresetsLoaded();
            const presets = this.presetsCache;

            listContainer.innerHTML = '';
            if (presets.length === 0) listContainer.innerHTML = '<div style="color:var(--tk-zinc-600); font-size: 0.875rem; text-align:center; padding: 2rem;">尚無預設項目</div>';

            const categories = {
                't2i': '🖼️ 文生圖 (T2I)',
                'i2i': '🎨 圖生圖 (I2I)',
                'edit': '🔨 圖片編輯 (Edit)',
                'post_image': '🧩 圖片後處理',
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
                    const safePreviewImageUrl = this.escapeAttr(p.previewImageUrl || '');
                    const safeName = this.escapeHtml(p.name || '');
                    const safeCategory = this.escapeHtml(p.category || '');
                    item.innerHTML = `
                        <div style="width:40px; height:40px; border-radius:8px; background:var(--tk-zinc-900); overflow:hidden; border:1px solid var(--tk-border); display:flex; align-items:center; justify-content:center;">
                            ${p.previewImageUrl ? `<img src="${safePreviewImageUrl}" class="tk-admin-preset-thumb" style="width:100%; height:100%; object-fit:cover; opacity: 0.8; ${previewCropStyle(p.previewCrop)}">` : '<span style="font-size:1.2rem;">🍌</span>'}
                        </div>
                        <div style="flex:1; min-width:0;">
                             <div style="font-size:0.875rem; font-weight:600; color:var(--tk-zinc-200); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${safeName}</div>
                             <div style="font-size:0.65rem; color:var(--tk-zinc-500); text-transform:uppercase;">${safeCategory}</div>
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
                    const thumb = item.querySelector('.tk-admin-preset-thumb');
                    if (thumb) {
                        thumb.onerror = () => {
                            const holder = thumb.parentElement;
                            thumb.remove();
                            if (holder) holder.innerText = '🍌';
                        };
                    }

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

            const currentSelected = this.getOrderedSelectedNextWorkflowIds();
            this.renderNextWorkflowOptions(currentSelected, this.editingPresetId);
        } catch (e) {
            listContainer.innerHTML = `<div style="color:red; font-size:0.75rem;">載入失敗: ${this.escapeHtml(e.message)}</div>`;
        }
    },

    loadPresetForEditing(preset) {
        this.editingPresetId = preset.id;
        this.currentWorkflow = preset.workflow;

        this.parseAndShowConfig(preset.workflow);
        const nextWorkflowIds = Array.isArray(preset.nextWorkflows) ? preset.nextWorkflows.map((id) => String(id)) : [];
        this.renderNextWorkflowOptions(nextWorkflowIds, preset.id);
        this.updateImageInputHint(preset.workflow);

        document.getElementById('tk-config-name').value = preset.name;
        document.getElementById('tk-config-category').value = preset.category;
        document.getElementById('tk-config-model').value = preset.modelUsage || '';
        document.getElementById('tk-config-allow-batch').checked = !!preset.allowBatch;
        document.getElementById('tk-config-image').value = preset.previewImageUrl || '';
        this.previewCropEditor.setImage(preset.previewImageUrl || '', preset.previewCrop);
        document.getElementById('tk-config-title').textContent = "編輯預設項目";

        (Array.isArray(preset.parameters) ? preset.parameters : []).forEach(p => {
            const checkbox = this.findElementByDataset('.tk-param-visible', {
                node: p.nodeId,
                key: p.inputName,
            });
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
                document.getElementById('tk-config-category').value = 't2i';
                document.getElementById('tk-config-model').value = '';
                document.getElementById('tk-config-allow-batch').checked = false;
                document.getElementById('tk-config-image').value = '';
                this.previewCropEditor.setImage('');
                this.renderNextWorkflowOptions([], null);
                this.updateImageInputHint(json);
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

            const header = document.createElement('div');
            header.style.cssText = "background:rgba(63,63,70,0.2); padding:0.5rem 1rem; font-size:10px; font-weight:800; color:var(--tk-zinc-500); display:flex; justify-content:space-between; text-transform:uppercase; letter-spacing:0.05em;";

            const nodeIdLabel = document.createElement('span');
            nodeIdLabel.textContent = `NODE ID: ${String(nodeId)}`;

            const classTypeLabel = document.createElement('span');
            classTypeLabel.style.cssText = "color:var(--tk-emerald-500); opacity:0.6;";
            classTypeLabel.textContent = String(nodeData.class_type || '');

            header.appendChild(nodeIdLabel);
            header.appendChild(classTypeLabel);
            nodeDiv.appendChild(header);

            const paramsBody = document.createElement('div');
            paramsBody.className = 'tk-node-params-body';
            paramsBody.style.cssText = "padding:1rem; display:flex; flex-direction:column; gap:0.75rem;";
            nodeDiv.appendChild(paramsBody);

            let hasInputs = false;

            for (const [key, val] of Object.entries(nodeData.inputs)) {
                if (Array.isArray(val)) continue;

                hasInputs = true;
                const paramDiv = document.createElement('div');
                paramDiv.className = 'tk-node-param-admin';
                paramDiv.style.cssText = "display:flex; align-items:center; gap:1rem;";

                const safeNodeId = String(nodeId);
                const safeKey = String(key);
                const safeDefaultValue = String(val ?? '');

                const visibleToggle = document.createElement('input');
                visibleToggle.type = 'checkbox';
                visibleToggle.className = 'tk-param-visible';
                visibleToggle.dataset.node = safeNodeId;
                visibleToggle.dataset.key = safeKey;
                visibleToggle.style.cssText = "accent-color: var(--tk-emerald-500);";

                const keyLabel = document.createElement('span');
                keyLabel.style.cssText = "font-size:0.875rem; color:var(--tk-zinc-300); width:120px; overflow:hidden; text-overflow:ellipsis;";
                keyLabel.textContent = safeKey;

                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.className = 'tk-input tk-param-name-admin';
                nameInput.placeholder = '顯示名稱';
                nameInput.value = safeKey;
                nameInput.style.cssText = "padding:0.4rem 0.8rem; flex:1; font-size:0.75rem;";

                const defaultInput = document.createElement('input');
                defaultInput.type = 'text';
                defaultInput.className = 'tk-input tk-param-default-admin';
                defaultInput.placeholder = '默認值';
                defaultInput.value = safeDefaultValue;
                defaultInput.style.cssText = "padding:0.4rem 0.8rem; width:120px; font-size:0.75rem;";

                paramDiv.appendChild(visibleToggle);
                paramDiv.appendChild(keyLabel);
                paramDiv.appendChild(nameInput);
                paramDiv.appendChild(defaultInput);
                paramsBody.appendChild(paramDiv);
            }

            if (hasInputs) nodeList.appendChild(nodeDiv);
        }

        this.updateImageInputHint(workflow);
    },

    async savePreset() {
        const name = document.getElementById('tk-config-name').value;
        const category = document.getElementById('tk-config-category').value;
        const modelUsage = document.getElementById('tk-config-model').value;
        const allowBatch = document.getElementById('tk-config-allow-batch').checked;
        const image = resolvePresetPreviewUrl(document.getElementById('tk-config-image').value, import.meta.url);
        const nextWorkflows = this.getOrderedSelectedNextWorkflowIds();

        if (!name) { alert("請輸入名稱"); return; }
        if (!this.currentWorkflow) { alert("未載入工作流"); return; }

        await this.ensurePresetsLoaded();
        const allPresets = Array.isArray(this.presetsCache) ? this.presetsCache : [];
        const postProcessPresetIds = new Set(
            allPresets
                .filter((p) => p && p.category === 'post_image')
                .map((p) => String(p.id))
        );

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

        const presetId = this.editingPresetId || this.uuidv4();
        if (nextWorkflows.includes(String(presetId))) {
            alert("儲存失敗：後續工作流不可包含自己。");
            return;
        }

        for (const nextId of nextWorkflows) {
            if (!postProcessPresetIds.has(String(nextId))) {
                alert(`儲存失敗：後續工作流 ID ${nextId} 不是「圖片後處理」分類。`);
                return;
            }
        }

        const nextGraph = {};
        allPresets.forEach((p) => {
            if (!p || !p.id) return;
            nextGraph[String(p.id)] = Array.isArray(p.nextWorkflows) ? p.nextWorkflows.map((id) => String(id)) : [];
        });
        nextGraph[String(presetId)] = nextWorkflows.map((id) => String(id));

        const cyclePath = findCyclePath(nextGraph);
        if (cyclePath) {
            const idToName = new Map(allPresets.map((p) => [String(p.id), p.name]));
            idToName.set(String(presetId), name);
            const cycleNames = cyclePath.map((id) => idToName.get(String(id)) || String(id));
            alert(`儲存失敗：偵測到後續工作流循環\n${cycleNames.join(' -> ')}`);
            return;
        }

        const presetData = {
            id: presetId,
            name,
            category,
            modelUsage,
            allowBatch,
            nextWorkflows,
            previewImageUrl: image,
            previewCrop: image ? this.previewCropEditor.getValue() : null,
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
            this.renderNextWorkflowOptions([]);
            this.updateImageInputHint({});
            this.loadAdminPresetList();
        } else alert("保存失敗");
    },

    async loadHistorySettings(historyId) {
        try {
            // 1. Ensure presets are loaded
            await this.ensurePresetsLoaded();

            // 2. Fetch history item details
            const hRes = await api.fetchApi('/tk/history');
            const history = await hRes.json();
            const item = history.find(h => h.id === historyId);

            if (!item) throw new Error("找不到該歷史記錄");

            // 3. Find corresponding preset (prefer stable ID)
            const preset = this.presetsCache.find(p => String(p.id) === String(item.preset_id))
                || this.presetsCache.find(p => p.name === item.preset_name);
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

            const sourceWorkflowObject = (sourceWorkflow && typeof sourceWorkflow === 'object') ? sourceWorkflow : {};

            // 5. Switch Tab and Render (await to avoid race with async form rendering)
            const sidebarList = document.getElementById('tk-sidebar-list');
            const mainPanel = document.getElementById('tk-main-panel');
            ToolkitUI.switchTab(preset.category, { skipLoad: true });

            if (sidebarList && mainPanel) {
                await this.loadPresets(preset.category, sidebarList, mainPanel);
            }
            if (!mainPanel) throw new Error("找不到主面板，無法套用同款參數。");

            await ToolkitUI.renderUserForm(preset, mainPanel);

            // Highlight in sidebar
            if (sidebarList) {
                const cards = sidebarList.querySelectorAll('.tk-preset-card');
                cards.forEach((card) => {
                    const presetName = card.querySelector('.tk-preset-name')?.textContent;
                    if (presetName === preset.name) {
                        card.classList.add('active');
                        card.scrollIntoView({ block: 'center' });
                    } else {
                        card.classList.remove('active');
                    }
                });
            }

            // 6. Populate Values from Source Workflow
            let matchCount = 0;
            console.log("Restoring from workflow:", sourceWorkflowObject);

            (Array.isArray(preset.parameters) ? preset.parameters : []).forEach((param) => {
                const node = sourceWorkflowObject[String(param.nodeId)];
                if (!node || !node.inputs) return;

                const val = node.inputs[param.inputName];
                if (val === undefined) return;

                const inputElem = this.findElementByDataset('.tk-form-input', {
                    node: param.nodeId,
                    input: param.inputName,
                });
                if (!inputElem) return;
                this.setFormInputValue(inputElem, val);
                matchCount++;
            });

            this.showToast(`已套用同款參數 (${matchCount})`, 'success');

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
            const inputEl = this.findElementByDataset('.tk-form-input', {
                node: nodeId,
                input: inputName,
            });
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
                    this.setFormInputValue(inputEl, absPath);
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

                    const hiddenInput = this.findElementByDataset('.tk-form-input', {
                        node: nodeId,
                        input: inputName,
                    });
                    if (hiddenInput) {
                        this.setFormInputValue(hiddenInput, finalFilename);
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
            if (previewContainer) previewContainer.innerHTML = `<div style="color:#ef4444; font-size:0.8rem; padding:10px;">上傳失敗 (Upload Failed): ${this.escapeHtml(e.message)}</div>`;
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
