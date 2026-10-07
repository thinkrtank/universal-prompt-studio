import test from 'node:test';
import assert from 'node:assert/strict';
import { core } from '../mcp/core.mjs';
const plain = value => JSON.parse(JSON.stringify(value));

test('every builder default and preset generates JSON and matching plain text', () => {
  assert.equal(Object.keys(core.SCHEMAS).length, 16);
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

test('preset values match field types and select options', () => {
  const sentinels = new Set(core.SELECT_SENTINELS);
  for (const [type, presets] of Object.entries(core.PRESETS)) {
    for (const [name, preset] of Object.entries(presets)) {
      for (const [key, value] of Object.entries(preset)) {
        const field = core.SCHEMAS[type][key];
        assert.ok(field, `${type} / ${name}: unknown key ${key}`);
        if (field.type === 'select') assert.ok(sentinels.has(value) || field.options.includes(value), `${type} / ${name}: ${key}=${value} is not an option`);
        if (field.type === 'multiselect') for (const item of value) assert.ok(field.options.includes(item), `${type} / ${name}: ${key} has unknown option ${item}`);
      }
    }
  }
});

test('every section has fields and every builder has complete card metadata', () => {
  assert.deepEqual(Object.keys(core.TYPE_META).sort(), Object.keys(core.SCHEMAS).sort());
  for (const [type, meta] of Object.entries(core.TYPE_META)) {
    for (const prop of ['group', 'title', 'shortTitle', 'desc', 'pasteTarget']) assert.ok(meta[prop], `${type}: missing ${prop}`);
    const used = new Set(Object.values(core.SCHEMAS[type]).map(field => field.section));
    for (const section of Object.keys(core.SECTION_INFO[type])) assert.ok(used.has(section), `${type}: section ${section} has no fields`);
  }
});

test('target model options all have profiles with notes', () => {
  for (const [type, profiles] of Object.entries(core.MODEL_PROFILES)) {
    const fields = Object.values(core.SCHEMAS[type]).filter(field => field.modelProfiles === type);
    assert.equal(fields.length, 1, `${type}: exactly one profile-driven field`);
    assert.deepEqual(plain(fields[0].options), Object.keys(profiles));
    for (const [id, profile] of Object.entries(profiles)) {
      assert.ok(profile.label && profile.notes.length, `${type}.${id}: needs label and notes`);
      assert.ok(['current', 'legacy', 'early_access'].includes(profile.status), `${type}.${id}: bad status`);
    }
  }
});

test('model guidance emits native syntax and compatibility warnings', () => {
  const mj = core.buildPromptObject('image', { 'meta.target_model': 'midjourney_v8_2', 'meta.aspect_ratio': '4:5', 'meta.quality': 'raw',
    'meta.resolution': '2K', 'model_params.stylize': 150, 'meta.seed': 7, 'advanced.negative_prompt': 'text, watermark' });
  assert.equal(mj.model_guidance.native_parameters, '--ar 4:5 --raw --hd --s 150 --seed 7 --no text, watermark');
  const niji = core.buildPromptObject('image', { 'meta.target_model': 'niji_7', 'meta.aspect_ratio': '1:1' });
  assert.equal(niji.model_guidance.native_parameters, '--ar 1:1 --niji 7');
  const nb = core.buildPromptObject('image', { 'meta.target_model': 'nano_banana_2_lite', 'meta.resolution': '4K', 'advanced.negative_prompt': 'blur' });
  assert.equal(nb.model_guidance.compatibility_warnings.length, 2);
  const veo = core.buildPromptObject('video', { 'meta.target_model': 'veo_3_1', 'meta.duration': '10s' });
  assert.match(veo.model_guidance.compatibility_warnings.join(' '), /4, 6, 8 s/);
  const okVeo = core.buildPromptObject('video', { 'meta.target_model': 'veo_3_1', 'meta.duration': '8s' });
  assert.equal(okVeo.model_guidance.compatibility_warnings, undefined);
  const seedance = core.buildPromptObject('video', { 'meta.target_model': 'seedance_2_0', 'shots.reference_images': 'hero\nproduct', 'shots.reference_videos': 'move' });
  assert.match(seedance.model_guidance.native_parameters, /@Image2 = product\n@Video1 = move/);
  const hd = core.buildPromptObject('image', { 'meta.target_model': 'midjourney_v8_2', 'meta.resolution': '2K', 'meta.aspect_ratio': '8:1' });
  assert.match(hd.model_guidance.compatibility_warnings.join(' '), /--hd limits aspect ratio to 4:1/);
  const edit = core.buildPromptObject('image', { 'meta.target_model': 'midjourney_v8_2', 'reference.mode': 'character_reference', 'reference.image_url': 'https://x/a.png' });
  assert.match(edit.model_guidance.native_parameters, /--edit https:\/\/x\/a\.png/);
  const sd = core.buildPromptObject('image', { 'meta.target_model': 'sdxl_local', 'meta.aspect_ratio': '1:1', 'sd_local.steps': 30, 'advanced.negative_prompt': 'blur' });
  assert.equal(sd.model_guidance.native_parameters, 'Negative prompt: blur\nSteps: 30, Size: 1024x1024');
  assert.match(core.promptPlainText(mj), /model guidance › native parameters: --ar 4:5/);
  const llm = core.buildPromptObject('llm', { 'meta.target_model': 'claude_opus_5_5' });
  assert.equal(llm.model_guidance.api_model_id, 'claude-opus-5-5');
  assert.equal(core.buildPromptObject('image', { 'meta.target_model': 'best_fit' }).model_guidance, undefined);
  const motion = core.buildPromptObject('motion', { 'target.tool': 'ai_video_model', 'target.ai_video_model': 'veo_3_1' });
  assert.match(motion.model_guidance.target_model, /Veo 3\.1/);
  assert.equal(core.buildPromptObject('motion', { 'target.tool': 'after_effects' }).model_guidance, undefined);
  const lyria = core.buildPromptObject('audio', { 'meta.target_tool': 'google_flow_music_lyria', 'meta.duration': '4:00' });
  assert.match(lyria.model_guidance.compatibility_warnings[0], /exceeds the 180 s maximum/);
});

test('guidance output re-imports cleanly and retired model values still load', () => {
  const data = { 'meta.target_model': 'midjourney_v8_2', 'meta.aspect_ratio': '1:1' };
  assert.deepEqual(plain(core.importPromptData('image', core.buildPromptObject('image', data))), data);
  const retired = { type: 'video', data: { 'meta.target_model': 'sora_2' } };
  assert.equal(core.validTemplate(retired), true);
  assert.equal(core.buildPromptObject('video', retired.data).model_guidance, undefined);
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
