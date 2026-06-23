import { Readable } from 'node:stream';

const BRIDGED_CODEX_MODELS = new Set([
  'glm-5.2',
  'qwen3.7-max',
  'minimax-m3',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'kimi-k2.7-code',
  'glm-5.1',
]);

const GPT_CODEX_MODELS = new Set([
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
]);

const EXTRA_CHAT_PASSTHROUGH_FIELDS = [
  'frequency_penalty',
  'metadata',
  'parallel_tool_calls',
  'presence_penalty',
  'response_format',
  'seed',
  'stop',
  'stream_options',
  'top_logprobs',
  'user',
];

const MAX_RAW_ERROR_CHARS = 1024;

export function shouldBridgeCodexModel(model, _serviceValue = 'routerlab') {
  const normalized = normalizeModel(model);
  return Boolean(normalized && BRIDGED_CODEX_MODELS.has(normalized) && !GPT_CODEX_MODELS.has(normalized));
}

export function responsesToChatCompletions(body) {
  const chat = {};
  const messages = [];

  if (body.model) {
    chat.model = body.model;
  }

  const instructions = textFromContent(body.instructions);
  if (instructions) {
    messages.push({ role: 'system', content: instructions });
  }

  appendInputMessages(body.input, messages);
  chat.messages = collapseSystemMessages(messages);

  if (body.max_output_tokens !== undefined) {
    chat.max_tokens = body.max_output_tokens;
  }
  if (body.max_tokens !== undefined) {
    chat.max_tokens = body.max_tokens;
  }
  if (body.max_completion_tokens !== undefined) {
    chat.max_completion_tokens = body.max_completion_tokens;
  }

  for (const key of ['temperature', 'top_p', 'stream']) {
    if (body[key] !== undefined) {
      chat[key] = body[key];
    }
  }
  for (const key of EXTRA_CHAT_PASSTHROUGH_FIELDS) {
    if (body[key] !== undefined) {
      chat[key] = structuredClone(body[key]);
    }
  }

  const tools = responseToolsToChatTools(body.tools);
  if (tools.length > 0) {
    chat.tools = tools;
  }
  if (body.tool_choice !== undefined) {
    chat.tool_choice = responseToolChoiceToChat(body.tool_choice);
  }

  applySimpleReasoningOptions(chat, body);

  if (!Array.isArray(chat.tools) || chat.tools.length === 0) {
    delete chat.tool_choice;
    delete chat.parallel_tool_calls;
  }

  if (chat.stream) {
    chat.stream_options = {
      ...(isPlainObject(chat.stream_options) ? chat.stream_options : {}),
      include_usage: true,
    };
  }

  return chat;
}

export function chatCompletionToResponses(chatResponse, context = {}) {
  const choice = chatResponse?.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const responseId = responseIdFromChatId(chatResponse?.id);
  const createdAt = chatResponse?.created ?? Math.floor(Date.now() / 1000);
  const model = chatResponse?.model ?? context.model ?? '';
  const output = [];

  const reasoning = reasoningTextFromObject(message);
  if (reasoning) {
    output.push({
      id: `${responseId}_reasoning`,
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: reasoning }],
      content: [{ type: 'reasoning_text', text: reasoning }],
      status: 'completed',
    });
  }

  for (const toolCall of message.tool_calls ?? []) {
    if (toolCall?.function?.name) {
      output.push({
        id: `${responseId}_call_${output.length}`,
        type: 'function_call',
        call_id: toolCall.id ?? `call_${output.length}`,
        name: toolCall.function.name,
        arguments: normalizeToolArguments(toolCall.function.arguments),
        status: 'completed',
      });
    }
  }

  const text = textFromContent(message.content);
  if (text) {
    output.push({
      id: `${responseId}_message`,
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    });
  }

  return {
    id: responseId,
    object: 'response',
    created_at: createdAt,
    status: responseStatusFromFinishReason(choice.finish_reason),
    model,
    output,
    usage: chatUsageToResponsesUsage(chatResponse?.usage),
  };
}

export function chatErrorToResponsesError(status, body) {
  const value = typeof body === 'string' ? parseJsonOrText(body) : body;
  const error = extractError(value);
  return {
    error: {
      message: error.message || `Upstream chat request failed with HTTP ${status}`,
      type: error.type || 'upstream_error',
      code: error.code ?? null,
      param: error.param ?? null,
    },
  };
}

export function chatSseToResponsesSse(stream, context = {}) {
  return Readable.from(chatSseEvents(stream, context));
}

async function* chatSseEvents(stream, context) {
  const responseId = responseIdFromChatId(context.id);
  let buffer = '';
  let started = false;
  let textAdded = false;
  let textDone = false;
  let outputText = '';
  let response = null;
  let latestUsage = null;
  let finishReason = null;
  const itemId = `${responseId}_message`;

  for await (const chunk of stream) {
    buffer += chunk.toString('utf8');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = sseData(block);
      if (!data) {
        continue;
      }
      if (data === '[DONE]') {
        break;
      }

      const parsed = parseJsonOrText(data);
      if (!isPlainObject(parsed)) {
        continue;
      }
      if (isPlainObject(parsed.error)) {
        yield sseEvent('error', chatErrorToResponsesError(502, parsed));
        continue;
      }

      response ??= responseSkeleton(parsed, context);
      if (!started) {
        started = true;
        yield sseEvent('response.created', response);
      }

      if (parsed.usage) {
        latestUsage = chatUsageToResponsesUsage(parsed.usage);
      }

      const choice = parsed.choices?.[0] ?? {};
      finishReason = choice.finish_reason ?? finishReason;
      const delta = choice.delta ?? {};

      const reasoning = reasoningTextFromObject(delta);
      if (reasoning) {
        yield sseEvent('response.reasoning_summary_text.delta', {
          type: 'response.reasoning_summary_text.delta',
          response_id: response.id,
          item_id: `${response.id}_reasoning`,
          output_index: 0,
          summary_index: 0,
          delta: reasoning,
        });
      }

      if (typeof delta.content === 'string' && delta.content) {
        if (!textAdded) {
          textAdded = true;
          yield sseEvent('response.output_item.added', {
            type: 'response.output_item.added',
            response_id: response.id,
            output_index: 0,
            item: {
              id: itemId,
              type: 'message',
              role: 'assistant',
              status: 'in_progress',
              content: [],
            },
          });
          yield sseEvent('response.content_part.added', {
            type: 'response.content_part.added',
            response_id: response.id,
            item_id: itemId,
            output_index: 0,
            content_index: 0,
            part: { type: 'output_text', text: '', annotations: [] },
          });
        }
        outputText += delta.content;
        yield sseEvent('response.output_text.delta', {
          type: 'response.output_text.delta',
          response_id: response.id,
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          delta: delta.content,
        });
      }
    }
  }

  response ??= responseSkeleton({}, context);
  if (!started) {
    yield sseEvent('response.created', response);
  }
  if (textAdded && !textDone) {
    textDone = true;
    yield sseEvent('response.output_text.done', {
      type: 'response.output_text.done',
      response_id: response.id,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      text: outputText,
    });
    yield sseEvent('response.content_part.done', {
      type: 'response.content_part.done',
      response_id: response.id,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: { type: 'output_text', text: outputText, annotations: [] },
    });
    yield sseEvent('response.output_item.done', {
      type: 'response.output_item.done',
      response_id: response.id,
      output_index: 0,
      item: {
        id: itemId,
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: outputText, annotations: [] }],
      },
    });
  }

  yield sseEvent('response.completed', {
    type: 'response.completed',
    response: {
      ...response,
      status: responseStatusFromFinishReason(finishReason),
      output: textAdded ? [{
        id: itemId,
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: outputText, annotations: [] }],
      }] : [],
      usage: latestUsage ?? chatUsageToResponsesUsage(null),
    },
  });
  yield 'data: [DONE]\n\n';
}

function appendInputMessages(input, messages) {
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
    return;
  }
  if (!Array.isArray(input)) {
    return;
  }

  for (const item of input) {
    if (!isPlainObject(item)) {
      continue;
    }
    if (item.type === 'message') {
      const role = chatRole(item.role);
      const content = textFromContent(item.content);
      if (content) {
        messages.push({ role, content });
      }
    } else if (item.type === 'function_call') {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: item.call_id ?? item.id ?? `call_${messages.length}`,
          type: 'function',
          function: {
            name: item.name ?? 'tool_call',
            arguments: normalizeToolArguments(item.arguments),
          },
        }],
        reasoning_content: textFromContent(item.reasoning_content) || 'tool call',
      });
    } else if (item.type === 'function_call_output') {
      messages.push({
        role: 'tool',
        tool_call_id: item.call_id ?? item.id ?? `call_${messages.length}`,
        content: textFromContent(item.output ?? item.content),
      });
    } else {
      const content = textFromContent(item);
      if (content) {
        messages.push({ role: 'user', content });
      }
    }
  }
}

function responseToolsToChatTools(tools) {
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools
    .map((tool) => {
      if (!isPlainObject(tool)) {
        return null;
      }
      if (tool.type === 'function') {
        const name = tool.name ?? tool.function?.name;
        if (!name) {
          return null;
        }
        return {
          type: 'function',
          function: {
            name,
            description: tool.description ?? tool.function?.description ?? '',
            parameters: tool.parameters ?? tool.function?.parameters ?? { type: 'object', properties: {} },
          },
        };
      }
      if (tool.type === 'custom') {
        const name = tool.name;
        if (!name) {
          return null;
        }
        return {
          type: 'function',
          function: {
            name,
            description: tool.description ?? '',
            parameters: { type: 'object', properties: {} },
          },
        };
      }
      return null;
    })
    .filter(Boolean);
}

function responseToolChoiceToChat(toolChoice) {
  if (isPlainObject(toolChoice) && (toolChoice.type === 'function' || toolChoice.type === 'custom')) {
    return {
      type: 'function',
      function: { name: toolChoice.name ?? toolChoice.function?.name ?? '' },
    };
  }
  return structuredClone(toolChoice);
}

function applySimpleReasoningOptions(chat, body) {
  const model = normalizeModel(chat.model);
  const reasoningEnabled = reasoningRequested(body);
  if (reasoningEnabled === undefined) {
    return;
  }

  if (model?.startsWith('deepseek-')) {
    chat.thinking = { type: reasoningEnabled ? 'enabled' : 'disabled' };
    if (reasoningEnabled) {
      const effort = body?.reasoning?.effort;
      if (typeof effort === 'string') {
        chat.reasoning_effort = mapReasoningEffort(effort, 'deepseek');
      }
    }
  } else if (model === 'minimax-m3') {
    chat.reasoning_split = reasoningEnabled;
  } else if (model?.startsWith('glm-') || model?.startsWith('kimi-')) {
    chat.thinking = { type: reasoningEnabled ? 'enabled' : 'disabled' };
  } else if (model?.startsWith('qwen')) {
    chat.enable_thinking = reasoningEnabled;
  }
}

function reasoningRequested(body) {
  const effort = body?.reasoning?.effort;
  if (typeof effort === 'string') {
    return !['none', 'off', 'disabled'].includes(effort.trim().toLowerCase());
  }
  return Object.hasOwn(body ?? {}, 'reasoning') ? body.reasoning !== null : undefined;
}

function mapReasoningEffort(effort, mode) {
  const normalized = effort.trim().toLowerCase();
  if (['none', 'off', 'disabled'].includes(normalized)) {
    return undefined;
  }
  if (mode === 'deepseek') {
    return normalized === 'max' || normalized === 'xhigh' ? 'max' : 'high';
  }
  return normalized;
}

function textFromContent(content) {
  if (content === null || content === undefined) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (typeof content === 'number' || typeof content === 'boolean') {
    return String(content);
  }
  if (Array.isArray(content)) {
    return content.map(textFromContent).filter(Boolean).join('\n');
  }
  if (isPlainObject(content)) {
    if (typeof content.text === 'string') {
      return content.text;
    }
    if (typeof content.output_text === 'string') {
      return content.output_text;
    }
    if (typeof content.input_text === 'string') {
      return content.input_text;
    }
    if (typeof content.output === 'string') {
      return content.output;
    }
    if (typeof content.content === 'string' || Array.isArray(content.content)) {
      return textFromContent(content.content);
    }
  }
  return '';
}

function collapseSystemMessages(messages) {
  const system = [];
  const rest = [];
  for (const message of messages) {
    if (message.role === 'system') {
      const content = textFromContent(message.content);
      if (content) {
        system.push(content);
      }
    } else {
      rest.push(message);
    }
  }
  return system.length > 0 ? [{ role: 'system', content: system.join('\n\n') }, ...rest] : rest;
}

function chatRole(role) {
  if (role === 'assistant' || role === 'system' || role === 'tool') {
    return role;
  }
  return 'user';
}

function responseSkeleton(chunk, context) {
  const id = responseIdFromChatId(chunk.id ?? context.id);
  return {
    id,
    object: 'response',
    created_at: chunk.created ?? Math.floor(Date.now() / 1000),
    status: 'in_progress',
    model: chunk.model ?? context.model ?? '',
    output: [],
    usage: null,
  };
}

function responseIdFromChatId(id) {
  if (typeof id === 'string' && id.startsWith('resp_')) {
    return id;
  }
  return `resp_${id || 'scionos'}`;
}

function responseStatusFromFinishReason(reason) {
  return reason === 'length' ? 'incomplete' : 'completed';
}

function chatUsageToResponsesUsage(usage) {
  return {
    input_tokens: usage?.prompt_tokens ?? usage?.input_tokens ?? 0,
    output_tokens: usage?.completion_tokens ?? usage?.output_tokens ?? 0,
    total_tokens: usage?.total_tokens ?? ((usage?.prompt_tokens ?? usage?.input_tokens ?? 0) + (usage?.completion_tokens ?? usage?.output_tokens ?? 0)),
  };
}

function reasoningTextFromObject(value) {
  if (!isPlainObject(value)) {
    return '';
  }
  return textFromContent(value.reasoning_content)
    || textFromContent(value.reasoning)
    || textFromContent(value.reasoning_details);
}

function normalizeToolArguments(args) {
  if (args === undefined || args === null || args === '') {
    return '{}';
  }
  if (typeof args === 'string') {
    return args;
  }
  return JSON.stringify(args);
}

function sseData(block) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  return data.trim();
}

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function extractError(value) {
  if (isPlainObject(value?.error)) {
    return value.error;
  }
  if (isPlainObject(value?.base_resp)) {
    return {
      message: value.base_resp.status_msg ?? value.base_resp.message ?? JSON.stringify(value.base_resp),
      type: 'upstream_error',
      code: value.base_resp.status_code ?? null,
      param: null,
    };
  }
  if (isPlainObject(value)) {
    return {
      message: value.message ?? value.detail ?? JSON.stringify(value),
      type: value.type ?? 'upstream_error',
      code: value.code ?? null,
      param: value.param ?? null,
    };
  }
  return {
    message: truncateRawError(String(value ?? 'Unknown upstream error')),
    type: 'upstream_error',
    code: null,
    param: null,
  };
}

function parseJsonOrText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return truncateRawError(text);
  }
}

function truncateRawError(text) {
  return text.length > MAX_RAW_ERROR_CHARS ? `${text.slice(0, MAX_RAW_ERROR_CHARS)}...(truncated)` : text;
}

function normalizeModel(model) {
  return typeof model === 'string' ? model.trim().toLowerCase() : '';
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
