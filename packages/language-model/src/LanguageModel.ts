/**
 * Effect service definition for language models.
 *
 * This module defines an Effect service for language model implementations.
 * Operations are represented with `Effect`, and streaming output is represented
 * with `Stream`.
 *
 * @since 1.0.0
 */
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Layer from "effect/Layer";
import type { Effect } from "effect/Effect";
import type * as Schema from "effect/Schema";
import type { Stream } from "effect/Stream";

const TypeId = "~@nmnmcc/e-language-model/LanguageModel";
const ErrorTypeId = "~@nmnmcc/e-language-model/LanguageModel/LanguageModelError";

/**
 * Service for a language model provider.
 *
 * @category models
 * @since 1.0.0
 */
export interface LanguageModel {
  readonly [TypeId]: typeof TypeId;
  readonly provider: string;
  readonly model: string;
  readonly generate: (options: GenerateOptions) => Effect<GenerateResult, LanguageModelError>;
  readonly stream: (options: GenerateOptions) => Effect<StreamResult, LanguageModelError>;
}

/**
 * Context service tag for the active language model.
 *
 * @category services
 * @since 1.0.0
 */
export const LanguageModel: Context.Service<LanguageModel, LanguageModel> = Context.Service(TypeId);

/**
 * Builds a language model service from its implementation.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = (impl: Omit<LanguageModel, typeof TypeId>): LanguageModel =>
  LanguageModel.of({
    [TypeId]: TypeId,
    ...impl,
  });

/**
 * Builds a layer from a language model implementation.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer = (impl: Omit<LanguageModel, typeof TypeId>): Layer.Layer<LanguageModel> =>
  Layer.succeed(LanguageModel, make(impl));

/**
 * Error reason for language model failures.
 *
 * @category errors
 * @since 1.0.0
 */
export type LanguageModelErrorReason = "Aborted" | "InvalidPrompt" | "Provider" | "Unsupported" | "Unknown";

/**
 * Error raised by a language model service.
 *
 * @category errors
 * @since 1.0.0
 */
export class LanguageModelError extends Data.TaggedError("LanguageModelError")<{
  readonly reason: LanguageModelErrorReason;
  readonly message: string;
  readonly provider?: string;
  readonly model?: string;
  readonly cause?: unknown;
}> {
  readonly [ErrorTypeId] = ErrorTypeId;
}

/**
 * JSON schema.
 *
 * @category models
 * @since 1.0.0
 */
export type JsonSchema = boolean | Schema.JsonObject;

/**
 * HTTP headers.
 *
 * @category models
 * @since 1.0.0
 */
export type Headers = Readonly<Record<string, string>>;

/**
 * Provider-specific options.
 *
 * @category models
 * @since 1.0.0
 */
export type ProviderOptions = Readonly<Record<string, Schema.JsonObject>>;

/**
 * Provider-specific metadata.
 *
 * @category models
 * @since 1.0.0
 */
export type ProviderMetadata = Readonly<Record<string, Schema.JsonObject>>;

/**
 * Base tagged model.
 *
 * @category models
 * @since 1.0.0
 */
export interface BaseTagged<Tag extends string> {
  readonly _tag: Tag;
}

/**
 * Provider-specific options attached to prompt messages and parts.
 *
 * @category models
 * @since 1.0.0
 */
export interface ProviderOptionsPart {
  readonly providerOptions?: ProviderOptions | undefined;
}

/**
 * Base prompt message.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface BaseMessage<Role extends string> extends ProviderOptionsPart {
  readonly role: Role;
}

/**
 * Base prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface BasePart<Tag extends string> extends BaseTagged<Tag>, ProviderOptionsPart {}

/**
 * Base generated content.
 *
 * @category content
 * @since 1.0.0
 */
export interface BaseContent<Tag extends string> extends BaseTagged<Tag> {
  readonly providerMetadata?: ProviderMetadata | undefined;
}

/**
 * Base source content.
 *
 * @category content
 * @since 1.0.0
 */
export interface BaseSource<Tag extends string> extends BaseContent<Tag> {
  readonly id: string;
}

/**
 * Base stream part.
 *
 * @category stream
 * @since 1.0.0
 */
export interface BaseStreamPart<Tag extends string> extends BaseTagged<Tag> {}

/**
 * Base stream part with provider metadata.
 *
 * @category stream
 * @since 1.0.0
 */
export interface BaseMetadataStreamPart<Tag extends string> extends BaseStreamPart<Tag> {
  readonly providerMetadata?: ProviderMetadata | undefined;
}

/**
 * Base tool configuration.
 *
 * @category tools
 * @since 1.0.0
 */
export interface BaseTool<Tag extends string> extends BaseTagged<Tag> {
  readonly name: string;
}

/**
 * Base response format.
 *
 * @category options
 * @since 1.0.0
 */
export interface BaseResponseFormat<Tag extends string> extends BaseTagged<Tag> {}

/**
 * Base tool choice policy.
 *
 * @category tools
 * @since 1.0.0
 */
export interface BaseToolChoice<Tag extends string> extends BaseTagged<Tag> {}

/**
 * Base provider warning.
 *
 * @category results
 * @since 1.0.0
 */
export interface BaseWarning<Tag extends string> extends BaseTagged<Tag> {}

/**
 * File data used in prompts.
 *
 * @category models
 * @since 1.0.0
 */
export type DataContent = Uint8Array | string | URL;

/**
 * Standard prompt sent to a language model.
 *
 * @category prompt
 * @since 1.0.0
 */
export type Prompt = ReadonlyArray<Message>;

/**
 * Prompt message.
 *
 * @category prompt
 * @since 1.0.0
 */
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

/**
 * System prompt message.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface SystemMessage extends BaseMessage<"system"> {
  readonly content: string;
}

/**
 * User prompt message.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface UserMessage extends BaseMessage<"user"> {
  readonly content: ReadonlyArray<TextPart | FilePart>;
}

/**
 * Assistant prompt message.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface AssistantMessage extends BaseMessage<"assistant"> {
  readonly content: ReadonlyArray<TextPart | FilePart | ReasoningPart | ToolCallPart | ToolResultPart>;
}

/**
 * Tool prompt message.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface ToolMessage extends BaseMessage<"tool"> {
  readonly content: ReadonlyArray<ToolResultPart | ToolApprovalResponsePart>;
}

/**
 * Prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export type Part = Data.TaggedEnum<{
  Text: {
    readonly text: string;
    readonly providerOptions?: ProviderOptions | undefined;
  };
  Reasoning: {
    readonly text: string;
    readonly providerOptions?: ProviderOptions | undefined;
  };
  File: {
    readonly data: DataContent;
    readonly mediaType: string;
    readonly filename?: string | undefined;
    readonly providerOptions?: ProviderOptions | undefined;
  };
  ToolCall: {
    readonly id: string;
    readonly name: string;
    readonly input: unknown;
    readonly providerExecuted?: boolean | undefined;
    readonly providerOptions?: ProviderOptions | undefined;
  };
  ToolResult: {
    readonly id: string;
    readonly name: string;
    readonly output: ToolResultOutput;
    readonly providerOptions?: ProviderOptions | undefined;
  };
  ToolApprovalResponse: {
    readonly id: string;
    readonly approved: boolean;
    readonly reason?: string | undefined;
    readonly providerOptions?: ProviderOptions | undefined;
  };
}>;

/**
 * Prompt part constructors.
 *
 * @category constructors
 * @since 1.0.0
 */
export const Part = Data.taggedEnum<Part>();

/**
 * Text prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export type TextPart = Data.TaggedEnum.Value<Part, "Text">;

/**
 * Reasoning prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export type ReasoningPart = Data.TaggedEnum.Value<Part, "Reasoning">;

/**
 * File prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export type FilePart = Data.TaggedEnum.Value<Part, "File">;

/**
 * Tool call prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export type ToolCallPart = Data.TaggedEnum.Value<Part, "ToolCall">;

/**
 * Tool result prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export type ToolResultPart = Data.TaggedEnum.Value<Part, "ToolResult">;

/**
 * Tool result output.
 *
 * @category prompt
 * @since 1.0.0
 */
export type ToolResultOutput = Data.TaggedEnum<{
  Text: {
    readonly value: string;
    readonly providerOptions?: ProviderOptions | undefined;
  };
  Json: {
    readonly value: Schema.Json;
    readonly providerOptions?: ProviderOptions | undefined;
  };
  ExecutionDenied: {
    readonly reason?: string | undefined;
    readonly providerOptions?: ProviderOptions | undefined;
  };
}>;

/**
 * Tool result output constructors.
 *
 * @category constructors
 * @since 1.0.0
 */
export const ToolResultOutput = Data.taggedEnum<ToolResultOutput>();

/**
 * Text tool result output.
 *
 * @category prompt
 * @since 1.0.0
 */
export type TextToolResultOutput = Data.TaggedEnum.Value<ToolResultOutput, "Text">;

/**
 * JSON tool result output.
 *
 * @category prompt
 * @since 1.0.0
 */
export type JsonToolResultOutput = Data.TaggedEnum.Value<ToolResultOutput, "Json">;

/**
 * Tool result output for denied execution.
 *
 * @category prompt
 * @since 1.0.0
 */
export type ExecutionDeniedToolResultOutput = Data.TaggedEnum.Value<ToolResultOutput, "ExecutionDenied">;

/**
 * Tool approval response prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export type ToolApprovalResponsePart = Data.TaggedEnum.Value<Part, "ToolApprovalResponse">;

/**
 * Options for a language model call.
 *
 * @category options
 * @since 1.0.0
 */
export interface GenerateOptions {
  readonly prompt: Prompt;
  readonly maxOutputTokens?: number | undefined;
  readonly temperature?: number | undefined;
  readonly stopSequences?: ReadonlyArray<string> | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
  readonly presencePenalty?: number | undefined;
  readonly frequencyPenalty?: number | undefined;
  readonly responseFormat?: ResponseFormat | undefined;
  readonly seed?: number | undefined;
  readonly tools?: ReadonlyArray<FunctionTool | ProviderTool> | undefined;
  readonly toolChoice?: ToolChoice | undefined;
  readonly includeRaw?: boolean | undefined;
  readonly abortSignal?: AbortSignal | undefined;
  readonly headers?: Readonly<Record<string, string | undefined>> | undefined;
  readonly providerOptions?: ProviderOptions | undefined;
}

/**
 * Requested output format.
 *
 * @category options
 * @since 1.0.0
 */
export type ResponseFormat = Data.TaggedEnum<{
  Text: {};
  Json: {
    readonly schema?: JsonSchema | undefined;
    readonly name?: string | undefined;
    readonly description?: string | undefined;
  };
}>;

/**
 * Response format constructors.
 *
 * @category constructors
 * @since 1.0.0
 */
export const ResponseFormat = Data.taggedEnum<ResponseFormat>();

/**
 * Text response format.
 *
 * @category options
 * @since 1.0.0
 */
export type TextResponseFormat = Data.TaggedEnum.Value<ResponseFormat, "Text">;

/**
 * JSON response format.
 *
 * @category options
 * @since 1.0.0
 */
export type JsonResponseFormat = Data.TaggedEnum.Value<ResponseFormat, "Json">;

/**
 * Function tool configuration.
 *
 * @category tools
 * @since 1.0.0
 */
export type Tool = Data.TaggedEnum<{
  Function: {
    readonly name: string;
    readonly description?: string | undefined;
    readonly input: JsonSchema;
    readonly inputExamples?: ReadonlyArray<{ readonly input: Schema.JsonObject }> | undefined;
    readonly strict?: boolean | undefined;
    readonly providerOptions?: ProviderOptions | undefined;
  };
  Provider: {
    readonly name: string;
    readonly id: `${string}.${string}`;
    readonly args: Readonly<Record<string, unknown>>;
  };
}>;

/**
 * Tool configuration constructors.
 *
 * @category constructors
 * @since 1.0.0
 */
export const Tool = Data.taggedEnum<Tool>();

/**
 * Function tool configuration.
 *
 * @category tools
 * @since 1.0.0
 */
export type FunctionTool = Data.TaggedEnum.Value<Tool, "Function">;

/**
 * Provider tool configuration.
 *
 * @category tools
 * @since 1.0.0
 */
export type ProviderTool = Data.TaggedEnum.Value<Tool, "Provider">;

/**
 * Tool choice policy.
 *
 * @category tools
 * @since 1.0.0
 */
export type ToolChoice = Data.TaggedEnum<{
  Auto: {};
  None: {};
  Required: {};
  Named: {
    readonly name: string;
  };
}>;

/**
 * Tool choice constructors.
 *
 * @category constructors
 * @since 1.0.0
 */
export const ToolChoice = Data.taggedEnum<ToolChoice>();

/**
 * Automatic tool choice.
 *
 * @category tools
 * @since 1.0.0
 */
export type AutoToolChoice = Data.TaggedEnum.Value<ToolChoice, "Auto">;

/**
 * No tool choice.
 *
 * @category tools
 * @since 1.0.0
 */
export type NoneToolChoice = Data.TaggedEnum.Value<ToolChoice, "None">;

/**
 * Required tool choice.
 *
 * @category tools
 * @since 1.0.0
 */
export type RequiredToolChoice = Data.TaggedEnum.Value<ToolChoice, "Required">;

/**
 * Named tool choice.
 *
 * @category tools
 * @since 1.0.0
 */
export type NamedToolChoice = Data.TaggedEnum.Value<ToolChoice, "Named">;

/**
 * Generated content.
 *
 * @category content
 * @since 1.0.0
 */
export type Content = Data.TaggedEnum<{
  Text: {
    readonly text: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  Reasoning: {
    readonly text: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  File: {
    readonly mediaType: string;
    readonly data: string | Uint8Array;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  UrlSource: {
    readonly id: string;
    readonly url: string;
    readonly title?: string | undefined;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  DocumentSource: {
    readonly id: string;
    readonly mediaType: string;
    readonly title: string;
    readonly filename?: string | undefined;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  ToolApprovalRequest: {
    readonly id: string;
    readonly callId: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  ToolCall: {
    readonly id: string;
    readonly name: string;
    readonly input: string;
    readonly providerExecuted?: boolean | undefined;
    readonly dynamic?: boolean | undefined;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  ToolResult: {
    readonly id: string;
    readonly name: string;
    readonly result: NonNullable<Schema.Json>;
    readonly isError?: boolean | undefined;
    readonly preliminary?: boolean | undefined;
    readonly dynamic?: boolean | undefined;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
}>;

/**
 * Generated content constructors.
 *
 * @category constructors
 * @since 1.0.0
 */
export const Content = Data.taggedEnum<Content>();

/**
 * Generated text.
 *
 * @category content
 * @since 1.0.0
 */
export type Text = Data.TaggedEnum.Value<Content, "Text">;

/**
 * Generated reasoning.
 *
 * @category content
 * @since 1.0.0
 */
export type Reasoning = Data.TaggedEnum.Value<Content, "Reasoning">;

/**
 * Generated file.
 *
 * @category content
 * @since 1.0.0
 */
export type File = Data.TaggedEnum.Value<Content, "File">;

/**
 * Source used to generate the response.
 *
 * @category content
 * @since 1.0.0
 */
export type Source = UrlSource | DocumentSource;

/**
 * URL source.
 *
 * @category content
 * @since 1.0.0
 */
export type UrlSource = Data.TaggedEnum.Value<Content, "UrlSource">;

/**
 * Document source.
 *
 * @category content
 * @since 1.0.0
 */
export type DocumentSource = Data.TaggedEnum.Value<Content, "DocumentSource">;

/**
 * Provider-executed tool approval request.
 *
 * @category tools
 * @since 1.0.0
 */
export type ToolApprovalRequest = Data.TaggedEnum.Value<Content, "ToolApprovalRequest">;

/**
 * Generated tool call.
 *
 * @category tools
 * @since 1.0.0
 */
export type ToolCall = Data.TaggedEnum.Value<Content, "ToolCall">;

/**
 * Provider-executed tool result.
 *
 * @category tools
 * @since 1.0.0
 */
export type ToolResult = Data.TaggedEnum.Value<Content, "ToolResult">;

/**
 * Non-streaming generation result.
 *
 * @category results
 * @since 1.0.0
 */
export interface GenerateResult {
  readonly content: ReadonlyArray<Content>;
  readonly finish: Finish;
  readonly usage: Usage;
  readonly providerMetadata?: ProviderMetadata;
  readonly request?: {
    readonly body?: unknown;
  };
  readonly response?: ResponseMetadata & {
    readonly headers?: Headers;
    readonly body?: unknown;
  };
  readonly warnings: ReadonlyArray<Warning>;
}

/**
 * Streaming output part.
 *
 * @category stream
 * @since 1.0.0
 */
export type StreamPart = StreamEvent | ToolApprovalRequest | ToolCall | ToolResult | File | Source;

/**
 * Streaming output event.
 *
 * @category stream
 * @since 1.0.0
 */
export type StreamEvent = Data.TaggedEnum<{
  TextStart: {
    readonly id: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  TextDelta: {
    readonly id: string;
    readonly delta: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  TextEnd: {
    readonly id: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  ReasoningStart: {
    readonly id: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  ReasoningDelta: {
    readonly id: string;
    readonly delta: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  ReasoningEnd: {
    readonly id: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  ToolInputStart: {
    readonly id: string;
    readonly name: string;
    readonly providerExecuted?: boolean | undefined;
    readonly dynamic?: boolean | undefined;
    readonly title?: string | undefined;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  ToolInputDelta: {
    readonly id: string;
    readonly delta: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  ToolInputEnd: {
    readonly id: string;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  StreamStart: {
    readonly warnings: ReadonlyArray<Warning>;
  };
  ResponseMetadata: {
    readonly id?: string | undefined;
    readonly timestamp?: Date | undefined;
    readonly model?: string | undefined;
  };
  Finish: {
    readonly usage: Usage;
    readonly finish: Finish;
    readonly providerMetadata?: ProviderMetadata | undefined;
  };
  Raw: {
    readonly value: unknown;
  };
  Error: {
    readonly error: unknown;
  };
}>;

/**
 * Streaming output event constructors.
 *
 * @category constructors
 * @since 1.0.0
 */
export const StreamEvent = Data.taggedEnum<StreamEvent>();

/**
 * Text stream block start.
 *
 * @category stream
 * @since 1.0.0
 */
export type TextStartStreamPart = Data.TaggedEnum.Value<StreamEvent, "TextStart">;

/**
 * Text stream delta.
 *
 * @category stream
 * @since 1.0.0
 */
export type TextDeltaStreamPart = Data.TaggedEnum.Value<StreamEvent, "TextDelta">;

/**
 * Text stream block end.
 *
 * @category stream
 * @since 1.0.0
 */
export type TextEndStreamPart = Data.TaggedEnum.Value<StreamEvent, "TextEnd">;

/**
 * Reasoning stream block start.
 *
 * @category stream
 * @since 1.0.0
 */
export type ReasoningStartStreamPart = Data.TaggedEnum.Value<StreamEvent, "ReasoningStart">;

/**
 * Reasoning stream delta.
 *
 * @category stream
 * @since 1.0.0
 */
export type ReasoningDeltaStreamPart = Data.TaggedEnum.Value<StreamEvent, "ReasoningDelta">;

/**
 * Reasoning stream block end.
 *
 * @category stream
 * @since 1.0.0
 */
export type ReasoningEndStreamPart = Data.TaggedEnum.Value<StreamEvent, "ReasoningEnd">;

/**
 * Tool input stream start.
 *
 * @category stream
 * @since 1.0.0
 */
export type ToolInputStartStreamPart = Data.TaggedEnum.Value<StreamEvent, "ToolInputStart">;

/**
 * Tool input stream delta.
 *
 * @category stream
 * @since 1.0.0
 */
export type ToolInputDeltaStreamPart = Data.TaggedEnum.Value<StreamEvent, "ToolInputDelta">;

/**
 * Tool input stream end.
 *
 * @category stream
 * @since 1.0.0
 */
export type ToolInputEndStreamPart = Data.TaggedEnum.Value<StreamEvent, "ToolInputEnd">;

/**
 * Stream start event.
 *
 * @category stream
 * @since 1.0.0
 */
export type StreamStartPart = Data.TaggedEnum.Value<StreamEvent, "StreamStart">;

/**
 * Response metadata stream event.
 *
 * @category stream
 * @since 1.0.0
 */
export type ResponseMetadataStreamPart = Data.TaggedEnum.Value<StreamEvent, "ResponseMetadata">;

/**
 * Stream finish event.
 *
 * @category stream
 * @since 1.0.0
 */
export type FinishStreamPart = Data.TaggedEnum.Value<StreamEvent, "Finish">;

/**
 * Raw provider stream event.
 *
 * @category stream
 * @since 1.0.0
 */
export type RawStreamPart = Data.TaggedEnum.Value<StreamEvent, "Raw">;

/**
 * Provider stream error event.
 *
 * @category stream
 * @since 1.0.0
 */
export type ErrorStreamPart = Data.TaggedEnum.Value<StreamEvent, "Error">;

/**
 * Streaming generation result.
 *
 * @category results
 * @since 1.0.0
 */
export interface StreamResult {
  readonly stream: Stream<StreamPart, LanguageModelError>;
  readonly request?: {
    readonly body?: unknown;
  };
  readonly response?: {
    readonly headers?: Headers;
  };
}

/**
 * Response metadata.
 *
 * @category results
 * @since 1.0.0
 */
export interface ResponseMetadata {
  readonly id?: string | undefined;
  readonly timestamp?: Date | undefined;
  readonly model?: string | undefined;
}

/**
 * Reason why generation finished.
 *
 * @category results
 * @since 1.0.0
 */
export type FinishReason = "Stop" | "Length" | "ContentFilter" | "ToolCalls" | "Error" | "Other";

/**
 * Finish information for a language model call.
 *
 * @category results
 * @since 1.0.0
 */
export interface Finish {
  readonly reason: FinishReason;
  readonly providerReason?: string;
}

/**
 * Usage information for a language model call.
 *
 * @category results
 * @since 1.0.0
 */
export interface Usage {
  readonly inputTokens: {
    readonly total: number | undefined;
    readonly uncached: number | undefined;
    readonly cacheRead: number | undefined;
    readonly cacheWrite: number | undefined;
  };
  readonly outputTokens: {
    readonly total: number | undefined;
    readonly text: number | undefined;
    readonly reasoning: number | undefined;
  };
  readonly raw?: Schema.JsonObject;
}

/**
 * Warning from the language model provider.
 *
 * @category results
 * @since 1.0.0
 */
export type Warning = Data.TaggedEnum<{
  Unsupported: {
    readonly feature: string;
    readonly details?: string | undefined;
  };
  Compatibility: {
    readonly feature: string;
    readonly details?: string | undefined;
  };
  Other: {
    readonly message: string;
  };
}>;

/**
 * Warning constructors.
 *
 * @category constructors
 * @since 1.0.0
 */
export const Warning = Data.taggedEnum<Warning>();

/**
 * Unsupported feature warning.
 *
 * @category results
 * @since 1.0.0
 */
export type UnsupportedWarning = Data.TaggedEnum.Value<Warning, "Unsupported">;

/**
 * Compatibility mode warning.
 *
 * @category results
 * @since 1.0.0
 */
export type CompatibilityWarning = Data.TaggedEnum.Value<Warning, "Compatibility">;

/**
 * Other provider warning.
 *
 * @category results
 * @since 1.0.0
 */
export type OtherWarning = Data.TaggedEnum.Value<Warning, "Other">;

/**
 * Generates a non-streaming language model response.
 *
 * @category constructors
 * @since 1.0.0
 */
export const generate = (options: GenerateOptions) => LanguageModel.use((service) => service.generate(options));

/**
 * Generates a streaming language model response.
 *
 * @category constructors
 * @since 1.0.0
 */
export const stream = (options: GenerateOptions) => LanguageModel.use((service) => service.stream(options));
