const nodemailer = require('nodemailer');
const environment = require('../../config/environment');
const logger = require('../../config/logger');

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: environment.email.host,
      port: environment.email.port,
      secure: environment.email.port === 465,
      auth: environment.email.user
        ? {
            user: environment.email.user,
            pass: environment.email.pass,
          }
        : undefined,
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transport = getTransporter();
    const info = await transport.sendMail({
      from: environment.email.from,
      to,
      subject,
      html,
      text,
    });
    logger.info('Email sent successfully:', { messageId: info.messageId, to, subject });
    return info;
  } catch (error) {
    logger.error('Failed to send email:', { error: error.message, to, subject });
    throw error;
  }
};

module.exports = {
  getTransporter,
  sendEmail,
};
