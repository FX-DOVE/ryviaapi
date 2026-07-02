import { jest } from '@jest/globals';

// Mock Mongoose models before importing services
jest.mock('../src/models/CreditLedger.js', () => {
  return {
    __esModule: true,
    default: {
      prototype: {
        save: jest.fn().mockImplementation(function() { return this; })
      },
      aggregate: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn()
    }
  };
});

jest.mock('../src/models/Workspace.js', () => {
  return {
    __esModule: true,
    default: {
      findByIdAndUpdate: jest.fn()
    }
  };
});

import CreditLedger from '../src/models/CreditLedger.js';
import Workspace from '../src/models/Workspace.js';
import { getDerivedBalance } from '../src/services/ledgerService.js';

describe('Credit Ledger Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should sum up credit transactions correctly via aggregation mock', async () => {
    CreditLedger.aggregate.mockResolvedValue([{ total: 350 }]);
    
    const balance = await getDerivedBalance('6682b13f36cf183204d88e0a');
    
    expect(CreditLedger.aggregate).toHaveBeenCalled();
    expect(balance).toBe(350);
  });

  it('should default to 0 if aggregate returns empty array', async () => {
    CreditLedger.aggregate.mockResolvedValue([]);
    
    const balance = await getDerivedBalance('6682b13f36cf183204d88e0a');
    expect(balance).toBe(0);
  });
});
