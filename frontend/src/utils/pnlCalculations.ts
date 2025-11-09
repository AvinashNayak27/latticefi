// Fee Data Constants
export const feeData = {
  openFeeP: 450000000,
  closeFeeP: 450000000,
  limitOrderFeeP: 100000000,
  minLevPosUSDC: 10000000,
  pnlFees: {
    feesP: [
      800000000000, 500000000000, 450000000000, 375000000000, 275000000000,
      250000000000, 250000000000, 225000000000, 150000000000, 25000000000,
    ],
    numTiers: 10,
    tierP: [
      10000000000, 50000000000, 250000000000, 500000000000, 1000000000000,
      2500000000000, 5000000000000, 15000000000000, 25000000000000,
      30000000000000,
    ],
  },
};

const _PRECISION = 1e10;

export function getPnlBasedFee(collateral: number, percentProfit: number) {
  if (percentProfit < 0) return 0;
  const feeStruct = feeData.pnlFees;
  let i = 0;
  for (; i < feeStruct.numTiers; i++) {
    if (percentProfit < feeStruct.tierP[i]) break;
  }
  if (i === feeStruct.numTiers) i--;
  let feesP = BigInt(feeStruct.feesP[i]);
  let coll = BigInt(collateral);
  let perc = BigInt(percentProfit);
  let precision = BigInt(_PRECISION);
  let pnl = (coll * perc) / precision / BigInt(100);
  let fee = (feesP * pnl) / precision / BigInt(100);
  return Number(fee);
}

export function calculatePercentProfit(position: any, currentPrice: number) {
  const openPrice = Number(position.openPrice);
  const collateral = Number(position.collateral);
  const leverage = Number(position.leverage);
  const shares = Number((leverage * collateral) / openPrice) / 1e6;
  let pnl;
  if (position.buy) {
    pnl = ((currentPrice - openPrice) * shares) / collateral;
  } else {
    pnl = ((openPrice - currentPrice) * shares) / collateral;
  }
  return Math.floor(pnl * 1e8);
}

export function getPnlForNonzeroPercentProfit(position: any, currentPrice: number) {
  const openPrice = Number(position.openPrice);
  const collateral = Number(position.collateral);
  const leverage = Number(position.leverage);
  const shares = Number((leverage * collateral) / openPrice) / 1e6;
  const closingFee = ((feeData.closeFeeP / 1e10) * collateral * leverage) / 1e18;
  const rolloverFee = Number(position.rolloverFee) / 1e6;

  let grossPnlPercent;
  let grossPnl;
  if (position.buy) {
    grossPnlPercent = ((currentPrice - openPrice) * shares) / collateral / 100;
    grossPnl = ((currentPrice - openPrice) / 1e10) * shares;
  } else {
    grossPnlPercent = ((openPrice - currentPrice) * shares) / collateral / 100;
    grossPnl = ((openPrice - currentPrice) / 1e10) * shares;
  }

  const netPnl = grossPnl - closingFee - rolloverFee;
  const netPnlPercent = (netPnl / (collateral / 1e6)) * 100;

  return {
    grossPnlPercent: grossPnlPercent,
    grossPnl: grossPnl,
    closingFee: closingFee,
    rolloverFee: rolloverFee,
    netPnlPercent: netPnlPercent,
    netPnl: netPnl,
    type: "nonZeroFeePerp"
  };
}

export function calculatePnL(trade: any, currentPriceVal: number | null, getRealtimePrice: (pairIndex: number) => number | null) {
  const pidx = trade.pairIndex ?? trade.pair_index ?? trade.trade?.pairIndex ?? trade.trade?.pair_index;
  if (pidx === undefined) return null;

  const priceVal = currentPriceVal ?? getRealtimePrice(pidx);
  if (!priceVal) return null;

  const currentPrice = priceVal * 1e10;

  if (!trade.isPnl) {
    const pnlData = getPnlForNonzeroPercentProfit(trade, currentPrice);
    return {
      ...pnlData,
      position: trade
    };
  } else {
    const grossPnlPercent = calculatePercentProfit(trade, currentPrice);
    const collateral = Number(trade.collateral);
    const grossPnl = (grossPnlPercent / 1e12) * collateral;
    const fee = getPnlBasedFee(collateral, grossPnlPercent);
    const netPnl = (grossPnlPercent / 1e12) * collateral - fee;
    const netPnlPercent = (netPnl / (collateral / 1e6)) * 100;
    return {
      position: trade,
      grossPnl: grossPnl / 1e6,
      grossPnlPercent: grossPnlPercent / 1e10,
      pnlPercent: netPnlPercent / 1e6,
      fee: fee / 1e6,
      pnl: netPnl / 1e6,
      type: "zeroFeePerp"
    };
  }
}

