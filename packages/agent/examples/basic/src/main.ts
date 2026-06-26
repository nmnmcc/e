import * as Agent from "@nmnmcc/e-agent/Agent";
import * as Memory from "@nmnmcc/e-agent/Memory";
import * as Tool from "@nmnmcc/e-agent/Tool";
import * as ToolLoop from "@nmnmcc/e-agent/ToolLoop";
import * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import { OpenAi } from "@nmnmcc/e-language-model-openai";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const program = Effect.gen(function* () {
  const getWeather = Tool.function("getWeather", {
    description: "Get the current weather for a city.",
    input: Schema.Struct({
      city: Schema.String,
    }),
    output: Schema.Struct({
      city: Schema.String,
      temperatureC: Schema.Number,
    }),
    execute: (input) =>
      Effect.succeed({
        city: input.city,
        temperatureC: 24,
      }),
  });

  const memory = yield* Memory.make();

  const weatherAgent = Agent.make("weather-agent", {
    instructions: "Answer weather questions with tools.",
    tools: [getWeather],
    middlewares: [Memory.middleware(memory), ToolLoop.middleware({ maxSteps: 4 })],
  });

  const lm = OpenAi.make({ model: "" });
  const result = yield* Agent.run("What is the weather in Shanghai?").pipe(
    Effect.provide(Agent.layer(weatherAgent)),
    Effect.provideService(LanguageModel.LanguageModel, lm),
  );

  yield* Effect.sync(() => {
    Array.forEach(result.content, (part) => {
      if (part._tag === "Text") {
        console.log(part.text);
      }
    });

    console.log(`Steps: ${result.steps.length}`);
  });
});
