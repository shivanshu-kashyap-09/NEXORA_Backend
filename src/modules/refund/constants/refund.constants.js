const RmaStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  PICKUP_SCHEDULED: 'PICKUP_SCHEDULED',
  IN_TRANSIT: 'IN_TRANSIT',
  RECEIVED: 'RECEIVED',
  INSPECTED: 'INSPECTED',
  REFUNDED: 'REFUNDED',
  EXCHANGED: 'EXCHANGED',
  REJECTED: 'REJECTED',
};

const QaGrade = {
  SELLABLE: 'SELLABLE',
  REFURBISHABLE: 'REFURBISHABLE',
  DAMAGED_SCRAP: 'DAMAGED_SCRAP',
};

const ReturnReasons = {
  DEFECTIVE_ITEM: 'DEFECTIVE_ITEM',
  WRONG_SIZE: 'WRONG_SIZE',
  ITEM_NOT_AS_DESCRIBED: 'ITEM_NOT_AS_DESCRIBED',
  BUYERS_REMORSE: 'BUYERS_REMORSE',
  DAMAGED_IN_TRANSIT: 'DAMAGED_IN_TRANSIT',
};

const VALID_RMA_TRANSITIONS = {
  [RmaStatus.REQUESTED]: [
    RmaStatus.APPROVED,
    RmaStatus.REJECTED,
  ],
  [RmaStatus.APPROVED]: [
    RmaStatus.PICKUP_SCHEDULED,
    RmaStatus.IN_TRANSIT,
    RmaStatus.RECEIVED,
    RmaStatus.REJECTED,
  ],
  [RmaStatus.PICKUP_SCHEDULED]: [
    RmaStatus.IN_TRANSIT,
    RmaStatus.RECEIVED,
    RmaStatus.REJECTED,
  ],
  [RmaStatus.IN_TRANSIT]: [
    RmaStatus.RECEIVED,
    RmaStatus.REJECTED,
  ],
  [RmaStatus.RECEIVED]: [
    RmaStatus.INSPECTED,
    RmaStatus.REJECTED,
  ],
  [RmaStatus.INSPECTED]: [
    RmaStatus.REFUNDED,
    RmaStatus.EXCHANGED,
    RmaStatus.REJECTED,
  ],
  [RmaStatus.REFUNDED]: [], // Terminal
  [RmaStatus.EXCHANGED]: [], // Terminal
  [RmaStatus.REJECTED]: [], // Terminal
};

module.exports = {
  RmaStatus,
  QaGrade,
  ReturnReasons,
  VALID_RMA_TRANSITIONS,
};
