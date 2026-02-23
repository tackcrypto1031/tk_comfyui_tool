import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findImageInputTargets,
  pickPrimaryImageInputTarget,
  extractFirstOutputImage,
  findCyclePath,
} from '../web/tk_workflow_utils.js';

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

test('findCyclePath returns null for acyclic graph', () => {
  const cycle = findCyclePath({
    A: ['B'],
    B: ['C'],
    C: [],
  });

  assert.equal(cycle, null);
});
