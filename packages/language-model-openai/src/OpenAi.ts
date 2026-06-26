/**
 * Adapter from the official OpenAI SDK to this project's language model service.
 *
 * @since 1.0.0
 */
export {
  fromChatCompletionsClient,
  fromClient,
  fromResponsesClient,
  layer,
  make,
  type OpenAiApi,
  type OpenAiLanguageModelOptions,
} from "./internal/openAi.ts";
