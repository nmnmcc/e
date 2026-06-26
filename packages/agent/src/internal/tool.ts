/** @internal */
import * as JsonSchema from "effect/JsonSchema";
import type { Effect } from "effect/Effect";
import type * as Schema from "effect/Schema";
import * as SchemaModule from "effect/Schema";

import type * as LanguageModel from "@nmnmcc/e-language-model/LanguageModel";
import type * as Tool from "../Tool.ts";

const TypeId = "~@nmnmcc/e-agent/Tool";

const FunctionProto = {
  [TypeId]: TypeId,
};

const ProviderProto = {
  [TypeId]: TypeId,
};

/** @internal */
export const makeFunction = <
  Name extends string,
  Input extends Schema.Constraint,
  Output extends Schema.Constraint,
  E,
  R,
  ToModelOutputE,
  ToModelOutputR,
>(options: {
  readonly name: Name;
  readonly description?: string;
  readonly input: Input;
  readonly output: Output;
  readonly strict?: boolean;
  readonly inputExamples?: ReadonlyArray<{ readonly input: Input["Type"] }>;
  readonly providerOptions?: LanguageModel.ProviderOptions;
  readonly execute?: (input: Input["Type"], options: Tool.ToolExecutionOptions) => Effect<Output["Type"], E, R>;
  readonly toModelOutput?: (
    options: Tool.ToolModelOutputOptions<Input["Type"], Output["Encoded"]>,
  ) => Effect<LanguageModel.ToolResultOutput, ToModelOutputE, ToModelOutputR>;
}): Tool.FunctionTool<Name, Input, Output, E, R, ToModelOutputE, ToModelOutputR> =>
  Object.setPrototypeOf(
    {
      ...options,
      _tag: "Function" as const,
    },
    FunctionProto,
  );

/** @internal */
export const makeProvider = <Name extends string>(options: {
  readonly name: Name;
  readonly id: `${string}.${string}`;
  readonly args: Readonly<Record<string, unknown>>;
}): Tool.ProviderTool<Name> =>
  Object.setPrototypeOf(
    {
      ...options,
      _tag: "Provider" as const,
    },
    ProviderProto,
  );

/** @internal */
export const getJsonSchemaFromSchema = (schema: Schema.Constraint): LanguageModel.JsonSchema => {
  const document = JsonSchema.resolveTopLevel$ref(SchemaModule.toJsonSchemaDocument(schema));
  return document.schema as LanguageModel.JsonSchema;
};
