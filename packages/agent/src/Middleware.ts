/**
 * Agent middleware declarations.
 *
 * @since 1.0.0
 */
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { Stream } from "effect/Stream";

import type * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import type * as Tool from "./Tool.ts";

/**
 * Agent error reason.
 *
 * @category errors
 * @since 1.0.0
 */
export type AgentErrorReason =
  | "InvalidToolInput"
  | "LanguageModel"
  | "MaxStepsExceeded"
  | "ToolExecution"
  | "ToolOutput"
  | "ToolResultOutput"
  | "Unknown";

/**
 * Error raised by an agent.
 *
 * @category errors
 * @since 1.0.0
 */
export class AgentError extends Data.TaggedError("AgentError")<{
  readonly reason: AgentErrorReason;
  readonly message: string;
  readonly cause?: unknown;
  readonly toolName?: string;
  readonly toolCallId?: string;
}> {}

/**
 * Model options accepted by an agent.
 *
 * @category options
 * @since 1.0.0
 */
export interface ModelOptions {
  readonly maxOutputTokens?: number | undefined;
  readonly temperature?: number | undefined;
  readonly stopSequences?: ReadonlyArray<string> | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
  readonly presencePenalty?: number | undefined;
  readonly frequencyPenalty?: number | undefined;
  readonly responseFormat?: LanguageModel.ResponseFormat | undefined;
  readonly seed?: number | undefined;
  readonly toolChoice?: LanguageModel.ToolChoice | undefined;
  readonly includeRaw?: boolean | undefined;
  readonly headers?: Readonly<Record<string, string | undefined>> | undefined;
  readonly providerOptions?: LanguageModel.ProviderOptions | undefined;
}

/**
 * Agent call options.
 *
 * @category options
 * @since 1.0.0
 */
export interface RunOptions extends ModelOptions {
  readonly abortSignal?: AbortSignal | undefined;
}

/**
 * A completed tool-loop step.
 *
 * @category results
 * @since 1.0.0
 */
export interface Step {
  readonly index: number;
  readonly response: LanguageModel.GenerateResult;
  readonly toolCalls: ReadonlyArray<LanguageModel.ToolCall>;
  readonly toolResults: ReadonlyArray<LanguageModel.ToolResultPart>;
}

/**
 * Agent run result.
 *
 * @category results
 * @since 1.0.0
 */
export interface RunResult extends LanguageModel.GenerateResult {
  readonly steps: ReadonlyArray<Step>;
  readonly messages: LanguageModel.Prompt;
}

/**
 * Agent stream part.
 *
 * @category stream
 * @since 1.0.0
 */
export type StreamPart = Data.TaggedEnum<{
  Model: {
    readonly step: number;
    readonly part: LanguageModel.StreamPart;
  };
  ToolExecutionStart: {
    readonly step: number;
    readonly toolCall: LanguageModel.ToolCall;
  };
  ToolExecutionEnd: {
    readonly step: number;
    readonly toolCall: LanguageModel.ToolCall;
    readonly toolResult: LanguageModel.ToolResultPart;
  };
  StepEnd: {
    readonly step: number;
    readonly finish: LanguageModel.Finish;
  };
  Finish: {
    readonly steps: ReadonlyArray<Step>;
    readonly finish: LanguageModel.Finish;
    readonly result: RunResult;
  };
}>;

/**
 * Agent stream part constructors.
 *
 * @category constructors
 * @since 1.0.0
 */
export const StreamPart = Data.taggedEnum<StreamPart>();

/**
 * Request passed through the agent handler pipeline.
 *
 * @category middleware
 * @since 1.0.0
 */
export interface Request<out Tools extends Tool.Tools = Tool.Tools> {
  readonly id: string;
  readonly instructions?: string | undefined;
  readonly input: LanguageModel.UserMessage;
  readonly messages: LanguageModel.Prompt;
  readonly tools: Tools;
  readonly options: ModelOptions;
  readonly steps: ReadonlyArray<Step>;
  readonly abortSignal?: AbortSignal | undefined;
}

/**
 * Runtime handler wrapped by middleware.
 *
 * @category middleware
 * @since 1.0.0
 */
export interface Handler<in out Tools extends Tool.Tools = Tool.Tools, out R = never> {
  readonly run: (request: Request<Tools>) => Effect.Effect<RunResult, AgentError, R>;
  readonly stream: (request: Request<Tools>) => Stream<StreamPart, AgentError, R>;
}

/**
 * Agent middleware.
 *
 * @category middleware
 * @since 1.0.0
 */
export interface Middleware<out R = never> {
  readonly wrap: <Tools extends Tool.Tools, R2>(
    handler: Handler<Tools, R2>,
  ) => Handler<Tools, R | R2 | Tool.Services<Tools[number]>>;
}

/**
 * Infer middleware service types.
 *
 * @category type-level
 * @since 1.0.0
 */
export type Services<Self> = Self extends Middleware<infer R> ? R : never;

/**
 * Builds an agent middleware.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = <R = never>(wrap: (handler: Handler) => Handler<Tool.Tools, R>): Middleware<R> => ({
  wrap: wrap as Middleware<R>["wrap"],
});
