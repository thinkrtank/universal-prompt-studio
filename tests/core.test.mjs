import test from 'node:test';
import assert from 'node:assert/strict';
import { core } from '../mcp/core.mjs';
const plain = value => JSON.parse(JSON.stringify(value));

test('every builder default and preset generates JSON and matching plain text', () => {
  assert.equal(Object.keys(core.SCHEMAS).length, 11);
  for (const type of Object.keys(core.SCHEMAS)) {
    for (const data of [{}, ...Object.values(core.PRESETS[type] || {})]) {
      const output = core.buildPromptObject(type, { ...core.defaultFormData(type), ...data });
      assert.equal(typeof core.promptPlainText(output), 'string');
      for (const field of Object.values(core.SCHEMAS[type])) {
        assert.ok(core.SECTION_INFO[type][field.section], `${type}: missing section ${field.section}`);
        if (field.condition) assert.ok(core.SCHEMAS[type][field.condition]);
      }
    }
  }
});

test('generation rejects prototype paths and inherited builder names', () => {
  for (const key of ['constructor.prototype.polluted', '__proto__.polluted', 'subject.__proto__.polluted']) {
    assert.throws(() => core.buildPromptObject('image', { [key]: 'yes' }), /Unsafe/);
  }
  assert.throws(() => core.buildPromptObject('toString', {}), /Unknown builder/);
  assert.equal({}.polluted, undefined);
});

test('literal inherited-property names survive sentinel resolution', () => {
  for (const value of ['toString', 'constructor', 'hasOwnProperty']) {
    assert.equal(core.buildPromptObject('llm', { user_intent: value }).user_intent, value);
  }
});

test('sentinels, intent, false and zero appear consistently in output', () => {
  const numericKey = Object.keys(core.SCHEMAS.image).find(key => core.SCHEMAS.image[key].type === 'number');
  const data = { user_intent: 'Important objective', 'role.persona': 'ask_me', 'advanced.self_critique': false };
  const obj = core.buildPromptObject('llm', data);
  const text = core.promptPlainText(obj);
  assert.match(text, /Important objective/);
  assert.match(text, /\[Ask me about this\]/);
  assert.match(text, /self critique: false/);
  assert.match(core.promptPlainText(core.buildPromptObject('image', { [numericKey]: 0 })), /: 0/);
  assert.deepEqual(plain(core.importPromptData('llm', obj)), data);
});

test('hidden fields are excluded using the template builder type', () => {
  const data = { 'text.enabled': false, 'text.content': 'hidden' };
  assert.equal(core.buildPromptObject('image', data).text.content, undefined);
  assert.equal(core.buildPromptObject('image', { ...data, 'text.enabled': true }).text.content, 'hidden');
});

test('imports reject object controls and invalid checkbox/array values', () => {
  assert.throws(() => core.importPromptData('llm', { role: { persona: { unexpected: true } } }), /Invalid value/);
  assert.throws(() => core.importPromptData('image', { text: { enabled: 'false' } }), /Invalid value/);
  assert.throws(() => core.validateFormData('llm', { _industries_selected: 'bad' }), /Invalid value/);
  assert.throws(() => core.importPromptData('image', { unknown: 3 }), /No matching fields/);
  assert.throws(() => core.importPromptData('image', []), /Expected/);
});

test('malformed storage and unsupported templates are filtered', () => {
  for (const value of [null, [], 'wrong', 12]) assert.deepEqual(plain(core.cleanTemplateLibrary(value)), {});
  const good = { type: 'llm', data: { user_intent: 'kept' } };
  const templates = core.cleanTemplateLibrary({ good, bad: { type: 'removed', data: {} }, null: null, invalid: { type: 'llm', data: [] } });
  assert.deepEqual(Object.keys(templates), ['good']);
});

test('autosave rejects future, expired and invalid records', () => {
  const saved = { type: 'llm', data: {}, timestamp: 100 };
  assert.equal(core.validAutosave(saved, 101), true);
  assert.equal(core.validAutosave(saved, 99), false);
  assert.equal(core.validAutosave(saved, 86400100), false);
  assert.equal(core.validAutosave({ ...saved, type: 'unknown' }, 101), false);
});

test('chains validate ordering, IDs, labels, types and targets', () => {
  const steps = [{ id: 1, type: 'standard', outputLabel: 'draft' }, { id: 2, type: 'translate', inputSource: 1, targets: ['Figma'] }];
  assert.equal(core.buildChainObject(steps).chain[1].input_source, 'draft');
  const badChains = [[], [...steps].reverse(), [steps[0], { ...steps[1], id: 1 }],
    [steps[0], { ...steps[1], outputLabel: 'draft' }], [{ id: '1', type: 'standard' }],
    [{ id: 1, type: 'unknown' }], [{ id: 1, type: 'standard', targets: [null] }]];
  for (const bad of badChains) assert.equal(core.validateChainSteps(bad), null);
});
