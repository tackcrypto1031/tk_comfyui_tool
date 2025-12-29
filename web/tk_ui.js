import { ToolkitApp } from "./tk_app.js";

export const ToolkitUI = {
    isOpen: false,

    open() {
        if (this.isOpen) return;
        this.createModal();
        this.isOpen = true;
        this.switchTab('t2i');
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
                        <span class="tk-logo-text">TK Toolkit Pro</span>
                    </div>
                    
                        <button class="tk-tab-btn" data-tab="t2i">🖼️ 文生圖</button>
                        <button class="tk-tab-btn" data-tab="i2i">🎨 圖生圖</button>
                        <button class="tk-tab-btn" data-tab="edit">🔨 圖片編輯</button>
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
            ToolkitApp.renderAdminPanel(mainPanel);
        } else if (tabName === 'gallery') {
            sidebar.classList.add('tk-hidden');
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

        presets.forEach((p, index) => {
            const card = document.createElement('div');
            card.className = 'tk-preset-card';
            card.innerHTML = `
                <img src="${p.previewImageUrl || ''}" class="tk-preset-thumb" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect width=%2248%22 height=%2248%22 fill=%22%2318181b%22/><text x=%2250%%22 y=%2250%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%233f3f46%22 font-size=%2220%22>?</text></svg>'">
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

            // Auto-select the first one if it's the first render and not searching
            if (index === 0) {
                selectPreset();
            }
        });
    },

    renderUserForm(preset, container) {
        const visibleParams = preset.parameters.filter(p => p.visible);

        container.innerHTML = `
            <div class="tk-preset-content">
                <div class="tk-preview-section">
                    <img src="${preset.previewImageUrl}" class="tk-preview-img" loading="lazy" onerror="this.style.opacity='0.2'">
                    <div class="tk-preview-badge">
                        <div class="tk-badge-pulse"></div>
                        <span class="tk-badge-text">目前預設</span>
                    </div>
                </div>
                
                <div class="tk-form-container">
                    <h4 class="tk-form-title">
                        <span style="color: var(--tk-emerald-500);">▶</span> 參數設定
                    </h4>
                    
                    <div class="tk-form-grid">
                        ${visibleParams.map(p => `
                            <div class="tk-form-group">
                                <label class="tk-label">${p.displayName}</label>
                                <input type="text" class="tk-input tk-form-input" 
                                    data-node="${p.nodeId}" 
                                    data-input="${p.inputName}" 
                                    value="${p.defaultValue}">
                            </div>
                        `).join('')}
                    </div>

                    <div class="tk-action-bar">
                        <div id="tk-status-container" class="tk-hidden">
                             <div id="tk-status-msg" class="tk-status-msg"></div>
                        </div>
                        <button class="tk-generate-btn" id="tk-generate-btn">
                             <span style="font-size: 1.2rem;">⚡</span>
                             生成圖片 (Generate)
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('#tk-generate-btn').onclick = () => {
            ToolkitApp.executeWorkflow(preset);
        };
    }
};
