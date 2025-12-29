import { ToolkitApp } from "./tk_app.js";

export const ToolkitUI = {
    isOpen: false,

    open() {
        if (this.isOpen) return;
        this.createModal();
        this.isOpen = true;
        // Default to first tab
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
                <div class="tk-header">
                    <div class="tk-tabs">
                        <button class="tk-tab-btn" data-tab="t2i">文生圖</button>
                        <button class="tk-tab-btn" data-tab="i2i">圖生圖</button>
                        <button class="tk-tab-btn" data-tab="edit">圖片編輯</button>
                        <button class="tk-tab-btn" data-tab="admin" style="color: #ff9800;">管理員</button>
                    </div>
                    <button class="tk-close-btn">Close</button>
                </div>
                <div class="tk-content">
                    <!-- Sidebar for selecting presets -->
                    <div class="tk-sidebar" id="tk-sidebar">
                        <!-- Presets list will be injected here -->
                    </div>
                    
                    <!-- Main Content Area -->
                    <div class="tk-main-panel" id="tk-main-panel">
                        <!-- Dynamic content -->
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event Listeners
        modal.querySelector('.tk-close-btn').onclick = () => this.close();

        modal.querySelectorAll('.tk-tab-btn').forEach(btn => {
            btn.onclick = (e) => this.switchTab(e.target.dataset.tab);
        });

        // Close on outside click
        modal.onclick = (e) => {
            if (e.target === modal) this.close();
        };
    },

    switchTab(tabName) {
        // Update active tab style
        document.querySelectorAll('.tk-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        const sidebar = document.getElementById('tk-sidebar');
        const mainPanel = document.getElementById('tk-main-panel');

        if (tabName === 'admin') {
            sidebar.style.display = 'none'; // Hide sidebar in admin
            ToolkitApp.renderAdminPanel(mainPanel);
        } else {
            sidebar.style.display = 'flex';
            ToolkitApp.loadPresets(tabName, sidebar, mainPanel);
        }
    },

    renderPresetList(presets, sidebar, mainPanel, category) {
        sidebar.innerHTML = '';
        if (presets.length === 0) {
            sidebar.innerHTML = '<div style="padding:10px; color:#777;">暫無預設</div>';
            mainPanel.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#555;">請選擇一個預設工作流</div>';
            return;
        }

        presets.forEach(p => {
            const card = document.createElement('div');
            card.className = 'tk-preset-card';
            card.innerHTML = `
                <img src="${p.previewImageUrl || ''}" class="tk-preset-thumb" onerror="this.style.background='#333'">
                <div class="tk-preset-info">
                    <span class="tk-preset-name">${p.name}</span>
                </div>
            `;
            card.onclick = () => {
                // Highlight active
                sidebar.querySelectorAll('.tk-preset-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.renderUserForm(p, mainPanel);
            };
            sidebar.appendChild(card);
        });
    },

    renderUserForm(preset, container) {
        // Generate Preview and Form for User
        const params = preset.parameters.filter(p => p.visible);

        container.innerHTML = `
            <div class="tk-preview-section">
                <img src="${preset.previewImageUrl}" class="tk-preview-img" onerror="this.style.display='none'">
            </div>
            
            <div class="tk-params-container">
                ${params.map(p => `
                    <div class="tk-form-group">
                        <label class="tk-form-label">${p.displayName}</label>
                        <input type="text" class="tk-form-input" 
                            data-node="${p.nodeId}" 
                            data-input="${p.inputName}" 
                            value="${p.defaultValue}">
                    </div>
                `).join('')}
            </div>

            <div class="tk-action-bar">
                <button class="tk-btn tk-btn-primary" id="tk-generate-btn">生成圖片 (Generate)</button>
            </div>
            <div id="tk-status-msg" style="text-align:right; color:#888; font-size:12px; margin-top:5px;"></div>
        `;

        container.querySelector('#tk-generate-btn').onclick = () => {
            ToolkitApp.executeWorkflow(preset);
        };
    }
};
