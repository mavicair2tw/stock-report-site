import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  const { user, pass } = config.email;
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass }
  });
  return transporter;
}

export async function sendEmail({ to, subject, text, html }) {
  const { user, pass, defaultTo, fromName } = config.email;
  if (!user || !pass) throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD');
  const mailTo = to || defaultTo;
  if (!mailTo) throw new Error('No recipient specified and MAIL_TO_DEFAULT is unset');

  const mailer = getTransporter();
  const info = await mailer.sendMail({
    from: `${fromName || 'OpenClaw'} <${user}>`,
    to: mailTo,
    subject,
    text,
    html
  });
  return { messageId: info.messageId };
}
