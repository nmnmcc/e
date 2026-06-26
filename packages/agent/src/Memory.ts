/**
 * Memory service for agent conversation history.
 *
 * @since 1.0.0
 */
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import type * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import * as Middleware from "./Middleware.ts";

const TypeId = "~@nmnmcc/e-agent/Memory";

/**
 * Agent memory service.
 *
 * @category services
 * @since 1.0.0
 */
export interface Memory {
  readonly [TypeId]: typeof TypeId;
  readonly get: Effect.Effect<LanguageModel.Prompt>;
  readonly set: (prompt: LanguageModel.Prompt) => Effect.Effect<void>;
  readonly append: (messages: ReadonlyArray<LanguageModel.Message>) => Effect.Effect<void>;
  readonly reset: Effect.Effect<void>;
}

/**
 * Context service tag for agent memory.
 *
 * @category services
 * @since 1.0.0
 */
export const Memory: Context.Service<Memory, Memory> = Context.Service(TypeId);

/**
 * Builds memory from an existing Effect ref.
 *
 * @category constructors
 * @since 1.0.0
 */
export const fromRef = (ref: Ref.Ref<LanguageModel.Prompt>): Memory =>
  Memory.of({
    [TypeId]: TypeId,
    get: Ref.get(ref),
    set: (prompt) => Ref.set(ref, prompt),
    append: (messages) => Ref.update(ref, (prompt) => Array.appendAll(prompt, messages)),
    reset: Ref.set(ref, []),
  });

/**
 * Builds middleware that reads and writes agent memory.
 *
 * @category middleware
 * @since 1.0.0
 */
export const middleware = (memory: Memory): Middleware.Middleware =>
  Middleware.make((handler) => ({
    run: (request) =>
      Effect.gen(function* () {
        const base = yield* memory.get;
        const result = yield* handler.run({
          ...request,
          messages: Array.appendAll(base, request.messages),
        });
        yield* memory.set(result.messages);
        return result;
      }),
    stream: (request) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const base = yield* memory.get;
          return handler
            .stream({
              ...request,
              messages: Array.appendAll(base, request.messages),
            })
            .pipe(
              Stream.tap((part) =>
                part._tag === "Finish" ? memory.set(part.result.messages) : Effect.succeed(undefined),
              ),
            );
        }),
      ),
  }));

/**
 * Builds in-memory conversation history.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = (initial: LanguageModel.Prompt = []): Effect.Effect<Memory> =>
  Effect.map(Ref.make(initial), fromRef);

/**
 * Builds a layer for in-memory conversation history.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer = (initial: LanguageModel.Prompt = []): Layer.Layer<Memory> =>
  Layer.effect(Memory, make(initial));
