/** @internal */
import * as Array from "effect/Array";
import * as Chunk from "effect/Chunk";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import type * as AgentModule from "../Agent.ts";
import * as Middleware from "../Middleware.ts";
import * as Prompt from "../Prompt.ts";
import * as Tool from "../Tool.ts";

interface StreamFoldState {
  readonly content: Chunk.Chunk<LanguageModel.Content>;
  readonly text: HashMap.HashMap<string, string>;
  readonly reasoning: HashMap.HashMap<string, string>;
  readonly finish: LanguageModel.Finish;
  readonly usage: LanguageModel.Usage;
  readonly providerMetadata?: LanguageModel.ProviderMetadata | undefined;
  readonly warnings: Chunk.Chunk<LanguageModel.Warning>;
  readonly responseMetadata?: LanguageModel.GenerateResult["response"] | undefined;
}

type StreamFoldUpdate = (state: StreamFoldState) => StreamFoldState;

/** @internal */
export const runAgent = <
  Id extends string,
  Tools extends Tool.Tools,
  Middlewares extends ReadonlyArray<Middleware.Middleware<any>>,
>(
  agent: AgentModule.Agent<Id, Tools, Middlewares>,
  input: Prompt.UserInput,
  options: Middleware.RunOptions,
): Effect.Effect<Middleware.RunResult, Middleware.AgentError, AgentModule.Requirements<Tools, Middlewares>> =>
  Effect.gen(function* () {
    const model = yield* LanguageModel.LanguageModel;
    const handler = buildHandler(agent, model);
    return yield* handler.run(makeRequest(agent, input, options));
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof Middleware.AgentError
        ? cause
        : new Middleware.AgentError({ reason: "Unknown", message: "Agent failed", cause }),
    ),
  );

/** @internal */
export const streamAgent = <
  Id extends string,
  Tools extends Tool.Tools,
  Middlewares extends ReadonlyArray<Middleware.Middleware<any>>,
>(
  agent: AgentModule.Agent<Id, Tools, Middlewares>,
  input: Prompt.UserInput,
  options: Middleware.RunOptions,
): Stream.Stream<Middleware.StreamPart, Middleware.AgentError, AgentModule.Requirements<Tools, Middlewares>> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const model = yield* LanguageModel.LanguageModel;
      const handler = buildHandler(agent, model);
      return handler.stream(makeRequest(agent, input, options));
    }),
  ).pipe(
    Stream.mapError((cause) =>
      cause instanceof Middleware.AgentError
        ? cause
        : new Middleware.AgentError({ reason: "Unknown", message: "Agent failed", cause }),
    ),
  );

const buildHandler = <Tools extends Tool.Tools>(
  agent: AgentModule.Agent<string, Tools, ReadonlyArray<Middleware.Middleware<any>>>,
  model: LanguageModel.LanguageModel,
): Middleware.Handler<Tools, any> =>
  Array.reduce(
    Array.reverse(agent.middlewares),
    coreHandler<Tools>(model) as Middleware.Handler<Tools, any>,
    (handler, item) => item.wrap(handler),
  );

const coreHandler = <Tools extends Tool.Tools>(model: LanguageModel.LanguageModel): Middleware.Handler<Tools, any> => ({
  run: (request) => runOnce(model, request),
  stream: (request) => streamOnce(model, request),
});

const makeRequest = <Tools extends Tool.Tools>(
  agent: AgentModule.Agent<string, Tools, ReadonlyArray<Middleware.Middleware<any>>>,
  input: Prompt.UserInput,
  options: Middleware.RunOptions,
): Middleware.Request<Tools> => ({
  id: agent.id,
  instructions: agent.instructions,
  input: Prompt.toUserMessage(input),
  messages: [Prompt.toUserMessage(input)],
  tools: agent.tools,
  options: mergeModelOptions(agent.options, options),
  steps: [],
  ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : {}),
});

const mergeModelOptions = (base: Middleware.ModelOptions, options: Middleware.RunOptions): Middleware.ModelOptions => ({
  ...base,
  maxOutputTokens: options.maxOutputTokens ?? base.maxOutputTokens,
  temperature: options.temperature ?? base.temperature,
  stopSequences: options.stopSequences ?? base.stopSequences,
  topP: options.topP ?? base.topP,
  topK: options.topK ?? base.topK,
  presencePenalty: options.presencePenalty ?? base.presencePenalty,
  frequencyPenalty: options.frequencyPenalty ?? base.frequencyPenalty,
  responseFormat: options.responseFormat ?? base.responseFormat,
  seed: options.seed ?? base.seed,
  toolChoice: options.toolChoice ?? base.toolChoice,
  includeRaw: options.includeRaw ?? base.includeRaw,
  headers: options.headers ?? base.headers,
  providerOptions: options.providerOptions ?? base.providerOptions,
});

const runOnce = (
  model: LanguageModel.LanguageModel,
  request: Middleware.Request,
): Effect.Effect<Middleware.RunResult, Middleware.AgentError, any> =>
  Effect.gen(function* () {
    const response = yield* model.generate(toGenerateOptions(request)).pipe(
      Effect.mapError(
        (cause) =>
          new Middleware.AgentError({
            reason: "LanguageModel",
            message: cause.message,
            cause,
          }),
      ),
    );
    return yield* toRunResult(request, response);
  });

const streamOnce = (
  model: LanguageModel.LanguageModel,
  request: Middleware.Request,
): Stream.Stream<Middleware.StreamPart, Middleware.AgentError, any> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const step = request.steps.length;
      const fold = yield* Ref.make(emptyStreamFoldState);
      const result = yield* model.stream(toGenerateOptions(request)).pipe(
        Effect.mapError(
          (cause) =>
            new Middleware.AgentError({
              reason: "LanguageModel",
              message: cause.message,
              cause,
            }),
        ),
      );
      const modelParts = result.stream.pipe(
        Stream.mapError(
          (cause) =>
            new Middleware.AgentError({
              reason: "LanguageModel",
              message: cause.message,
              cause,
            }),
        ),
        Stream.tap((part) => Effect.flatMap(streamFoldUpdate(part), (update) => Ref.update(fold, update))),
        Stream.map((part) => Middleware.StreamPart.Model({ step, part })),
      );

      return Stream.concat(
        modelParts,
        Stream.unwrap(
          Effect.gen(function* () {
            const state = yield* Ref.get(fold);
            const response = generateResultFromFoldState(state);
            const runResult = yield* toRunResult(request, response);
            return Stream.fromIterable([
              Middleware.StreamPart.StepEnd({ step, finish: response.finish }),
              Middleware.StreamPart.Finish({
                steps: runResult.steps,
                finish: response.finish,
                result: runResult,
              }),
            ] satisfies ReadonlyArray<Middleware.StreamPart>);
          }),
        ),
      );
    }),
  );

const toGenerateOptions = (request: Middleware.Request): LanguageModel.GenerateOptions => ({
  prompt: Prompt.compile({
    instructions: request.instructions,
    messages: request.messages,
  }),
  maxOutputTokens: request.options.maxOutputTokens,
  temperature: request.options.temperature,
  stopSequences: request.options.stopSequences,
  topP: request.options.topP,
  topK: request.options.topK,
  presencePenalty: request.options.presencePenalty,
  frequencyPenalty: request.options.frequencyPenalty,
  responseFormat: request.options.responseFormat,
  seed: request.options.seed,
  tools: Tool.toModelTools(request.tools),
  toolChoice: request.options.toolChoice,
  includeRaw: request.options.includeRaw,
  abortSignal: request.abortSignal,
  headers: request.options.headers,
  providerOptions: request.options.providerOptions,
});

const toRunResult = (
  request: Middleware.Request,
  response: LanguageModel.GenerateResult,
): Effect.Effect<Middleware.RunResult, Middleware.AgentError> =>
  Effect.gen(function* () {
    const message = yield* Prompt.toAssistantMessage(response.content);
    const messages = Array.append(request.messages, message);
    const toolCalls = Tool.executableCalls(request.tools, response.content);
    const step = {
      index: request.steps.length,
      response,
      toolCalls,
      toolResults: [],
    } satisfies Middleware.Step;
    return {
      ...response,
      steps: Array.append(request.steps, step),
      messages,
    };
  });

const generateResultFromFoldState = (state: StreamFoldState): LanguageModel.GenerateResult => ({
  content: Chunk.toReadonlyArray(state.content),
  finish: state.finish,
  usage: state.usage,
  ...(state.providerMetadata !== undefined ? { providerMetadata: state.providerMetadata } : {}),
  ...(state.responseMetadata !== undefined ? { response: state.responseMetadata } : {}),
  warnings: Chunk.toReadonlyArray(state.warnings),
});

const streamFoldUpdate = (part: LanguageModel.StreamPart): Effect.Effect<StreamFoldUpdate, Middleware.AgentError> =>
  Match.value(part).pipe(
    Match.tag("StreamStart", (part) =>
      Effect.succeed(
        (state: StreamFoldState): StreamFoldState => ({
          ...state,
          warnings: Chunk.appendAll(state.warnings, Chunk.fromIterable(part.warnings)),
        }),
      ),
    ),
    Match.tag("TextStart", (part) =>
      Effect.succeed(
        (state: StreamFoldState): StreamFoldState => ({
          ...state,
          text: HashMap.set(state.text, part.id, ""),
        }),
      ),
    ),
    Match.tag("TextDelta", (part) =>
      Effect.succeed((state: StreamFoldState): StreamFoldState => {
        const value = HashMap.get(state.text, part.id);
        return {
          ...state,
          text: HashMap.set(state.text, part.id, (Option.isSome(value) ? value.value : "") + part.delta),
        };
      }),
    ),
    Match.tag("TextEnd", (part) =>
      Effect.succeed((state: StreamFoldState): StreamFoldState => {
        const value = HashMap.get(state.text, part.id);
        return {
          ...state,
          content: Option.isSome(value)
            ? Chunk.append(state.content, LanguageModel.Content.Text({ text: value.value }))
            : state.content,
        };
      }),
    ),
    Match.tag("ReasoningStart", (part) =>
      Effect.succeed(
        (state: StreamFoldState): StreamFoldState => ({
          ...state,
          reasoning: HashMap.set(state.reasoning, part.id, ""),
        }),
      ),
    ),
    Match.tag("ReasoningDelta", (part) =>
      Effect.succeed((state: StreamFoldState): StreamFoldState => {
        const value = HashMap.get(state.reasoning, part.id);
        return {
          ...state,
          reasoning: HashMap.set(state.reasoning, part.id, (Option.isSome(value) ? value.value : "") + part.delta),
        };
      }),
    ),
    Match.tag("ReasoningEnd", (part) =>
      Effect.succeed((state: StreamFoldState): StreamFoldState => {
        const value = HashMap.get(state.reasoning, part.id);
        return {
          ...state,
          content: Option.isSome(value)
            ? Chunk.append(state.content, LanguageModel.Content.Reasoning({ text: value.value }))
            : state.content,
        };
      }),
    ),
    Match.tag("ToolCall", "ToolResult", "ToolApprovalRequest", "File", "UrlSource", "DocumentSource", (part) =>
      Effect.succeed(
        (state: StreamFoldState): StreamFoldState => ({
          ...state,
          content: Chunk.append(state.content, part),
        }),
      ),
    ),
    Match.tag("Finish", (part) =>
      Effect.succeed(
        (state: StreamFoldState): StreamFoldState => ({
          ...state,
          finish: part.finish,
          usage: part.usage,
          ...(part.providerMetadata !== undefined ? { providerMetadata: part.providerMetadata } : {}),
        }),
      ),
    ),
    Match.tag("ResponseMetadata", (part) =>
      Effect.succeed(
        (state: StreamFoldState): StreamFoldState => ({
          ...state,
          responseMetadata: part,
        }),
      ),
    ),
    Match.tag("ToolInputStart", "ToolInputDelta", "ToolInputEnd", "Raw", () =>
      Effect.succeed((state: StreamFoldState): StreamFoldState => state),
    ),
    Match.tag("Error", (part) =>
      Effect.fail(
        new Middleware.AgentError({
          reason: "LanguageModel",
          message: "Language model stream emitted an error",
          cause: part.error,
        }),
      ),
    ),
    Match.exhaustive,
  );

const emptyUsage: LanguageModel.Usage = {
  inputTokens: {
    total: undefined,
    uncached: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: undefined,
    text: undefined,
    reasoning: undefined,
  },
};

const emptyStreamFoldState: StreamFoldState = {
  content: Chunk.empty<LanguageModel.Content>(),
  text: HashMap.empty<string, string>(),
  reasoning: HashMap.empty<string, string>(),
  finish: { reason: "Other" },
  usage: emptyUsage,
  warnings: Chunk.empty<LanguageModel.Warning>(),
};
