import mongoose from 'mongoose';

const chatConversationSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    userId: {
      type: String,
      default: '',
      trim: true,
    },
    userName: {
      type: String,
      default: 'Customer',
      trim: true,
    },
    lastMessage: {
      type: String,
      default: '',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    hasAdminReplied: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);

export default ChatConversation;
