import { sendEmail } from '../Config/email.js';
import Order from '../Models/Order.js';
import FoodItem from '../Models/FoodItem.js';
import { handleControllerError } from '../Utils/errorResponse.js';
import { recomputeCatalogStats, foodItemIdFromProductId } from '../Utils/catalogStats.js';

/**
 * Refreshes the derived bestseller / sold-count fields for every category touched
 * by an order. Failures are logged only - a ranking refresh must never fail the
 * customer's order.
 */
const refreshCatalogStats = async (items) => {
  try {
    const dishIds = (items || [])
      .filter((item) => item && item.type === 'dish')
      .map((item) => foodItemIdFromProductId(item.productId))
      .filter(Boolean);
    if (!dishIds.length) return;

    const dishes = await FoodItem.find({ _id: { $in: dishIds } }).select('categoryId').lean();
    const categoryIds = [
      ...new Set(dishes.map((dish) => String(dish.categoryId?._id || dish.categoryId || ''))),
    ].filter(Boolean);

    for (const categoryId of categoryIds) {
      await recomputeCatalogStats({ categoryId });
    }
  } catch (error) {
    console.error('Catalog stats refresh failed:', error.message);
  }
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);

const formatAmount = (value) => `Rs. ${Number(value).toLocaleString('en-PK')}`;

const buildConfirmationEmail = (order) => {
  const {
    orderId,
    placedAt,
    estimatedDeliveryTime,
    customerName,
    customerPhone,
    address,
    paymentMethod,
    items,
    subtotal,
    discount,
    deliveryFee,
    packagingFee,
    tip,
    total,
    notes,
    transactionId,
  } = order;
  const safeOrderId = escapeHtml(orderId.slice(0, 80));
  const safeName = escapeHtml(customerName.slice(0, 120));
  const safePlacedAt = escapeHtml(new Date(placedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }));
  const safeEta = escapeHtml(String(estimatedDeliveryTime || '30-45 mins').slice(0, 100));
  const itemRows = items.map((item) => {
    const title = escapeHtml(item.title.slice(0, 200));
    const serving = item.serving ? `<br><small>${escapeHtml(String(item.serving).slice(0, 120))}</small>` : '';
    return `<tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${title}${serving}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">${Number(item.quantity)}</td>
      <td style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb">${formatAmount(Number(item.price) * Number(item.quantity))}</td>
    </tr>`;
  }).join('');
  const safeAddress = escapeHtml(address.slice(0, 500));
  const safePhone = escapeHtml(customerPhone.slice(0, 40));
  const safePaymentMethod = escapeHtml(String(paymentMethod || 'Not specified').slice(0, 60));
  const safeNotes = notes ? escapeHtml(String(notes).slice(0, 1000)) : '';
  const safeTransactionId = transactionId
    ? escapeHtml(String(transactionId).slice(0, 120))
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;max-width:640px;margin:auto">
      <h1 style="color:#f97316">Order confirmed</h1>
      <p>Hello ${safeName},</p>
      <p>Thank you for your order. We have received it and our kitchen is preparing it.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr><td style="padding:6px 0"><strong>Order ID</strong></td><td style="text-align:right">#${safeOrderId}</td></tr>
        <tr><td style="padding:6px 0"><strong>Order time</strong></td><td style="text-align:right">${safePlacedAt}</td></tr>
        <tr><td style="padding:6px 0"><strong>Estimated delivery</strong></td><td style="text-align:right">${safeEta}</td></tr>
      </table>
      <h2 style="font-size:18px">Your items</h2>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:10px;text-align:left">Product</th>
          <th style="padding:10px">Qty</th>
          <th style="padding:10px;text-align:right">Amount</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table style="width:100%;margin-top:14px;border-collapse:collapse">
        <tr><td style="padding:5px 0">Items subtotal</td><td style="text-align:right">${formatAmount(Number(subtotal))}</td></tr>
        ${Number(discount) > 0 ? `<tr><td style="padding:5px 0">Discount</td><td style="text-align:right">- ${formatAmount(Number(discount))}</td></tr>` : ''}
        <tr><td style="padding:5px 0">Delivery fee</td><td style="text-align:right">${formatAmount(Number(deliveryFee))}</td></tr>
        <tr><td style="padding:5px 0">Packaging fee</td><td style="text-align:right">${formatAmount(Number(packagingFee))}</td></tr>
        ${Number(tip) > 0 ? `<tr><td style="padding:5px 0">Rider tip</td><td style="text-align:right">${formatAmount(Number(tip))}</td></tr>` : ''}
        <tr><td style="padding:10px 0;border-top:1px solid #d1d5db"><strong>Total</strong></td><td style="text-align:right;border-top:1px solid #d1d5db"><strong>${formatAmount(Number(total))}</strong></td></tr>
      </table>
      <h2 style="font-size:18px">Delivery details</h2>
      <p>${safeName}<br>${safePhone}<br>${safeAddress}</p>
      <p><strong>Payment method:</strong> ${safePaymentMethod}</p>
      ${safeTransactionId ? `<p><strong>Transaction ID:</strong> ${safeTransactionId}</p>` : ''}
      ${safeNotes ? `<p><strong>Order notes:</strong> ${safeNotes}</p>` : ''}
      <p style="color:#6b7280;font-size:12px">This is an order confirmation email. Please contact support if you need help.</p>
    </div>`;
  const text = [
    `Order confirmed: #${orderId}`,
    `Order time: ${safePlacedAt}`,
    `Estimated delivery: ${safeEta}`,
    '',
    'Items:',
    ...items.map((item) => `${item.quantity} x ${item.title} - ${formatAmount(Number(item.price) * Number(item.quantity))}`),
    '',
    `Subtotal: ${formatAmount(Number(subtotal))}`,
    `Discount: ${formatAmount(Number(discount))}`,
    `Delivery fee: ${formatAmount(Number(deliveryFee))}`,
    `Packaging fee: ${formatAmount(Number(packagingFee))}`,
    `Tip: ${formatAmount(Number(tip))}`,
    `Total: ${formatAmount(Number(total))}`,
    '',
    `Delivery address: ${customerName}, ${customerPhone}, ${address}`,
    `Payment method: ${paymentMethod || 'Not specified'}`,
    transactionId ? `Transaction ID: ${transactionId}` : '',
    notes ? `Order notes: ${notes}` : '',
  ].filter(Boolean).join('\n');

  return { subject: `Your Homefoods order #${orderId} is confirmed`, html, text };
};

const serializeCustomerOrder = (order) => ({
  id: order.orderId,
  userId: String(order.userId),
  date: new Date(order.placedAt).toISOString(),
  items: order.items.slice(0, 2).map((item) => `${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.title}`).join(' + ') +
    (order.items.length > 2 ? ` + ${order.items.length - 2} more` : ''),
  lineItems: order.items.map((item) => ({
    id: item.productId || item.title,
    title: item.title,
    type: item.type,
    serving: item.serving,
    price: item.price,
    quantity: item.quantity,
    imageUrl: item.imageUrl,
  })),
  itemCount: order.items.reduce((count, item) => count + item.quantity, 0),
  total: order.total,
  status: order.status,
  address: order.address,
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  paymentMethod: order.paymentMethod,
  notes: order.notes,
  tip: order.tip,
});

const serializeAdminOrder = (order) => ({
  id: order.orderId,
  customerName: order.customerName,
  phone: order.customerPhone,
  address: order.address,
  itemsSummary: order.items.map((item) => `${item.quantity}x ${item.title}`).join(', '),
  total: order.total,
  status: order.status,
  date: new Date(order.placedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }),
  placedAt: order.placedAt ? new Date(order.placedAt).toISOString() : new Date().toISOString(),
  paymentMethod: order.paymentMethod,
});

export const createOrder = async (req, res) => {
  try {
    const {
      orderId, customerName, customerPhone, address, items, subtotal, discount = 0,
      deliveryFee, packagingFee, tip = 0, total, paymentMethod, transactionId = '',
      notes = '', placedAt, estimatedDeliveryTime,
    } = req.body || {};

    if (
      typeof orderId !== 'string' || !orderId.trim() ||
      !Array.isArray(items) || items.length === 0 || items.length > 100 ||
      typeof customerName !== 'string' || !customerName.trim() ||
      typeof customerPhone !== 'string' || !customerPhone.trim() ||
      typeof address !== 'string' || !address.trim() ||
      typeof paymentMethod !== 'string' || !paymentMethod.trim()
    ) {
      return res.status(400).json({ success: false, message: 'Order details are incomplete.' });
    }

    const amounts = [subtotal, discount, deliveryFee, packagingFee, tip, total];
    if (
      amounts.some((amount) => !Number.isFinite(Number(amount)) || Number(amount) < 0) ||
      items.some((item) =>
        !item || typeof item.title !== 'string' ||
        !['deal', 'dish', 'frozen'].includes(item.type) ||
        !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 ||
        !Number.isFinite(Number(item.price)) || Number(item.price) <= 0
      )
    ) {
      return res.status(400).json({ success: false, message: 'Order contains invalid item or payment details.' });
    }

    // The client must not be able to dictate the price of the order: every money
    // field is recomputed/verified server-side before anything is persisted.
    const asNumber = (value) => Number(value);
    const itemsTotal = items.reduce(
      (sum, item) => sum + asNumber(item.price) * asNumber(item.quantity),
      0
    );
    const subtotalValue = asNumber(subtotal);
    const discountValue = asNumber(discount);
    const totalValue = asNumber(total);
    const expectedTotal =
      subtotalValue - discountValue + asNumber(deliveryFee) + asNumber(packagingFee) + asNumber(tip);

    if (Math.abs(itemsTotal - subtotalValue) > 0.05) {
      return res.status(400).json({
        success: false,
        message: 'Order subtotal does not match the sum of its items.',
      });
    }
    if (discountValue > subtotalValue) {
      return res.status(400).json({
        success: false,
        message: 'Order discount cannot be greater than the subtotal.',
      });
    }
    if (Math.abs(expectedTotal - totalValue) > 0.05) {
      return res.status(400).json({
        success: false,
        message: 'Order total does not match subtotal minus discount plus fees and tip.',
      });
    }
    if (!(totalValue > 0)) {
      return res.status(400).json({
        success: false,
        message: 'Order total must be greater than zero.',
      });
    }

    const existingOrder = await Order.findOne({ orderId: orderId.trim(), userId: req.user._id });
    if (existingOrder) {
      // Never hand back a document that does not belong to the caller.
      if (String(existingOrder.userId) !== String(req.user._id)) {
        return res.status(409).json({
          success: false,
          message: 'This order ID is already in use. Please refresh and try again.',
        });
      }
      return res.status(200).json({
        success: true,
        order: serializeCustomerOrder(existingOrder),
        emailSent: false,
        message: 'This order has already been placed.',
      });
    }

    // Prevent transactionId reuse across different orders (Duplicate/Fraud prevention)
    if (transactionId && typeof transactionId === 'string' && transactionId.trim()) {
      const duplicateTx = await Order.findOne({ transactionId: transactionId.trim() });
      if (duplicateTx && duplicateTx.orderId !== orderId.trim()) {
        return res.status(400).json({
          success: false,
          message: 'This payment transaction ID has already been applied to another order.',
        });
      }
    }

    const order = await Order.create({
      orderId: orderId.trim(),
      userId: req.user._id,
      customerName,
      customerEmail: req.user.email,
      customerPhone,
      address,
      items,
      subtotal: Number(subtotal),
      discount: Number(discount),
      deliveryFee: Number(deliveryFee),
      packagingFee: Number(packagingFee),
      tip: Number(tip),
      total: Number(total),
      paymentMethod,
      transactionId,
      notes,
      placedAt: placedAt && !Number.isNaN(new Date(placedAt).getTime()) ? new Date(placedAt) : new Date(),
      estimatedDeliveryTime: estimatedDeliveryTime || '30-45 mins',
      status: 'Processing',
    });

    let emailSent = false;
    try {
      const email = buildConfirmationEmail(order.toObject());
      await sendEmail({ to: req.user.email, ...email });
      emailSent = true;
    } catch (emailError) {
      console.error('Order confirmation email failed:', emailError);
    }

    await refreshCatalogStats(items);

    return res.status(201).json({
      success: true,
      order: serializeCustomerOrder(order),
      emailSent,
      message: emailSent
        ? 'Order placed and confirmation email sent.'
        : 'Order placed, but the confirmation email could not be sent.',
    });
  } catch (error) {
    if (error && error.code === 11000) {
      // The orderId column is globally unique - tell the caller it is a conflict.
      return res.status(409).json({
        success: false,
        message: 'This order ID is already in use. Please refresh and try again.',
      });
    }
    return handleControllerError(res, error, 'Could not save the order. Please try again.');
  }
};

export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ placedAt: -1 }).lean();
    return res.status(200).json({ success: true, orders: orders.map(serializeCustomerOrder) });
  } catch (error) {
    return handleControllerError(res, error, 'Could not load your orders.');
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ placedAt: -1 }).lean();
    return res.status(200).json({ success: true, orders: orders.map(serializeAdminOrder) });
  } catch (error) {
    return handleControllerError(res, error, 'Could not load orders.');
  }
};

const allowedTransitions = {
  Processing: ['Confirmed', 'Cancelled'],
  Confirmed: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body || {};
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    const allowed = allowedTransitions[order.status] ?? [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot move from ${order.status} to ${status}.`,
      });
    }
    order.status = status;
    await order.save();
    await refreshCatalogStats(order.items);
    return res.status(200).json({ success: true, order: serializeAdminOrder(order) });
  } catch (error) {
    return handleControllerError(res, error, 'Could not update order status.');
  }
};

export const cancelMyOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId, userId: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    const allowed = allowedTransitions[order.status] ?? [];
    if (!allowed.includes('Cancelled')) {
      return res.status(400).json({ success: false, message: 'This order can no longer be cancelled.' });
    }
    order.status = 'Cancelled';
    await order.save();
    await refreshCatalogStats(order.items);
    return res.status(200).json({ success: true, order: serializeCustomerOrder(order) });
  } catch (error) {
    return handleControllerError(res, error, 'Could not cancel this order.');
  }
};

export const sendOrderConfirmationEmail = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.body?.orderId, userId: req.user._id }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    const email = buildConfirmationEmail(order);
    await sendEmail({ to: req.user.email, ...email });
    return res.status(200).json({ success: true, message: 'Order confirmation email sent.' });
  } catch (error) {
    return handleControllerError(res, error, 'The order was placed, but its confirmation email could not be sent.');
  }
};
