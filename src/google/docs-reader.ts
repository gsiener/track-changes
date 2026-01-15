import type { docs_v1, drive_v3 } from "googleapis";
import { createDocsClient, createDriveClient } from "./auth.js";
import type { Config } from "../config.js";
import type { DocumentContent, CommentThread, CommentReply } from "./types.js";
import { logger } from "../utils/logger.js";

export class DocsReader {
  private docsClient: docs_v1.Docs;
  private driveClient: drive_v3.Drive;

  constructor(config: Config) {
    this.docsClient = createDocsClient(config);
    this.driveClient = createDriveClient(config);
  }

  async fetchDocument(documentId: string): Promise<DocumentContent> {
    logger.info("Fetching document content", { documentId });

    // Fetch document content
    const docResponse = await this.docsClient.documents.get({
      documentId,
      suggestionsViewMode: "SUGGESTIONS_INLINE",
    });

    const doc = docResponse.data;
    const title = doc.title ?? "Untitled";
    const body = this.extractBodyText(doc.body);

    logger.info("Document fetched", { title, bodyLength: body.length });

    // Fetch comments
    const comments = await this.fetchComments(documentId);

    return {
      id: documentId,
      title,
      body,
      comments,
    };
  }

  private extractBodyText(body: docs_v1.Schema$Body | undefined): string {
    if (!body?.content) return "";

    const textParts: string[] = [];

    for (const element of body.content) {
      if (element.paragraph) {
        const paragraphText = this.extractParagraphText(element.paragraph);
        textParts.push(paragraphText);
      } else if (element.table) {
        const tableText = this.extractTableText(element.table);
        textParts.push(tableText);
      }
    }

    return textParts.join("\n");
  }

  private extractParagraphText(paragraph: docs_v1.Schema$Paragraph): string {
    if (!paragraph.elements) return "";

    return paragraph.elements
      .map((el) => el.textRun?.content ?? "")
      .join("");
  }

  private extractTableText(table: docs_v1.Schema$Table): string {
    if (!table.tableRows) return "";

    const rows = table.tableRows.map((row) => {
      if (!row.tableCells) return "";
      return row.tableCells
        .map((cell) => {
          if (!cell.content) return "";
          return cell.content
            .map((el) => {
              if (el.paragraph) return this.extractParagraphText(el.paragraph);
              return "";
            })
            .join("");
        })
        .join("\t");
    });

    return rows.join("\n");
  }

  private async fetchComments(documentId: string): Promise<CommentThread[]> {
    logger.info("Fetching comments", { documentId });

    try {
      const response = await this.driveClient.comments.list({
        fileId: documentId,
        fields: "comments(id,content,author,resolved,quotedFileContent,replies)",
        includeDeleted: false,
      });

      const comments = response.data.comments ?? [];
      logger.info("Comments fetched", { count: comments.length });

      return comments.map((comment): CommentThread => ({
        id: comment.id ?? "",
        anchorText: comment.quotedFileContent?.value ?? "",
        content: comment.content ?? "",
        author: comment.author?.displayName ?? "Unknown",
        resolved: comment.resolved ?? false,
        replies: (comment.replies ?? []).map((reply): CommentReply => ({
          content: reply.content ?? "",
          author: reply.author?.displayName ?? "Unknown",
        })),
      }));
    } catch (error) {
      logger.warn("Failed to fetch comments (may need Drive API scope)", {
        error: String(error),
      });
      return [];
    }
  }

  async replyToComment(
    documentId: string,
    commentId: string,
    replyText: string,
    resolve: boolean = false
  ): Promise<void> {
    logger.info("Creating comment reply via Drive API", {
      documentId,
      commentId,
      willResolve: resolve,
    });

    // Create the reply
    await this.driveClient.replies.create({
      fileId: documentId,
      commentId: commentId,
      fields: "id,content,author",
      requestBody: {
        content: replyText,
      },
    });

    logger.info("Reply created successfully");

    // Resolve if requested
    if (resolve) {
      await this.resolveComment(documentId, commentId);
    }
  }

  async resolveComment(documentId: string, commentId: string): Promise<void> {
    logger.info("Resolving comment via Drive API", { documentId, commentId });

    await this.driveClient.comments.update({
      fileId: documentId,
      commentId: commentId,
      fields: "id,resolved",
      requestBody: {
        resolved: true,
      },
    });

    logger.info("Comment resolved successfully");
  }
}
