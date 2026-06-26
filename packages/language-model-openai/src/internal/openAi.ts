/**
 * Adapter from the official OpenAI SDK to this project's language model service.
 *
 * @since 1.0.0
 */
import OpenAI, { APIError, APIUserAbortError, type ClientOptions } from "openai";
import type { CompletionUsage } from "openai/resources/completions";
import type {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionContentPartText,
  ChatCompletionCreateParamsBase,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionFunctionTool,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionNamedToolChoice,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions/completions";
import type {
  EasyInputMessage,
  FunctionTool as ResponseFunctionTool,
  Response,
  ResponseCreateParamsBase,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseFormatTextConfig,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputContent,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseStreamEvent,
  ResponseUsage,
  Tool,
  ToolChoiceFunction,
  ToolChoiceOptions,
} from "openai/resources/responses/responses";
import * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Record from "effect/Record";
import * as Stream from "effect/Stream";

/**
 * Options for building an OpenAI language model service.
 *
 * @category models
 * @since 1.0.0
 */
export interface OpenAiLanguageModelOptions {
  readonly model: string;
  readonly api?: OpenAiApi;
  readonly client?: OpenAI;
  readonly clientOptions?: ClientOptions;
}

/**
 * OpenAI API surface used by the language model service.
 *
 * @category models
 * @since 1.0.0
 */
export type OpenAiApi = "responses" | "chatCompletions";

interface ChatAssistantState {
  readonly text: globalThis.Array<string>;
  readonly toolCalls: globalThis.Array<ChatCompletionMessageToolCall>;
}

const emptyChatAssistantState: ChatAssistantState = {
  text: [],
  toolCalls: [],
};

/**
 * Builds a language model service backed by the official OpenAI SDK.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = (options: OpenAiLanguageModelOptions): LanguageModel.LanguageModel => {
  const client = options.client ?? new OpenAI(options.clientOptions);
  return fromClient(client, options.model, options.api);
};

/**
 * Builds a language model layer backed by the official OpenAI SDK.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer = (options: OpenAiLanguageModelOptions) => LanguageModel.layer(make(options));

/**
 * Converts an existing OpenAI client and model ID to this project's LanguageModel.
 *
 * @category constructors
 * @since 1.0.0
 */
export const fromClient = (client: OpenAI, model: string, api: OpenAiApi = "responses"): LanguageModel.LanguageModel =>
  api === "chatCompletions" ? fromChatCompletionsClient(client, model) : fromResponsesClient(client, model);

/**
 * Converts an existing OpenAI client and model ID to a Responses API LanguageModel.
 *
 * @category constructors
 * @since 1.0.0
 */
export const fromResponsesClient = (client: OpenAI, model: string): LanguageModel.LanguageModel =>
  LanguageModel.make({
    provider: "openai",
    model,
    generate: (options) =>
      Effect.tryPromise({
        try: (signal) =>
          client.responses.create(toCreateParams(options, model), {
            signal: mergeAbortSignals(options.abortSignal, signal),
            headers: toHeaders(options.headers),
          }),
        catch: (cause) => toLanguageModelError(cause, model),
      }).pipe(Effect.flatMap((response) => mapGenerateResult(response, model))),
    stream: (options) =>
      Effect.tryPromise({
        try: async (signal) => {
          const body = toCreateParams(options, model, true);
          const result = await client.responses
            .create(body, {
              signal: mergeAbortSignals(options.abortSignal, signal),
              headers: toHeaders(options.headers),
            })
            .withResponse();
          return fromStreamResult(result.data, result.request_id, options.includeRaw, model);
        },
        catch: (cause) => toLanguageModelError(cause, model),
      }),
  });

/**
 * Converts an existing OpenAI client and model ID to a Chat Completions LanguageModel.
 *
 * @category constructors
 * @since 1.0.0
 */
export const fromChatCompletionsClient = (client: OpenAI, model: string): LanguageModel.LanguageModel =>
  LanguageModel.make({
    provider: "openai",
    model,
    generate: (options) =>
      Effect.tryPromise({
        try: (signal) =>
          client.chat.completions.create(toChatCreateParams(options, model), {
            signal: mergeAbortSignals(options.abortSignal, signal),
            headers: toHeaders(options.headers),
          }),
        catch: (cause) => toLanguageModelError(cause, model),
      }).pipe(Effect.flatMap((completion) => mapChatGenerateResult(completion, model))),
    stream: (options) =>
      Effect.tryPromise({
        try: async (signal) => {
          const body = toChatCreateParams(options, model, true);
          const result = await client.chat.completions
            .create(body, {
              signal: mergeAbortSignals(options.abortSignal, signal),
              headers: toHeaders(options.headers),
            })
            .withResponse();
          return fromChatStreamResult(result.data, result.request_id, options.includeRaw, model);
        },
        catch: (cause) => toLanguageModelError(cause, model),
      }),
  });

function toCreateParams(
  options: LanguageModel.GenerateOptions,
  model: string,
  stream?: false,
): ResponseCreateParamsNonStreaming;
function toCreateParams(
  options: LanguageModel.GenerateOptions,
  model: string,
  stream: true,
): ResponseCreateParamsStreaming;
function toCreateParams(
  options: LanguageModel.GenerateOptions,
  model: string,
  stream = false,
): ResponseCreateParamsBase {
  return {
    model,
    input: toInput(options.prompt),
    ...optional("max_output_tokens", options.maxOutputTokens),
    ...optional("temperature", options.temperature),
    ...optional("top_p", options.topP),
    ...optional("text", toTextConfig(options.responseFormat)),
    ...optional("tools", toTools(options.tools)),
    ...optional("tool_choice", toToolChoice(options.toolChoice)),
    ...openAiProviderOptions(options.providerOptions),
    ...(stream ? { stream: true } : {}),
  };
}

function toChatCreateParams(
  options: LanguageModel.GenerateOptions,
  model: string,
  stream?: false,
): ChatCompletionCreateParamsNonStreaming;
function toChatCreateParams(
  options: LanguageModel.GenerateOptions,
  model: string,
  stream: true,
): ChatCompletionCreateParamsStreaming;
function toChatCreateParams(
  options: LanguageModel.GenerateOptions,
  model: string,
  stream = false,
): ChatCompletionCreateParamsBase {
  return {
    model,
    messages: toChatMessages(options.prompt),
    ...optional("max_completion_tokens", options.maxOutputTokens),
    ...optional("temperature", options.temperature),
    ...optional("stop", options.stopSequences === undefined ? undefined : [...options.stopSequences]),
    ...optional("top_p", options.topP),
    ...optional("presence_penalty", options.presencePenalty),
    ...optional("frequency_penalty", options.frequencyPenalty),
    ...optional("response_format", toChatResponseFormat(options.responseFormat)),
    ...optional("seed", options.seed),
    ...optional("tools", toChatTools(options.tools)),
    ...optional("tool_choice", toChatToolChoice(options.toolChoice)),
    ...openAiChatProviderOptions(options.providerOptions),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
}

const toInput = (prompt: LanguageModel.Prompt): ResponseInput =>
  Array.flatMap(
    prompt,
    (message): ReadonlyArray<ResponseInputItem> =>
      Match.value(message).pipe(
        Match.when({ role: "system" }, (message) => [
          {
            role: "system",
            content: message.content,
          } satisfies EasyInputMessage,
        ]),
        Match.when({ role: "user" }, (message) => [
          {
            role: "user",
            content: Array.map(message.content, toInputContent),
          } satisfies EasyInputMessage,
        ]),
        Match.when({ role: "assistant" }, (message) => [
          {
            role: "assistant",
            content: Array.join(Array.map(message.content, toAssistantContent), ""),
          } satisfies EasyInputMessage,
        ]),
        Match.when({ role: "tool" }, (message) => Array.map(message.content, toFunctionCallOutput)),
        Match.exhaustive,
      ),
  );

const toInputContent = (part: LanguageModel.TextPart | LanguageModel.FilePart): ResponseInputContent =>
  Match.value(part).pipe(
    Match.tag(
      "Text",
      (part) =>
        ({
          type: "input_text",
          text: part.text,
        }) satisfies ResponseInputContent,
    ),
    Match.tag("File", toFileInput),
    Match.exhaustive,
  );

const toFileInput = (part: LanguageModel.FilePart): ResponseInputContent => {
  if (part.mediaType.startsWith("image/")) {
    return {
      type: "input_image",
      detail: "auto",
      image_url: toUrlOrDataUrl(part.data, part.mediaType),
    };
  }
  const file = {
    type: "input_file",
    ...optional("filename", part.filename),
  } satisfies ResponseInputContent;
  if (part.data instanceof URL) {
    return { ...file, file_url: part.data.toString() } satisfies ResponseInputContent;
  }
  return {
    ...file,
    file_data: encodeDataContent(part.data),
  } satisfies ResponseInputContent;
};

const toAssistantContent = (
  part:
    | LanguageModel.TextPart
    | LanguageModel.FilePart
    | LanguageModel.ReasoningPart
    | LanguageModel.ToolCallPart
    | LanguageModel.ToolResultPart,
): string =>
  Match.value(part).pipe(
    Match.tag("Text", (part) => part.text),
    Match.tag("Reasoning", (part) => part.text),
    Match.tag("File", () => unsupported("assistant file prompt parts")),
    Match.tag("ToolCall", () => unsupported("assistant tool call prompt parts")),
    Match.tag("ToolResult", () => unsupported("assistant tool result prompt parts")),
    Match.exhaustive,
  );

const toFunctionCallOutput = (
  part: LanguageModel.ToolResultPart | LanguageModel.ToolApprovalResponsePart,
): ResponseInputItem =>
  Match.value(part).pipe(
    Match.tag(
      "ToolResult",
      (part) =>
        ({
          type: "function_call_output",
          call_id: part.id,
          output: toToolResultOutput(part.output),
        }) satisfies ResponseInputItem,
    ),
    Match.tag("ToolApprovalResponse", () => unsupported("tool approval response prompt parts")),
    Match.exhaustive,
  );

const toToolResultOutput = (output: LanguageModel.ToolResultOutput): string =>
  Match.value(output).pipe(
    Match.tag("Text", (output) => output.value),
    Match.tag("Json", (output) => JSON.stringify(output.value)),
    Match.tag("ExecutionDenied", (output) => output.reason ?? "Tool execution denied"),
    Match.exhaustive,
  );

const toChatMessages = (prompt: LanguageModel.Prompt): Array<ChatCompletionMessageParam> =>
  Array.flatMap(
    prompt,
    (message): ReadonlyArray<ChatCompletionMessageParam> =>
      Match.value(message).pipe(
        Match.when({ role: "system" }, (message) => [
          {
            role: "system",
            content: message.content,
          } satisfies ChatCompletionMessageParam,
        ]),
        Match.when({ role: "user" }, (message) => [
          {
            role: "user",
            content: Array.map(message.content, toChatContentPart),
          } satisfies ChatCompletionMessageParam,
        ]),
        Match.when({ role: "assistant" }, (message) => [toChatAssistantMessage(message)]),
        Match.when({ role: "tool" }, (message) => Array.map(message.content, toChatToolMessage)),
        Match.exhaustive,
      ),
  );

const toChatContentPart = (part: LanguageModel.TextPart | LanguageModel.FilePart): ChatCompletionContentPart =>
  Match.value(part).pipe(
    Match.tag(
      "Text",
      (part) =>
        ({
          type: "text",
          text: part.text,
        }) satisfies ChatCompletionContentPartText,
    ),
    Match.tag("File", toChatFilePart),
    Match.exhaustive,
  );

const toChatFilePart = (part: LanguageModel.FilePart): ChatCompletionContentPart => {
  if (part.mediaType.startsWith("image/")) {
    return {
      type: "image_url",
      image_url: {
        url: toUrlOrDataUrl(part.data, part.mediaType),
        detail: "auto",
      },
    };
  }
  if (part.data instanceof URL) {
    return unsupported("non-image URL file prompt parts in Chat Completions");
  }
  return {
    type: "file",
    file: {
      file_data: encodeDataContent(part.data),
      ...optional("filename", part.filename),
    },
  };
};

const toChatAssistantMessage = (message: LanguageModel.AssistantMessage): ChatCompletionAssistantMessageParam => {
  const state = Array.reduce(message.content, emptyChatAssistantState, (state, part) =>
    Match.value(part).pipe(
      Match.tag("Text", (part) => ({ ...state, text: Array.append(state.text, part.text) })),
      Match.tag("Reasoning", (part) => ({ ...state, text: Array.append(state.text, part.text) })),
      Match.tag("ToolCall", (part) => ({ ...state, toolCalls: Array.append(state.toolCalls, toChatToolCall(part)) })),
      Match.tag("File", () => unsupported("assistant file prompt parts in Chat Completions")),
      Match.tag("ToolResult", () => unsupported("assistant tool result prompt parts in Chat Completions")),
      Match.exhaustive,
    ),
  );
  return {
    role: "assistant",
    content: state.text.length === 0 ? null : Array.join(state.text, ""),
    ...optional("tool_calls", state.toolCalls.length === 0 ? undefined : state.toolCalls),
  };
};

const toChatToolCall = (part: LanguageModel.ToolCallPart): ChatCompletionMessageFunctionToolCall => ({
  type: "function",
  id: part.id,
  function: {
    name: part.name,
    arguments: typeof part.input === "string" ? part.input : JSON.stringify(part.input),
  },
});

const toChatToolMessage = (
  part: LanguageModel.ToolResultPart | LanguageModel.ToolApprovalResponsePart,
): ChatCompletionMessageParam =>
  Match.value(part).pipe(
    Match.tag(
      "ToolResult",
      (part) =>
        ({
          role: "tool",
          tool_call_id: part.id,
          content: toToolResultOutput(part.output),
        }) satisfies ChatCompletionMessageParam,
    ),
    Match.tag("ToolApprovalResponse", () => unsupported("tool approval response prompt parts in Chat Completions")),
    Match.exhaustive,
  );

const toTextConfig = (
  responseFormat: LanguageModel.GenerateOptions["responseFormat"],
): ResponseCreateParamsBase["text"] => {
  if (responseFormat === undefined) {
    return undefined;
  }
  return Match.value(responseFormat).pipe(
    Match.tag("Text", () => ({ format: { type: "text" } satisfies ResponseFormatTextConfig })),
    Match.tag("Json", (format) => ({
      format:
        format.schema === undefined
          ? ({ type: "json_object" } satisfies ResponseFormatTextConfig)
          : ({
              type: "json_schema",
              name: format.name ?? "response",
              schema: format.schema as Record<string, unknown>,
              ...optional("description", format.description),
            } satisfies ResponseFormatTextConfig),
    })),
    Match.exhaustive,
  );
};

const toChatResponseFormat = (
  responseFormat: LanguageModel.GenerateOptions["responseFormat"],
): ChatCompletionCreateParamsBase["response_format"] => {
  if (responseFormat === undefined) {
    return undefined;
  }
  return Match.value(responseFormat).pipe(
    Match.tag("Text", () => ({ type: "text" as const })),
    Match.tag("Json", (format) =>
      format.schema === undefined
        ? { type: "json_object" as const }
        : ({
            type: "json_schema",
            json_schema: {
              name: format.name ?? "response",
              schema: format.schema === undefined || typeof format.schema === "boolean" ? {} : format.schema,
              ...optional("description", format.description),
            },
          } satisfies NonNullable<ChatCompletionCreateParamsBase["response_format"]>),
    ),
    Match.exhaustive,
  );
};

const toTools = (tools: LanguageModel.GenerateOptions["tools"]): Array<Tool> | undefined =>
  tools === undefined
    ? undefined
    : Array.map(tools, (tool) =>
        Match.value(tool).pipe(
          Match.tag(
            "Function",
            (tool) =>
              ({
                type: "function",
                name: tool.name,
                parameters:
                  tool.input === true ? {} : tool.input === false ? null : (tool.input as Record<string, unknown>),
                strict: tool.strict ?? null,
                ...optional("description", tool.description),
              }) satisfies ResponseFunctionTool,
          ),
          Match.tag("Provider", (tool) => unsupported(`provider tool ${tool.id}`)),
          Match.exhaustive,
        ),
      );

const toChatTools = (tools: LanguageModel.GenerateOptions["tools"]): Array<ChatCompletionTool> | undefined =>
  tools === undefined
    ? undefined
    : Array.map(tools, (tool) =>
        Match.value(tool).pipe(
          Match.tag(
            "Function",
            (tool) =>
              ({
                type: "function",
                function: {
                  name: tool.name,
                  parameters:
                    tool.input === true ? {} : tool.input === false ? {} : (tool.input as Record<string, unknown>),
                  strict: tool.strict ?? null,
                  ...optional("description", tool.description),
                },
              }) satisfies ChatCompletionFunctionTool,
          ),
          Match.tag("Provider", (tool) => unsupported(`provider tool ${tool.id} in Chat Completions`)),
          Match.exhaustive,
        ),
      );

const toToolChoice = (
  toolChoice: LanguageModel.GenerateOptions["toolChoice"],
): ToolChoiceOptions | ToolChoiceFunction | undefined => {
  if (toolChoice === undefined) {
    return undefined;
  }
  return Match.value(toolChoice).pipe(
    Match.tag("Auto", () => "auto" as const),
    Match.tag("None", () => "none" as const),
    Match.tag("Required", () => "required" as const),
    Match.tag(
      "Named",
      (toolChoice) =>
        ({
          type: "function",
          name: toolChoice.name,
        }) satisfies ToolChoiceFunction,
    ),
    Match.exhaustive,
  );
};

const toChatToolChoice = (
  toolChoice: LanguageModel.GenerateOptions["toolChoice"],
): ChatCompletionToolChoiceOption | undefined => {
  if (toolChoice === undefined) {
    return undefined;
  }
  return Match.value(toolChoice).pipe(
    Match.tag("Auto", () => "auto" as const),
    Match.tag("None", () => "none" as const),
    Match.tag("Required", () => "required" as const),
    Match.tag(
      "Named",
      (toolChoice) =>
        ({
          type: "function",
          function: { name: toolChoice.name },
        }) satisfies ChatCompletionNamedToolChoice,
    ),
    Match.exhaustive,
  );
};

const mapGenerateResult = (
  response: Response,
  model: string,
): Effect.Effect<LanguageModel.GenerateResult, LanguageModel.LanguageModelError> => {
  try {
    return Effect.succeed(fromResponse(response));
  } catch (cause) {
    return Effect.fail(toLanguageModelError(cause, model));
  }
};

const mapChatGenerateResult = (
  completion: ChatCompletion,
  model: string,
): Effect.Effect<LanguageModel.GenerateResult, LanguageModel.LanguageModelError> => {
  try {
    return Effect.succeed(fromChatCompletion(completion));
  } catch (cause) {
    return Effect.fail(toLanguageModelError(cause, model));
  }
};

const fromResponse = (response: Response): LanguageModel.GenerateResult => ({
  content: Array.flatMap(response.output, fromOutputItem),
  finish: fromResponseFinish(response),
  usage: fromUsage(response.usage),
  ...optional("response", {
    id: response.id,
    timestamp: new Date(response.created_at * 1000),
    model: response.model,
    ...optional("body", response),
  }),
  warnings: [],
});

const fromStreamResult = (
  stream: AsyncIterable<ResponseStreamEvent>,
  requestId: string | null,
  includeRaw: boolean | undefined,
  model: string,
): LanguageModel.StreamResult => ({
  stream: Stream.fromAsyncIterable(stream, (cause) => toLanguageModelError(cause, model)).pipe(
    Stream.mapEffect((event) => {
      try {
        return Effect.succeed(fromStreamEvent(event, includeRaw));
      } catch (cause) {
        return Effect.fail(toLanguageModelError(cause, model));
      }
    }),
    Stream.filter((part): part is LanguageModel.StreamPart => part !== undefined),
  ),
  ...optional("response", requestId === null ? undefined : { headers: { "x-request-id": requestId } }),
});

const fromChatCompletion = (completion: ChatCompletion): LanguageModel.GenerateResult => {
  const choice = completion.choices[0];
  return {
    content: choice === undefined ? [] : fromChatMessage(choice.message),
    finish: choice === undefined ? { reason: "Other" } : fromChatFinishReason(choice.finish_reason),
    usage: fromChatUsage(completion.usage),
    response: {
      id: completion.id,
      timestamp: new Date(completion.created * 1000),
      model: completion.model,
      body: completion,
    },
    warnings: [],
  };
};

const fromChatStreamResult = (
  stream: AsyncIterable<ChatCompletionChunk>,
  requestId: string | null,
  includeRaw: boolean | undefined,
  model: string,
): LanguageModel.StreamResult => ({
  stream: Stream.fromAsyncIterable(stream, (cause) => toLanguageModelError(cause, model)).pipe(
    Stream.mapEffect((chunk) => {
      try {
        return Effect.succeed(fromChatChunk(chunk, includeRaw));
      } catch (cause) {
        return Effect.fail(toLanguageModelError(cause, model));
      }
    }),
    Stream.flatMap((parts) => Stream.fromIterable(parts)),
  ),
  ...optional("response", requestId === null ? undefined : { headers: { "x-request-id": requestId } }),
});

const fromOutputItem = (item: ResponseOutputItem): ReadonlyArray<LanguageModel.Content> =>
  Match.value(item).pipe(
    Match.discriminator("type")("message", (item) => Array.map(item.content, fromMessageContent)),
    Match.discriminator("type")("function_call", (item) => [fromFunctionToolCall(item)]),
    Match.discriminator("type")("function_call_output", (item) => [fromFunctionToolCallOutput(item)]),
    Match.orElse(() => []),
  );

const fromMessageContent = (content: ResponseOutputMessage["content"][number]): LanguageModel.Text =>
  Match.value(content).pipe(
    Match.discriminator("type")(
      "output_text",
      (content) => ({ _tag: "Text", text: content.text }) satisfies LanguageModel.Text,
    ),
    Match.discriminator("type")(
      "refusal",
      (content) => ({ _tag: "Text", text: content.refusal }) satisfies LanguageModel.Text,
    ),
    Match.exhaustive,
  );

const fromChatMessage = (
  message: ChatCompletion["choices"][number]["message"],
): ReadonlyArray<LanguageModel.Content> => [
  ...optionalArray(
    message.content === null ? undefined : ({ _tag: "Text", text: message.content } satisfies LanguageModel.Text),
  ),
  ...optionalArray(
    message.refusal === null || message.refusal === undefined
      ? undefined
      : ({ _tag: "Text", text: message.refusal } satisfies LanguageModel.Text),
  ),
  ...Array.map(message.tool_calls ?? [], fromChatToolCall),
];

const fromChatToolCall = (call: ChatCompletionMessageToolCall): LanguageModel.ToolCall =>
  Match.value(call).pipe(
    Match.discriminator("type")(
      "function",
      (call) =>
        ({
          _tag: "ToolCall",
          id: call.id,
          name: call.function.name,
          input: call.function.arguments,
        }) satisfies LanguageModel.ToolCall,
    ),
    Match.discriminator("type")(
      "custom",
      (call) =>
        ({
          _tag: "ToolCall",
          id: call.id,
          name: call.custom.name,
          input: call.custom.input,
        }) satisfies LanguageModel.ToolCall,
    ),
    Match.exhaustive,
  );

const fromFunctionToolCall = (call: ResponseFunctionToolCall): LanguageModel.ToolCall => ({
  _tag: "ToolCall",
  id: call.call_id,
  name: call.name,
  input: call.arguments,
});

const fromFunctionToolCallOutput = (output: {
  readonly call_id: string;
  readonly output: unknown;
}): LanguageModel.ToolResult => ({
  _tag: "ToolResult",
  id: output.call_id,
  name: "",
  result: output.output as NonNullable<LanguageModel.ToolResult["result"]>,
});

const fromStreamEvent = (
  event: ResponseStreamEvent,
  includeRaw: boolean | undefined,
): LanguageModel.StreamPart | undefined =>
  Match.value(event).pipe(
    Match.discriminator("type")(
      "response.created",
      () => ({ _tag: "StreamStart", warnings: [] }) satisfies LanguageModel.StreamStartPart,
    ),
    Match.discriminator("type")(
      "response.in_progress",
      (event) =>
        ({
          _tag: "ResponseMetadata",
          id: event.response.id,
          timestamp: new Date(event.response.created_at * 1000),
          model: event.response.model,
        }) satisfies LanguageModel.ResponseMetadataStreamPart,
    ),
    Match.discriminator("type")("response.content_part.added", (event) =>
      Match.value(event.part).pipe(
        Match.discriminator("type")(
          "output_text",
          () => ({ _tag: "TextStart" as const, id: event.item_id }) satisfies LanguageModel.TextStartStreamPart,
        ),
        Match.discriminator("type")(
          "reasoning_text",
          () =>
            ({ _tag: "ReasoningStart" as const, id: event.item_id }) satisfies LanguageModel.ReasoningStartStreamPart,
        ),
        Match.orElse(() => raw(event, includeRaw)),
      ),
    ),
    Match.discriminator("type")("response.output_item.added", (event) =>
      Match.value(event.item).pipe(
        Match.discriminator("type")(
          "function_call",
          (item) =>
            ({
              _tag: "ToolInputStart",
              id: item.call_id,
              name: item.name,
            }) satisfies LanguageModel.ToolInputStartStreamPart,
        ),
        Match.orElse(() => raw(event, includeRaw)),
      ),
    ),
    Match.discriminator("type")(
      "response.output_text.delta",
      (event) =>
        ({
          _tag: "TextDelta",
          id: event.item_id,
          delta: event.delta,
        }) satisfies LanguageModel.TextDeltaStreamPart,
    ),
    Match.discriminator("type")(
      "response.output_text.done",
      (event) => ({ _tag: "TextEnd", id: event.item_id }) satisfies LanguageModel.TextEndStreamPart,
    ),
    Match.discriminator("type")(
      "response.reasoning_text.delta",
      (event) =>
        ({
          _tag: "ReasoningDelta",
          id: event.item_id,
          delta: event.delta,
        }) satisfies LanguageModel.ReasoningDeltaStreamPart,
    ),
    Match.discriminator("type")(
      "response.reasoning_text.done",
      (event) => ({ _tag: "ReasoningEnd", id: event.item_id }) satisfies LanguageModel.ReasoningEndStreamPart,
    ),
    Match.discriminator("type")(
      "response.function_call_arguments.delta",
      (event) =>
        ({
          _tag: "ToolInputDelta",
          id: event.item_id,
          delta: event.delta,
        }) satisfies LanguageModel.ToolInputDeltaStreamPart,
    ),
    Match.discriminator("type")(
      "response.function_call_arguments.done",
      (event) => ({ _tag: "ToolInputEnd", id: event.item_id }) satisfies LanguageModel.ToolInputEndStreamPart,
    ),
    Match.discriminator("type")("response.output_item.done", (event) =>
      Match.value(event.item).pipe(
        Match.discriminator("type")("function_call", fromFunctionToolCall),
        Match.orElse(() => raw(event, includeRaw)),
      ),
    ),
    Match.discriminator("type")(
      "response.completed",
      "response.failed",
      "response.incomplete",
      (event) =>
        ({
          _tag: "Finish",
          usage: fromUsage(event.response.usage),
          finish: fromResponseFinish(event.response),
        }) satisfies LanguageModel.FinishStreamPart,
    ),
    Match.discriminator("type")(
      "error",
      (event) => ({ _tag: "Error", error: event }) satisfies LanguageModel.ErrorStreamPart,
    ),
    Match.orElse((event) => raw(event, includeRaw)),
  );

const fromChatChunk = (
  chunk: ChatCompletionChunk,
  includeRaw: boolean | undefined,
): ReadonlyArray<LanguageModel.StreamPart> => {
  const parts = Array.reduce(chunk.choices, [] as globalThis.Array<LanguageModel.StreamPart>, (parts, choice) => {
    const roleParts = Array.appendAll(
      optionalArray(
        choice.delta.role === undefined
          ? undefined
          : ({ _tag: "StreamStart", warnings: [] } satisfies LanguageModel.StreamPart),
      ),
      optionalArray(
        choice.delta.role === undefined
          ? undefined
          : ({
              _tag: "ResponseMetadata",
              id: chunk.id,
              timestamp: new Date(chunk.created * 1000),
              model: chunk.model,
            } satisfies LanguageModel.StreamPart),
      ),
    );
    const textParts = Array.appendAll(
      optionalArray(
        choice.delta.content === undefined || choice.delta.content === null
          ? undefined
          : ({
              _tag: "TextDelta",
              id: chatTextId(choice.index),
              delta: choice.delta.content,
            } satisfies LanguageModel.StreamPart),
      ),
      optionalArray(
        choice.delta.refusal === undefined || choice.delta.refusal === null
          ? undefined
          : ({
              _tag: "TextDelta",
              id: chatTextId(choice.index),
              delta: choice.delta.refusal,
            } satisfies LanguageModel.StreamPart),
      ),
    );
    const toolParts = Array.reduce(
      choice.delta.tool_calls ?? [],
      [] as globalThis.Array<LanguageModel.StreamPart>,
      (parts, call) =>
        Array.appendAll(
          Array.appendAll(
            parts,
            optionalArray(
              call.id === undefined && call.function?.name === undefined
                ? undefined
                : ({
                    _tag: "ToolInputStart",
                    id: call.id ?? chatToolId(choice.index, call.index),
                    name: call.function?.name ?? "",
                  } satisfies LanguageModel.StreamPart),
            ),
          ),
          optionalArray(
            call.function?.arguments === undefined
              ? undefined
              : ({
                  _tag: "ToolInputDelta",
                  id: call.id ?? chatToolId(choice.index, call.index),
                  delta: call.function.arguments,
                } satisfies LanguageModel.StreamPart),
          ),
        ),
    );
    return Array.appendAll(
      parts,
      Array.appendAll(
        Array.appendAll(roleParts, textParts),
        Array.appendAll(
          toolParts,
          optionalArray(
            choice.finish_reason === null
              ? undefined
              : ({
                  _tag: "Finish",
                  usage: fromChatUsage(chunk.usage),
                  finish: fromChatFinishReason(choice.finish_reason),
                } satisfies LanguageModel.StreamPart),
          ),
        ),
      ),
    );
  });
  return Array.appendAll(
    Array.appendAll(
      parts,
      optionalArray(
        chunk.usage !== undefined && chunk.usage !== null && chunk.choices.length === 0
          ? ({
              _tag: "Finish",
              usage: fromChatUsage(chunk.usage),
              finish: { reason: "Stop" },
            } satisfies LanguageModel.StreamPart)
          : undefined,
      ),
    ),
    optionalArray(includeRaw ? ({ _tag: "Raw", value: chunk } satisfies LanguageModel.StreamPart) : undefined),
  );
};

const fromResponseFinish = (response: Response): LanguageModel.Finish => {
  if (response.error !== null) {
    return { reason: "Error", ...optional("providerReason", response.error.code ?? undefined) };
  }
  if (response.incomplete_details !== null) {
    return {
      reason: response.incomplete_details.reason === "max_output_tokens" ? "Length" : "Other",
      ...optional("providerReason", response.incomplete_details.reason),
    };
  }
  if (Array.some(response.output, (item) => item.type === "function_call")) {
    return { reason: "ToolCalls", ...optional("providerReason", response.status) };
  }
  return {
    reason: response.status === "completed" ? "Stop" : "Other",
    ...optional("providerReason", response.status),
  };
};

const fromUsage = (usage: ResponseUsage | null | undefined): LanguageModel.Usage => ({
  inputTokens: {
    total: usage?.input_tokens,
    uncached:
      usage === null || usage === undefined ? undefined : usage.input_tokens - usage.input_tokens_details.cached_tokens,
    cacheRead: usage?.input_tokens_details.cached_tokens,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: usage?.output_tokens,
    text:
      usage === null || usage === undefined
        ? undefined
        : usage.output_tokens - usage.output_tokens_details.reasoning_tokens,
    reasoning: usage?.output_tokens_details.reasoning_tokens,
  },
  ...optional("raw", usage === null || usage === undefined ? undefined : { total_tokens: usage.total_tokens }),
});

const fromChatFinishReason = (finishReason: ChatCompletion["choices"][number]["finish_reason"]): LanguageModel.Finish =>
  Match.value(finishReason).pipe(
    Match.when(
      "stop",
      (finishReason) => ({ reason: "Stop" as const, providerReason: finishReason }) satisfies LanguageModel.Finish,
    ),
    Match.when(
      "length",
      (finishReason) => ({ reason: "Length" as const, providerReason: finishReason }) satisfies LanguageModel.Finish,
    ),
    Match.when(
      "content_filter",
      (finishReason) =>
        ({ reason: "ContentFilter" as const, providerReason: finishReason }) satisfies LanguageModel.Finish,
    ),
    Match.whenOr(
      "tool_calls",
      "function_call",
      (finishReason) => ({ reason: "ToolCalls" as const, providerReason: finishReason }) satisfies LanguageModel.Finish,
    ),
    Match.exhaustive,
  );

const fromChatUsage = (usage: CompletionUsage | null | undefined): LanguageModel.Usage => ({
  inputTokens: {
    total: usage?.prompt_tokens,
    uncached:
      usage === null || usage === undefined
        ? undefined
        : usage.prompt_tokens - (usage.prompt_tokens_details?.cached_tokens ?? 0),
    cacheRead: usage?.prompt_tokens_details?.cached_tokens,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: usage?.completion_tokens,
    text:
      usage === null || usage === undefined
        ? undefined
        : usage.completion_tokens - (usage.completion_tokens_details?.reasoning_tokens ?? 0),
    reasoning: usage?.completion_tokens_details?.reasoning_tokens,
  },
  ...optional("raw", usage === null || usage === undefined ? undefined : { total_tokens: usage.total_tokens }),
});

const openAiProviderOptions = (
  providerOptions: LanguageModel.GenerateOptions["providerOptions"],
): Partial<ResponseCreateParamsBase> => {
  const openai = providerOptions?.["openai"];
  return openai === undefined ? {} : (openai as Partial<ResponseCreateParamsBase>);
};

const openAiChatProviderOptions = (
  providerOptions: LanguageModel.GenerateOptions["providerOptions"],
): Partial<ChatCompletionCreateParamsBase> => {
  const openai = providerOptions?.["openai"];
  return openai === undefined ? {} : (openai as Partial<ChatCompletionCreateParamsBase>);
};

const raw = (event: ResponseStreamEvent, includeRaw: boolean | undefined): LanguageModel.RawStreamPart | undefined =>
  includeRaw ? { _tag: "Raw", value: event } : undefined;

const toUrlOrDataUrl = (data: LanguageModel.DataContent, mediaType: string): string => {
  if (data instanceof URL) {
    return data.toString();
  }
  return `data:${mediaType};base64,${encodeDataContent(data)}`;
};

const encodeDataContent = (data: Exclude<LanguageModel.DataContent, URL>): string =>
  typeof data === "string" ? data : Buffer.from(data).toString("base64");

const chatTextId = (choiceIndex: number): string => `chat-${choiceIndex}-text`;

const chatToolId = (choiceIndex: number, toolIndex: number): string => `chat-${choiceIndex}-tool-${toolIndex}`;

const toHeaders = (
  headers: Readonly<Record<string, string | undefined>> | undefined,
): Record<string, string> | undefined => {
  if (headers === undefined) {
    return undefined;
  }
  return Record.filter(headers, (value): value is string => value !== undefined);
};

const mergeAbortSignals = (first: AbortSignal | undefined, second: AbortSignal): AbortSignal => {
  if (first === undefined || first === second) {
    return second;
  }
  const controller = new AbortController();
  const abortFromFirst = () => controller.abort(first.reason);
  const abortFromSecond = () => controller.abort(second.reason);

  if (first.aborted) {
    abortFromFirst();
    return controller.signal;
  }
  if (second.aborted) {
    abortFromSecond();
    return controller.signal;
  }
  first.addEventListener("abort", abortFromFirst, { once: true });
  second.addEventListener("abort", abortFromSecond, { once: true });
  return controller.signal;
};

const toLanguageModelError = (cause: unknown, model: string): LanguageModel.LanguageModelError => {
  if (cause instanceof LanguageModel.LanguageModelError) {
    return cause;
  }
  if (cause instanceof APIUserAbortError || isAbortError(cause)) {
    return new LanguageModel.LanguageModelError({
      reason: "Aborted",
      message: getErrorMessage(cause),
      provider: "openai",
      model,
      cause,
    });
  }
  if (cause instanceof APIError && cause.status === 400) {
    return new LanguageModel.LanguageModelError({
      reason: "InvalidPrompt",
      message: getErrorMessage(cause),
      provider: "openai",
      model,
      cause,
    });
  }
  return new LanguageModel.LanguageModelError({
    reason: cause instanceof LanguageModel.LanguageModelError ? cause.reason : "Provider",
    message: getErrorMessage(cause),
    provider: "openai",
    model,
    cause,
  });
};

const unsupported = (feature: string): never => {
  throw new LanguageModel.LanguageModelError({
    reason: "Unsupported",
    message: `OpenAI adapter cannot represent ${feature}.`,
  });
};

const isAbortError = (cause: unknown): boolean => hasStringProperty(cause, "name") && cause.name === "AbortError";

const getErrorMessage = (cause: unknown): string => {
  if (cause === undefined || cause === null) {
    return "unknown error";
  }
  if (typeof cause === "string") {
    return cause;
  }
  if (cause instanceof Error) {
    return cause.toString();
  }
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
};

const hasStringProperty = <K extends string>(value: unknown, key: K): value is { readonly [P in K]: string } => {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return false;
  }
  return typeof (value as Record<K, unknown>)[key] === "string";
};

const optional = <K extends string, V>(key: K, value: V | undefined): { readonly [P in K]: V } | {} =>
  value === undefined ? {} : ({ [key]: value } as { readonly [P in K]: V });

const optionalArray = <A>(value: A | undefined): ReadonlyArray<A> => (value === undefined ? [] : [value]);
