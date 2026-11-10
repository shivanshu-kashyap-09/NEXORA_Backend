const reportingRepository = require('../repository/reporting.repository');

const getSalesSummary = async (tenantId, query) => {
  return reportingRepository.getSalesSummary(tenantId, {
    fromDate: query.from_date,
    toDate: query.to_date,
  });
};

const getInventoryValuation = async (tenantId) => {
  return reportingRepository.getInventoryValuation(tenantId);
};

const getReturnRates = async (tenantId, query) => {
  return reportingRepository.getReturnRates(tenantId, {
    fromDate: query.from_date,
    toDate: query.to_date,
  });
};

const getChannelBreakdown = async (tenantId) => {
  return reportingRepository.getChannelBreakdown(tenantId);
};

module.exports = {
  getSalesSummary,
  getInventoryValuation,
  getReturnRates,
  getChannelBreakdown,
};
