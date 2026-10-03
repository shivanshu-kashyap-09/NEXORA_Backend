const { getTransporter, sendEmail } = require('./emailTransporter');
const templateEngine = require('./templateEngine');

module.exports = {
  getTransporter,
  sendEmail,
  templateEngine,
};
