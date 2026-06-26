/** @internal */
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import type * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import * as Middleware from "../Middleware.ts";
import * as Tool from "../Tool.ts";

/** @internal */
export const runLoop = <Ts extends Tool.Tools, R>(
  handler: Middleware.Handler<Ts, R>,
  maxSteps: number,
  request: Middleware.Request<Ts>,
): Effect.Effect<Middleware.RunResult, Middleware.AgentError, R | Tool.Services<Ts[number]>> =>
  Effect.gen(function* () {
    const result = yield* handler.run(request);
    const step = lastStep(result.steps);

    if (step === undefined || result.finish.reason !== "ToolCalls" || step.toolCalls.length === 0) {
      return result;
    }

    if (result.steps.length >= maxSteps) {
      return yield* maxStepsError(maxSteps);
    }

    const toolResults = yield* Tool.executeCalls(request.tools, result.messages, step.toolCalls, request.abortSignal);
    const nextStep = {
      ...step,
      toolResults,
    } satisfies Middleware.Step;
    return yield* runLoop(handler, maxSteps, {
      ...request,
      messages: Array.append(result.messages, {
        role: "tool",
        content: toolResults,
      } satisfies LanguageModel.ToolMessage),
      steps: replaceLast(result.steps, nextStep),
    });
  });

/** @internal */
export const streamLoop = <Ts extends Tool.Tools, R>(
  handler: Middleware.Handler<Ts, R>,
  maxSteps: number,
  request: Middleware.Request<Ts>,
): Stream.Stream<Middleware.StreamPart, Middleware.AgentError, R | Tool.Services<Ts[number]>> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const resultRef = yield* Ref.make<Option.Option<Middleware.RunResult>>(Option.none());
      const visible = handler.stream(request).pipe(
        Stream.tap((part) =>
          part._tag === "Finish" ? Ref.set(resultRef, Option.some(part.result)) : Effect.succeed(undefined),
        ),
        Stream.filter((part) => part._tag !== "StepEnd" && part._tag !== "Finish"),
      );

      return Stream.concat(
        visible,
        Stream.unwrap(
          Effect.gen(function* () {
            const option = yield* Ref.get(resultRef);
            if (Option.isNone(option)) {
              return Stream.fail(
                new Middleware.AgentError({
                  reason: "Unknown",
                  message: "Agent stream finished without a final result",
                }),
              );
            }

            const result = option.value;
            const step = lastStep(result.steps);

            if (step === undefined || result.finish.reason !== "ToolCalls" || step.toolCalls.length === 0) {
              return Stream.fromIterable([
                Middleware.StreamPart.StepEnd({ step: step?.index ?? result.steps.length, finish: result.finish }),
                Middleware.StreamPart.Finish({ steps: result.steps, finish: result.finish, result }),
              ] satisfies ReadonlyArray<Middleware.StreamPart>);
            }

            if (result.steps.length >= maxSteps) {
              return Stream.fail(maxStepsError(maxSteps));
            }

            return Stream.concat(
              Stream.fromIterable(
                Array.map(step.toolCalls, (toolCall) =>
                  Middleware.StreamPart.ToolExecutionStart({
                    step: step.index,
                    toolCall,
                  }),
                ),
              ),
              Stream.unwrap(
                Effect.gen(function* () {
                  const toolResults = yield* Tool.executeCalls(
                    request.tools,
                    result.messages,
                    step.toolCalls,
                    request.abortSignal,
                  );
                  const nextStep = {
                    ...step,
                    toolResults,
                  } satisfies Middleware.Step;
                  const nextRequest = {
                    ...request,
                    messages: Array.append(result.messages, {
                      role: "tool",
                      content: toolResults,
                    } satisfies LanguageModel.ToolMessage),
                    steps: replaceLast(result.steps, nextStep),
                  } satisfies Middleware.Request;
                  return Stream.concat(
                    Stream.fromIterable(
                      Array.append(
                        Array.map(Array.zip(step.toolCalls, toolResults), ([toolCall, toolResult]) =>
                          Middleware.StreamPart.ToolExecutionEnd({
                            step: step.index,
                            toolCall,
                            toolResult,
                          }),
                        ),
                        Middleware.StreamPart.StepEnd({ step: step.index, finish: result.finish }),
                      ),
                    ),
                    streamLoop(handler, maxSteps, nextRequest),
                  );
                }),
              ),
            );
          }),
        ),
      );
    }),
  );

const lastStep = (steps: ReadonlyArray<Middleware.Step>): Middleware.Step | undefined => steps[steps.length - 1];

const replaceLast = (steps: ReadonlyArray<Middleware.Step>, step: Middleware.Step): ReadonlyArray<Middleware.Step> =>
  Array.append(Array.take(steps, steps.length - 1), step);

const maxStepsError = (maxSteps: number): Middleware.AgentError =>
  new Middleware.AgentError({
    reason: "MaxStepsExceeded",
    message: `Agent exceeded maxSteps (${maxSteps}) while tool calls were still pending`,
  });
