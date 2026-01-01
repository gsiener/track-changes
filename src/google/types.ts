export interface DocumentContent {
  id: string;
  title: string;
  body: string;
  comments: CommentThread[];
}

export interface CommentThread {
  id: string;
  anchorText: string;
  content: string;
  author: string;
  resolved: boolean;
  replies: CommentReply[];
}

export interface CommentReply {
  content: string;
  author: string;
}
