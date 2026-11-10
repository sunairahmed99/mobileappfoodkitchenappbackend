import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      trim: true,
    },
    messageId: {
      type: String,
      required: true,
      trim: true,
    },
    sender: {
      type: String,
      enum: ['user', 'agent'],
      required: true,
    },
    senderName: {
      type: String,
      default: 'Customer',
      trim: true,
    },
    text: {
      type: String,
      default: '',
      maxlength: 5000,
    },
    image: {
      type: String,
      default: '',
    },
    time: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'delivered',
    },
  },
  { timestamps: true }
);

chatMessageSchema.index({ roomId: 1, createdAt: 1 });
chatMessageSchema.index({ roomId: 1, messageId: 1 }, { unique: true });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;
