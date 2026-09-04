import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreviewCrop, previewCropStyle, dragPreviewCrop } from '../web/tk_preview_crop.js';

test('existing presets default to a centered crop at the original scale', () => {
  assert.deepEqual(normalizePreviewCrop(), { x: 50, y: 50, zoom: 1 });
  assert.deepEqual(normalizePreviewCrop(null), { x: 50, y: 50, zoom: 1 });
});

test('saved crop settings are bounded and cannot inject CSS', () => {
  assert.deepEqual(normalizePreviewCrop({ x: -10, y: 120, zoom: 8 }), { x: 0, y: 100, zoom: 3 });
  assert.deepEqual(normalizePreviewCrop({ x: NaN, y: '0; display:none', zoom: Infinity }), { x: 50, y: 50, zoom: 1 });
  assert.equal(previewCropStyle({ x: 25, y: 10, zoom: 2 }), 'object-position:25% 10%; transform:scale(2); transform-origin:25% 10%;');
});

test('dragging a portrait image moves the visible area without exposing empty space', () => {
  const crop = { x: 50, y: 50, zoom: 1 };
  const image = { width: 400, height: 800 };
  const frame = { width: 400, height: 112.5 };
  assert.deepEqual(dragPreviewCrop(crop, image, frame, { x: 100, y: 68.75 }), { x: 50, y: 40, zoom: 1 });
  assert.equal(dragPreviewCrop(crop, image, frame, { x: 0, y: 10000 }).y, 0);
  assert.equal(dragPreviewCrop(crop, image, frame, { x: 0, y: -10000 }).y, 100);
});

test('zoomed crops can be panned horizontally and use rendered image dimensions', () => {
  assert.deepEqual(dragPreviewCrop({ x: 50, y: 50, zoom: 2 },
    { width: 400, height: 800 }, { width: 400, height: 112.5 }, { x: 40, y: 0 }),
    { x: 40, y: 50, zoom: 2 });
});

test('dragging before image load leaves the saved crop unchanged', () => {
  assert.deepEqual(dragPreviewCrop({ x: 30, y: 20, zoom: 1.5 },
    { width: 0, height: 0 }, { width: 400, height: 112.5 }, { x: 40, y: 30 }),
    { x: 30, y: 20, zoom: 1.5 });
});
