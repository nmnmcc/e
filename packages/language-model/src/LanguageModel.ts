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
  readonly providerOptions?: ProviderOptions;
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
  readonly providerMetadata?: ProviderMetadata;
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
  readonly providerMetadata?: ProviderMetadata;
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
 * Text prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface TextPart extends BasePart<"Text"> {
  readonly text: string;
}

/**
 * Reasoning prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface ReasoningPart extends BasePart<"Reasoning"> {
  readonly text: string;
}

/**
 * File prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface FilePart extends BasePart<"File"> {
  readonly data: DataContent;
  readonly mediaType: string;
  readonly filename?: string;
}

/**
 * Tool call prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface ToolCallPart extends BasePart<"ToolCall"> {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  readonly providerExecuted?: boolean;
}

/**
 * Tool result prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface ToolResultPart extends BasePart<"ToolResult"> {
  readonly id: string;
  readonly name: string;
  readonly output: ToolResultOutput;
}

/**
 * Tool result output.
 *
 * @category prompt
 * @since 1.0.0
 */
export type ToolResultOutput = TextToolResultOutput | JsonToolResultOutput | ExecutionDeniedToolResultOutput;

/**
 * Text tool result output.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface TextToolResultOutput extends BasePart<"Text"> {
  readonly value: string;
}

/**
 * JSON tool result output.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface JsonToolResultOutput extends BasePart<"Json"> {
  readonly value: Schema.Json;
}

/**
 * Tool result output for denied execution.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface ExecutionDeniedToolResultOutput extends BasePart<"ExecutionDenied"> {
  readonly reason?: string;
}

/**
 * Tool approval response prompt part.
 *
 * @category prompt
 * @since 1.0.0
 */
export interface ToolApprovalResponsePart extends BasePart<"ToolApprovalResponse"> {
  readonly id: string;
  readonly approved: boolean;
  readonly reason?: string;
}

/**
 * Options for a language model call.
 *
 * @category options
 * @since 1.0.0
 */
export interface GenerateOptions {
  readonly prompt: Prompt;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly stopSequences?: ReadonlyArray<string>;
  readonly topP?: number;
  readonly topK?: number;
  readonly presencePenalty?: number;
  readonly frequencyPenalty?: number;
  readonly responseFormat?: ResponseFormat;
  readonly seed?: number;
  readonly tools?: ReadonlyArray<FunctionTool | ProviderTool>;
  readonly toolChoice?: ToolChoice;
  readonly includeRaw?: boolean;
  readonly abortSignal?: AbortSignal;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly providerOptions?: ProviderOptions;
}

/**
 * Requested output format.
 *
 * @category options
 * @since 1.0.0
 */
export type ResponseFormat = TextResponseFormat | JsonResponseFormat;

/**
 * Text response format.
 *
 * @category options
 * @since 1.0.0
 */
export interface TextResponseFormat extends BaseResponseFormat<"Text"> {}

/**
 * JSON response format.
 *
 * @category options
 * @since 1.0.0
 */
export interface JsonResponseFormat extends BaseResponseFormat<"Json"> {
  readonly schema?: JsonSchema;
  readonly name?: string;
  readonly description?: string;
}

/**
 * Function tool configuration.
 *
 * @category tools
 * @since 1.0.0
 */
export interface FunctionTool extends BaseTool<"Function"> {
  readonly description?: string;
  readonly inputSchema: JsonSchema;
  readonly inputExamples?: ReadonlyArray<{ readonly input: Schema.JsonObject }>;
  readonly strict?: boolean;
  readonly providerOptions?: ProviderOptions;
}

/**
 * Provider tool configuration.
 *
 * @category tools
 * @since 1.0.0
 */
export interface ProviderTool extends BaseTool<"Provider"> {
  readonly id: `${string}.${string}`;
  readonly args: Readonly<Record<string, unknown>>;
}

/**
 * Tool choice policy.
 *
 * @category tools
 * @since 1.0.0
 */
export type ToolChoice = AutoToolChoice | NoneToolChoice | RequiredToolChoice | NamedToolChoice;

/**
 * Automatic tool choice.
 *
 * @category tools
 * @since 1.0.0
 */
export interface AutoToolChoice extends BaseToolChoice<"Auto"> {}

/**
 * No tool choice.
 *
 * @category tools
 * @since 1.0.0
 */
export interface NoneToolChoice extends BaseToolChoice<"None"> {}

/**
 * Required tool choice.
 *
 * @category tools
 * @since 1.0.0
 */
export interface RequiredToolChoice extends BaseToolChoice<"Required"> {}

/**
 * Named tool choice.
 *
 * @category tools
 * @since 1.0.0
 */
export interface NamedToolChoice extends BaseToolChoice<"Named"> {
  readonly name: string;
}

/**
 * Generated content.
 *
 * @category content
 * @since 1.0.0
 */
export type Content = Text | Reasoning | File | ToolApprovalRequest | Source | ToolCall | ToolResult;

/**
 * Generated text.
 *
 * @category content
 * @since 1.0.0
 */
export interface Text extends BaseContent<"Text"> {
  readonly text: string;
}

/**
 * Generated reasoning.
 *
 * @category content
 * @since 1.0.0
 */
export interface Reasoning extends BaseContent<"Reasoning"> {
  readonly text: string;
}

/**
 * Generated file.
 *
 * @category content
 * @since 1.0.0
 */
export interface File extends BaseContent<"File"> {
  readonly mediaType: string;
  readonly data: string | Uint8Array;
}

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
export interface UrlSource extends BaseSource<"UrlSource"> {
  readonly url: string;
  readonly title?: string;
}

/**
 * Document source.
 *
 * @category content
 * @since 1.0.0
 */
export interface DocumentSource extends BaseSource<"DocumentSource"> {
  readonly mediaType: string;
  readonly title: string;
  readonly filename?: string;
}

/**
 * Provider-executed tool approval request.
 *
 * @category tools
 * @since 1.0.0
 */
export interface ToolApprovalRequest extends BaseContent<"ToolApprovalRequest"> {
  readonly id: string;
  readonly callId: string;
}

/**
 * Generated tool call.
 *
 * @category tools
 * @since 1.0.0
 */
export interface ToolCall extends BaseContent<"ToolCall"> {
  readonly id: string;
  readonly name: string;
  readonly input: string;
  readonly providerExecuted?: boolean;
  readonly dynamic?: boolean;
}

/**
 * Provider-executed tool result.
 *
 * @category tools
 * @since 1.0.0
 */
export interface ToolResult extends BaseContent<"ToolResult"> {
  readonly id: string;
  readonly name: string;
  readonly result: NonNullable<Schema.Json>;
  readonly isError?: boolean;
  readonly preliminary?: boolean;
  readonly dynamic?: boolean;
}

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
export type StreamPart =
  | TextStartStreamPart
  | TextDeltaStreamPart
  | TextEndStreamPart
  | ReasoningStartStreamPart
  | ReasoningDeltaStreamPart
  | ReasoningEndStreamPart
  | ToolInputStartStreamPart
  | ToolInputDeltaStreamPart
  | ToolInputEndStreamPart
  | ToolApprovalRequest
  | ToolCall
  | ToolResult
  | File
  | Source
  | StreamStartPart
  | ResponseMetadataStreamPart
  | FinishStreamPart
  | RawStreamPart
  | ErrorStreamPart;

/**
 * Text stream block start.
 *
 * @category stream
 * @since 1.0.0
 */
export interface TextStartStreamPart extends BaseMetadataStreamPart<"TextStart"> {
  readonly id: string;
}

/**
 * Text stream delta.
 *
 * @category stream
 * @since 1.0.0
 */
export interface TextDeltaStreamPart extends BaseMetadataStreamPart<"TextDelta"> {
  readonly id: string;
  readonly delta: string;
}

/**
 * Text stream block end.
 *
 * @category stream
 * @since 1.0.0
 */
export interface TextEndStreamPart extends BaseMetadataStreamPart<"TextEnd"> {
  readonly id: string;
}

/**
 * Reasoning stream block start.
 *
 * @category stream
 * @since 1.0.0
 */
export interface ReasoningStartStreamPart extends BaseMetadataStreamPart<"ReasoningStart"> {
  readonly id: string;
}

/**
 * Reasoning stream delta.
 *
 * @category stream
 * @since 1.0.0
 */
export interface ReasoningDeltaStreamPart extends BaseMetadataStreamPart<"ReasoningDelta"> {
  readonly id: string;
  readonly delta: string;
}

/**
 * Reasoning stream block end.
 *
 * @category stream
 * @since 1.0.0
 */
export interface ReasoningEndStreamPart extends BaseMetadataStreamPart<"ReasoningEnd"> {
  readonly id: string;
}

/**
 * Tool input stream start.
 *
 * @category stream
 * @since 1.0.0
 */
export interface ToolInputStartStreamPart extends BaseMetadataStreamPart<"ToolInputStart"> {
  readonly id: string;
  readonly name: string;
  readonly providerExecuted?: boolean;
  readonly dynamic?: boolean;
  readonly title?: string;
}

/**
 * Tool input stream delta.
 *
 * @category stream
 * @since 1.0.0
 */
export interface ToolInputDeltaStreamPart extends BaseMetadataStreamPart<"ToolInputDelta"> {
  readonly id: string;
  readonly delta: string;
}

/**
 * Tool input stream end.
 *
 * @category stream
 * @since 1.0.0
 */
export interface ToolInputEndStreamPart extends BaseMetadataStreamPart<"ToolInputEnd"> {
  readonly id: string;
}

/**
 * Stream start event.
 *
 * @category stream
 * @since 1.0.0
 */
export interface StreamStartPart extends BaseStreamPart<"StreamStart"> {
  readonly warnings: ReadonlyArray<Warning>;
}

/**
 * Response metadata stream event.
 *
 * @category stream
 * @since 1.0.0
 */
export type ResponseMetadataStreamPart = ResponseMetadata & BaseStreamPart<"ResponseMetadata">;

/**
 * Stream finish event.
 *
 * @category stream
 * @since 1.0.0
 */
export interface FinishStreamPart extends BaseMetadataStreamPart<"Finish"> {
  readonly usage: Usage;
  readonly finish: Finish;
}

/**
 * Raw provider stream event.
 *
 * @category stream
 * @since 1.0.0
 */
export interface RawStreamPart extends BaseStreamPart<"Raw"> {
  readonly value: unknown;
}

/**
 * Provider stream error event.
 *
 * @category stream
 * @since 1.0.0
 */
export interface ErrorStreamPart extends BaseStreamPart<"Error"> {
  readonly error: unknown;
}

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
  readonly id?: string;
  readonly timestamp?: Date;
  readonly model?: string;
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
export type Warning = UnsupportedWarning | CompatibilityWarning | OtherWarning;

/**
 * Unsupported feature warning.
 *
 * @category results
 * @since 1.0.0
 */
export interface UnsupportedWarning extends BaseWarning<"Unsupported"> {
  readonly feature: string;
  readonly details?: string;
}

/**
 * Compatibility mode warning.
 *
 * @category results
 * @since 1.0.0
 */
export interface CompatibilityWarning extends BaseWarning<"Compatibility"> {
  readonly feature: string;
  readonly details?: string;
}

/**
 * Other provider warning.
 *
 * @category results
 * @since 1.0.0
 */
export interface OtherWarning extends BaseWarning<"Other"> {
  readonly message: string;
}

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
