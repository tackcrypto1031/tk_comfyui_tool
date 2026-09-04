// Run with: node --experimental-vm-modules --test tests/tk_app_video.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const videoHistory = { outputs: { '12': { gifs: [{
  filename: 'clip with audio.mp4', subfolder: 'MiniMaxH3', type: 'output', format: 'video/h264-mp4',
}] } } };
const videoUrl = '/view?filename=clip%20with%20audio.mp4&subfolder=MiniMaxH3&type=output';

async function loadToolkitApp(presets = []) {
  const savedHistory = [];
  const previews = [];
  const presetLists = [];
  const context = vm.createContext({ console, URL, document: { getElementById: () => null } });
  const apiModule = new vm.SyntheticModule(['api'], function () {
    this.setExport('api', {
      async fetchApi(path, options) {
        if (path === '/tk/presets') return { ok: true, json: async () => structuredClone(presets) };
        assert.equal(path, '/tk/save_history');
        savedHistory.push(JSON.parse(options.body));
        return { ok: true };
      },
    });
  }, { context });
  const uiModule = new vm.SyntheticModule(['ToolkitUI'], function () {
    this.setExport('ToolkitUI', {
      updatePreview: (type, content) => previews.push({ type, content }),
      renderPresetList: (items) => presetLists.push(items),
    });
  }, { context });
  const utilsModule = new vm.SourceTextModule(await readFile(new URL('../web/tk_workflow_utils.js', import.meta.url), 'utf8'), { context });
  const cropModule = new vm.SourceTextModule(await readFile(new URL('../web/tk_preview_crop.js', import.meta.url), 'utf8'), { context });
  const appModule = new vm.SourceTextModule(await readFile(new URL('../web/tk_app.js', import.meta.url), 'utf8'), {
    context,
    initializeImportMeta: (meta) => { meta.url = 'http://localhost:8188/extensions/tk_comfyui_tool/tk_app.js'; },
  });
  await appModule.link((specifier) => {
    if (specifier === '../../scripts/api.js') return apiModule;
    if (specifier === './tk_ui.js') return uiModule;
    if (specifier === './tk_workflow_utils.js') return utilsModule;
    if (specifier === './tk_preview_crop.js') return cropModule;
    throw new Error(`Unexpected import: ${specifier}`);
  });
  await appModule.evaluate();
  return { app: appModule.namespace.ToolkitApp, savedHistory, previews, presetLists };
}

test('completed videos persist a playable URL without using the image upload endpoint', async () => {
  const { app, savedHistory } = await loadToolkitApp();
  app.cacheOutputImageForHistory = () => assert.fail('Video must not be uploaded as an image');
  const result = await app.persistHistoryResult('prompt-1', { id: 'preset-1', name: 'Video' }, videoHistory);
  assert.equal(result.videoUrl, videoUrl);
  assert.equal(result.outputImage, null);
  assert.equal(savedHistory[0].video_url, videoUrl);
  assert.equal(savedHistory[0].video_meta.filename, 'clip with audio.mp4');
  assert.equal(savedHistory[0].status, 'completed');
});

test('workflow completion updates the video preview even when executed arrived before history', async () => {
  const { app, savedHistory, previews } = await loadToolkitApp();
  app.submitPrompt = async () => 'prompt-1';
  app.waitForPromptResult = async () => videoHistory;
  app.setProgressInfo = () => {};
  app.setFormStatus = () => {};
  await app.executePresetChain({ id: 'preset-1', name: 'Video', nextWorkflows: [] }, {}, new Map(), {
    batchIndex: 0, batchCount: 1, chainStack: [],
  });
  assert.equal(savedHistory.length, 1);
  assert.deepEqual(previews, [{ type: 'video', content: videoUrl }]);
  assert.equal(app.getPresetState('preset-1').preview.type, 'video');
});

test('image history still uses its persisted image snapshot', async () => {
  const { app, savedHistory } = await loadToolkitApp();
  app.cacheOutputImageForHistory = async () => '/tk/view_upload/snapshot.png';
  const result = await app.persistHistoryResult('prompt-2', { id: 'preset-2', name: 'Image' }, {
    outputs: { '9': { images: [{ filename: 'image.png', type: 'output' }] } },
  });
  assert.equal(result.imageUrl, '/tk/view_upload/snapshot.png');
  assert.equal(savedHistory[0].persisted_image_url, '/tk/view_upload/snapshot.png');
  assert.equal(savedHistory[0].video_meta, null);
  assert.equal(savedHistory[0].video_url, '');
});

test('video preset covers use the active extension path when saved with the old folder name', async () => {
  const { app, presetLists } = await loadToolkitApp([{
    id: 'preset-1', name: 'Video', category: 'i2v',
    previewImageUrl: 'extensions/tk_comfyui_tooldesign/assets/cover.png',
    workflow: { '12': { class_type: 'VHS_VideoCombine' } },
  }]);
  await app.loadPresets('video', {}, {});
  assert.equal(presetLists[0][0].previewImageUrl, '/extensions/tk_comfyui_tool/assets/cover.png');
  assert.equal(app.presetsCache[0].previewImageUrl, '/extensions/tk_comfyui_tool/assets/cover.png');
  assert.equal(app.presetsCache[0].workflow['12'].class_type, 'VHS_VideoCombine');
});
