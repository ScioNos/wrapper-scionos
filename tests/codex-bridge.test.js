import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  chatErrorToResponsesError,
  chatSseToResponsesSse,
  responsesToChatCompletions,
  shouldBridgeCodexModel,
} from '../src/platform/codex-responses-chat-bridge.js';

test('Codex bridge selects third-party response-incompatible models only', () => {
  assert.equal(shouldBridgeCodexModel('glm-5.2', 'llm'), true);
  assert.equal(shouldBridgeCodexModel('MiniMax-M3', 'llm'), true);
  assert.equal(shouldBridgeCodexModel('deepseek-v4-flash', 'routerlab'), true);
  assert.equal(shouldBridgeCodexModel('gpt-5.5', 'llm'), false);
});

test('Responses request converts to Chat Completions with stream usage and clean tools', () => {
  const chat = responsesToChatCompletions({
    model: 'glm-5.2',
    instructions: 'Be concise.',
    input: 'hello',
    stream: true,
    max_output_tokens: 100,
    tool_choice: 'auto',
    parallel_tool_calls: true,
  });

  assert.equal(chat.model, 'glm-5.2');
  assert.deepEqual(chat.messages, [
    { role: 'system', content: 'Be concise.' },
    { role: 'user', content: 'hello' },
  ]);
  assert.equal(chat.max_tokens, 100);
  assert.equal(chat.stream_options.include_usage, true);
  assert.equal(Object.hasOwn(chat, 'tool_choice'), false);
  assert.equal(Object.hasOwn(chat, 'parallel_tool_calls'), false);
});

test('Responses tools keep tool choice when valid tools exist', () => {
  const chat = responsesToChatCompletions({
    model: 'MiniMax-M3',
    input: 'use a tool',
    tools: [{ type: 'function', name: 'get_weather', parameters: { type: 'object', properties: {} } }],
    tool_choice: { type: 'function', name: 'get_weather' },
  });

  assert.equal(chat.tools[0].function.name, 'get_weather');
  assert.equal(chat.tool_choice.function.name, 'get_weather');
});

test('Chat errors normalize to Responses error envelope and truncate raw text', () => {
  const error = chatErrorToResponsesError(502, '<html>' + 'x'.repeat(1200));
  assert.equal(typeof error.error.message, 'string');
  assert.equal(error.error.type, 'upstream_error');
  assert.equal(error.error.message.includes('(truncated)'), true);
});

test('Codex bridge maps reasoning options like cc-switch for bridged Chat upstreams', () => {
  const deepseek = responsesToChatCompletions({
    model: 'deepseek-v4-pro',
    input: 'solve',
    reasoning: { effort: 'max' },
  });
  assert.deepEqual(deepseek.thinking, { type: 'enabled' });
  assert.equal(deepseek.reasoning_effort, 'max');

  const deepseekDisabled = responsesToChatCompletions({
    model: 'deepseek-v4-pro',
    input: 'solve',
    reasoning: { effort: 'none' },
  });
  assert.deepEqual(deepseekDisabled.thinking, { type: 'disabled' });
  assert.equal(Object.hasOwn(deepseekDisabled, 'reasoning_effort'), false);

  const glm = responsesToChatCompletions({
    model: 'glm-5.2',
    input: 'solve',
    reasoning: { effort: 'high' },
  });
  assert.deepEqual(glm.thinking, { type: 'enabled' });
  assert.equal(Object.hasOwn(glm, 'enable_thinking'), false);
  assert.equal(Object.hasOwn(glm, 'reasoning_effort'), false);

  const qwen = responsesToChatCompletions({
    model: 'qwen3.7-max',
    input: 'solve',
    reasoning: { effort: 'high' },
  });
  assert.equal(qwen.enable_thinking, true);
  assert.equal(Object.hasOwn(qwen, 'reasoning_effort'), false);

  const minimax = responsesToChatCompletions({
    model: 'MiniMax-M3',
    input: 'solve',
    reasoning: { effort: 'high' },
  });
  assert.equal(minimax.reasoning_split, true);
  assert.equal(Object.hasOwn(minimax, 'reasoning_effort'), false);

  const noReasoning = responsesToChatCompletions({ model: 'glm-5.2', input: 'solve' });
  assert.equal(Object.hasOwn(noReasoning, 'thinking'), false);
});

test('Codex bridge wraps streaming response.completed with Responses event shape', async () => {
  const upstream = Readable.from([
    'data: {"id":"chatcmpl-test","created":123,"model":"glm-5.2","choices":[{"delta":{"content":"4"}}]}\n\n',
    'data: {"choices":[{"finish_reason":"stop","delta":{}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
    'data: [DONE]\n\n',
  ]);
  let text = '';
  for await (const chunk of chatSseToResponsesSse(upstream, { model: 'glm-5.2' })) {
    text += chunk.toString();
  }

  const completedBlock = text.split('\n\n').find((block) => block.includes('event: response.completed'));
  assert.ok(completedBlock);
  const jsonLine = completedBlock.split('\n').find((line) => line.startsWith('data: '));
  const payload = JSON.parse(jsonLine.slice('data: '.length));
  assert.equal(payload.type, 'response.completed');
  assert.equal(payload.response.status, 'completed');
  assert.equal(payload.response.output[0].content[0].text, '4');
  assert.equal(payload.response.usage.total_tokens, 2);
});
