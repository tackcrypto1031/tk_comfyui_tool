function bounded(value, min, max, fallback) {
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function normalizePreviewCrop(crop) {
    return {
        x: bounded(crop?.x, 0, 100, 50),
        y: bounded(crop?.y, 0, 100, 50),
        zoom: bounded(crop?.zoom, 1, 3, 1),
    };
}

export function previewCropStyle(crop) {
    const { x, y, zoom } = normalizePreviewCrop(crop);
    return `object-position:${x}% ${y}%; transform:scale(${zoom}); transform-origin:${x}% ${y}%;`;
}

export function dragPreviewCrop(crop, image, frame, delta) {
    const next = normalizePreviewCrop(crop);
    if (image.width <= 0 || image.height <= 0 || frame.width <= 0 || frame.height <= 0) return next;
    const scale = Math.max(frame.width / image.width, frame.height / image.height) * next.zoom;
    const overflowX = image.width * scale - frame.width;
    const overflowY = image.height * scale - frame.height;
    if (overflowX > 0.5) next.x -= delta.x / overflowX * 100;
    if (overflowY > 0.5) next.y -= delta.y / overflowY * 100;
    return normalizePreviewCrop(next);
}

export class PreviewCropEditor {
    constructor(container) {
        this.container = container;
        this.crop = normalizePreviewCrop();
        this.drag = null;
        container.className = 'tk-crop-editor';
        container.hidden = true;
        container.innerHTML = `
            <div class="tk-crop-heading">
                <span>預覽圖裁切</span>
                <button type="button" class="tk-tab-btn tk-crop-reset">重設</button>
            </div>
            <p class="tk-crop-hint">拖曳圖片調整顯示範圍，使用縮放放大細節。完成後按「保存預設」。</p>
            <div class="tk-crop-frame" tabindex="0" role="group" aria-label="預覽圖裁切範圍，可拖曳圖片或使用方向鍵微調">
                <img class="tk-crop-image" alt="封面裁切預覽" draggable="false">
                <div class="tk-crop-grid" aria-hidden="true"></div>
            </div>
            <div class="tk-crop-controls">
                <div class="tk-crop-zoom-control">
                    <label for="tk-crop-zoom">縮放 <output class="tk-crop-zoom-value">1.00×</output></label>
                    <input id="tk-crop-zoom" type="range" min="1" max="3" step="0.05" value="1">
                </div>
                <div class="tk-crop-thumb-group">
                    <div class="tk-crop-thumb"><img alt="縮圖裁切預覽" draggable="false"></div>
                    <span>縮圖</span>
                </div>
            </div>
            <p class="tk-crop-status" role="status"></p>
        `;
        this.frame = container.querySelector('.tk-crop-frame');
        this.image = container.querySelector('.tk-crop-image');
        this.thumb = container.querySelector('.tk-crop-thumb img');
        this.zoom = container.querySelector('#tk-crop-zoom');
        this.zoomValue = container.querySelector('.tk-crop-zoom-value');
        this.status = container.querySelector('.tk-crop-status');

        this.image.onload = () => { this.status.textContent = ''; };
        this.image.onerror = () => { this.status.textContent = '圖片無法載入，請檢查連結或重新上傳。'; };
        this.zoom.oninput = () => {
            this.crop.zoom = Number(this.zoom.value);
            this.render();
        };
        this.zoom.onkeydown = (event) => {
            const next = {
                ArrowLeft: this.crop.zoom - 0.05, ArrowDown: this.crop.zoom - 0.05,
                ArrowRight: this.crop.zoom + 0.05, ArrowUp: this.crop.zoom + 0.05,
                Home: 1, End: 3,
            }[event.key];
            if (next === undefined) return;
            event.preventDefault();
            event.stopPropagation();
            this.crop = normalizePreviewCrop({ ...this.crop, zoom: Math.round(next * 100) / 100 });
            this.render();
        };
        container.querySelector('.tk-crop-reset').onclick = () => {
            this.crop = normalizePreviewCrop();
            this.render();
        };
        this.frame.onpointerdown = (event) => {
            if (event.button !== 0 || !this.image.naturalWidth) return;
            event.preventDefault();
            this.frame.focus({ preventScroll: true });
            this.drag = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                crop: this.getValue(),
                frame: { width: this.frame.clientWidth, height: this.frame.clientHeight },
            };
            this.frame.setPointerCapture(event.pointerId);
            this.frame.classList.add('is-dragging');
        };
        this.frame.onpointermove = (event) => {
            if (!this.drag || event.pointerId !== this.drag.pointerId) return;
            this.crop = dragPreviewCrop(this.drag.crop,
                { width: this.image.naturalWidth, height: this.image.naturalHeight }, this.drag.frame,
                { x: event.clientX - this.drag.x, y: event.clientY - this.drag.y });
            this.render();
        };
        const stopDragging = (event) => {
            if (!this.drag || event.pointerId !== this.drag.pointerId) return;
            if (this.frame.hasPointerCapture(event.pointerId)) this.frame.releasePointerCapture(event.pointerId);
            this.drag = null;
            this.frame.classList.remove('is-dragging');
        };
        this.frame.onpointerup = stopDragging;
        this.frame.onpointercancel = stopDragging;
        this.frame.onlostpointercapture = stopDragging;
        this.frame.onkeydown = (event) => {
            const step = event.shiftKey ? 5 : 1;
            const movement = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
            if (!movement) return;
            event.preventDefault();
            event.stopPropagation();
            this.crop = normalizePreviewCrop({ ...this.crop, x: this.crop.x + movement[0], y: this.crop.y + movement[1] });
            this.render();
        };
    }

    setImage(url, crop) {
        this.crop = normalizePreviewCrop(crop);
        this.container.hidden = !url;
        this.drag = null;
        this.frame.classList.remove('is-dragging');
        if (url) {
            this.status.textContent = '載入圖片中…';
            this.image.src = url;
            this.thumb.src = url;
        } else {
            this.image.removeAttribute('src');
            this.thumb.removeAttribute('src');
            this.status.textContent = '';
        }
        this.render();
    }

    getValue() {
        return { ...this.crop };
    }

    render() {
        const style = previewCropStyle(this.crop);
        this.image.style.cssText = style;
        this.thumb.style.cssText = style;
        this.zoom.value = this.crop.zoom;
        this.zoomValue.textContent = `${this.crop.zoom.toFixed(2)}×`;
    }
}
