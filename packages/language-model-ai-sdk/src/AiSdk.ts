/**
 * Adapter from AI SDK language models to this project's language model service.
 *
 * @since 1.0.0
 */
import { InvalidArgumentError, InvalidPromptError, UnsupportedFunctionalityError } from "@ai-sdk/provider";
import type {
  JSONSchema7,
  JSONObject,
  JSONValue,
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FilePart,
  LanguageModelV2FinishReason,
  LanguageModelV2FunctionTool,
  LanguageModelV2ProviderDefinedTool,
  LanguageModelV2ReasoningPart,
  LanguageModelV2StreamPart,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultPart,
  LanguageModelV2Usage,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3File,
  LanguageModelV3FilePart,
  LanguageModelV3FinishReason,
  LanguageModelV3FunctionTool,
  LanguageModelV3ProviderTool,
  LanguageModelV3ReasoningPart,
  LanguageModelV3StreamPart,
  LanguageModelV3TextPart,
  LanguageModelV3ToolApprovalResponsePart,
  LanguageModelV3ToolCallPart,
  LanguageModelV3ToolResultPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as EffectRecord from "effect/Record";
import * as Stream from "effect/Stream";
import * as Struct from "effect/Struct";

/**
 * AI SDK language model versions supported by this adapter.
 *
 * @category models
 * @since 1.0.0
 */
export type AiSdkLanguageModel = LanguageModelV2 | LanguageModelV3;

type V2TextOrFilePart = LanguageModelV2TextPart | LanguageModelV2FilePart;
type V2AssistantPart =
  | V2TextOrFilePart
  | LanguageModelV2ReasoningPart
  | LanguageModelV2ToolCallPart
  | LanguageModelV2ToolResultPart;
type V3TextOrFilePart = LanguageModelV3TextPart | LanguageModelV3FilePart;
type V3AssistantPart =
  | V3TextOrFilePart
  | LanguageModelV3ReasoningPart
  | LanguageModelV3ToolCallPart
  | LanguageModelV3ToolResultPart;
type V3ToolMessagePart = LanguageModelV3ToolResultPart | LanguageModelV3ToolApprovalResponsePart;
type AiSdkWarning =
  | LanguageModelV2CallWarning
  | {
      readonly type: "unsupported" | "compatibility" | "deprecated" | "other";
      readonly feature?: string;
      readonly details?: string;
      readonly setting?: string;
      readonly message?: string;
    };

/**
 * Converts any supported AI SDK language model to this project's LanguageModel.
 *
 * @category constructors
 * @since 1.0.0
 */
export const fromLanguageModel = (model: AiSdkLanguageModel): LanguageModel.LanguageModel => {
  return Match.value(model).pipe(
    Match.when({ specificationVersion: "v2" }, fromLanguageModelV2),
    Match.when({ specificationVersion: "v3" }, fromLanguageModelV3),
    Match.exhaustive,
  );
};

/**
 * Converts an AI SDK LanguageModelV2 to this project's LanguageModel.
 *
 * @category constructors
 * @since 1.0.0
 */
export const fromLanguageModelV2 = (model: LanguageModelV2): LanguageModel.LanguageModel =>
  LanguageModel.make({
    provider: model.provider,
    model: model.modelId,
    generate: (options) =>
      Effect.tryPromise({
        try: (signal) => {
          const { abortSignal, cleanup } = mergeAbortSignals(options.abortSignal, signal);
          return Promise.resolve(model.doGenerate(toV2CallOptions(options, abortSignal))).finally(cleanup);
        },
        catch: (cause) => toLanguageModelError(cause, model),
      }).pipe(Effect.flatMap((result) => mapGenerateResult(result, model, fromV2GenerateResult))),
    stream: (options) =>
      Effect.tryPromise({
        try: (signal) => {
          const { abortSignal, cleanup } = mergeAbortSignals(options.abortSignal, signal);
          return Promise.resolve(model.doStream(toV2CallOptions(options, abortSignal))).finally(cleanup);
        },
        catch: (cause) => toLanguageModelError(cause, model),
      }).pipe(Effect.map((result) => fromStreamResult(result, model, fromV2StreamPart))),
  });

/**
 * Converts an AI SDK LanguageModelV3 to this project's LanguageModel.
 *
 * @category constructors
 * @since 1.0.0
 */
export const fromLanguageModelV3 = (model: LanguageModelV3): LanguageModel.LanguageModel =>
  LanguageModel.make({
    provider: model.provider,
    model: model.modelId,
    generate: (options) =>
      Effect.tryPromise({
        try: (signal) => {
          const { abortSignal, cleanup } = mergeAbortSignals(options.abortSignal, signal);
          return Promise.resolve(model.doGenerate(toV3CallOptions(options, abortSignal))).finally(cleanup);
        },
        catch: (cause) => toLanguageModelError(cause, model),
      }).pipe(Effect.flatMap((result) => mapGenerateResult(result, model, fromV3GenerateResult))),
    stream: (options) =>
      Effect.tryPromise({
        try: (signal) => {
          const { abortSignal, cleanup } = mergeAbortSignals(options.abortSignal, signal);
          return Promise.resolve(model.doStream(toV3CallOptions(options, abortSignal))).finally(cleanup);
        },
        catch: (cause) => toLanguageModelError(cause, model),
      }).pipe(Effect.map((result) => fromStreamResult(result, model, fromV3StreamPart))),
  });

const toV2CallOptions = (
  options: LanguageModel.GenerateOptions,
  abortSignal: AbortSignal,
): LanguageModelV2CallOptions => ({
  prompt: toV2Prompt(options.prompt),
  ...optional("maxOutputTokens", options.maxOutputTokens),
  ...optional("temperature", options.temperature),
  ...optional("stopSequences", options.stopSequences === undefined ? undefined : [...options.stopSequences]),
  ...optional("topP", options.topP),
  ...optional("topK", options.topK),
  ...optional("presencePenalty", options.presencePenalty),
  ...optional("frequencyPenalty", options.frequencyPenalty),
  ...optional("responseFormat", toResponseFormat(options.responseFormat)),
  ...optional("seed", options.seed),
  ...optional("tools", toV2Tools(options.tools)),
  ...optional("toolChoice", toToolChoice(options.toolChoice)),
  ...optional("includeRawChunks", options.includeRaw),
  abortSignal,
  ...optional("headers", options.headers),
  ...optional("providerOptions", options.providerOptions as LanguageModelV2CallOptions["providerOptions"] | undefined),
});

const toV3CallOptions = (
  options: LanguageModel.GenerateOptions,
  abortSignal: AbortSignal,
): LanguageModelV3CallOptions => ({
  prompt: toV3Prompt(options.prompt),
  ...optional("maxOutputTokens", options.maxOutputTokens),
  ...optional("temperature", options.temperature),
  ...optional("stopSequences", options.stopSequences === undefined ? undefined : [...options.stopSequences]),
  ...optional("topP", options.topP),
  ...optional("topK", options.topK),
  ...optional("presencePenalty", options.presencePenalty),
  ...optional("frequencyPenalty", options.frequencyPenalty),
  ...optional("responseFormat", toResponseFormat(options.responseFormat)),
  ...optional("seed", options.seed),
  ...optional("tools", toV3Tools(options.tools)),
  ...optional("toolChoice", toToolChoice(options.toolChoice)),
  ...optional("includeRawChunks", options.includeRaw),
  abortSignal,
  ...optional("headers", options.headers),
  ...optional("providerOptions", options.providerOptions as LanguageModelV3CallOptions["providerOptions"] | undefined),
});

const toV2Prompt = (prompt: LanguageModel.Prompt): LanguageModelV2CallOptions["prompt"] =>
  prompt.map((message) =>
    Match.value(message).pipe(
      Match.when(
        { role: "system" },
        (message) =>
          ({
            role: "system",
            content: message.content,
            ...v2ProviderOptions(message),
          }) satisfies LanguageModelV2CallOptions["prompt"][number],
      ),
      Match.when(
        { role: "user" },
        (message) =>
          ({
            role: "user",
            content: message.content.map(toV2TextOrFilePart),
            ...v2ProviderOptions(message),
          }) satisfies LanguageModelV2CallOptions["prompt"][number],
      ),
      Match.when(
        { role: "assistant" },
        (message) =>
          ({
            role: "assistant",
            content: message.content.map(toV2AssistantPart),
            ...v2ProviderOptions(message),
          }) satisfies LanguageModelV2CallOptions["prompt"][number],
      ),
      Match.when(
        { role: "tool" },
        (message) =>
          ({
            role: "tool",
            content: message.content.map(toV2ToolMessagePart),
            ...v2ProviderOptions(message),
          }) satisfies LanguageModelV2CallOptions["prompt"][number],
      ),
      Match.exhaustive,
    ),
  );

const toV3Prompt = (prompt: LanguageModel.Prompt): LanguageModelV3CallOptions["prompt"] =>
  prompt.map((message) =>
    Match.value(message).pipe(
      Match.when(
        { role: "system" },
        (message) =>
          ({
            role: "system",
            content: message.content,
            ...v3ProviderOptions(message),
          }) satisfies LanguageModelV3CallOptions["prompt"][number],
      ),
      Match.when(
        { role: "user" },
        (message) =>
          ({
            role: "user",
            content: message.content.map(toV3TextOrFilePart),
            ...v3ProviderOptions(message),
          }) satisfies LanguageModelV3CallOptions["prompt"][number],
      ),
      Match.when(
        { role: "assistant" },
        (message) =>
          ({
            role: "assistant",
            content: message.content.map(toV3AssistantPart),
            ...v3ProviderOptions(message),
          }) satisfies LanguageModelV3CallOptions["prompt"][number],
      ),
      Match.when(
        { role: "tool" },
        (message) =>
          ({
            role: "tool",
            content: message.content.map(toV3ToolMessagePart),
            ...v3ProviderOptions(message),
          }) satisfies LanguageModelV3CallOptions["prompt"][number],
      ),
      Match.exhaustive,
    ),
  );

const toV2TextOrFilePart = (part: LanguageModel.TextPart | LanguageModel.FilePart): V2TextOrFilePart =>
  Match.value(part).pipe(
    Match.tag(
      "Text",
      (part) =>
        ({
          type: "text",
          ...Struct.pick(part, ["text"]),
          ...v2ProviderOptions(part),
        }) satisfies LanguageModelV2TextPart,
    ),
    Match.tag(
      "File",
      (part) =>
        ({
          type: "file",
          ...Struct.pick(part, ["data", "mediaType"]),
          ...optional("filename", part.filename),
          ...v2ProviderOptions(part),
        }) satisfies LanguageModelV2FilePart,
    ),
    Match.exhaustive,
  );

const toV3TextOrFilePart = (part: LanguageModel.TextPart | LanguageModel.FilePart): V3TextOrFilePart =>
  Match.value(part).pipe(
    Match.tag(
      "Text",
      (part) =>
        ({
          type: "text",
          ...Struct.pick(part, ["text"]),
          ...v3ProviderOptions(part),
        }) satisfies LanguageModelV3TextPart,
    ),
    Match.tag(
      "File",
      (part) =>
        ({
          type: "file",
          ...Struct.pick(part, ["data", "mediaType"]),
          ...optional("filename", part.filename),
          ...v3ProviderOptions(part),
        }) satisfies LanguageModelV3FilePart,
    ),
    Match.exhaustive,
  );

const toV2AssistantPart = (
  part:
    | LanguageModel.TextPart
    | LanguageModel.FilePart
    | LanguageModel.ReasoningPart
    | LanguageModel.ToolCallPart
    | LanguageModel.ToolResultPart,
): V2AssistantPart =>
  Match.value(part).pipe(
    Match.tag("Text", "File", toV2TextOrFilePart),
    Match.tag(
      "Reasoning",
      (part) =>
        ({
          type: "reasoning",
          ...Struct.pick(part, ["text"]),
          ...v2ProviderOptions(part),
        }) satisfies LanguageModelV2ReasoningPart,
    ),
    Match.tag(
      "ToolCall",
      (part) =>
        ({
          type: "tool-call",
          toolCallId: part.id,
          toolName: part.name,
          input: part.input,
          ...optional("providerExecuted", part.providerExecuted),
          ...v2ProviderOptions(part),
        }) satisfies LanguageModelV2ToolCallPart,
    ),
    Match.tag("ToolResult", toV2ToolResultPart),
    Match.exhaustive,
  );

const toV3AssistantPart = (
  part:
    | LanguageModel.TextPart
    | LanguageModel.FilePart
    | LanguageModel.ReasoningPart
    | LanguageModel.ToolCallPart
    | LanguageModel.ToolResultPart,
): V3AssistantPart =>
  Match.value(part).pipe(
    Match.tag("Text", "File", toV3TextOrFilePart),
    Match.tag(
      "Reasoning",
      (part) =>
        ({
          type: "reasoning",
          ...Struct.pick(part, ["text"]),
          ...v3ProviderOptions(part),
        }) satisfies LanguageModelV3ReasoningPart,
    ),
    Match.tag(
      "ToolCall",
      (part) =>
        ({
          type: "tool-call",
          toolCallId: part.id,
          toolName: part.name,
          input: part.input,
          ...optional("providerExecuted", part.providerExecuted),
          ...v3ProviderOptions(part),
        }) satisfies LanguageModelV3ToolCallPart,
    ),
    Match.tag("ToolResult", toV3ToolResultPart),
    Match.exhaustive,
  );

const toV2ToolMessagePart = (
  part: LanguageModel.ToolResultPart | LanguageModel.ToolApprovalResponsePart,
): LanguageModelV2ToolResultPart =>
  Match.value(part).pipe(
    Match.tag("ToolResult", toV2ToolResultPart),
    Match.tag("ToolApprovalResponse", () => unsupported("tool approval responses in LanguageModelV2 prompts")),
    Match.exhaustive,
  );

const toV3ToolMessagePart = (
  part: LanguageModel.ToolResultPart | LanguageModel.ToolApprovalResponsePart,
): V3ToolMessagePart =>
  Match.value(part).pipe(
    Match.tag("ToolResult", toV3ToolResultPart),
    Match.tag(
      "ToolApprovalResponse",
      (part) =>
        ({
          type: "tool-approval-response",
          approvalId: part.id,
          approved: part.approved,
          ...optional("reason", part.reason),
          ...v3ProviderOptions(part),
        }) satisfies LanguageModelV3ToolApprovalResponsePart,
    ),
    Match.exhaustive,
  );

const toV2ToolResultPart = (part: LanguageModel.ToolResultPart): LanguageModelV2ToolResultPart => ({
  type: "tool-result",
  toolCallId: part.id,
  toolName: part.name,
  output: toV2ToolResultOutput(part.output),
  ...v2ProviderOptions(part),
});

const toV3ToolResultPart = (part: LanguageModel.ToolResultPart): LanguageModelV3ToolResultPart => ({
  type: "tool-result",
  toolCallId: part.id,
  toolName: part.name,
  output: toV3ToolResultOutput(part.output),
  ...v3ProviderOptions(part),
});

const toV2ToolResultOutput = (output: LanguageModel.ToolResultOutput): LanguageModelV2ToolResultPart["output"] =>
  Match.value(output).pipe(
    Match.tag(
      "Text",
      (output) => ({ type: "text", value: output.value }) satisfies LanguageModelV2ToolResultPart["output"],
    ),
    Match.tag(
      "Json",
      (output) =>
        ({ type: "json", value: output.value as JSONValue }) satisfies LanguageModelV2ToolResultPart["output"],
    ),
    Match.tag(
      "ExecutionDenied",
      (output) =>
        ({
          type: "error-text",
          value: output.reason ?? "Tool execution denied",
        }) satisfies LanguageModelV2ToolResultPart["output"],
    ),
    Match.exhaustive,
  );

const toV3ToolResultOutput = (output: LanguageModel.ToolResultOutput): LanguageModelV3ToolResultPart["output"] =>
  Match.value(output).pipe(
    Match.tag(
      "Text",
      (output) => ({ type: "text", value: output.value }) satisfies LanguageModelV3ToolResultPart["output"],
    ),
    Match.tag(
      "Json",
      (output) =>
        ({ type: "json", value: output.value as JSONValue }) satisfies LanguageModelV3ToolResultPart["output"],
    ),
    Match.tag(
      "ExecutionDenied",
      (output) =>
        ({
          type: "execution-denied",
          ...optional("reason", output.reason),
        }) satisfies LanguageModelV3ToolResultPart["output"],
    ),
    Match.exhaustive,
  );

const toResponseFormat = (
  format: LanguageModel.GenerateOptions["responseFormat"],
): LanguageModelV3CallOptions["responseFormat"] => {
  if (format === undefined) {
    return undefined;
  }
  return Match.value(format).pipe(
    Match.tag("Text", () => ({ type: "text" }) satisfies NonNullable<LanguageModelV3CallOptions["responseFormat"]>),
    Match.tag(
      "Json",
      (format) =>
        ({
          type: "json",
          ...optional("schema", format.schema as JSONSchema7 | undefined),
          ...optional("name", format.name),
          ...optional("description", format.description),
        }) satisfies NonNullable<LanguageModelV3CallOptions["responseFormat"]>,
    ),
    Match.exhaustive,
  );
};

const toV2Tools = (
  tools: LanguageModel.GenerateOptions["tools"],
): Array<LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool> | undefined =>
  tools?.map((tool) =>
    Match.value(tool).pipe(
      Match.tag(
        "Function",
        (tool) =>
          ({
            type: "function",
            name: tool.name,
            ...optional("description", tool.description),
            inputSchema: tool.inputSchema as JSONSchema7,
            ...v2ProviderOptions(tool),
          }) satisfies LanguageModelV2FunctionTool,
      ),
      Match.tag(
        "Provider",
        (tool) =>
          ({
            type: "provider-defined",
            id: tool.id,
            name: tool.name,
            args: { ...tool.args },
          }) satisfies LanguageModelV2ProviderDefinedTool,
      ),
      Match.exhaustive,
    ),
  );

const toV3Tools = (
  tools: LanguageModel.GenerateOptions["tools"],
): Array<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool> | undefined =>
  tools?.map((tool) =>
    Match.value(tool).pipe(
      Match.tag(
        "Function",
        (tool) =>
          ({
            type: "function",
            name: tool.name,
            ...optional("description", tool.description),
            inputSchema: tool.inputSchema as JSONSchema7,
            ...optional("inputExamples", toInputExamples(tool.inputExamples)),
            ...optional("strict", tool.strict),
            ...v3ProviderOptions(tool),
          }) satisfies LanguageModelV3FunctionTool,
      ),
      Match.tag(
        "Provider",
        (tool) =>
          ({
            type: "provider",
            id: tool.id,
            name: tool.name,
            args: { ...tool.args },
          }) satisfies LanguageModelV3ProviderTool,
      ),
      Match.exhaustive,
    ),
  );

const toInputExamples = (
  inputExamples: LanguageModel.FunctionTool["inputExamples"],
): Array<{ input: JSONObject }> | undefined =>
  inputExamples?.map((example) => ({ input: example.input as JSONObject }));

const toToolChoice = (
  toolChoice: LanguageModel.GenerateOptions["toolChoice"],
): LanguageModelV3CallOptions["toolChoice"] => {
  if (toolChoice === undefined) {
    return undefined;
  }
  return Match.value(toolChoice).pipe(
    Match.tag("Auto", () => ({ type: "auto" }) satisfies NonNullable<LanguageModelV3CallOptions["toolChoice"]>),
    Match.tag("None", () => ({ type: "none" }) satisfies NonNullable<LanguageModelV3CallOptions["toolChoice"]>),
    Match.tag("Required", () => ({ type: "required" }) satisfies NonNullable<LanguageModelV3CallOptions["toolChoice"]>),
    Match.tag(
      "Named",
      (toolChoice) =>
        ({ type: "tool", toolName: toolChoice.name }) satisfies NonNullable<LanguageModelV3CallOptions["toolChoice"]>,
    ),
    Match.exhaustive,
  );
};

const fromV2GenerateResult = (
  result: Awaited<ReturnType<LanguageModelV2["doGenerate"]>>,
): LanguageModel.GenerateResult => ({
  content: result.content.map(fromV2Content),
  finish: fromV2FinishReason(result.finishReason),
  usage: fromV2Usage(result.usage),
  ...providerMetadata(result),
  ...optional("request", result.request),
  ...optional("response", fromResponseMetadata(result.response)),
  warnings: result.warnings.map(fromWarning),
});

const fromV3GenerateResult = (
  result: Awaited<ReturnType<LanguageModelV3["doGenerate"]>>,
): LanguageModel.GenerateResult => ({
  content: result.content.map(fromV3Content),
  finish: fromV3FinishReason(result.finishReason),
  usage: fromV3Usage(result.usage),
  ...providerMetadata(result),
  ...optional("request", result.request),
  ...optional("response", fromResponseMetadata(result.response)),
  warnings: result.warnings.map(fromWarning),
});

const mapGenerateResult = <Input>(
  result: Input,
  model: AiSdkLanguageModel,
  decode: (result: Input) => LanguageModel.GenerateResult,
): Effect.Effect<LanguageModel.GenerateResult, LanguageModel.LanguageModelError> => {
  try {
    return Effect.succeed(decode(result));
  } catch (cause) {
    return Effect.fail(toLanguageModelError(cause, model));
  }
};

const fromStreamResult = <Part>(
  result: {
    readonly stream: ReadableStream<Part>;
    readonly request?: { readonly body?: unknown };
    readonly response?: { readonly headers?: Record<string, string> };
  },
  model: AiSdkLanguageModel,
  decode: (part: Part) => LanguageModel.StreamPart,
): LanguageModel.StreamResult => ({
  stream: Stream.fromReadableStream({
    evaluate: () => result.stream,
    onError: (cause) => toLanguageModelError(cause, model),
  }).pipe(
    Stream.mapEffect((part) => {
      try {
        return Effect.succeed(decode(part));
      } catch (cause) {
        return Effect.fail(toLanguageModelError(cause, model));
      }
    }),
  ),
  ...optional("request", result.request),
  ...optional("response", result.response),
});

const fromV2Content = (content: LanguageModelV2Content): LanguageModel.Content =>
  Match.value(content).pipe(
    Match.when(
      { type: "text" },
      (content) =>
        ({
          _tag: "Text",
          ...Struct.pick(content, ["text"]),
          ...providerMetadata(content),
        }) satisfies LanguageModel.Text,
    ),
    Match.when(
      { type: "reasoning" },
      (content) =>
        ({
          _tag: "Reasoning",
          ...Struct.pick(content, ["text"]),
          ...providerMetadata(content),
        }) satisfies LanguageModel.Reasoning,
    ),
    Match.when({ type: "file" }, fromV2File),
    Match.when({ type: "source" }, fromSource),
    Match.when({ type: "tool-call" }, fromToolCall),
    Match.when({ type: "tool-result" }, fromV2ToolResult),
    Match.exhaustive,
  );

const fromV3Content = (content: LanguageModelV3Content): LanguageModel.Content =>
  Match.value(content).pipe(
    Match.when(
      { type: "text" },
      (content) =>
        ({
          _tag: "Text",
          ...Struct.pick(content, ["text"]),
          ...providerMetadata(content),
        }) satisfies LanguageModel.Text,
    ),
    Match.when(
      { type: "reasoning" },
      (content) =>
        ({
          _tag: "Reasoning",
          ...Struct.pick(content, ["text"]),
          ...providerMetadata(content),
        }) satisfies LanguageModel.Reasoning,
    ),
    Match.when({ type: "file" }, fromV3File),
    Match.when({ type: "tool-approval-request" }, fromToolApprovalRequest),
    Match.when({ type: "source" }, fromSource),
    Match.when({ type: "tool-call" }, fromToolCall),
    Match.when({ type: "tool-result" }, fromToolResult),
    Match.exhaustive,
  );

const fromV2StreamPart = (part: LanguageModelV2StreamPart): LanguageModel.StreamPart =>
  Match.value(part).pipe(
    Match.when({ type: "text-start" }, fromTextStart),
    Match.when({ type: "text-delta" }, fromTextDelta),
    Match.when({ type: "text-end" }, fromTextEnd),
    Match.when({ type: "reasoning-start" }, fromReasoningStart),
    Match.when({ type: "reasoning-delta" }, fromReasoningDelta),
    Match.when({ type: "reasoning-end" }, fromReasoningEnd),
    Match.when({ type: "tool-input-start" }, fromToolInputStart),
    Match.when({ type: "tool-input-delta" }, fromToolInputDelta),
    Match.when({ type: "tool-input-end" }, fromToolInputEnd),
    Match.when({ type: "tool-call" }, fromToolCall),
    Match.when({ type: "tool-result" }, fromV2ToolResult),
    Match.when({ type: "file" }, fromV2File),
    Match.when({ type: "source" }, fromSource),
    Match.when(
      { type: "stream-start" },
      (part) =>
        ({
          _tag: "StreamStart",
          warnings: part.warnings.map(fromWarning),
        }) satisfies LanguageModel.StreamStartPart,
    ),
    Match.when({ type: "response-metadata" }, fromResponseMetadataStreamPart),
    Match.when(
      { type: "finish" },
      (part) =>
        ({
          _tag: "Finish",
          usage: fromV2Usage(part.usage),
          finish: fromV2FinishReason(part.finishReason),
          ...providerMetadata(part),
        }) satisfies LanguageModel.FinishStreamPart,
    ),
    Match.when(
      { type: "raw" },
      (part) => ({ _tag: "Raw", value: part.rawValue }) satisfies LanguageModel.RawStreamPart,
    ),
    Match.when(
      { type: "error" },
      (part) => ({ _tag: "Error", error: part.error }) satisfies LanguageModel.ErrorStreamPart,
    ),
    Match.exhaustive,
  );

const fromV3StreamPart = (part: LanguageModelV3StreamPart): LanguageModel.StreamPart =>
  Match.value(part).pipe(
    Match.when({ type: "text-start" }, fromTextStart),
    Match.when({ type: "text-delta" }, fromTextDelta),
    Match.when({ type: "text-end" }, fromTextEnd),
    Match.when({ type: "reasoning-start" }, fromReasoningStart),
    Match.when({ type: "reasoning-delta" }, fromReasoningDelta),
    Match.when({ type: "reasoning-end" }, fromReasoningEnd),
    Match.when({ type: "tool-input-start" }, fromToolInputStart),
    Match.when({ type: "tool-input-delta" }, fromToolInputDelta),
    Match.when({ type: "tool-input-end" }, fromToolInputEnd),
    Match.when({ type: "tool-approval-request" }, fromToolApprovalRequest),
    Match.when({ type: "tool-call" }, fromToolCall),
    Match.when({ type: "tool-result" }, fromToolResult),
    Match.when({ type: "file" }, fromV3File),
    Match.when({ type: "source" }, fromSource),
    Match.when(
      { type: "stream-start" },
      (part) =>
        ({
          _tag: "StreamStart",
          warnings: part.warnings.map(fromWarning),
        }) satisfies LanguageModel.StreamStartPart,
    ),
    Match.when({ type: "response-metadata" }, fromResponseMetadataStreamPart),
    Match.when(
      { type: "finish" },
      (part) =>
        ({
          _tag: "Finish",
          usage: fromV3Usage(part.usage),
          finish: fromV3FinishReason(part.finishReason),
          ...providerMetadata(part),
        }) satisfies LanguageModel.FinishStreamPart,
    ),
    Match.when(
      { type: "raw" },
      (part) => ({ _tag: "Raw", value: part.rawValue }) satisfies LanguageModel.RawStreamPart,
    ),
    Match.when(
      { type: "error" },
      (part) => ({ _tag: "Error", error: part.error }) satisfies LanguageModel.ErrorStreamPart,
    ),
    Match.exhaustive,
  );

const fromTextStart = (part: {
  readonly id: string;
  readonly providerMetadata?: unknown;
}): LanguageModel.TextStartStreamPart => ({
  _tag: "TextStart",
  ...Struct.pick(part, ["id"]),
  ...providerMetadata(part),
});

const fromTextDelta = (part: {
  readonly id: string;
  readonly delta: string;
  readonly providerMetadata?: unknown;
}): LanguageModel.TextDeltaStreamPart => ({
  _tag: "TextDelta",
  ...Struct.pick(part, ["id", "delta"]),
  ...providerMetadata(part),
});

const fromTextEnd = (part: {
  readonly id: string;
  readonly providerMetadata?: unknown;
}): LanguageModel.TextEndStreamPart => ({
  _tag: "TextEnd",
  ...Struct.pick(part, ["id"]),
  ...providerMetadata(part),
});

const fromReasoningStart = (part: {
  readonly id: string;
  readonly providerMetadata?: unknown;
}): LanguageModel.ReasoningStartStreamPart => ({
  _tag: "ReasoningStart",
  ...Struct.pick(part, ["id"]),
  ...providerMetadata(part),
});

const fromReasoningDelta = (part: {
  readonly id: string;
  readonly delta: string;
  readonly providerMetadata?: unknown;
}): LanguageModel.ReasoningDeltaStreamPart => ({
  _tag: "ReasoningDelta",
  ...Struct.pick(part, ["id", "delta"]),
  ...providerMetadata(part),
});

const fromReasoningEnd = (part: {
  readonly id: string;
  readonly providerMetadata?: unknown;
}): LanguageModel.ReasoningEndStreamPart => ({
  _tag: "ReasoningEnd",
  ...Struct.pick(part, ["id"]),
  ...providerMetadata(part),
});

const fromToolInputStart = (part: {
  readonly id: string;
  readonly toolName: string;
  readonly providerMetadata?: unknown;
  readonly providerExecuted?: boolean;
  readonly dynamic?: boolean;
  readonly title?: string;
}): LanguageModel.ToolInputStartStreamPart => ({
  _tag: "ToolInputStart",
  id: part.id,
  name: part.toolName,
  ...compactOptional(Struct.pick(part, ["providerExecuted", "dynamic", "title"])),
  ...providerMetadata(part),
});

const fromToolInputDelta = (part: {
  readonly id: string;
  readonly delta: string;
  readonly providerMetadata?: unknown;
}): LanguageModel.ToolInputDeltaStreamPart => ({
  _tag: "ToolInputDelta",
  ...Struct.pick(part, ["id", "delta"]),
  ...providerMetadata(part),
});

const fromToolInputEnd = (part: {
  readonly id: string;
  readonly providerMetadata?: unknown;
}): LanguageModel.ToolInputEndStreamPart => ({
  _tag: "ToolInputEnd",
  ...Struct.pick(part, ["id"]),
  ...providerMetadata(part),
});

const fromToolApprovalRequest = (part: {
  readonly approvalId: string;
  readonly toolCallId: string;
  readonly providerMetadata?: unknown;
}): LanguageModel.ToolApprovalRequest => ({
  _tag: "ToolApprovalRequest",
  id: part.approvalId,
  callId: part.toolCallId,
  ...providerMetadata(part),
});

const fromV2File = (file: { readonly mediaType: string; readonly data: string | Uint8Array }): LanguageModel.File => ({
  _tag: "File",
  mediaType: file.mediaType,
  data: file.data,
});

const fromV3File = (file: LanguageModelV3File): LanguageModel.File => ({
  _tag: "File",
  ...Struct.pick(file, ["mediaType", "data"]),
  ...providerMetadata(file),
});

const fromToolCall = (part: {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: string;
  readonly providerExecuted?: boolean;
  readonly dynamic?: boolean;
  readonly providerMetadata?: unknown;
}): LanguageModel.ToolCall => ({
  _tag: "ToolCall",
  id: part.toolCallId,
  name: part.toolName,
  input: part.input,
  ...compactOptional(Struct.pick(part, ["providerExecuted", "dynamic"])),
  ...providerMetadata(part),
});

const fromV2ToolResult = (part: {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly result: unknown;
  readonly isError?: boolean;
  readonly providerMetadata?: unknown;
}): LanguageModel.ToolResult => ({
  _tag: "ToolResult",
  id: part.toolCallId,
  name: part.toolName,
  result: part.result as LanguageModel.ToolResult["result"],
  ...compactOptional(Struct.pick(part, ["isError"])),
  ...providerMetadata(part),
});

const fromToolResult = (part: {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly result: unknown;
  readonly isError?: boolean;
  readonly preliminary?: boolean;
  readonly dynamic?: boolean;
  readonly providerMetadata?: unknown;
}): LanguageModel.ToolResult => ({
  _tag: "ToolResult",
  id: part.toolCallId,
  name: part.toolName,
  result: part.result as LanguageModel.ToolResult["result"],
  ...compactOptional(Struct.pick(part, ["isError", "preliminary", "dynamic"])),
  ...providerMetadata(part),
});

const fromSource = (source: {
  readonly sourceType: "url" | "document";
  readonly id: string;
  readonly url?: string;
  readonly title?: string;
  readonly mediaType?: string;
  readonly filename?: string;
  readonly providerMetadata?: unknown;
}): LanguageModel.Source =>
  Match.value(source).pipe(
    Match.when(
      { sourceType: "url" },
      (source) =>
        ({
          _tag: "UrlSource",
          id: source.id,
          url: source.url ?? unsupported("URL source without url"),
          ...optional("title", source.title),
          ...providerMetadata(source),
        }) satisfies LanguageModel.UrlSource,
    ),
    Match.when(
      { sourceType: "document" },
      (source) =>
        ({
          _tag: "DocumentSource",
          id: source.id,
          mediaType: source.mediaType ?? unsupported("document source without media type"),
          title: source.title ?? unsupported("document source without title"),
          ...optional("filename", source.filename),
          ...providerMetadata(source),
        }) satisfies LanguageModel.DocumentSource,
    ),
    Match.exhaustive,
  );

const fromResponseMetadata = (
  response:
    | {
        readonly id?: string;
        readonly timestamp?: Date;
        readonly modelId?: string;
        readonly headers?: Record<string, string>;
        readonly body?: unknown;
      }
    | undefined,
):
  | (LanguageModel.ResponseMetadata & { readonly headers?: LanguageModel.Headers; readonly body?: unknown })
  | undefined => {
  if (response === undefined) {
    return undefined;
  }
  return compactOptional({
    id: response.id,
    timestamp: response.timestamp,
    model: response.modelId,
    headers: response.headers,
    body: response.body,
  }) as LanguageModel.ResponseMetadata & { readonly headers?: LanguageModel.Headers; readonly body?: unknown };
};

const fromResponseMetadataStreamPart = (part: {
  readonly id?: string;
  readonly timestamp?: Date;
  readonly modelId?: string;
}): LanguageModel.ResponseMetadataStreamPart => ({
  _tag: "ResponseMetadata",
  ...compactOptional({
    id: part.id,
    timestamp: part.timestamp,
    model: part.modelId,
  }),
});

const fromV2FinishReason = (finishReason: LanguageModelV2FinishReason): LanguageModel.Finish => ({
  reason: fromUnifiedFinishReason(finishReason),
  ...(finishReason === "unknown" ? {} : { providerReason: finishReason }),
});

const fromV3FinishReason = (finishReason: LanguageModelV3FinishReason): LanguageModel.Finish => ({
  reason: fromUnifiedFinishReason(finishReason.unified),
  ...optional("providerReason", finishReason.raw),
});

const fromUnifiedFinishReason = (
  finishReason: LanguageModelV2FinishReason | LanguageModelV3FinishReason["unified"],
): LanguageModel.FinishReason =>
  Match.value(finishReason).pipe(
    Match.when("stop", () => "Stop" as const),
    Match.when("length", () => "Length" as const),
    Match.when("content-filter", () => "ContentFilter" as const),
    Match.when("tool-calls", () => "ToolCalls" as const),
    Match.when("error", () => "Error" as const),
    Match.when("other", () => "Other" as const),
    Match.when("unknown", () => "Other" as const),
    Match.exhaustive,
  );

const fromV2Usage = (usage: LanguageModelV2Usage): LanguageModel.Usage => {
  const raw = usage.totalTokens === undefined ? undefined : { totalTokens: usage.totalTokens };
  return {
    inputTokens: {
      total: usage.inputTokens,
      uncached:
        usage.inputTokens === undefined || usage.cachedInputTokens === undefined
          ? undefined
          : usage.inputTokens - usage.cachedInputTokens,
      cacheRead: usage.cachedInputTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage.outputTokens,
      text:
        usage.outputTokens === undefined || usage.reasoningTokens === undefined
          ? usage.outputTokens
          : usage.outputTokens - usage.reasoningTokens,
      reasoning: usage.reasoningTokens,
    },
    ...optional("raw", raw),
  };
};

const fromV3Usage = (usage: LanguageModelV3Usage): LanguageModel.Usage => ({
  inputTokens: {
    total: usage.inputTokens.total,
    uncached: usage.inputTokens.noCache,
    cacheRead: usage.inputTokens.cacheRead,
    cacheWrite: usage.inputTokens.cacheWrite,
  },
  outputTokens: {
    total: usage.outputTokens.total,
    text: usage.outputTokens.text,
    reasoning: usage.outputTokens.reasoning,
  },
  ...optional("raw", usage.raw as LanguageModel.Usage["raw"] | undefined),
});

const fromWarning = (warning: AiSdkWarning): LanguageModel.Warning =>
  Match.value(warning).pipe(
    Match.when(
      { type: "unsupported-setting" },
      (warning) =>
        ({
          _tag: "Unsupported",
          feature: String(warning.setting),
          ...optional("details", warning.details),
        }) satisfies LanguageModel.UnsupportedWarning,
    ),
    Match.when(
      { type: "unsupported-tool" },
      (warning) =>
        ({
          _tag: "Unsupported",
          feature: `tool:${warning.tool.name}`,
          ...optional("details", warning.details),
        }) satisfies LanguageModel.UnsupportedWarning,
    ),
    Match.when(
      { type: "unsupported" },
      (warning) =>
        ({
          _tag: "Unsupported",
          feature: warning.feature ?? "unknown",
          ...optional("details", warning.details),
        }) satisfies LanguageModel.UnsupportedWarning,
    ),
    Match.when(
      { type: "compatibility" },
      (warning) =>
        ({
          _tag: "Compatibility",
          feature: warning.feature ?? "unknown",
          ...optional("details", warning.details),
        }) satisfies LanguageModel.CompatibilityWarning,
    ),
    Match.when(
      { type: "deprecated" },
      (warning) =>
        ({
          _tag: "Other",
          message: `${warning.setting ?? "unknown"} is deprecated: ${warning.message ?? ""}`,
        }) satisfies LanguageModel.OtherWarning,
    ),
    Match.when(
      { type: "other" },
      (warning) =>
        ({
          _tag: "Other",
          message: warning.message ?? "Unknown provider warning",
        }) satisfies LanguageModel.OtherWarning,
    ),
    Match.exhaustive,
  );

const mergeAbortSignals = (
  first: AbortSignal | undefined,
  second: AbortSignal,
): { readonly abortSignal: AbortSignal; readonly cleanup: () => void } => {
  if (first === undefined || first === second) {
    return { abortSignal: second, cleanup: noop };
  }

  const controller = new AbortController();
  const abortFromFirst = () => controller.abort(first.reason);
  const abortFromSecond = () => controller.abort(second.reason);

  if (first.aborted) {
    abortFromFirst();
    return { abortSignal: controller.signal, cleanup: noop };
  }
  if (second.aborted) {
    abortFromSecond();
    return { abortSignal: controller.signal, cleanup: noop };
  }

  first.addEventListener("abort", abortFromFirst, { once: true });
  second.addEventListener("abort", abortFromSecond, { once: true });

  return {
    abortSignal: controller.signal,
    cleanup: () => {
      first.removeEventListener("abort", abortFromFirst);
      second.removeEventListener("abort", abortFromSecond);
    },
  };
};

const toLanguageModelError = (cause: unknown, model: AiSdkLanguageModel): LanguageModel.LanguageModelError => {
  if (cause instanceof LanguageModel.LanguageModelError) {
    return cause;
  }
  if (UnsupportedFunctionalityError.isInstance(cause)) {
    return new LanguageModel.LanguageModelError({
      reason: "Unsupported",
      message: cause.message,
      provider: model.provider,
      model: model.modelId,
      cause,
    });
  }
  if (InvalidPromptError.isInstance(cause) || InvalidArgumentError.isInstance(cause)) {
    return new LanguageModel.LanguageModelError({
      reason: "InvalidPrompt",
      message: getErrorMessage(cause),
      provider: model.provider,
      model: model.modelId,
      cause,
    });
  }
  if (isAbortError(cause)) {
    return new LanguageModel.LanguageModelError({
      reason: "Aborted",
      message: getErrorMessage(cause),
      provider: model.provider,
      model: model.modelId,
      cause,
    });
  }
  return new LanguageModel.LanguageModelError({
    reason: "Provider",
    message: getErrorMessage(cause),
    provider: model.provider,
    model: model.modelId,
    cause,
  });
};

const unsupported = (feature: string): never => {
  throw new LanguageModel.LanguageModelError({
    reason: "Unsupported",
    message: `AI SDK adapter cannot represent ${feature}.`,
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

const providerMetadata = (value: { readonly providerMetadata?: unknown }) =>
  optional("providerMetadata", Struct.get(value, "providerMetadata") as LanguageModel.ProviderMetadata | undefined);

const v2ProviderOptions = (value: { readonly providerOptions?: unknown }) =>
  optional(
    "providerOptions",
    Struct.get(value, "providerOptions") as LanguageModelV2CallOptions["providerOptions"] | undefined,
  );

const v3ProviderOptions = (value: { readonly providerOptions?: unknown }) =>
  optional(
    "providerOptions",
    Struct.get(value, "providerOptions") as LanguageModelV3CallOptions["providerOptions"] | undefined,
  );

const compactOptional = <Fields extends Record<string, unknown>>(
  fields: Fields,
): Partial<{ readonly [Key in keyof Fields]: Exclude<Fields[Key], undefined> }> =>
  EffectRecord.filter(
    fields,
    (value): value is Exclude<(typeof fields)[keyof Fields], undefined> => value !== undefined,
  ) as Partial<{ readonly [Key in keyof Fields]: Exclude<Fields[Key], undefined> }>;

const optional = <K extends string, V>(
  key: K,
  value: V | undefined,
): { readonly [P in K]: V } | Record<string, never> =>
  compactOptional({ [key]: value } as { readonly [P in K]: V | undefined }) as
    | { readonly [P in K]: V }
    | Record<string, never>;

const noop = () => {};
