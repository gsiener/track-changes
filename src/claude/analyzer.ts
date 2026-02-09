import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Config } from "../config.js";
import type { DocumentContent } from "../google/types.js";
import type { ReviewResponse } from "./types.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import { logger } from "../utils/logger.js";

const reviewResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      findText: z.string(),
      contextBefore: z.string().optional(),
      replaceWith: z.string(),
      rationale: z.string().optional(),
    })
  ),
  commentReplies: z.array(
    z.object({
      commentQuote: z.string(),
      reply: z.string(),
      resolve: z.boolean(),
    })
  ),
  newComments: z.array(
    z.object({
      anchorText: z.string(),
      comment: z.string(),
    })
  ),
});

export class DocumentAnalyzer {
  private client: Anthropic;

  constructor(config: Config) {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  async analyze(
    document: DocumentContent,
    focusPrompt?: string
  ): Promise<ReviewResponse> {
    logger.trace("Sending document to Claude for analysis", {
      title: document.title,
      bodyLength: document.body.length,
      commentCount: document.comments.length,
    });

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildUserPrompt(document, focusPrompt),
        },
      ],
    });

    // Log API usage and cost
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const estimatedCost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    logger.trace("API usage", {
      model: "claude-sonnet-4-20250514",
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost: `$${estimatedCost.toFixed(4)}`,
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    let rawJson = textContent.text;
    logger.debug("Raw Claude response", { response: rawJson });

    // Extract JSON from response - handle text before/after and markdown fences
    rawJson = rawJson.trim();

    // Find JSON block in markdown fence
    const fenceMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      rawJson = fenceMatch[1].trim();
    } else if (!rawJson.startsWith("{")) {
      // Try to find JSON object in the response
      const jsonStart = rawJson.indexOf("{");
      const jsonEnd = rawJson.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        rawJson = rawJson.slice(jsonStart, jsonEnd + 1);
      }
    }

    // Parse and validate JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error(`Invalid JSON from Claude: ${rawJson.slice(0, 200)}...`);
    }

    const result = reviewResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Invalid response schema: ${result.error.errors.map((e) => e.message).join(", ")}`
      );
    }

    logger.trace("Analysis complete", {
      suggestions: result.data.suggestions.length,
      replies: result.data.commentReplies.length,
      newComments: result.data.newComments.length,
    });

    return result.data;
  }
}
