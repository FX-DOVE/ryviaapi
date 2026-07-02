import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

describe('Auth Security Module', () => {
  it('should sign and verify JWT tokens correctly', () => {
    const payload = { userId: 'test-user-id', role: 'admin' };
    const secret = 'test-secret-key';
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    
    const verified = jwt.verify(token, secret);
    expect(verified.userId).toBe('test-user-id');
    expect(verified.role).toBe('admin');
  });

  it('should hash and compare passwords correctly', async () => {
    const password = 'SaaS-Strong-Password-100!';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    
    const matches = await bcrypt.compare(password, hash);
    expect(matches).toBe(true);
    
    const invalidMatches = await bcrypt.compare('wrong-password', hash);
    expect(invalidMatches).toBe(false);
  });
});
