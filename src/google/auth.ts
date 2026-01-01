import { google } from "googleapis";
import { readFileSync } from "fs";
import type { Config } from "../config.js";

export function createGoogleAuth(config: Config) {
  if (!config.googleServiceAccountPath) {
    throw new Error("Google service account path not configured");
  }

  const credentials = JSON.parse(
    readFileSync(config.googleServiceAccountPath, "utf-8")
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/documents.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });

  return auth;
}

export function createDocsClient(config: Config) {
  const auth = createGoogleAuth(config);
  return google.docs({ version: "v1", auth });
}

export function createDriveClient(config: Config) {
  const auth = createGoogleAuth(config);
  return google.drive({ version: "v3", auth });
}
