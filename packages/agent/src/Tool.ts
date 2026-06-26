/**
 * Tool declarations for agents.
 *
 * @since 1.0.0
 */
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import type * as Schema from "effect/Schema";
import * as SchemaModule from "effect/Schema";

import * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import * as internal from "./internal/tool.ts";
import * as Middleware from "./Middleware.ts";
import * as Prompt from "./Prompt.ts";

const TypeId = "~@nmnmcc/e-agent/Tool";

/**
 * Options passed to local tool execution.
 *
 * @category models
 * @since 1.0.0
 */
export interface ToolExecutionOptions {
  readonly toolCallId: string;
  readonly messages: LanguageModel.Prompt;
  readonly abortSignal?: AbortSignal;
}

/**
 * Options passed to tool result conversion.
 *
 * @category models
 * @since 1.0.0
 */
export interface ToolModelOutputOptions<Input, Output> {
  readonly toolCallId: string;
  readonly input: Input;
  readonly output: Output;
}

/**
 * A local function tool.
 *
 * @category models
 * @since 1.0.0
 */
export interface FunctionTool<
  Name extends string = string,
  Input extends Schema.Constraint = Schema.Constraint,
  Output extends Schema.Constraint = Schema.Constraint,
  E = never,
  R = never,
  ToModelOutputE = never,
  ToModelOutputR = never,
> {
  readonly [TypeId]: typeof TypeId;
  readonly _tag: "Function";
  readonly name: Name;
  readonly description?: string;
  readonly input: Input;
  readonly output: Output;
  readonly strict?: boolean;
  readonly inputExamples?: ReadonlyArray<{ readonly input: Input["Type"] }>;
  readonly providerOptions?: LanguageModel.ProviderOptions;
  readonly execute?: (input: Input["Type"], options: ToolExecutionOptions) => Effect.Effect<Output["Type"], E, R>;
  readonly toModelOutput?: (
    options: ToolModelOutputOptions<Input["Type"], Output["Encoded"]>,
  ) => Effect.Effect<LanguageModel.ToolResultOutput, ToModelOutputE, ToModelOutputR>;
}

/**
 * A provider-defined tool.
 *
 * @category models
 * @since 1.0.0
 */
export interface ProviderTool<Name extends string = string> {
  readonly [TypeId]: typeof TypeId;
  readonly _tag: "Provider";
  readonly name: Name;
  readonly id: `${string}.${string}`;
  readonly args: Readonly<Record<string, unknown>>;
}

/**
 * Any declared tool.
 *
 * @category models
 * @since 1.0.0
 */
export type Tool = FunctionTool<any, any, any, any, any, any, any> | ProviderTool<any>;

/**
 * Any tool list.
 *
 * @category models
 * @since 1.0.0
 */
export type Tools<T extends Tool = Tool> = ReadonlyArray<T>;

/**
 * A widened function tool.
 *
 * @category models
 * @since 1.0.0
 */
export type AnyFunction = Extract<Tool, { readonly _tag: "Function" }>;

/**
 * A widened provider tool.
 *
 * @category models
 * @since 1.0.0
 */
export type AnyProvider = Extract<Tool, { readonly _tag: "Provider" }>;

/**
 * Infer a function tool input type.
 *
 * @category type-level
 * @since 1.0.0
 */
export type Input<Tool> = Tool extends FunctionTool<any, infer I, any, any, any, any, any> ? I["Type"] : never;

/**
 * Infer a function tool output type.
 *
 * @category type-level
 * @since 1.0.0
 */
export type Output<Tool> = Tool extends FunctionTool<any, any, infer O, any, any, any, any> ? O["Type"] : never;

/**
 * Infer a tool execution error type.
 *
 * @category type-level
 * @since 1.0.0
 */
export type Error<Tool> = Tool extends FunctionTool<any, any, any, infer E, any, any, any> ? E : never;

/**
 * Infer tool service types.
 *
 * @category type-level
 * @since 1.0.0
 */
export type Services<Tool> = Tool extends FunctionTool<any, any, any, any, infer R, any, infer MR> ? R | MR : never;

/**
 * Returns `true` when a value is a tool declaration.
 *
 * @category guards
 * @since 1.0.0
 */
export const isTool = (value: unknown): value is Tool => typeof value === "object" && value !== null && TypeId in value;

/**
 * Declares a local function tool.
 *
 * @category constructors
 * @since 1.0.0
 */
const function_ = <
  const Name extends string,
  Input extends Schema.Constraint,
  Output extends Schema.Constraint,
  E = never,
  R = never,
  ToModelOutputE = never,
  ToModelOutputR = never,
>(
  name: Name,
  options: {
    readonly description?: string;
    readonly input: Input;
    readonly output: Output;
    readonly strict?: boolean;
    readonly inputExamples?: ReadonlyArray<{ readonly input: Input["Type"] }>;
    readonly providerOptions?: LanguageModel.ProviderOptions;
    readonly execute?: (input: Input["Type"], options: ToolExecutionOptions) => Effect.Effect<Output["Type"], E, R>;
    readonly toModelOutput?: (
      options: ToolModelOutputOptions<Input["Type"], Output["Encoded"]>,
    ) => Effect.Effect<LanguageModel.ToolResultOutput, ToModelOutputE, ToModelOutputR>;
  },
): FunctionTool<Name, Input, Output, E, R, ToModelOutputE, ToModelOutputR> =>
  internal.makeFunction({
    name,
    ...options,
  });

export { function_ as function };

/**
 * Declares a provider tool.
 *
 * @category constructors
 * @since 1.0.0
 */
export const provider = <const Name extends string>(
  name: Name,
  options: {
    readonly id: `${string}.${string}`;
    readonly args: Readonly<Record<string, unknown>>;
  },
): ProviderTool<Name> =>
  internal.makeProvider({
    name,
    id: options.id,
    args: options.args,
  });

/**
 * Gets a tool by name.
 *
 * @category accessors
 * @since 1.0.0
 */
export const get = (self: Tools, name: string): Tool | undefined =>
  Option.getOrUndefined(Array.findFirst(self, (tool) => tool.name === name));

/**
 * Reflects over tools.
 *
 * @category reflection
 * @since 1.0.0
 */
export const reflect = (
  self: Tools,
  options: {
    readonly onTool: (tool: Tool) => void;
  },
) => {
  Array.forEach(self, options.onTool);
};

/**
 * Converts a tool declaration to the model-facing tool shape.
 *
 * @category conversions
 * @since 1.0.0
 */
export const toModelTool = (tool: Tool): LanguageModel.FunctionTool | LanguageModel.ProviderTool =>
  Match.value(tool).pipe(
    Match.tag("Function", (tool) =>
      LanguageModel.Tool.Function({
        name: tool.name,
        input: internal.getJsonSchemaFromSchema(tool.input),
        ...(tool.description !== undefined ? { description: tool.description } : {}),
        ...(tool.inputExamples !== undefined ? { inputExamples: tool.inputExamples as any } : {}),
        ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
        ...(tool.providerOptions !== undefined ? { providerOptions: tool.providerOptions } : {}),
      }),
    ),
    Match.tag("Provider", (tool) =>
      LanguageModel.Tool.Provider({
        name: tool.name,
        id: tool.id,
        args: tool.args,
      }),
    ),
    Match.exhaustive,
  );

/**
 * Converts every tool to model-facing tool declarations.
 *
 * @category conversions
 * @since 1.0.0
 */
export const toModelTools = (self: Tools): ReadonlyArray<LanguageModel.FunctionTool | LanguageModel.ProviderTool> =>
  Array.map(self, toModelTool);

/**
 * Gets local function calls that can be executed by these tools.
 *
 * @category execution
 * @since 1.0.0
 */
export const executableCalls = (
  self: Tools,
  content: ReadonlyArray<LanguageModel.Content>,
): ReadonlyArray<LanguageModel.ToolCall> =>
  Array.filter(content, (part): part is LanguageModel.ToolCall => {
    const tool = part._tag === "ToolCall" ? get(self, part.name) : undefined;
    return (
      part._tag === "ToolCall" &&
      part.providerExecuted !== true &&
      tool?._tag === "Function" &&
      tool.execute !== undefined
    );
  });

/**
 * Executes local function calls concurrently.
 *
 * @category execution
 * @since 1.0.0
 */
export const executeCalls = <Ts extends Tools>(
  self: Ts,
  messages: LanguageModel.Prompt,
  toolCalls: ReadonlyArray<LanguageModel.ToolCall>,
  abortSignal: AbortSignal | undefined,
): Effect.Effect<ReadonlyArray<LanguageModel.ToolResultPart>, Middleware.AgentError, Services<Ts[number]>> =>
  Effect.forEach(toolCalls, (toolCall) => executeCall(self, messages, toolCall, abortSignal), {
    concurrency: "unbounded",
  });

const executeCall = <Ts extends Tools>(
  self: Ts,
  messages: LanguageModel.Prompt,
  toolCall: LanguageModel.ToolCall,
  abortSignal: AbortSignal | undefined,
): Effect.Effect<LanguageModel.ToolResultPart, Middleware.AgentError, Services<Ts[number]>> =>
  Effect.gen(function* () {
    const tool = get(self, toolCall.name);
    if (tool === undefined || tool._tag !== "Function" || tool.execute === undefined) {
      return yield* new Middleware.AgentError({
        reason: "ToolExecution",
        message: `Tool ${toolCall.name} is not executable`,
        toolName: toolCall.name,
        toolCallId: toolCall.id,
      });
    }
    const raw = yield* Prompt.parseToolInput(toolCall);
    const input = yield* SchemaModule.decodeUnknownEffect(tool.input)(raw).pipe(
      Effect.mapError(
        (cause) =>
          new Middleware.AgentError({
            reason: "InvalidToolInput",
            message: `Tool ${toolCall.name} input did not match its schema`,
            cause,
            toolName: toolCall.name,
            toolCallId: toolCall.id,
          }),
      ),
    );
    const opts = {
      toolCallId: toolCall.id,
      messages,
      ...(abortSignal !== undefined ? { abortSignal } : {}),
    };
    const output = yield* tool.execute(input, opts).pipe(
      Effect.mapError(
        (cause) =>
          new Middleware.AgentError({
            reason: "ToolExecution",
            message: `Tool ${toolCall.name} failed`,
            cause,
            toolName: toolCall.name,
            toolCallId: toolCall.id,
          }),
      ),
    );
    const encoded = yield* SchemaModule.encodeUnknownEffect(tool.output)(output).pipe(
      Effect.mapError(
        (cause) =>
          new Middleware.AgentError({
            reason: "ToolOutput",
            message: `Tool ${toolCall.name} output did not match its schema`,
            cause,
            toolName: toolCall.name,
            toolCallId: toolCall.id,
          }),
      ),
    );
    const result = yield* toModelOutput(tool, toolCall, input, encoded);
    return LanguageModel.Part.ToolResult({
      id: toolCall.id,
      name: toolCall.name,
      output: result,
    });
  });

const toModelOutput = <Input extends Schema.Constraint, Output extends Schema.Constraint>(
  tool: FunctionTool<string, Input, Output, any, any, any, any>,
  toolCall: LanguageModel.ToolCall,
  input: Input["Type"],
  output: Output["Encoded"],
): Effect.Effect<LanguageModel.ToolResultOutput, Middleware.AgentError, any> => {
  if (tool.toModelOutput !== undefined) {
    return tool.toModelOutput({ toolCallId: toolCall.id, input, output }).pipe(
      Effect.mapError(
        (cause) =>
          new Middleware.AgentError({
            reason: "ToolResultOutput",
            message: `Tool ${toolCall.name} failed to create model output`,
            cause,
            toolName: toolCall.name,
            toolCallId: toolCall.id,
          }),
      ),
    );
  }
  if (typeof output === "string") {
    return Effect.succeed(LanguageModel.ToolResultOutput.Text({ value: output }));
  }
  return Effect.succeed(LanguageModel.ToolResultOutput.Json({ value: output as Schema.Json }));
};
