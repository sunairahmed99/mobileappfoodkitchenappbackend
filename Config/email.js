import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create reusable transporter using Gmail credentials from .env
const transporter = nodemailer.createTransport({
  service: 'gmail',
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  auth: {
    user: process.env.Gmailuser,
    pass: process.env.Gmailpassword,
  },
});

/**
 * Send an email via Nodemailer Gmail
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text fallback
 * @returns {Promise<Object>}
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const mailOptions = {
      from: `"Homefoods Kitchen" <${process.env.Gmailuser}>`,
      to,
      subject,
      text: text || html.replace(/<[^>]*>?/gm, ''), // fallback plain text
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent successfully to ${to}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email via Nodemailer:', error.message);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
};

export default transporter;
