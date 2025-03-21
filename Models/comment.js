const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema(
  {
    story: {
      type: mongoose.Schema.ObjectId,
      required: true,
      ref: "Story",
    },
    content: {
      type: String,
      required: [true, "Please provide a content"],
    },
    author: {
      _id: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
      },
      username: String,
      photo: String,
    },
    likes: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
    ],
    likeCount: {
      type: Number,
      default: 0,
    },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },
    replies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment",
      },
    ],
    taggedReply: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Comment = mongoose.model("Comment", CommentSchema);

module.exports = Comment;
