import { jest } from '@jest/globals';

// Mock bullmq
jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(function(name) {
      this.name = name;
      this.add = jest.fn();
    })
  };
});

// Mock Mongoose models
jest.mock('../src/models/Job.js', () => {
  return {
    __esModule: true,
    default: {
      findById: jest.fn()
    }
  };
});

jest.mock('../src/models/Workspace.js', () => {
  return {
    __esModule: true,
    default: {
      findById: jest.fn()
    }
  };
});

import Job from '../src/models/Job.js';
import Workspace from '../src/models/Workspace.js';
import { enqueueScriptJob, queues } from '../src/queues/queueManager.js';

describe('Priority Queue Mappings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should map Enterprise workspace plan to priority 1', async () => {
    Job.findById.mockResolvedValue({
      _id: 'job-123',
      workspaceId: 'ws-enterprise'
    });

    Workspace.findById.mockResolvedValue({
      _id: 'ws-enterprise',
      billingPlan: 'enterprise'
    });

    await enqueueScriptJob('job-123');

    expect(queues.script.add).toHaveBeenCalledWith(
      'process_script',
      { jobId: 'job-123' },
      { priority: 1 }
    );
  });

  it('should fallback to priority 5 for Free plans or missing workspaces', async () => {
    Job.findById.mockResolvedValue({
      _id: 'job-456',
      workspaceId: 'ws-free'
    });

    Workspace.findById.mockResolvedValue({
      _id: 'ws-free',
      billingPlan: 'free'
    });

    await enqueueScriptJob('job-456');

    expect(queues.script.add).toHaveBeenCalledWith(
      'process_script',
      { jobId: 'job-456' },
      { priority: 5 }
    );
  });
});
