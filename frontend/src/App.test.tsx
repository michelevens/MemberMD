import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    // App wraps everything in ErrorBoundary + HashRouter + AuthProvider
    // On initial load it shows a loading spinner or login screen
    expect(document.body).toBeTruthy();
  });

  it('shows login or loading state initially', () => {
    render(<App />);
    // AuthProvider resolves quickly in test — may show loading or login
    const hasLoading = screen.queryByText('Loading...');
    const hasLogin = screen.queryByText('Sign in to your account');
    expect(hasLoading || hasLogin).toBeTruthy();
  });
});
