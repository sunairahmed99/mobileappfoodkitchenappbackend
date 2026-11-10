import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, default: '' },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: ['deal', 'dish', 'frozen'], required: true },
    serving: { type: String, default: '', maxlength: 120 },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: '' },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    customerEmail: { type: String, required: true, trim: true, lowercase: true },
    customerPhone: { type: String, required: true, trim: true, maxlength: 40 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    items: { type: [orderItemSchema], required: true, validate: (items) => items.length > 0 },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    packagingFee: { type: Number, required: true, min: 0 },
    tip: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, required: true, maxlength: 60 },
    transactionId: { type: String, default: '', maxlength: 120 },
    notes: { type: String, default: '', maxlength: 1000 },
    status: {
      type: String,
      enum: ['Processing', 'Confirmed', 'Delivered', 'Cancelled'],
      default: 'Processing',
    },
    placedAt: { type: Date, default: Date.now },
    estimatedDeliveryTime: { type: String, default: '30-45 mins', maxlength: 100 },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, placedAt: -1 });
orderSchema.index({ status: 1, placedAt: -1 });

const Order = mongoose.model('Order', orderSchema);

export default Order;
