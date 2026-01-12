import { ToolkitApp } from "./tk_app.js";

export const ToolkitUI = {
    isOpen: false,

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

    switchTab(tabName) {
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
                    <button class="tk-generate-btn" style="min-width: 180px;" onclick="document.querySelector('[data-tab=admin]').click()">
                        前往管理員模式
                    </button>
                </div>
            `;
            return;
        }

        // --- GROUPING LOGIC ---
        // Define Display Names for Sub-Categories
        const subCatNames = {
            't2i': '文生圖',
            'i2i': '圖生圖',
            'edit': '圖片編輯',
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
        const orderMap = ['t2i', 'i2i', 'edit', 't2v', 'i2v', 'v2v', 'rev_image', 'rev_video']; // Order of appearance

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

                    // Banana Fallback Logic
                    let imgHtml = '';
                    if (p.previewImageUrl) {
                        imgHtml = `<img src="${p.previewImageUrl}" class="tk-preset-thumb" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'tk-preset-thumb\\' style=\\'display:flex;align-items:center;justify-content:center;font-size:1.5rem;background:#18181b;\\'>🍌</div>'">`;
                    } else {
                        imgHtml = `<div class="tk-preset-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;background:#18181b;">🍌</div>`;
                    }

                    card.innerHTML = `
                        ${imgHtml}
                        <div class="tk-preset-info">
                            <span class="tk-preset-name">${p.name}</span>
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

        const visibleParams = preset.parameters.filter(p => p.visible);

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
            const isLoadImage = p.nodeClass === 'LoadImage' || p.nodeClass === 'LoadImageFromPath';
            const isLongText = isLongTextParam(p);
            const isSeed = p.inputName.toLowerCase() === 'seed' ||
                p.inputName.toLowerCase() === 'noise_seed' ||
                p.displayName.includes('Seed');

            if (isLoadImage) {
                return `
                    <div class="tk-form-group">
                        <label class="tk-label">${p.displayName}</label>
                        <div class="tk-image-upload-area" 
                             style="background:var(--tk-zinc-900); border:1px dashed var(--tk-border); border-radius:8px; padding:12px; text-align:center; transition: all 0.2s;"
                             ondragover="ToolkitApp.handleDragOver(event)"
                             ondragleave="ToolkitApp.handleDragLeave(event)"
                             ondrop="ToolkitApp.handleDrop(event, '${p.nodeId}', '${p.inputName}')">
                             <input type="file" accept="image/*" style="display:none" onchange="ToolkitApp.uploadInputImage(this, '${p.nodeId}', '${p.inputName}')">
                             <div class="tk-preview-container" id="preview-${p.nodeId}-${p.inputName}" style="min-height: 40px; display:flex; align-items:center; justify-content:center; flex-direction: column;">
                                ${p.defaultValue ? `<img src="/view?filename=${encodeURIComponent(p.defaultValue)}&type=input" style="max-width:100%; max-height:200px; border-radius:8px; margin-bottom:8px; box-shadow:0 4px 6px rgba(0,0,0,0.2);">` : '<span style="color:var(--tk-zinc-600); font-size: 2rem; margin-bottom: 8px;">🖼️</span>'}
                             </div>
                             
                             <button class="tk-tab-btn" onclick="this.parentElement.querySelector('input[type=file]').click()" style="width:100%; justify-content:center;">
                                📤 上傳圖片 (Upload)
                             </button>
                             <input type="text" class="tk-input tk-form-input" 
                                data-node="${p.nodeId}" 
                                data-input="${p.inputName}" 
                                data-node-class="${p.nodeClass || ''}"
                                data-type="string"
                                value="${inputsState[p.nodeId + '_' + p.inputName] !== undefined ? inputsState[p.nodeId + '_' + p.inputName] : (p.defaultValue || '')}"
                                style="display:none;"
                                onchange="ToolkitApp.savePresetState('${preset.id}', { inputs: { ['${p.nodeId}_${p.inputName}']: this.value } })">
                        </div>
                    </div>
                `;
            }

            if (isLongText) {
                return `
                    <div class="tk-form-group" style="height: 100%;">
                        <label class="tk-label">${p.displayName}</label>
                        <textarea class="tk-input tk-form-input" 
                            data-node="${p.nodeId}" 
                            data-input="${p.inputName}" 
                            data-type="string"
                            style="flex: 1; resize: none; min-height: 200px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: break-word; font-family: monospace;"
                            oninput="ToolkitApp.savePresetState('${preset.id}', { inputs: { ['${p.nodeId}_${p.inputName}']: this.value } })"
                        >${inputsState[p.nodeId + '_' + p.inputName] !== undefined ? inputsState[p.nodeId + '_' + p.inputName] : p.defaultValue}</textarea>
                    </div>
                `;
            }

            if (isSeed) {
                return `
                    <div class="tk-form-group">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding-right: 4px;">
                             <label class="tk-label">${p.displayName}</label>
                             <label class="tk-seed-toggle-label" style="display:flex; align-items:center; gap:4px; transform: scale(0.9); cursor:pointer; opacity: 0.8; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">
                                <input type="checkbox" class="tk-random-seed-toggle" 
                                    data-node="${p.nodeId}" 
                                    data-input="${p.inputName}"
                                    style="accent-color: var(--tk-emerald-500); width:14px; height:14px;"
                                    onchange="const input = this.closest('.tk-form-group').querySelector('.tk-form-input'); input.disabled = this.checked; input.style.opacity = this.checked ? '0.5' : '1';">
                                <span style="font-size:0.75rem; color:var(--tk-zinc-400); font-weight: 500;">🎲 隨機</span>
                            </label>
                        </div>
                        <input type="number" class="tk-input tk-form-input" 
                            data-node="${p.nodeId}" 
                            data-input="${p.inputName}" 
                            data-type="number"
                            value="${inputsState[p.nodeId + '_' + p.inputName] !== undefined ? inputsState[p.nodeId + '_' + p.inputName] : p.defaultValue}"
                            onchange="ToolkitApp.savePresetState('${preset.id}', { inputs: { ['${p.nodeId}_${p.inputName}']: this.value } })">
                    </div>
                `;
            }

            return `
                <div class="tk-form-group">
                    <label class="tk-label">${p.displayName}</label>
                    <input type="text" class="tk-input tk-form-input" 
                        data-node="${p.nodeId}" 
                        data-input="${p.inputName}" 
                        data-type="${(!isNaN(p.defaultValue) && p.defaultValue !== '') ? 'number' : 'string'}"
                        value="${inputsState[p.nodeId + '_' + p.inputName] !== undefined ? inputsState[p.nodeId + '_' + p.inputName] : p.defaultValue}"
                        onchange="ToolkitApp.savePresetState('${preset.id}', { inputs: { ['${p.nodeId}_${p.inputName}']: this.value } })">
                </div>
            `;
        };

        const promptParams = visibleParams.filter(p => isLongTextParam(p));
        // Filter out width/height if handling specifically
        const otherParams = visibleParams.filter(p => !isLongTextParam(p) && (!hasSizeSelection || (p !== widthParam && p !== heightParam)));

        // --- SIZE SELECTION HTML GENERATION ---
        let sizeSelectionHtml = '';
        if (hasSizeSelection) {
            // Determine current values
            const currW = inputsState[widthParam.nodeId + '_' + widthParam.inputName] !== undefined ? inputsState[widthParam.nodeId + '_' + widthParam.inputName] : widthParam.defaultValue;
            const currH = inputsState[heightParam.nodeId + '_' + heightParam.inputName] !== undefined ? inputsState[heightParam.nodeId + '_' + heightParam.inputName] : heightParam.defaultValue;

            // Find matching ratio
            const currentRatio = modelData.ratios.find(r => r.width == currW && r.height == currH);
            const ratioSelectValue = currentRatio ? JSON.stringify({ w: currentRatio.width, h: currentRatio.height }) : 'custom';

            // Force custom mode if no matching ratio and we are in ratio mode (edge case, but handled by select value)

            sizeSelectionHtml = `
                <div class="tk-form-group" style="background:rgba(24,24,27,0.5); padding:12px; border-radius:8px; border:1px solid var(--tk-border);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                         <label class="tk-label" style="margin:0;">📏 尺寸選擇 (${modelData.name})</label>
                         <div style="display:flex; gap:8px; font-size:0.75rem;">
                             <label style="cursor:pointer; display:flex; align-items:center; gap:4px; ${sizeMode === 'ratio' ? 'color:var(--tk-emerald-400);' : 'color:var(--tk-zinc-500);'}">
                                <input type="radio" name="sizeMode_${preset.id}" value="ratio" ${sizeMode === 'ratio' ? 'checked' : ''} style="display:none">
                                <span>選擇比例</span>
                             </label>
                             <label style="cursor:pointer; display:flex; align-items:center; gap:4px; ${sizeMode === 'custom' ? 'color:var(--tk-emerald-400);' : 'color:var(--tk-zinc-500);'}">
                                <input type="radio" name="sizeMode_${preset.id}" value="custom" ${sizeMode === 'custom' ? 'checked' : ''} style="display:none">
                                <span>自訂</span>
                             </label>
                         </div>
                    </div>

                    <!-- Ratio Selector -->
                    <div id="tk-size-ratio-container" class="${sizeMode === 'ratio' ? '' : 'tk-hidden'}">
                        <select class="tk-input" id="tk-size-ratio-select">
                            ${modelData.ratios.map(r => `
                                <option value='${JSON.stringify({ w: r.width, h: r.height })}' ${ratioSelectValue !== 'custom' && currentRatio && r.name === currentRatio.name ? 'selected' : ''}>
                                    ${r.name} (${r.width}x${r.height})
                                </option>
                            `).join('')}
                            ${ratioSelectValue === 'custom' ? `<option value="custom" selected disabled>自訂尺寸 (請切換到自訂模式)</option>` : ''}
                        </select>
                    </div>

                    <!-- Custom Inputs (Standard Rendering + Hidden inputs for Ratio to sync to) -->
                    <div id="tk-size-custom-container" class="${sizeMode === 'custom' ? '' : 'tk-hidden'}" style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                         <div>
                            <label style="font-size:0.7rem; color:var(--tk-zinc-500);">Width</label>
                            <input type="number" class="tk-input tk-form-input tk-size-input-w" 
                                data-node="${widthParam.nodeId}" data-input="${widthParam.inputName}" data-type="number"
                                value="${currW}"
                                style="width:100%; box-sizing:border-box;"
                                onchange="ToolkitApp.savePresetState('${preset.id}', { inputs: { ['${widthParam.nodeId}_${widthParam.inputName}']: this.value } })">
                         </div>
                         <div>
                            <label style="font-size:0.7rem; color:var(--tk-zinc-500);">Height</label>
                            <input type="number" class="tk-input tk-form-input tk-size-input-h" 
                                data-node="${heightParam.nodeId}" data-input="${heightParam.inputName}" data-type="number"
                                value="${currH}"
                                style="width:100%; box-sizing:border-box;"
                                onchange="ToolkitApp.savePresetState('${preset.id}', { inputs: { ['${heightParam.nodeId}_${heightParam.inputName}']: this.value } })">
                         </div>
                    </div>
                </div>
            `;
        }


        container.innerHTML = `
            <div class="tk-preset-content">
                <div class="tk-preview-section">
                    ${preset.previewImageUrl ?
                `<img src="${preset.previewImageUrl}" class="tk-preview-img" loading="lazy" onerror="this.outerHTML='<div class=\\'tk-preview-img\\' style=\\'display:flex;align-items:center;justify-content:center;font-size:5rem;background:#18181b;color:var(--tk-zinc-700);\\'>🍌</div>'">`
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

                    <div class="tk-action-bar" style="flex-direction: column; gap: 1rem;">
                        ${preset.allowBatch ? `
                        <div style="width:100%; padding: 12px; background: rgba(39, 39, 42, 0.4); border: 1px solid var(--tk-border); border-radius: 8px; transition: all 0.3s;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color: var(--tk-zinc-300); font-weight: 500; user-select: none;">
                                <input type="checkbox" id="tk-batch-toggle" style="accent-color: var(--tk-emerald-500); width:16px; height:16px;" onchange="document.getElementById('tk-batch-config').classList.toggle('tk-hidden', !this.checked); if(this.checked) document.querySelector('.tk-form-container').scrollTop = document.querySelector('.tk-form-container').scrollHeight;">
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

        container.querySelector('#tk-generate-btn').onclick = () => {
            ToolkitApp.executeWorkflow(preset);
        };

        // --- SIZE SELECTION EVENT BINDING ---
        if (hasSizeSelection) {
            const ratioSelect = container.querySelector('#tk-size-ratio-select');
            const inputW = container.querySelector('.tk-size-input-w');
            const inputH = container.querySelector('.tk-size-input-h');
            const radios = container.querySelectorAll(`input[name="sizeMode_${preset.id}"]`);

            const updateHiddenInputs = (w, h) => {
                inputW.value = w;
                inputW.dispatchEvent(new Event('change')); // Trigger savePresetState
                inputH.value = h;
                inputH.dispatchEvent(new Event('change'));
            };

            // Radio Change
            radios.forEach(r => {
                r.onchange = (e) => {
                    const newMode = e.target.value;
                    ToolkitApp.savePresetState(preset.id, { sizeMode: newMode });

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
                        // Force update to selected ratio
                        if (ratioSelect.value && ratioSelect.value !== 'custom') {
                            const dims = JSON.parse(ratioSelect.value);
                            updateHiddenInputs(dims.w, dims.h);
                        }
                    } else {
                        ratioContainer.classList.add('tk-hidden');
                        customContainer.classList.remove('tk-hidden');
                    }
                };
            });

            // Ratio Select Change
            if (ratioSelect) {
                ratioSelect.onchange = (e) => {
                    const val = e.target.value;
                    if (val && val !== 'custom') {
                        const dims = JSON.parse(val);
                        updateHiddenInputs(dims.w, dims.h);
                    }
                };

                // If initializing in ratio mode and no match (custom shown in select), auto-select first ratio?
                // Or leave as is. Current logic: value="custom" disabled option selected.
                // Better UX: If ratio mode active but current size matches none, force first ratio.
                if (sizeMode === 'ratio' && modelData.ratios.length > 0) {
                    // Check if current value matches any ratio
                    const currW = inputsState[widthParam.nodeId + '_' + widthParam.inputName] !== undefined ? inputsState[widthParam.nodeId + '_' + widthParam.inputName] : widthParam.defaultValue;
                    const currH = inputsState[heightParam.nodeId + '_' + heightParam.inputName] !== undefined ? inputsState[heightParam.nodeId + '_' + heightParam.inputName] : heightParam.defaultValue;
                    const match = modelData.ratios.find(r => r.width == currW && r.height == currH);

                    if (!match) {
                        const first = modelData.ratios[0];
                        ratioSelect.value = JSON.stringify({ w: first.width, h: first.height });
                        updateHiddenInputs(first.width, first.height);
                    }
                }
            }
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
            previewSection.innerHTML = `
                <img src="${content}" class="tk-preview-img" style="cursor:pointer;" onclick="ToolkitApp.openImageModal('${content}')">
                <div class="tk-preview-badge" style="background: rgba(16, 185, 129, 0.9);">
                    <span class="tk-badge-text">✨ 生成結果</span>
                </div>
            `;
        } else if (type === 'text') {
            // Text Preview
            previewSection.innerHTML = `
                 <div style="width:100%; height:100%; background:#18181b; padding:2rem; overflow-y:auto; font-size:0.95rem; color:#e4e4e7; white-space:pre-wrap; font-family:monospace; position:relative; display:flex; align-items:center; justify-content:center; text-align:center;">
                    <div style="max-width: 90%; text-align: left;">${content}</div>
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
