/**
 * Adapter from AI SDK language models to this project's language model service.
 *
 * @since 1.0.0
 */
export {
  fromLanguageModel,
  fromLanguageModelV2,
  fromLanguageModelV3,
  type AiSdkLanguageModel,
} from "./internal/aiSdk.ts";
