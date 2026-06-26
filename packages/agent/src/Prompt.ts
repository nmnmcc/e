/**
 * Prompt helpers for agents.
 *
 * @since 1.0.0
 */
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";

import * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import * as Middleware from "./Middleware.ts";

/**
 * User input accepted by an agent.
 *
 * @category models
 * @since 1.0.0
 */
export type UserInput = string | LanguageModel.UserMessage;

type AssistantPart =
  | LanguageModel.TextPart
  | LanguageModel.FilePart
  | LanguageModel.ReasoningPart
  | LanguageModel.ToolCallPart
  | LanguageModel.ToolResultPart;

/**
 * Prompt compile options.
 *
 * @category options
 * @since 1.0.0
 */
export interface CompileOptions {
  readonly instructions?: string | undefined;
  readonly messages: LanguageModel.Prompt;
}

/**
 * Converts agent user input to a language model user message.
 *
 * @category conversions
 * @since 1.0.0
 */
export const toUserMessage = (input: UserInput): LanguageModel.UserMessage =>
  typeof input === "string"
    ? {
        role: "user",
        content: [LanguageModel.Part.Text({ text: input })],
      }
    : input;

/**
 * Builds the model prompt for one model call.
 *
 * @category conversions
 * @since 1.0.0
 */
export const compile = (options: CompileOptions): LanguageModel.Prompt =>
  options.instructions === undefined
    ? options.messages
    : Array.prepend(options.messages, {
        role: "system",
        content: options.instructions,
      });

/**
 * Converts model content to an assistant prompt message.
 *
 * @category conversions
 * @since 1.0.0
 */
export const toAssistantMessage = (
  content: ReadonlyArray<LanguageModel.Content>,
): Effect.Effect<LanguageModel.AssistantMessage, Middleware.AgentError> =>
  Effect.gen(function* () {
    const parts = yield* Effect.forEach(content, toAssistantPart);
    return {
      role: "assistant",
      content: Array.filter(parts, (part): part is AssistantPart => part !== undefined),
    };
  });

const toAssistantPart = (
  part: LanguageModel.Content,
): Effect.Effect<AssistantPart | undefined, Middleware.AgentError> =>
  Match.value(part).pipe(
    Match.tag("Text", (part) => Effect.succeed(LanguageModel.Part.Text({ text: part.text }))),
    Match.tag("Reasoning", (part) => Effect.succeed(LanguageModel.Part.Reasoning({ text: part.text }))),
    Match.tag("File", (part) =>
      Effect.succeed(
        LanguageModel.Part.File({
          mediaType: part.mediaType,
          data: part.data,
        }),
      ),
    ),
    Match.tag("ToolCall", (part) =>
      Effect.map(parseToolInput(part), (input) =>
        LanguageModel.Part.ToolCall({
          id: part.id,
          name: part.name,
          input,
          ...(part.providerExecuted !== undefined ? { providerExecuted: part.providerExecuted } : {}),
        }),
      ),
    ),
    Match.tag("ToolResult", (part) =>
      Effect.succeed(
        LanguageModel.Part.ToolResult({
          id: part.id,
          name: part.name,
          output: LanguageModel.ToolResultOutput.Json({ value: part.result }),
        }),
      ),
    ),
    Match.tag("UrlSource", "DocumentSource", "ToolApprovalRequest", () => Effect.succeed(undefined)),
    Match.exhaustive,
  );

/**
 * Parses JSON input from a generated tool call.
 *
 * @category conversions
 * @since 1.0.0
 */
export const parseToolInput = (toolCall: LanguageModel.ToolCall): Effect.Effect<unknown, Middleware.AgentError> =>
  Effect.try({
    try: () => JSON.parse(toolCall.input) as unknown,
    catch: (cause) =>
      new Middleware.AgentError({
        reason: "InvalidToolInput",
        message: `Tool call ${toolCall.id} for ${toolCall.name} did not contain valid JSON input`,
        cause,
        toolName: toolCall.name,
        toolCallId: toolCall.id,
      }),
  });
