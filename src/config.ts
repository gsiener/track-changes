import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const configSchema = z.object({
  googleServiceAccountPath: z.string().min(1, "Google service account path required"),
  claudeGoogleEmail: z.string().email("Valid email required for Claude's Google account"),
  claudeGooglePassword: z.string().min(1, "Google password required"),
  anthropicApiKey: z.string().startsWith("sk-ant-", "Invalid Anthropic API key format"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    googleServiceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_PATH,
    claudeGoogleEmail: process.env.CLAUDE_GOOGLE_EMAIL,
    claudeGooglePassword: process.env.CLAUDE_GOOGLE_PASSWORD,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration error:\n${errors}\n\nSee .env.example for required variables.`);
  }

  return result.data;
}
