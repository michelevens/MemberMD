import { describe, it, expect, beforeEach } from 'vitest';
import { getAuthToken, setAuthToken, removeAuthToken } from './api';

describe('Token Management', () => {
  beforeEach(() => {
    // Clear sessionStorage and module-level cache between tests
    sessionStorage.clear();
    // removeAuthToken resets both the in-memory cache and sessionStorage
    removeAuthToken();
  });

  it('getAuthToken returns null when no token is set', () => {
    expect(getAuthToken()).toBeNull();
  });

  it('setAuthToken stores a token that can be retrieved', () => {
    setAuthToken('test_token_123');
    expect(getAuthToken()).toBe('test_token_123');
  });

  it('setAuthToken persists token to sessionStorage', () => {
    setAuthToken('persisted_token');
    expect(sessionStorage.getItem('membermd_token')).toBe('persisted_token');
  });

  it('removeAuthToken clears the token', () => {
    setAuthToken('token_to_remove');
    expect(getAuthToken()).toBe('token_to_remove');

    removeAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it('removeAuthToken clears sessionStorage entries', () => {
    setAuthToken('some_token');
    sessionStorage.setItem('membermd_user', '{"id":"u1"}');

    removeAuthToken();
    expect(sessionStorage.getItem('membermd_token')).toBeNull();
    expect(sessionStorage.getItem('membermd_user')).toBeNull();
  });
});
