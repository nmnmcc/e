/**
 * Tool loop middleware.
 *
 * @since 1.0.0
 */
import * as internal from "./internal/toolLoop.ts";
import * as Middleware from "./Middleware.ts";
import * as Tool from "./Tool.ts";

/**
 * Tool loop middleware options.
 *
 * @category options
 * @since 1.0.0
 */
export interface Options {
  readonly maxSteps?: number | undefined;
}

/**
 * Builds middleware that executes local tool calls until the model finishes.
 *
 * @category middleware
 * @since 1.0.0
 */
export const middleware = (options: Options = {}): Middleware.Middleware => {
  const maxSteps = options.maxSteps ?? 20;
  return {
    wrap: <Ts extends Tool.Tools, R>(
      handler: Middleware.Handler<Ts, R>,
    ): Middleware.Handler<Ts, R | Tool.Services<Ts[number]>> => ({
      run: (request) => internal.runLoop(handler, maxSteps, request),
      stream: (request) => internal.streamLoop(handler, maxSteps, request),
    }),
  };
};
