import { ToolkitApp } from "./tk_app.js";

export const ToolkitUI = {
    isOpen: false,

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

    isAbsolutePath(value) {
        const str = String(value ?? '');
        return /^[A-Za-z]:[\\/]/.test(str) || str.startsWith('/');
    },

    basenameFromPath(value) {
        const normalized = String(value ?? '').replace(/\\/g, '/');
        const parts = normalized.split('/');
        return parts[parts.length - 1] || '';
    },

    buildInputPreviewSources(nodeClass, rawValue) {
        const value = String(rawValue ?? '').trim();
        if (!value) return { primary: '', fallback: '' };

        const standardView = `/view?filename=${encodeURIComponent(value)}&type=input`;
        if (nodeClass !== 'LoadImageFromPath') {
            return { primary: standardView, fallback: '' };
        }

        if (this.isAbsolutePath(value)) {
            const fileName = this.basenameFromPath(value);
            if (fileName) {
                return {
                    primary: `/tk/view_upload/${encodeURIComponent(fileName)}`,
                    fallback: standardView,
                };
            }
        }

        return { primary: standardView, fallback: '' };
    },

    open() {
        if (this.isOpen) return;
        this.createModal();
        this.isOpen = true;
        this.switchTab('image');
    },

    close() {
        const modal = document.querySelector('.tk-modal-overlay');
        if (modal) modal.remove();
        this.isOpen = false;
    },

    createModal() {
        const modal = document.createElement('div');
        modal.className = 'tk-modal-overlay';

        modal.innerHTML = `
            <div class="tk-modal-window">
                <header class="tk-header">
                    <div class="tk-logo-area">
                        <span style="font-size: 1.5rem;">🍌</span>
                        <span class="tk-logo-text">塔克小工具</span>
                    </div>
                    
                        <button class="tk-tab-btn" data-tab="image">🖼️ 圖片</button>
                        <button class="tk-tab-btn" data-tab="video">🎥 影片</button>
                        <button class="tk-tab-btn" data-tab="reverse">🔍 反推</button>
                        <button class="tk-tab-btn" data-tab="gallery">📂 我的作品</button>
                        <button class="tk-tab-btn" data-tab="admin" style="margin-left:8px;">⚙️ 管理員</button>
                    </nav>
                    
                    <button class="tk-close-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </header>

                <div class="tk-content">
                    <aside class="tk-sidebar">
                        <div class="tk-sidebar-search">
                            <input type="text" id="tk-search-presets" placeholder="搜尋預設工作流...">
                        </div>
                        <h3 class="tk-sidebar-label">常用項目</h3>
                        <div id="tk-sidebar-list" class="tk-sidebar-list">
                            <!-- Presets list will be injected here -->
                        </div>
                        
                        <div id="tk-progress-area" class="tk-progress-container tk-hidden">
                            <div class="tk-progress-label">
                                <span id="tk-progress-title">Generating...</span>
                                <span id="tk-progress-percent">0%</span>
                            </div>
                            <div class="tk-progress-bar">
                                <div id="tk-progress-fill" class="tk-progress-fill"></div>
                            </div>
                            <div id="tk-queue-count" class="tk-queue-info">Waiting: 0</div>
                        </div>
                    </aside>
                    
                    <main class="tk-main-panel" id="tk-main-panel">
                        <div class="h-full flex flex-col items-center justify-center text-zinc-600">
                             <span style="font-size: 3rem; opacity: 0.2; margin-bottom: 1rem;">🖼️</span>
                             <p style="font-weight: 500;">請選擇一個預設項目開始創作</p>
                        </div>
                    </main>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event Listeners
        modal.querySelector('.tk-close-btn').onclick = () => this.close();
        modal.querySelectorAll('.tk-tab-btn').forEach(btn => {
            btn.onclick = (e) => this.switchTab(e.currentTarget.dataset.tab);
        });

        // Search logic
        const searchInput = modal.querySelector('#tk-search-presets');
        searchInput.oninput = (e) => this.filterSidebarList(e.target.value);

        // Close on outside click
        modal.onclick = (e) => {
            if (e.target === modal) this.close();
        };
    },

    currentPresets: [], // Local cache for filtering

    switchTab(tabName, options = {}) {
        const { skipLoad = false } = options;
        document.querySelectorAll('.tk-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        const sidebar = document.querySelector('.tk-sidebar');
        const mainPanel = document.getElementById('tk-main-panel');

        if (tabName === 'admin') {
            sidebar.classList.add('tk-hidden');
            delete sidebar.dataset.category;
            ToolkitApp.renderAdminPanel(mainPanel);
        } else if (tabName === 'gallery') {
            sidebar.classList.add('tk-hidden');
            delete sidebar.dataset.category;
            ToolkitApp.renderGallery(mainPanel);
        } else {
            sidebar.classList.remove('tk-hidden');
            if (skipLoad) return;
            // Show loading if cache is empty or it's a new category
            const currentCat = sidebar.dataset.category;
            if (currentCat !== tabName || !ToolkitApp.presetsCache) {
                sidebar.dataset.category = tabName;
                mainPanel.innerHTML = `
                    <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#52525b; animation: tk-fade-in 0.5s;">
                        <div class="tk-badge-pulse" style="width:12px; height:12px; margin-bottom:1rem;"></div>
                        <p style="font-weight: 500; font-size: 0.875rem; letter-spacing: 0.05em;">正在加載預設項目...</p>
                    </div>
                `;
                ToolkitApp.loadPresets(tabName, document.getElementById('tk-sidebar-list'), mainPanel);
            }
        }
    },

    renderPresetList(presets, sidebarList, mainPanel, category) {
        this.currentPresets = presets;
        this.renderFilteredList(presets, sidebarList, mainPanel);
    },

    filterSidebarList(query) {
        const filtered = this.currentPresets.filter(p =>
            p.name.toLowerCase().includes(query.toLowerCase())
        );
        const sidebarList = document.getElementById('tk-sidebar-list');
        const mainPanel = document.getElementById('tk-main-panel');
        this.renderFilteredList(filtered, sidebarList, mainPanel);
    },

    renderFilteredList(presets, sidebarList, mainPanel) {
        sidebarList.innerHTML = '';
        if (presets.length === 0) {
            sidebarList.innerHTML = '<div style="padding:20px; text-align:center; color:#52525b; font-size: 0.8rem;">找不到相符的項目</div>';
            mainPanel.innerHTML = `
                <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding: 2rem; animation: tk-fade-in 0.5s;">
                    <span style="font-size: 4rem; margin-bottom: 1.5rem; filter: grayscale(1); opacity: 0.3;">📂</span>
                    <h3 style="color: var(--tk-zinc-200); font-weight: 700; margin-bottom: 0.5rem;">此分類尚無預設項目</h3>
                    <p style="color: var(--tk-zinc-500); max-width: 300px; font-size: 0.875rem; line-height: 1.5; margin-bottom: 2rem;">
                        您需要先前往管理員模式上傳或配置工作流，才能在這裡看到它們。
                    </p>
                    <button class="tk-generate-btn tk-open-admin-btn" style="min-width: 180px;">
                        前往管理員模式
                    </button>
                </div>
            `;
            const openAdminBtn = mainPanel.querySelector('.tk-open-admin-btn');
            if (openAdminBtn) {
                openAdminBtn.onclick = () => {
                    const adminTab = document.querySelector('[data-tab=admin]');
                    if (adminTab) adminTab.click();
                };
            }
            return;
        }

        // --- GROUPING LOGIC ---
        // Define Display Names for Sub-Categories
        const subCatNames = {
            't2i': '文生圖',
            'i2i': '圖生圖',
            'edit': '圖片編輯',
            'post_image': '圖片後處理',
            't2v': '文生影片',
            'i2v': '圖生影片',
            'v2v': '影片生影片',
            'rev_image': '圖片反推',
            'rev_video': '影片反推'
        };

        // If we are searching, we might just show a flat list OR still grouped. 
        // Let's stick to grouped for consistency.

        // We know the current active tab from sidebar.dataset.category usually, 
        // but here we just group based on what we have in `presets`.

        // 1. Group items
        const groups = {};
        const orderMap = ['t2i', 'i2i', 'edit', 'post_image', 't2v', 'i2v', 'v2v', 'rev_image', 'rev_video']; // Order of appearance

        presets.forEach(p => {
            const cat = p.category;
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(p);
        });

        let hasAnyItem = false;

        // 2. Render Groups
        orderMap.forEach(catKey => {
            if (groups[catKey] && groups[catKey].length > 0) {
                hasAnyItem = true;

                // Render Header
                const header = document.createElement('div');
                header.className = 'tk-sidebar-group-header';
                header.style.cssText = "color: var(--tk-zinc-500); font-size: 0.75rem; font-weight: 600; padding: 12px 0 4px 4px; text-transform: uppercase; letter-spacing: 0.05em;";
                header.textContent = subCatNames[catKey] || catKey;
                sidebarList.appendChild(header);

                // Render Items
                groups[catKey].forEach(p => {
                    const card = document.createElement('div');
                    card.className = 'tk-preset-card';
                    const safePresetName = this.escapeHtml(p.name || '');
                    const safePreviewImageUrl = this.escapeAttr(p.previewImageUrl || '');

                    // Banana Fallback Logic
                    let imgHtml = '';
                    if (p.previewImageUrl) {
                        imgHtml = `<img src="${safePreviewImageUrl}" class="tk-preset-thumb" loading="lazy">`;
                    } else {
                        imgHtml = `<div class="tk-preset-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;background:#18181b;">🍌</div>`;
                    }

                    card.innerHTML = `
                        ${imgHtml}
                        <div class="tk-preset-info">
                            <span class="tk-preset-name">${safePresetName}</span>
                            <span class="tk-preset-meta">工作流已就緒</span>
                        </div>
                        <span style="color: #3f3f46; font-size: 0.75rem;">➔</span>
                    `;

                    const selectPreset = () => {
                        sidebarList.querySelectorAll('.tk-preset-card').forEach(c => c.classList.remove('active'));
                        card.classList.add('active');
                        this.renderUserForm(p, mainPanel);
                    };

                    card.onclick = selectPreset;
                    const thumbImg = card.querySelector('img.tk-preset-thumb');
                    if (thumbImg) {
                        thumbImg.onerror = () => {
                            const fallback = document.createElement('div');
                            fallback.className = 'tk-preset-thumb';
                            fallback.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:1.5rem;background:#18181b;';
                            fallback.textContent = '🍌';
                            thumbImg.replaceWith(fallback);
                        };
                    }
                    sidebarList.appendChild(card);
                });
            }
        });

        // 3. Handle specific case: If presets exist but don't match the orderMap (unlikely given filters but possible for 'others')
        // We can check for any 'other' categories if needed, but for now strict grouping is requested.

        // Auto-select first item
        const firstCard = sidebarList.querySelector('.tk-preset-card');
        if (firstCard) {
            firstCard.click();
        }
    },

    async renderUserForm(preset, container) {
        // 0. Ensure models loaded if needed
        if (preset.modelUsage && !ToolkitApp.modelsCache) {
            await ToolkitApp.loadModels();
        }

        // 1. Recover State
        const savedState = ToolkitApp.getPresetState(preset.id);
        const inputsState = savedState ? savedState.inputs : {};
        const sizeMode = (savedState && savedState.sizeMode) ? savedState.sizeMode : 'ratio'; // 'ratio' or 'custom'

        const visibleParams = (Array.isArray(preset.parameters) ? preset.parameters : []).filter(p => p.visible);

        // --- SIZE SELECTION LOGIC ---
        let widthParam = null;
        let heightParam = null;
        let modelData = null;

        if (preset.modelUsage && ToolkitApp.modelsCache) {
            modelData = ToolkitApp.modelsCache.find(m => m.id === preset.modelUsage);
            if (modelData) {
                widthParam = visibleParams.find(p => p.inputName.toLowerCase() === 'width');
                heightParam = visibleParams.find(p => p.inputName.toLowerCase() === 'height');
            }
        }

        const hasSizeSelection = widthParam && heightParam && modelData;

        const isLongTextParam = (p) => {
            return p.inputName.toLowerCase().includes('text') ||
                p.inputName.toLowerCase().includes('prompt') ||
                p.displayName.includes('提示詞') ||
                p.displayName.toLowerCase().includes('prompt');
        };

        const renderParamHtml = (p) => {
            const nodeIdRaw = String(p.nodeId ?? '');
            const inputNameRaw = String(p.inputName ?? '');
            const nodeClassRaw = String(p.nodeClass || '');
            const presetIdRaw = String(preset.id ?? '');
            const stateKeyRaw = `${nodeIdRaw}_${inputNameRaw}`;
            const currentValueRaw = inputsState[stateKeyRaw] !== undefined ? inputsState[stateKeyRaw] : (p.defaultValue ?? '');
            const displayNameRaw = String(p.displayName ?? p.inputName ?? '');

            const safeDisplayName = this.escapeHtml(displayNameRaw);
            const safeNodeIdAttr = this.escapeAttr(nodeIdRaw);
            const safeInputNameAttr = this.escapeAttr(inputNameRaw);
            const safeNodeClassAttr = this.escapeAttr(nodeClassRaw);
            const safeValueAttr = this.escapeAttr(String(currentValueRaw ?? ''));
            const safeValueText = this.escapeHtml(String(currentValueRaw ?? ''));

            const isLoadImage = p.nodeClass === 'LoadImage' || p.nodeClass === 'LoadImageFromPath';
            const isLongText = isLongTextParam(p);
            const isSeed = p.inputName.toLowerCase() === 'seed' ||
                p.inputName.toLowerCase() === 'noise_seed' ||
                p.displayName.includes('Seed');

            if (isLoadImage) {
                const imageValue = String(currentValueRaw ?? '');
                const previewSources = this.buildInputPreviewSources(nodeClassRaw, imageValue);
                const safePreviewUrl = this.escapeAttr(previewSources.primary);
                const safeFallbackPreviewUrl = this.escapeAttr(previewSources.fallback);
                return `
                    <div class="tk-form-group">
                        <label class="tk-label">${safeDisplayName}</label>
                        <div class="tk-image-upload-area" 
                             style="background:var(--tk-zinc-900); border:1px dashed var(--tk-border); border-radius:8px; padding:12px; text-align:center; transition: all 0.2s;"
                             data-node-id="${safeNodeIdAttr}"
                             data-input-name="${safeInputNameAttr}">
                             <input type="file" accept="image/*" class="tk-upload-file-input" data-node-id="${safeNodeIdAttr}" data-input-name="${safeInputNameAttr}" style="display:none">
                             <div class="tk-preview-container" id="preview-${safeNodeIdAttr}-${safeInputNameAttr}" style="min-height: 40px; display:flex; align-items:center; justify-content:center; flex-direction: column;">
                                ${imageValue ? `<img src="${safePreviewUrl}" class="tk-upload-preview-image" data-fallback-src="${safeFallbackPreviewUrl}" style="max-width:100%; max-height:200px; border-radius:8px; margin-bottom:8px; box-shadow:0 4px 6px rgba(0,0,0,0.2);">` : '<span style="color:var(--tk-zinc-600); font-size: 2rem; margin-bottom: 8px;">🖼️</span>'}
                             </div>
                              
                             <button class="tk-tab-btn tk-upload-open-btn" type="button" style="width:100%; justify-content:center;">
                                📤 上傳圖片 (Upload)
                             </button>
                             <input type="text" class="tk-input tk-form-input tk-state-input" 
                                data-node="${safeNodeIdAttr}" 
                                data-input="${safeInputNameAttr}" 
                                data-node-class="${safeNodeClassAttr}"
                                data-preset-id="${safePresetIdAttr}"
                                data-state-key="${this.escapeAttr(stateKeyRaw)}"
                                data-state-event="change"
                                data-type="string"
                                value="${safeValueAttr}"
                                style="display:none;">
                        </div>
                    </div>
                `;
            }

            if (isLongText) {
                return `
                    <div class="tk-form-group" style="height: 100%;">
                        <label class="tk-label">${safeDisplayName}</label>
                        <textarea class="tk-input tk-form-input tk-state-input" 
                            data-node="${safeNodeIdAttr}" 
                            data-input="${safeInputNameAttr}" 
                            data-preset-id="${safePresetIdAttr}"
                            data-state-key="${this.escapeAttr(stateKeyRaw)}"
                            data-state-event="input"
                            data-type="string"
                            style="flex: 1; resize: none; min-height: 200px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: break-word; font-family: monospace;"
                        >${safeValueText}</textarea>
                    </div>
                `;
            }

            if (isSeed) {
                return `
                    <div class="tk-form-group">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding-right: 4px;">
                             <label class="tk-label">${safeDisplayName}</label>
                             <label class="tk-seed-toggle-label" style="display:flex; align-items:center; gap:4px; transform: scale(0.9); cursor:pointer; opacity: 0.8; transition: opacity 0.2s;">
                                <input type="checkbox" class="tk-random-seed-toggle" 
                                    data-node="${safeNodeIdAttr}" 
                                    data-input="${safeInputNameAttr}"
                                    style="accent-color: var(--tk-emerald-500); width:14px; height:14px;">
                                <span style="font-size:0.75rem; color:var(--tk-zinc-400); font-weight: 500;">🎲 隨機</span>
                            </label>
                        </div>
                        <input type="number" class="tk-input tk-form-input tk-state-input" 
                            data-node="${safeNodeIdAttr}" 
                            data-input="${safeInputNameAttr}" 
                            data-preset-id="${safePresetIdAttr}"
                            data-state-key="${this.escapeAttr(stateKeyRaw)}"
                            data-state-event="change"
                            data-type="number"
                            value="${safeValueAttr}">
                    </div>
                `;
            }

            return `
                <div class="tk-form-group">
                    <label class="tk-label">${safeDisplayName}</label>
                    <input type="text" class="tk-input tk-form-input tk-state-input" 
                        data-node="${safeNodeIdAttr}" 
                        data-input="${safeInputNameAttr}" 
                        data-preset-id="${safePresetIdAttr}"
                        data-state-key="${this.escapeAttr(stateKeyRaw)}"
                        data-state-event="change"
                        data-type="${(!isNaN(p.defaultValue) && p.defaultValue !== '') ? 'number' : 'string'}"
                        value="${safeValueAttr}">
                </div>
            `;
        };

        const promptParams = visibleParams.filter(p => isLongTextParam(p));
        // Filter out width/height if handling specifically
        const otherParams = visibleParams.filter(p => !isLongTextParam(p) && (!hasSizeSelection || (p !== widthParam && p !== heightParam)));
        const presetIdRaw = String(preset.id ?? '');
        const safePresetIdAttr = this.escapeAttr(presetIdRaw);
        const sizeModeInputName = `sizeMode_${presetIdRaw}`;
        const safeSizeModeInputName = this.escapeAttr(sizeModeInputName);
        const savedFollowups = (savedState && typeof savedState.followups === 'object' && savedState.followups) ? savedState.followups : {};

        const availableFollowupIds = Array.isArray(preset.nextWorkflows) ? preset.nextWorkflows.map((id) => String(id)) : [];
        const presetsMap = new Map((Array.isArray(ToolkitApp.presetsCache) ? ToolkitApp.presetsCache : []).map((p) => [String(p.id), p]));
        const availableFollowups = availableFollowupIds
            .map((id) => {
                const matched = presetsMap.get(String(id));
                if (!matched) return null;
                return { id: String(id), name: String(matched.name || id) };
            })
            .filter((item) => !!item);
        const followupSectionHtml = availableFollowups.length > 0 ? `
            <div class="tk-user-followup-panel">
                <div class="tk-user-followup-title">可開啟的後續工作流</div>
                <div class="tk-user-followup-list">
                    ${availableFollowups.map((item) => {
                        const safeFollowupId = this.escapeAttr(item.id);
                        const safeFollowupName = this.escapeHtml(item.name);
                        const checked = !!savedFollowups[item.id];
                        return `
                            <label class="tk-user-followup-item">
                                <input type="checkbox"
                                       class="tk-user-followup-toggle"
                                       data-followup-id="${safeFollowupId}"
                                       ${checked ? 'checked' : ''}>
                                <span class="tk-user-followup-name">${safeFollowupName}</span>
                            </label>
                        `;
                    }).join('')}
                </div>
                <p class="tk-user-followup-hint">僅本次生成生效；執行順序沿用管理員設定。</p>
            </div>
        ` : '';

        // --- SIZE SELECTION HTML GENERATION ---
        let sizeSelectionHtml = '';
        if (hasSizeSelection) {
            // Determine current values
            const currW = inputsState[widthParam.nodeId + '_' + widthParam.inputName] !== undefined ? inputsState[widthParam.nodeId + '_' + widthParam.inputName] : widthParam.defaultValue;
            const currH = inputsState[heightParam.nodeId + '_' + heightParam.inputName] !== undefined ? inputsState[heightParam.nodeId + '_' + heightParam.inputName] : heightParam.defaultValue;

            // Find matching ratio
            const currentRatio = modelData.ratios.find(r => r.width == currW && r.height == currH);

            // Group ratios by name (e.g., "16:9", "1:1")
            const ratioGroups = {};
            modelData.ratios.forEach(r => {
                if (!ratioGroups[r.name]) ratioGroups[r.name] = [];
                ratioGroups[r.name].push(r);
            });
            const uniqueRatioNames = Object.keys(ratioGroups);

            // Determine initial selection for Group Select
            let initialGroup = uniqueRatioNames.length > 0 ? uniqueRatioNames[0] : '';
            if (currentRatio) {
                initialGroup = currentRatio.name;
            }
            const safeModelName = this.escapeHtml(String(modelData.name || ''));
            const safeWidthNodeId = this.escapeAttr(String(widthParam.nodeId ?? ''));
            const safeWidthInputName = this.escapeAttr(String(widthParam.inputName ?? ''));
            const safeHeightNodeId = this.escapeAttr(String(heightParam.nodeId ?? ''));
            const safeHeightInputName = this.escapeAttr(String(heightParam.inputName ?? ''));

            sizeSelectionHtml = `
                <div class="tk-form-group" style="background:rgba(24,24,27,0.5); padding:12px; border-radius:8px; border:1px solid var(--tk-border);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                         <label class="tk-label" style="margin:0;">📏 尺寸選擇 (${safeModelName})</label>
                         <div style="display:flex; gap:8px; font-size:0.75rem;">
                             <label style="cursor:pointer; display:flex; align-items:center; gap:4px; ${sizeMode === 'ratio' ? 'color:var(--tk-emerald-400);' : 'color:var(--tk-zinc-500);'}">
                                <input type="radio" name="${safeSizeModeInputName}" value="ratio" ${sizeMode === 'ratio' ? 'checked' : ''} style="display:none">
                                <span>選擇比例</span>
                             </label>
                             <label style="cursor:pointer; display:flex; align-items:center; gap:4px; ${sizeMode === 'custom' ? 'color:var(--tk-emerald-400);' : 'color:var(--tk-zinc-500);'}">
                                <input type="radio" name="${safeSizeModeInputName}" value="custom" ${sizeMode === 'custom' ? 'checked' : ''} style="display:none">
                                <span>自訂</span>
                             </label>
                         </div>
                    </div>

                    <!-- Dependent Ratio Selectors -->
                    <div id="tk-size-ratio-container" class="${sizeMode === 'ratio' ? '' : 'tk-hidden'}" style="display:flex; gap:8px;">
                        
                        <!-- 1. Ratio Group Selector -->
                        <div style="flex: 1;">
                            <label style="font-size:0.75rem; color:var(--tk-zinc-500); display:block; margin-bottom:4px;">比例 (Ratio)</label>
                            <select class="tk-input" id="tk-size-ratio-group">
                                ${uniqueRatioNames.map(name => `
                                    <option value="${this.escapeAttr(name)}" ${name === initialGroup ? 'selected' : ''}>${this.escapeHtml(name)}</option>
                                `).join('')}
                            </select>
                        </div>

                        <!-- 2. Resolution Selector -->
                        <div style="flex: 2;">
                            <label style="font-size:0.75rem; color:var(--tk-zinc-500); display:block; margin-bottom:4px;">解析度 (Resolution)</label>
                            <select class="tk-input" id="tk-size-resolution-select">
                                <!-- Options populated via JS -->
                            </select>
                        </div>
                    </div>

                    <!-- Custom Inputs (Standard Rendering + Hidden inputs for Ratio to sync to) -->
                    <div id="tk-size-custom-container" class="${sizeMode === 'custom' ? '' : 'tk-hidden'}" style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                         <div>
                            <label style="font-size:0.7rem; color:var(--tk-zinc-500);">Width</label>
                            <input type="number" class="tk-input tk-form-input tk-state-input tk-size-input-w" 
                                data-node="${safeWidthNodeId}" data-input="${safeWidthInputName}" data-type="number"
                                data-preset-id="${safePresetIdAttr}"
                                data-state-key="${this.escapeAttr(`${String(widthParam.nodeId ?? '')}_${String(widthParam.inputName ?? '')}`)}"
                                data-state-event="change"
                                value="${this.escapeAttr(String(currW ?? ''))}"
                                style="width:100%; box-sizing:border-box;">
                         </div>
                         <div>
                            <label style="font-size:0.7rem; color:var(--tk-zinc-500);">Height</label>
                            <input type="number" class="tk-input tk-form-input tk-state-input tk-size-input-h" 
                                data-node="${safeHeightNodeId}" data-input="${safeHeightInputName}" data-type="number"
                                data-preset-id="${safePresetIdAttr}"
                                data-state-key="${this.escapeAttr(`${String(heightParam.nodeId ?? '')}_${String(heightParam.inputName ?? '')}`)}"
                                data-state-event="change"
                                value="${this.escapeAttr(String(currH ?? ''))}"
                                style="width:100%; box-sizing:border-box;">
                         </div>
                    </div>
                </div>
            `;
        }


        container.innerHTML = `
            <div class="tk-preset-content">
                <div class="tk-preview-section">
                    ${preset.previewImageUrl ?
                `<img src="${this.escapeAttr(preset.previewImageUrl)}" class="tk-preview-img" loading="lazy">`
                : `<div class="tk-preview-img" style="display:flex;align-items:center;justify-content:center;font-size:5rem;background:#18181b;color:var(--tk-zinc-700);">🍌</div>`
            }
                    <div class="tk-preview-badge">
                        <div class="tk-badge-pulse"></div>
                        <span class="tk-badge-text">目前預設</span>
                    </div>
                </div>
                
                <div class="tk-form-container">
                    <h4 class="tk-form-title">
                        <span style="color: var(--tk-emerald-500);">▶</span> 參數設定
                    </h4>
                    
                    <div class="tk-form-split-container">
                        <!-- Left Column: Prompts -->
                        ${promptParams.length > 0 ? `
                        <div class="tk-form-left-col">
                            ${promptParams.map(renderParamHtml).join('')}
                        </div>
                        ` : ''}

                        <!-- Right Column: Others -->
                        <div class="tk-form-right-col">
                            <div class="tk-form-grid">
                                ${sizeSelectionHtml}
                                ${otherParams.map(renderParamHtml).join('')}
                            </div>
                        </div>
                    </div>

                    ${followupSectionHtml}

                    <div class="tk-action-bar" style="flex-direction: column; gap: 1rem;">
                        ${preset.allowBatch ? `
                        <div style="width:100%; padding: 12px; background: rgba(39, 39, 42, 0.4); border: 1px solid var(--tk-border); border-radius: 8px; transition: all 0.3s;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color: var(--tk-zinc-300); font-weight: 500; user-select: none;">
                                <input type="checkbox" id="tk-batch-toggle" style="accent-color: var(--tk-emerald-500); width:16px; height:16px;">
                                <span>🚀 批量生成 (Batch Generation)</span>
                            </label>
                            <div id="tk-batch-config" class="tk-hidden" style="margin-top: 12px; padding-left: 4px; border-top: 1px solid var(--tk-border); padding-top: 12px; animation: tk-fade-in 0.2s;">
                                <div style="display:flex; align-items:center; gap:12px;">
                                    <span style="font-size: 0.85rem; color: var(--tk-zinc-400);">生成張數 (Count):</span>
                                    <input type="number" id="tk-batch-count" value="2" min="2" max="10" step="1" class="tk-input" style="width: 100px;">
                                    <span style="font-size: 0.75rem; color: var(--tk-zinc-500);">(2 - 10)</span>
                                </div>
                                <p style="font-size: 0.75rem; color: var(--tk-emerald-500); margin-top: 6px; opacity: 0.8;">ℹ️ 每一張圖片將使用不同的隨機種子</p>
                            </div>
                        </div>
                        ` : ''}
                        <div id="tk-status-container" class="tk-hidden">
                             <div id="tk-status-msg" class="tk-status-msg"></div>
                        </div>
                        <button class="tk-generate-btn" id="tk-generate-btn">
                             <span style="font-size: 1.2rem;">⚡</span>
                             生成 (Generate)
                        </button>
                    </div>
                </div>
            </div>
        `;

        const previewImage = container.querySelector('.tk-preview-section img.tk-preview-img');
        if (previewImage) {
            previewImage.onerror = () => {
                const fallback = document.createElement('div');
                fallback.className = 'tk-preview-img';
                fallback.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:5rem;background:#18181b;color:var(--tk-zinc-700);';
                fallback.textContent = '🍌';
                previewImage.replaceWith(fallback);
            };
        }

        const stateInputs = container.querySelectorAll('.tk-state-input');
        stateInputs.forEach((inputEl) => {
            const presetId = inputEl.dataset.presetId || presetIdRaw;
            const stateKey = inputEl.dataset.stateKey;
            if (!stateKey) return;
            const eventType = inputEl.dataset.stateEvent || (inputEl.tagName === 'TEXTAREA' ? 'input' : 'change');
            inputEl.addEventListener(eventType, () => {
                ToolkitApp.savePresetState(presetId, {
                    inputs: { [stateKey]: inputEl.value }
                });
            });
        });

        const followupToggles = container.querySelectorAll('.tk-user-followup-toggle[data-followup-id]');
        followupToggles.forEach((toggle) => {
            toggle.addEventListener('change', () => {
                const followupId = String(toggle.dataset.followupId || '').trim();
                if (!followupId) return;
                ToolkitApp.savePresetState(presetIdRaw, {
                    followups: { [followupId]: !!toggle.checked }
                });
            });
        });

        const uploadAreas = container.querySelectorAll('.tk-image-upload-area[data-node-id][data-input-name]');
        uploadAreas.forEach((area) => {
            const nodeId = area.dataset.nodeId;
            const inputName = area.dataset.inputName;
            if (!nodeId || !inputName) return;

            area.addEventListener('dragover', (e) => ToolkitApp.handleDragOver(e));
            area.addEventListener('dragleave', (e) => ToolkitApp.handleDragLeave(e));
            area.addEventListener('drop', (e) => ToolkitApp.handleDrop(e, nodeId, inputName));

            const fileInput = area.querySelector('.tk-upload-file-input');
            if (fileInput) {
                fileInput.addEventListener('change', () => ToolkitApp.uploadInputImage(fileInput, nodeId, inputName));
            }
            const triggerBtn = area.querySelector('.tk-upload-open-btn');
            if (triggerBtn && fileInput) {
                triggerBtn.onclick = () => fileInput.click();
            }
        });

        const uploadPreviewImages = container.querySelectorAll('.tk-upload-preview-image');
        uploadPreviewImages.forEach((img) => {
            img.addEventListener('error', () => {
                const fallbackSrc = String(img.dataset.fallbackSrc || '');
                const triedFallback = img.dataset.fallbackTried === '1';
                if (fallbackSrc && !triedFallback && img.getAttribute('src') !== fallbackSrc) {
                    img.dataset.fallbackTried = '1';
                    img.setAttribute('src', fallbackSrc);
                    return;
                }

                const previewContainer = img.parentElement;
                if (!previewContainer) return;
                const placeholder = document.createElement('span');
                placeholder.style.cssText = 'color:var(--tk-zinc-600); font-size: 2rem; margin-bottom: 8px;';
                placeholder.textContent = '🖼️';
                img.replaceWith(placeholder);
            });
        });

        const seedLabels = container.querySelectorAll('.tk-seed-toggle-label');
        seedLabels.forEach((label) => {
            label.addEventListener('mouseenter', () => { label.style.opacity = '1'; });
            label.addEventListener('mouseleave', () => { label.style.opacity = '0.8'; });
        });

        const seedToggles = container.querySelectorAll('.tk-random-seed-toggle');
        seedToggles.forEach((toggle) => {
            const applyToggleState = () => {
                const input = toggle.closest('.tk-form-group')?.querySelector('.tk-form-input');
                if (!input) return;
                input.disabled = toggle.checked;
                input.style.opacity = toggle.checked ? '0.5' : '1';
            };
            toggle.addEventListener('change', applyToggleState);
            applyToggleState();
        });

        const batchToggle = container.querySelector('#tk-batch-toggle');
        const batchConfig = container.querySelector('#tk-batch-config');
        if (batchToggle && batchConfig) {
            batchToggle.addEventListener('change', () => {
                batchConfig.classList.toggle('tk-hidden', !batchToggle.checked);
                if (batchToggle.checked) {
                    const formContainer = container.querySelector('.tk-form-container');
                    if (formContainer) formContainer.scrollTop = formContainer.scrollHeight;
                }
            });
        }

        container.querySelector('#tk-generate-btn').onclick = () => {
            ToolkitApp.executeWorkflow(preset);
        };

        // --- SIZE SELECTION EVENT BINDING ---
        if (hasSizeSelection) {
            const groupSelect = container.querySelector('#tk-size-ratio-group');
            const resSelect = container.querySelector('#tk-size-resolution-select');
            const inputW = container.querySelector('.tk-size-input-w');
            const inputH = container.querySelector('.tk-size-input-h');
            const radios = Array.from(container.querySelectorAll('input[type="radio"]')).filter((radio) => radio.name === sizeModeInputName);

            // Helper to get matching ratio object
            const getRatioObj = (w, h) => modelData.ratios.find(r => r.width == w && r.height == h);

            // Group Ratios again for logic usage
            const ratioGroups = {};
            modelData.ratios.forEach(r => {
                if (!ratioGroups[r.name]) ratioGroups[r.name] = [];
                ratioGroups[r.name].push(r);
            });

            // Populate Resolution Select based on Group
            const populateResolutions = (groupName) => {
                const ratios = ratioGroups[groupName] || [];
                resSelect.innerHTML = '';
                ratios.forEach((r) => {
                    const option = document.createElement('option');
                    option.value = JSON.stringify({ w: r.width, h: r.height });
                    option.textContent = `${String(r.width)} x ${String(r.height)}`;
                    resSelect.appendChild(option);
                });
            };

            const updateHiddenInputs = (w, h) => {
                inputW.value = w;
                inputW.dispatchEvent(new Event('change')); // Trigger savePresetState
                inputH.value = h;
                inputH.dispatchEvent(new Event('change'));
            };

            // 1. Initial Populate
            if (groupSelect && groupSelect.value) {
                populateResolutions(groupSelect.value);

                // Try to sync selection with current width/height
                const currW = inputW.value;
                const currH = inputH.value;
                const match = modelData.ratios.find(r => r.width == currW && r.height == currH && r.name === groupSelect.value);

                if (match) {
                    resSelect.value = JSON.stringify({ w: match.width, h: match.height });
                } else if (sizeMode === 'ratio' || !match) {
                    // If mismatch but in ratio mode, force update to first option
                    // Or if custom mode but we want UI consistency
                    if (resSelect.options.length > 0) {
                        const firstVal = JSON.parse(resSelect.options[0].value);
                        if (sizeMode === 'ratio') updateHiddenInputs(firstVal.w, firstVal.h);
                        resSelect.selectedIndex = 0;
                    }
                }
            }

            // 2. Event Listeners
            if (groupSelect) {
                groupSelect.onchange = (e) => {
                    const group = e.target.value;
                    populateResolutions(group);
                    // Output first resolution of new group
                    if (resSelect.options.length > 0) {
                        const dims = JSON.parse(resSelect.options[0].value);
                        updateHiddenInputs(dims.w, dims.h);
                    }
                };
            }

            if (resSelect) {
                resSelect.onchange = (e) => {
                    const dims = JSON.parse(e.target.value);
                    updateHiddenInputs(dims.w, dims.h);
                };
            }

            // Radio Change logic
            radios.forEach(r => {
                r.onchange = (e) => {
                    const newMode = e.target.value;
                    ToolkitApp.savePresetState(presetIdRaw, { sizeMode: newMode });

                    // UI Toggle
                    const ratioContainer = container.querySelector('#tk-size-ratio-container');
                    const customContainer = container.querySelector('#tk-size-custom-container');

                    // Update Label Colors
                    radios.forEach(rad => {
                        rad.parentElement.style.color = rad.checked ? 'var(--tk-emerald-400)' : 'var(--tk-zinc-500)';
                    });

                    if (newMode === 'ratio') {
                        ratioContainer.classList.remove('tk-hidden');
                        customContainer.classList.add('tk-hidden');
                        // Force update to selected resolution
                        if (resSelect && resSelect.value) {
                            const dims = JSON.parse(resSelect.value);
                            updateHiddenInputs(dims.w, dims.h);
                        }
                    } else {
                        ratioContainer.classList.add('tk-hidden');
                        customContainer.classList.remove('tk-hidden');
                    }
                };
            });
        }

        // Restore Preview if exists
        if (savedState && savedState.preview) {
            this.updatePreview(savedState.preview.type, savedState.preview.content);
        }
    },

    updatePreview(type, content) {
        const previewSection = document.querySelector('.tk-preview-section');
        if (!previewSection) return;

        if (type === 'image') {
            const safeContent = this.escapeAttr(content);
            previewSection.innerHTML = `
                <img src="${safeContent}" class="tk-preview-img tk-preview-result-image" style="cursor:pointer;">
                <div class="tk-preview-badge" style="background: rgba(16, 185, 129, 0.9);">
                    <span class="tk-badge-text">✨ 生成結果</span>
                </div>
            `;
            const img = previewSection.querySelector('.tk-preview-result-image');
            if (img) {
                img.onclick = () => ToolkitApp.openImageModal(content);
            }
        } else if (type === 'text') {
            // Text Preview
            previewSection.innerHTML = `
                 <div style="width:100%; height:100%; background:#18181b; padding:2rem; overflow-y:auto; font-size:0.95rem; color:#e4e4e7; white-space:pre-wrap; font-family:monospace; position:relative; display:flex; align-items:center; justify-content:center; text-align:center;">
                    <div class="tk-preview-text-content" style="max-width: 90%; text-align: left;"></div>
                 </div>
                 <button class="tk-copy-btn" title="複製文字" style="
                    position:absolute; top:12px; right:12px; 
                    background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); 
                    color:#fff; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:13px;
                    display:flex; align-items:center; gap:6px; backdrop-filter:blur(4px); transition: all 0.2s;
                    z-index: 10;
                 ">
                    📋 複製提示詞
                 </button>
                 <div class="tk-preview-badge" style="background: rgba(16, 185, 129, 0.9);">
                    <span class="tk-badge-text">📝 生成文字</span>
                </div>
            `;

            const textContentNode = previewSection.querySelector('.tk-preview-text-content');
            if (textContentNode) {
                textContentNode.textContent = String(content ?? '');
            }

            // Add copy functionality
            const copyBtn = previewSection.querySelector('.tk-copy-btn');
            if (copyBtn) {
                copyBtn.onclick = (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(content).then(() => {
                        const originalText = copyBtn.innerHTML;
                        copyBtn.innerHTML = '✅ 已複製';
                        copyBtn.style.background = 'rgba(16, 185, 129, 0.3)';
                        setTimeout(() => {
                            copyBtn.innerHTML = originalText;
                            copyBtn.style.background = 'rgba(255,255,255,0.1)';
                        }, 2000);
                    });
                };
            }
        }
    }
};
