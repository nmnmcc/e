/**
 * Adapter from the official Anthropic SDK to this project's language model service.
 *
 * @since 1.0.0
 */
import AnthropicClient, { APIError, APIUserAbortError, type ClientOptions } from "@anthropic-ai/sdk";
import * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Record from "effect/Record";
import type * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

/**
 * Options for building an Anthropic language model service.
 *
 * @category models
 * @since 1.0.0
 */
export interface AnthropicLanguageModelOptions {
  readonly model: string;
  readonly client?: AnthropicClient;
  readonly clientOptions?: ClientOptions;
  readonly defaultMaxTokens?: number | undefined;
}

/**
 * Builds a language model service backed by the official Anthropic SDK.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = (options: AnthropicLanguageModelOptions): LanguageModel.LanguageModel => {
  const client = options.client ?? new AnthropicClient(options.clientOptions);
  return fromClient(client, options.model, options.defaultMaxTokens);
};

/**
 * Builds a language model layer backed by the official Anthropic SDK.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer = (options: AnthropicLanguageModelOptions) => LanguageModel.layer(make(options));

/**
 * Converts an existing Anthropic client and model ID to this project's LanguageModel.
 *
 * @category constructors
 * @since 1.0.0
 */
export const fromClient = (
  client: AnthropicClient,
  model: string,
  defaultMaxTokens = 4096,
): LanguageModel.LanguageModel =>
  LanguageModel.make({
    provider: "anthropic",
    model,
    generate: (options) =>
      Effect.tryPromise({
        try: (signal) => {
          const body = toCreateParams(options, model, defaultMaxTokens);
          return client.messages
            .create(body, {
              signal: mergeAbortSignals(options.abortSignal, signal),
              headers: toHeaders(options.headers),
            })
            .withResponse();
        },
        catch: (cause) => toLanguageModelError(cause, model),
      }).pipe(
        Effect.flatMap((response) => mapGenerateResult(response.data, response.request_id, response.response, model)),
      ),
    stream: (options) =>
      Effect.tryPromise({
        try: async (signal) => {
          const body = toCreateParams(options, model, defaultMaxTokens, true);
          const result = await client.messages
            .create(body, {
              signal: mergeAbortSignals(options.abortSignal, signal),
              headers: toHeaders(options.headers),
            })
            .withResponse();
          return fromStreamResult(result.data, result.request_id, options.includeRaw, model, body);
        },
        catch: (cause) => toLanguageModelError(cause, model),
      }),
  });

function toCreateParams(
  options: LanguageModel.GenerateOptions,
  model: string,
  defaultMaxTokens: number,
  stream?: false,
): AnthropicClient.MessageCreateParamsNonStreaming;
function toCreateParams(
  options: LanguageModel.GenerateOptions,
  model: string,
  defaultMaxTokens: number,
  stream: true,
): AnthropicClient.MessageCreateParamsStreaming;
function toCreateParams(
  options: LanguageModel.GenerateOptions,
  model: string,
  defaultMaxTokens: number,
  stream = false,
): AnthropicClient.MessageCreateParams {
  return {
    model,
    max_tokens: options.maxOutputTokens ?? defaultMaxTokens,
    messages: toMessages(options.prompt),
    ...optional("system", toSystem(options.prompt)),
    ...optional("temperature", options.temperature),
    ...optional("stop_sequences", options.stopSequences === undefined ? undefined : [...options.stopSequences]),
    ...optional("top_p", options.topP),
    ...optional("top_k", options.topK),
    ...optional("tools", toTools(options.tools)),
    ...optional("tool_choice", toToolChoice(options.toolChoice)),
    ...optional("output_config", toOutputConfig(options.responseFormat)),
    ...anthropicProviderOptions(options.providerOptions),
    ...(stream ? { stream: true } : {}),
  } as AnthropicClient.MessageCreateParams;
}

const toSystem = (prompt: LanguageModel.Prompt): ReadonlyArray<AnthropicClient.TextBlockParam> | undefined => {
  const blocks = Array.flatMap(
    prompt,
    (message): ReadonlyArray<AnthropicClient.TextBlockParam> =>
      Match.value(message).pipe(
        Match.when({ role: "system" }, (message) => [
          {
            type: "text",
            text: message.content,
            ...anthropicPartOptions(message),
          } satisfies AnthropicClient.TextBlockParam,
        ]),
        Match.orElse(() => []),
      ),
  );
  return blocks.length === 0 ? undefined : blocks;
};

const toMessages = (prompt: LanguageModel.Prompt): Array<AnthropicClient.MessageParam> =>
  Array.flatMap(
    prompt,
    (message): ReadonlyArray<AnthropicClient.MessageParam> =>
      Match.value(message).pipe(
        Match.when({ role: "system" }, () => []),
        Match.when({ role: "user" }, (message) => [
          {
            role: "user",
            content: Array.map(message.content, toUserContent),
          } satisfies AnthropicClient.MessageParam,
        ]),
        Match.when({ role: "assistant" }, (message) => [
          {
            role: "assistant",
            content: Array.map(message.content, toAssistantContent),
          } satisfies AnthropicClient.MessageParam,
        ]),
        Match.when({ role: "tool" }, (message) => [
          {
            role: "user",
            content: Array.map(message.content, toToolResultContent),
          } satisfies AnthropicClient.MessageParam,
        ]),
        Match.exhaustive,
      ),
  );

const toUserContent = (part: LanguageModel.TextPart | LanguageModel.FilePart): AnthropicClient.ContentBlockParam =>
  Match.value(part).pipe(
    Match.tag(
      "Text",
      (part) =>
        ({
          type: "text",
          text: part.text,
          ...anthropicPartOptions<AnthropicClient.TextBlockParam>(part),
        }) satisfies AnthropicClient.TextBlockParam,
    ),
    Match.tag("File", toFileContent),
    Match.exhaustive,
  );

const toAssistantContent = (
  part:
    | LanguageModel.TextPart
    | LanguageModel.FilePart
    | LanguageModel.ReasoningPart
    | LanguageModel.ToolCallPart
    | LanguageModel.ToolResultPart,
): AnthropicClient.ContentBlockParam =>
  Match.value(part).pipe(
    Match.tag(
      "Text",
      (part) =>
        ({
          type: "text",
          text: part.text,
          ...anthropicPartOptions<AnthropicClient.TextBlockParam>(part),
        }) satisfies AnthropicClient.TextBlockParam,
    ),
    Match.tag(
      "Reasoning",
      (part) =>
        ({
          type: "thinking",
          thinking: part.text,
          signature: "",
        }) satisfies AnthropicClient.ThinkingBlockParam,
    ),
    Match.tag("ToolCall", toToolUseContent),
    Match.tag("File", () => unsupported("assistant file prompt parts")),
    Match.tag("ToolResult", () => unsupported("assistant tool result prompt parts")),
    Match.exhaustive,
  );

const toFileContent = (part: LanguageModel.FilePart): AnthropicClient.ContentBlockParam => {
  if (part.mediaType.startsWith("image/")) {
    return {
      type: "image",
      source: toImageSource(part),
      ...anthropicPartOptions<AnthropicClient.ImageBlockParam>(part),
    } satisfies AnthropicClient.ImageBlockParam;
  }
  if (part.mediaType === "application/pdf") {
    return {
      type: "document",
      source: toPdfSource(part),
      title: part.filename ?? null,
      ...anthropicPartOptions<AnthropicClient.DocumentBlockParam>(part),
    } satisfies AnthropicClient.DocumentBlockParam;
  }
  if (part.mediaType === "text/plain") {
    return {
      type: "document",
      source: {
        type: "text",
        media_type: "text/plain",
        data: toTextData(part.data),
      },
      title: part.filename ?? null,
      ...anthropicPartOptions<AnthropicClient.DocumentBlockParam>(part),
    } satisfies AnthropicClient.DocumentBlockParam;
  }
  return unsupported(`file prompt part with media type ${part.mediaType}`);
};

const toImageSource = (part: LanguageModel.FilePart): AnthropicClient.ImageBlockParam["source"] => {
  if (part.data instanceof URL) {
    return {
      type: "url",
      url: part.data.toString(),
    };
  }
  if (!isAnthropicImageMediaType(part.mediaType)) {
    return unsupported(`image media type ${part.mediaType}`);
  }
  return {
    type: "base64",
    media_type: part.mediaType,
    data: encodeDataContent(part.data),
  };
};

const toPdfSource = (part: LanguageModel.FilePart): AnthropicClient.DocumentBlockParam["source"] => {
  if (part.data instanceof URL) {
    return {
      type: "url",
      url: part.data.toString(),
    };
  }
  return {
    type: "base64",
    media_type: "application/pdf",
    data: encodeDataContent(part.data),
  };
};

const toTextData = (data: LanguageModel.DataContent): string => {
  if (data instanceof URL) {
    return unsupported("URL text/plain file prompt parts");
  }
  return typeof data === "string" ? data : Buffer.from(data).toString("utf8");
};

const toToolUseContent = (part: LanguageModel.ToolCallPart): AnthropicClient.ToolUseBlockParam => ({
  type: "tool_use",
  id: part.id,
  name: part.name,
  input: part.input,
  ...anthropicPartOptions<AnthropicClient.ToolUseBlockParam>(part),
});

const toToolResultContent = (
  part: LanguageModel.ToolResultPart | LanguageModel.ToolApprovalResponsePart,
): AnthropicClient.ToolResultBlockParam =>
  Match.value(part).pipe(
    Match.tag(
      "ToolResult",
      (part) =>
        ({
          type: "tool_result",
          tool_use_id: part.id,
          content: toToolResultOutput(part.output),
          ...anthropicPartOptions<AnthropicClient.ToolResultBlockParam>(part),
        }) satisfies AnthropicClient.ToolResultBlockParam,
    ),
    Match.tag(
      "ToolApprovalResponse",
      (part) =>
        ({
          type: "tool_result",
          tool_use_id: part.id,
          content: part.reason ?? (part.approved ? "Tool execution approved" : "Tool execution denied"),
          is_error: !part.approved,
          ...anthropicPartOptions<AnthropicClient.ToolResultBlockParam>(part),
        }) satisfies AnthropicClient.ToolResultBlockParam,
    ),
    Match.exhaustive,
  );

const toToolResultOutput = (output: LanguageModel.ToolResultOutput): string =>
  Match.value(output).pipe(
    Match.tag("Text", (output) => output.value),
    Match.tag("Json", (output) => JSON.stringify(output.value)),
    Match.tag("ExecutionDenied", (output) => output.reason ?? "Tool execution denied"),
    Match.exhaustive,
  );

const toTools = (tools: LanguageModel.GenerateOptions["tools"]): Array<AnthropicClient.ToolUnion> | undefined =>
  tools === undefined
    ? undefined
    : Array.map(tools, (tool) =>
        Match.value(tool).pipe(
          Match.tag(
            "Function",
            (tool) =>
              ({
                type: "custom",
                name: tool.name,
                input_schema: toInputSchema(tool.input),
                ...optional("strict", tool.strict),
                ...optional(
                  "input_examples",
                  tool.inputExamples === undefined ? undefined : Array.map(tool.inputExamples, (_) => _.input),
                ),
                ...optional("description", tool.description),
                ...anthropicToolOptions(tool),
              }) satisfies AnthropicClient.Tool,
          ),
          Match.tag("Provider", (tool) => unsupported(`provider tool ${tool.id}`)),
          Match.exhaustive,
        ),
      );

const toInputSchema = (schema: LanguageModel.JsonSchema): AnthropicClient.Tool.InputSchema => {
  if (schema === true || schema === false) {
    return { type: "object" };
  }
  return {
    ...schema,
    type: "object",
  } as AnthropicClient.Tool.InputSchema;
};

const toToolChoice = (
  toolChoice: LanguageModel.GenerateOptions["toolChoice"],
): AnthropicClient.ToolChoice | undefined => {
  if (toolChoice === undefined) {
    return undefined;
  }
  return Match.value(toolChoice).pipe(
    Match.tag("Auto", () => ({ type: "auto" as const })),
    Match.tag("None", () => ({ type: "none" as const })),
    Match.tag("Required", () => ({ type: "any" as const })),
    Match.tag("Named", (toolChoice) => ({ type: "tool" as const, name: toolChoice.name })),
    Match.exhaustive,
  );
};

const toOutputConfig = (
  responseFormat: LanguageModel.GenerateOptions["responseFormat"],
): AnthropicClient.OutputConfig | undefined => {
  if (responseFormat === undefined) {
    return undefined;
  }
  return Match.value(responseFormat).pipe(
    Match.tag("Text", () => undefined),
    Match.tag(
      "Json",
      (format) =>
        ({
          format: {
            type: "json_schema",
            schema: format.schema === undefined || typeof format.schema === "boolean" ? {} : format.schema,
          },
        }) satisfies AnthropicClient.OutputConfig,
    ),
    Match.exhaustive,
  );
};

const mapGenerateResult = (
  message: AnthropicClient.Message,
  requestId: string | null | undefined,
  response: Response,
  model: string,
): Effect.Effect<LanguageModel.GenerateResult, LanguageModel.LanguageModelError> => {
  try {
    return Effect.succeed(fromMessage(message, requestId, response));
  } catch (cause) {
    return Effect.fail(toLanguageModelError(cause, model));
  }
};

const fromMessage = (
  message: AnthropicClient.Message,
  requestId: string | null | undefined,
  response: Response,
): LanguageModel.GenerateResult => ({
  content: Array.flatMap(message.content, fromContentBlock),
  finish: fromStopReason(message.stop_reason),
  usage: fromUsage(message.usage),
  response: {
    id: message.id,
    model: message.model,
    body: message,
    ...optional("headers", requestHeaders(requestId)),
  },
  providerMetadata: fromProviderMetadata(message.usage, response),
  warnings: [],
});

const fromStreamResult = (
  stream: AsyncIterable<AnthropicClient.RawMessageStreamEvent>,
  requestId: string | null | undefined,
  includeRaw: boolean | undefined,
  model: string,
  body: AnthropicClient.MessageCreateParamsStreaming,
): LanguageModel.StreamResult => ({
  stream: Stream.fromAsyncIterable(stream, (cause) => toLanguageModelError(cause, model)).pipe(
    Stream.mapEffect((event) => {
      try {
        return Effect.succeed(fromStreamEvent(event, includeRaw));
      } catch (cause) {
        return Effect.fail(toLanguageModelError(cause, model));
      }
    }),
    Stream.flatMap((parts) => Stream.fromIterable(parts)),
  ),
  request: {
    body,
  },
  ...optional("response", responseHeaders(requestId)),
});

const fromContentBlock = (block: AnthropicClient.ContentBlock): ReadonlyArray<LanguageModel.Content> =>
  optionalArray(
    Match.value(block).pipe(
      Match.discriminator("type")(
        "text",
        (block) =>
          ({
            _tag: "Text",
            text: block.text,
          }) satisfies LanguageModel.Text,
      ),
      Match.discriminator("type")(
        "thinking",
        (block) =>
          ({
            _tag: "Reasoning",
            text: block.thinking,
          }) satisfies LanguageModel.Reasoning,
      ),
      Match.discriminator("type")(
        "redacted_thinking",
        (block) =>
          ({
            _tag: "Reasoning",
            text: block.data,
          }) satisfies LanguageModel.Reasoning,
      ),
      Match.discriminator("type")("tool_use", fromToolUseBlock),
      Match.discriminator("type")("server_tool_use", fromServerToolUseBlock),
      Match.orElse(() => undefined),
    ),
  );

const fromToolUseBlock = (block: AnthropicClient.ToolUseBlock): LanguageModel.ToolCall => ({
  _tag: "ToolCall",
  id: block.id,
  name: block.name,
  input: toJsonString(block.input),
  providerExecuted: false,
});

const fromServerToolUseBlock = (block: AnthropicClient.ServerToolUseBlock): LanguageModel.ToolCall => ({
  _tag: "ToolCall",
  id: block.id,
  name: block.name,
  input: toJsonString(block.input),
  providerExecuted: true,
});

const fromStreamEvent = (
  event: AnthropicClient.RawMessageStreamEvent,
  includeRaw: boolean | undefined,
): ReadonlyArray<LanguageModel.StreamPart> =>
  Array.appendAll(
    Match.value(event).pipe(
      Match.discriminator("type")("message_start", (event) => [
        { _tag: "StreamStart", warnings: [] } satisfies LanguageModel.StreamStartPart,
        {
          _tag: "ResponseMetadata",
          id: event.message.id,
          model: event.message.model,
        } satisfies LanguageModel.ResponseMetadataStreamPart,
      ]),
      Match.discriminator("type")("content_block_start", fromContentBlockStart),
      Match.discriminator("type")("content_block_delta", fromContentBlockDelta),
      Match.discriminator("type")("message_delta", (event) => [
        {
          _tag: "Finish",
          usage: fromDeltaUsage(event.usage),
          finish: fromStopReason(event.delta.stop_reason),
        } satisfies LanguageModel.FinishStreamPart,
      ]),
      Match.discriminator("type")("message_stop", () => []),
      Match.discriminator("type")("content_block_stop", () => []),
      Match.exhaustive,
    ),
    optionalArray(raw(event, includeRaw)),
  );

const fromContentBlockStart = (
  event: AnthropicClient.RawContentBlockStartEvent,
): ReadonlyArray<LanguageModel.StreamPart> =>
  Match.value(event.content_block).pipe(
    Match.discriminator("type")("text", () => [
      { _tag: "TextStart", id: blockId(event.index) } satisfies LanguageModel.TextStartStreamPart,
    ]),
    Match.discriminator("type")("thinking", () => [
      { _tag: "ReasoningStart", id: blockId(event.index) } satisfies LanguageModel.ReasoningStartStreamPart,
    ]),
    Match.discriminator("type")("tool_use", (block) => [
      {
        _tag: "ToolInputStart",
        id: block.id,
        name: block.name,
        providerExecuted: false,
      } satisfies LanguageModel.ToolInputStartStreamPart,
    ]),
    Match.discriminator("type")("server_tool_use", (block) => [
      {
        _tag: "ToolInputStart",
        id: block.id,
        name: block.name,
        providerExecuted: true,
      } satisfies LanguageModel.ToolInputStartStreamPart,
    ]),
    Match.orElse(() => []),
  );

const fromContentBlockDelta = (
  event: AnthropicClient.RawContentBlockDeltaEvent,
): ReadonlyArray<LanguageModel.StreamPart> =>
  optionalArray(
    Match.value(event.delta).pipe(
      Match.discriminator("type")(
        "text_delta",
        (delta) =>
          ({
            _tag: "TextDelta",
            id: blockId(event.index),
            delta: delta.text,
          }) satisfies LanguageModel.TextDeltaStreamPart,
      ),
      Match.discriminator("type")(
        "thinking_delta",
        (delta) =>
          ({
            _tag: "ReasoningDelta",
            id: blockId(event.index),
            delta: delta.thinking,
          }) satisfies LanguageModel.ReasoningDeltaStreamPart,
      ),
      Match.discriminator("type")(
        "input_json_delta",
        (delta) =>
          ({
            _tag: "ToolInputDelta",
            id: blockId(event.index),
            delta: delta.partial_json,
          }) satisfies LanguageModel.ToolInputDeltaStreamPart,
      ),
      Match.orElse(() => undefined),
    ),
  );

const fromStopReason = (reason: AnthropicClient.StopReason | null): LanguageModel.Finish =>
  Match.value(reason).pipe(
    Match.when(null, () => ({ reason: "Other" as const })),
    Match.when("end_turn", (reason) => ({ reason: "Stop" as const, providerReason: reason })),
    Match.when("max_tokens", (reason) => ({ reason: "Length" as const, providerReason: reason })),
    Match.when("stop_sequence", (reason) => ({ reason: "Stop" as const, providerReason: reason })),
    Match.when("tool_use", (reason) => ({ reason: "ToolCalls" as const, providerReason: reason })),
    Match.when("pause_turn", (reason) => ({ reason: "Other" as const, providerReason: reason })),
    Match.when("refusal", (reason) => ({ reason: "ContentFilter" as const, providerReason: reason })),
    Match.exhaustive,
  );

const fromUsage = (usage: AnthropicClient.Usage): LanguageModel.Usage => ({
  inputTokens: {
    total: usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    uncached: usage.input_tokens,
    cacheRead: usage.cache_read_input_tokens ?? undefined,
    cacheWrite: usage.cache_creation_input_tokens ?? undefined,
  },
  outputTokens: {
    total: usage.output_tokens,
    text: usage.output_tokens - (usage.output_tokens_details?.thinking_tokens ?? 0),
    reasoning: usage.output_tokens_details?.thinking_tokens,
  },
  raw: {
    service_tier: usage.service_tier,
    inference_geo: usage.inference_geo,
  },
});

const fromDeltaUsage = (usage: AnthropicClient.MessageDeltaUsage): LanguageModel.Usage => ({
  inputTokens: {
    total:
      usage.input_tokens === null
        ? undefined
        : usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    uncached: usage.input_tokens ?? undefined,
    cacheRead: usage.cache_read_input_tokens ?? undefined,
    cacheWrite: usage.cache_creation_input_tokens ?? undefined,
  },
  outputTokens: {
    total: usage.output_tokens,
    text: usage.output_tokens - (usage.output_tokens_details?.thinking_tokens ?? 0),
    reasoning: usage.output_tokens_details?.thinking_tokens,
  },
  raw:
    usage.server_tool_use === null
      ? {}
      : ({
          server_tool_use: usage.server_tool_use as unknown as Schema.JsonObject,
        } satisfies Schema.JsonObject),
});

const fromProviderMetadata = (usage: AnthropicClient.Usage, response: Response): LanguageModel.ProviderMetadata => ({
  anthropic: {
    request_id: response.headers.get("request-id"),
    service_tier: usage.service_tier,
    inference_geo: usage.inference_geo,
    server_tool_use: usage.server_tool_use as unknown as Schema.Json,
  },
});

const anthropicProviderOptions = (
  providerOptions: LanguageModel.GenerateOptions["providerOptions"],
): Partial<AnthropicClient.MessageCreateParams> => {
  const anthropic = providerOptions?.["anthropic"];
  return anthropic === undefined ? {} : (anthropic as Partial<AnthropicClient.MessageCreateParams>);
};

const anthropicPartOptions = <A extends object>(part: LanguageModel.ProviderOptionsPart): Partial<A> => {
  const anthropic = part.providerOptions?.["anthropic"];
  return anthropic === undefined ? {} : (anthropic as Partial<A>);
};

const anthropicToolOptions = (tool: LanguageModel.FunctionTool): Partial<AnthropicClient.Tool> => {
  const anthropic = tool.providerOptions?.["anthropic"];
  return anthropic === undefined ? {} : (anthropic as Partial<AnthropicClient.Tool>);
};

const raw = (
  event: AnthropicClient.RawMessageStreamEvent,
  includeRaw: boolean | undefined,
): LanguageModel.RawStreamPart | undefined => (includeRaw ? { _tag: "Raw", value: event } : undefined);

const requestHeaders = (requestId: string | null | undefined): LanguageModel.Headers | undefined =>
  requestId === null || requestId === undefined ? undefined : { "request-id": requestId };

const responseHeaders = (
  requestId: string | null | undefined,
): { readonly headers: LanguageModel.Headers } | undefined =>
  requestId === null || requestId === undefined ? undefined : { headers: { "request-id": requestId } };

const blockId = (index: number): string => `anthropic-${index}`;

const toJsonString = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value));

const isAnthropicImageMediaType = (mediaType: string): mediaType is AnthropicClient.Base64ImageSource["media_type"] =>
  mediaType === "image/jpeg" || mediaType === "image/png" || mediaType === "image/gif" || mediaType === "image/webp";

const encodeDataContent = (data: Exclude<LanguageModel.DataContent, URL>): string =>
  typeof data === "string" ? data : Buffer.from(data).toString("base64");

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
      provider: "anthropic",
      model,
      cause,
    });
  }
  if (cause instanceof APIError && (cause.status === 400 || cause.status === 422)) {
    return new LanguageModel.LanguageModelError({
      reason: "InvalidPrompt",
      message: getErrorMessage(cause),
      provider: "anthropic",
      model,
      cause,
    });
  }
  return new LanguageModel.LanguageModelError({
    reason: cause instanceof LanguageModel.LanguageModelError ? cause.reason : "Provider",
    message: getErrorMessage(cause),
    provider: "anthropic",
    model,
    cause,
  });
};

const unsupported = (feature: string): never => {
  throw new LanguageModel.LanguageModelError({
    reason: "Unsupported",
    message: `Anthropic adapter cannot represent ${feature}.`,
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
