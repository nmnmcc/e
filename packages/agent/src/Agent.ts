/**
 * Agent declarations.
 *
 * @since 1.0.0
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import * as internal from "./internal/agent.ts";
import * as Middleware from "./Middleware.ts";
import * as Prompt from "./Prompt.ts";
import * as Tool from "./Tool.ts";

export {
  AgentError,
  type AgentErrorReason,
  type ModelOptions,
  type RunOptions,
  type RunResult,
  type Step,
  type StreamPart,
} from "./Middleware.ts";

const TypeId = "~@nmnmcc/e-agent/Agent";

/**
 * Agent service.
 *
 * @category services
 * @since 1.0.0
 */
export interface Agent<
  out Id extends string = string,
  out Tools extends Tool.Tools = Tool.Tools,
  out Middlewares extends ReadonlyArray<Middleware.Middleware<any>> = ReadonlyArray<Middleware.Middleware<any>>,
> {
  readonly [TypeId]: typeof TypeId;
  readonly id: Id;
  readonly instructions?: string | undefined;
  readonly tools: Tools;
  readonly options: Middleware.ModelOptions;
  readonly middlewares: Middlewares;
  readonly annotations: Context.Context<never>;
  readonly run: (
    input: Prompt.UserInput,
    options?: Middleware.RunOptions,
  ) => Effect.Effect<Middleware.RunResult, Middleware.AgentError, Requirements<Tools, Middlewares>>;
  readonly stream: (
    input: Prompt.UserInput,
    options?: Middleware.RunOptions,
  ) => Stream.Stream<Middleware.StreamPart, Middleware.AgentError, Requirements<Tools, Middlewares>>;
}

/**
 * Infer agent service types.
 *
 * @category type-level
 * @since 1.0.0
 */
export type Requirements<Tools extends Tool.Tools, Middlewares extends ReadonlyArray<Middleware.Middleware<any>>> =
  | LanguageModel.LanguageModel
  | Tool.Services<Tools[number]>
  | Middleware.Services<Middlewares[number]>;

/**
 * Context service tag for the active agent.
 *
 * @category services
 * @since 1.0.0
 */
export const Agent: Context.Service<Agent, Agent> = Context.Service(TypeId);

/**
 * Options for an agent.
 *
 * @category options
 * @since 1.0.0
 */
export interface Options<
  out Tools extends Tool.Tools = Tool.Tools,
  out Middlewares extends ReadonlyArray<Middleware.Middleware<any>> = ReadonlyArray<Middleware.Middleware<any>>,
> {
  readonly instructions?: string | undefined;
  readonly tools?: Tools | undefined;
  readonly modelOptions?: Middleware.ModelOptions | undefined;
  readonly middlewares?: Middlewares | undefined;
  readonly annotations?: Context.Context<never> | undefined;
}

/**
 * Creates an agent.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = <
  const Id extends string,
  const Tools extends Tool.Tools = readonly [],
  const Middlewares extends ReadonlyArray<Middleware.Middleware<any>> = readonly [],
>(
  id: Id,
  options: Options<Tools, Middlewares> = {},
): Agent<Id, Tools, Middlewares> => {
  const agent: Agent<Id, Tools, Middlewares> = {
    [TypeId]: TypeId,
    id,
    ...(options.instructions !== undefined ? { instructions: options.instructions } : {}),
    tools: options.tools ?? ([] as unknown as Tools),
    options: options.modelOptions ?? {},
    middlewares: options.middlewares ?? ([] as unknown as Middlewares),
    annotations: options.annotations ?? Context.empty(),
    run: (input, runOptions = {}) => internal.runAgent(agent, input, runOptions),
    stream: (input, runOptions = {}) => internal.streamAgent(agent, input, runOptions),
  };
  return agent;
};

/**
 * Builds an agent layer from the active language model service.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer = (agent: Agent): Layer.Layer<Agent> => Layer.succeed(Agent, agent);

/**
 * Runs the active agent.
 *
 * @category constructors
 * @since 1.0.0
 */
export const run = (input: Prompt.UserInput, options?: Middleware.RunOptions) =>
  Agent.use((service) => service.run(input, options));

/**
 * Streams from the active agent.
 *
 * @category constructors
 * @since 1.0.0
 */
export const stream = (input: Prompt.UserInput, options?: Middleware.RunOptions) =>
  Agent.useSync((service) => service.stream(input, options)).pipe(Stream.unwrap);
