export interface ReviewResponse {
  suggestions: TextSuggestion[];
  commentReplies: CommentReplyAction[];
  newComments: NewComment[];
}

export interface TextSuggestion {
  findText: string;
  contextBefore?: string;
  replaceWith: string;
  rationale?: string;
}

export interface CommentReplyAction {
  commentQuote: string;
  reply: string;
  resolve: boolean;
}

export interface NewComment {
  anchorText: string;
  comment: string;
}
