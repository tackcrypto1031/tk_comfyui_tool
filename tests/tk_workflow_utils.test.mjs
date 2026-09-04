import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findImageInputTargets,
  pickPrimaryImageInputTarget,
  extractFirstOutputImage,
  extractFirstOutputVideo,
  resolvePresetPreviewUrl,
  findCyclePath,
} from '../web/tk_workflow_utils.js';

test('preset preview URLs follow the active extension directory and preserve encoded filenames', () => {
  for (const folder of ['tk_comfyui_tool', 'tk_comfyui_tooldesign']) {
    assert.equal(resolvePresetPreviewUrl(
      `extensions/${folder}/assets/cover%20image.png?v=2`,
      'http://localhost:8188/comfy/extensions/custom-toolkit/tk_app.js',
    ), '/comfy/extensions/custom-toolkit/assets/cover%20image.png?v=2');
  }
  assert.equal(resolvePresetPreviewUrl('/extensions/tk_comfyui_tooldesign/assets/cover.png',
    'http://localhost:8188/extensions/tk_comfyui_tool/tk_app.js'), '/extensions/tk_comfyui_tool/assets/cover.png');
});

test('preset preview URL repair leaves external URLs and other local resources unchanged', () => {
  const extensionUrl = 'http://localhost:8188/extensions/tk_comfyui_tool/tk_app.js';
  for (const url of [
    '', 'https://example.com/cover.png', '/view?filename=cover.png&type=input',
    'https://example.com/extensions/tk_comfyui_tooldesign/assets/cover.png',
    '/extensions/another-node/assets/cover.png', 'data:image/png;base64,abc',
  ]) {
    assert.equal(resolvePresetPreviewUrl(url, extensionUrl), url);
  }
  assert.equal(resolvePresetPreviewUrl(null, extensionUrl), '');
});

test('findImageInputTargets prefers LoadImageFromPath and smallest node id', () => {
  const workflow = {
    '10': { class_type: 'LoadImage', inputs: { image: 'a.png' } },
    '3': { class_type: 'LoadImageFromPath', inputs: { image: '/tmp/3.png' } },
    '2': { class_type: 'LoadImageFromPath', inputs: { image_path: '/tmp/2.png' } },
  };

  const targets = findImageInputTargets(workflow);

  assert.equal(targets.length, 3);
  assert.deepEqual(targets[0], { nodeId: '2', nodeClass: 'LoadImageFromPath', inputName: 'image_path' });
  assert.deepEqual(targets[1], { nodeId: '3', nodeClass: 'LoadImageFromPath', inputName: 'image' });
  assert.deepEqual(targets[2], { nodeId: '10', nodeClass: 'LoadImage', inputName: 'image' });
});

test('pickPrimaryImageInputTarget returns null when no target nodes exist', () => {
  const target = pickPrimaryImageInputTarget({
    '1': { class_type: 'KSampler', inputs: { seed: 1 } },
  });

  assert.equal(target, null);
});

test('findImageInputTargets ignores image nodes without known image input keys', () => {
  const workflow = {
    '1': { class_type: 'LoadImageFromPath', inputs: { custom_path: '/tmp/a.png' } },
  };

  const targets = findImageInputTargets(workflow);
  assert.deepEqual(targets, []);
});

test('extractFirstOutputImage returns first image by smallest output node id', () => {
  const historyEntry = {
    outputs: {
      '12': { images: [{ filename: 'b.png', subfolder: '', type: 'output' }] },
      '2': { images: [{ filename: 'a.png', subfolder: 'foo', type: 'output' }] },
    },
  };

  const image = extractFirstOutputImage(historyEntry);

  assert.deepEqual(image, {
    filename: 'a.png',
    subfolder: 'foo',
    type: 'output',
    sourceNodeId: '2',
  });
});

test('findCyclePath returns cycle path for cyclic graph', () => {
  const cycle = findCyclePath({
    A: ['B'],
    B: ['C'],
    C: ['A'],
  });

  assert.deepEqual(cycle, ['A', 'B', 'C', 'A']);
});

test('extractFirstOutputImage does not treat native ComfyUI video output as an image', () => {
  const history = {
    outputs: {
      '12': { images: [{ filename: 'clip.mp4', subfolder: 'video', type: 'output' }], animated: [true] },
    },
  };
  assert.equal(extractFirstOutputImage(history), null);
});

test('extractFirstOutputImage supports GIF output from VideoHelperSuite', () => {
  const history = {
    outputs: {
      '12': { gifs: [{ filename: 'clip.gif', subfolder: '', type: 'output', format: 'image/gif' }] },
    },
  };
  assert.deepEqual(extractFirstOutputImage(history), {
    filename: 'clip.gif', subfolder: '', type: 'output', sourceNodeId: '12',
  });
});

test('extractFirstOutputVideo recognizes VideoHelperSuite MP4 output', () => {
  const history = { outputs: {
    '12': { gifs: [{
      filename: 'stable_4v4a_00004-audio.mp4', subfolder: 'MiniMaxH3', type: 'output',
      format: 'video/h264-mp4', frame_rate: 24, workflow: 'stable_4v4a_00004.png',
    }] },
  } };
  assert.deepEqual(extractFirstOutputVideo(history), {
    filename: 'stable_4v4a_00004-audio.mp4', subfolder: 'MiniMaxH3', type: 'output', sourceNodeId: '12',
  });
  assert.equal(extractFirstOutputImage(history), null);
});

test('extractFirstOutputVideo recognizes native video without confusing thumbnails', () => {
  const history = { outputs: {
    '1': { images: [{ filename: 'thumbnail.png' }] },
    '12': { images: [null, { filename: 'clip.WEBM' }], animated: [true] },
  } };
  assert.equal(extractFirstOutputVideo(history).filename, 'clip.WEBM');
  assert.equal(extractFirstOutputImage(history).filename, 'thumbnail.png');
});

test('extractFirstOutputVideo ignores GIF images and malformed output entries', () => {
  for (const history of [null, {}, { outputs: { '1': null, '2': { gifs: [null, {}, { filename: 'clip.gif', format: 'image/gif' }] } } }]) {
    assert.equal(extractFirstOutputVideo(history), null);
  }
});

test('extractFirstOutputVideo supports explicit video arrays and MIME format', () => {
  const history = { outputs: { '4': { videos: [{ filename: 'clip', format: 'video/webm', type: 'temp' }] } } };
  assert.deepEqual(extractFirstOutputVideo(history), {
    filename: 'clip', subfolder: '', type: 'temp', sourceNodeId: '4',
  });
});

test('findCyclePath returns null for acyclic graph', () => {
  const cycle = findCyclePath({
    A: ['B'],
    B: ['C'],
    C: [],
  });

  assert.equal(cycle, null);
});
