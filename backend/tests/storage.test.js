import { S3StorageProvider } from '../src/providers/storage/S3StorageProvider.js';

describe('S3 Storage Driver Abstraction', () => {
  it('should fall back to simulation mode if credentials are empty', () => {
    const oldKey = process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_ACCESS_KEY_ID;

    const provider = new S3StorageProvider();
    expect(provider.isMock).toBe(true);

    process.env.S3_ACCESS_KEY_ID = oldKey;
  });

  it('should return simulated URLs in mock mode', async () => {
    const oldKey = process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_ACCESS_KEY_ID;

    const provider = new S3StorageProvider();
    const url = await provider.uploadFile('/local/temp/path.jpg', 'jobs/123/scene.jpg', 'image/jpeg');
    expect(url).toContain('/mock-storage/');
    expect(url).toContain('jobs/123/scene.jpg');

    process.env.S3_ACCESS_KEY_ID = oldKey;
  });
});
