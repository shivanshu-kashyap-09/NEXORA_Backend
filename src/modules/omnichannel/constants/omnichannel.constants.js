/**
 * Omnichannel (BOPIS / BORIS) Constants
 */

const BopisPickupStatus = {
  REGISTERED: 'REGISTERED',
  STAGED: 'STAGED',
  PICKED_UP: 'PICKED_UP',
};

const BorisReturnDisposition = {
  RESTOCK_SELLABLE: 'RESTOCK_SELLABLE',
  DAMAGED_SCRAP: 'DAMAGED_SCRAP',
};

module.exports = {
  BopisPickupStatus,
  BorisReturnDisposition,
};
