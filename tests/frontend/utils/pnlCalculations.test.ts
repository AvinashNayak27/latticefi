/**
 * PnL calculation utility tests
 */
import { describe, it, expect } from 'vitest';
import {
  calculatePnL,
  calculatePercentProfit,
  getPnlForNonzeroPercentProfit,
  getPnlBasedFee,
} from '../../../frontend/src/utils/pnlCalculations';

describe('pnlCalculations', () => {
  describe('calculatePercentProfit', () => {
    it('should calculate profit percentage for long position', () => {
      const position = {
        openPrice: 100 * 1e10,
        collateral: 1000 * 1e6,
        leverage: 10,
        buy: true,
      };
      const currentPrice = 110 * 1e10;
      const result = calculatePercentProfit(position, currentPrice);
      expect(result).toBeGreaterThan(0);
    });

    it('should calculate profit percentage for short position', () => {
      const position = {
        openPrice: 100 * 1e10,
        collateral: 1000 * 1e6,
        leverage: 10,
        buy: false,
      };
      const currentPrice = 90 * 1e10;
      const result = calculatePercentProfit(position, currentPrice);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('getPnlBasedFee', () => {
    it('should return zero fee for negative profit', () => {
      const fee = getPnlBasedFee(1000, -100);
      expect(fee).toBe(0);
    });

    it('should calculate fee for positive profit', () => {
      const fee = getPnlBasedFee(1000 * 1e6, 10000000000); // 1% profit
      expect(fee).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getPnlForNonzeroPercentProfit', () => {
    it('should calculate PnL for long position', () => {
      const position = {
        openPrice: 100 * 1e10,
        collateral: 1000 * 1e6,
        leverage: 10,
        buy: true,
        rolloverFee: 0,
      };
      const currentPrice = 110 * 1e10;
      const result = getPnlForNonzeroPercentProfit(position, currentPrice);
      expect(result.grossPnl).toBeGreaterThan(0);
      expect(result.netPnl).toBeDefined();
    });

    it('should calculate PnL for short position', () => {
      const position = {
        openPrice: 100 * 1e10,
        collateral: 1000 * 1e6,
        leverage: 10,
        buy: false,
        rolloverFee: 0,
      };
      const currentPrice = 90 * 1e10;
      const result = getPnlForNonzeroPercentProfit(position, currentPrice);
      expect(result.grossPnl).toBeGreaterThan(0);
    });
  });

  describe('calculatePnL', () => {
    it('should return null for missing pair index', () => {
      const trade = {};
      const getRealtimePrice = () => null;
      const result = calculatePnL(trade, null, getRealtimePrice);
      expect(result).toBeNull();
    });

    it('should return null for missing price', () => {
      const trade = { pairIndex: 0 };
      const getRealtimePrice = () => null;
      const result = calculatePnL(trade, null, getRealtimePrice);
      expect(result).toBeNull();
    });

    it('should calculate PnL for zero fee perpetual', () => {
      const trade = {
        pairIndex: 0,
        isPnl: true,
        openPrice: 100 * 1e10,
        collateral: 1000 * 1e6,
        leverage: 10,
        buy: true,
      };
      const currentPrice = 110;
      const getRealtimePrice = () => null;
      const result = calculatePnL(trade, currentPrice, getRealtimePrice);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('zeroFeePerp');
    });

    it('should calculate PnL for non-zero fee perpetual', () => {
      const trade = {
        pairIndex: 0,
        isPnl: false,
        openPrice: 100 * 1e10,
        collateral: 1000 * 1e6,
        leverage: 10,
        buy: true,
        rolloverFee: 0,
      };
      const currentPrice = 110;
      const getRealtimePrice = () => null;
      const result = calculatePnL(trade, currentPrice, getRealtimePrice);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('nonZeroFeePerp');
    });
  });
});

