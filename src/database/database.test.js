const { DB } = require('./database');

describe('database helpers', () => {
  test('getTokenSignature returns jwt signature part', () => {
    expect(DB.getTokenSignature('a.b.c')).toBe('c');
  });

  test('getTokenSignature returns empty string for invalid token', () => {
    expect(DB.getTokenSignature('not-a-jwt')).toBe('');
  });

  test('getOffset calculates page offset', () => {
    expect(DB.getOffset(1, 10)).toBe(0);
    expect(DB.getOffset(2, 10)).toBe(10);
    expect(DB.getOffset(3, 10)).toBe(20);
  });
});