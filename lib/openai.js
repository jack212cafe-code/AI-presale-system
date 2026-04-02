import { config, hasOpenAi } from "./config.js";
import { safeParseJson } from "./json.js";

export async function embedQuery(query) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai.apiKey}`
    },
    body: JSON.stringify({
      model: config.openai.embeddingModel || "text-embedding-3-small",
      input: query
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return payload.data?.[0]?.embedding ?? [];
}

function collectOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim() !== "") {
    return payload.output_text.trim();
  }

  const texts = [];
  for (const item of payload.output || []) {
    if (item.type !== "message") {
      continue;
    }

    for (const contentItem of item.content || []) {
      if (typeof contentItem.text === "string") {
        texts.push(contentItem.text);
      }
    }
  }

  return texts.join("\n").trim();
}

export async function generateJsonWithOpenAI({
  systemPrompt,
  userPrompt,
  model,
  maxOutputTokens = 1800,
  mockResponseFactory,
  textFormat,
  attempt = 1
}) {
  if (!hasOpenAi()) {
    return {
      output: await mockResponseFactory(),
      usage: { input_tokens: 0, output_tokens: 0 },
      model: "mock",
      mock: true
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai.apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }]
        }
      ],
      max_output_tokens: maxOutputTokens,
      text: {
        format:
          textFormat ??
          {
            type: "json_object"
          }
      }
    })
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenAI request failed with status ${response.status}: ${failureText}`);
  }

  const payload = await response.json();
  const rawText = collectOutputText(payload);
  const parsed = safeParseJson(rawText);
  if (!parsed.ok) {
    const retry = payload.incomplete_details?.reason === "max_output_tokens" && attempt < 3;
    if (retry) {
      return generateJsonWithOpenAI({
        systemPrompt,
        userPrompt,
        model,
        maxOutputTokens: Math.min(8000, maxOutputTokens * 2),
        mockResponseFactory,
        textFormat,
        attempt: attempt + 1
      });
    }

    if (mockResponseFactory) {
      return {
        output: await mockResponseFactory(),
        usage: payload.usage ?? { input_tokens: 0, output_tokens: 0 },
        model: payload.model ?? model,
        mock: true
      };
    }

    throw parsed.error;
  }

  return {
    output: parsed.value,
    usage: payload.usage ?? { input_tokens: 0, output_tokens: 0 },
    model: payload.model ?? model,
    mock: false
  };
}
