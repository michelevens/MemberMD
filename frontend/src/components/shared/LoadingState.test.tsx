import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
  it('renders default label', () => {
    render(<LoadingState />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders custom label', () => {
    render(<LoadingState label="Fetching patients…" />);
    expect(screen.getByText('Fetching patients…')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<LoadingState description="This usually takes a few seconds." />);
    expect(screen.getByText('This usually takes a few seconds.')).toBeInTheDocument();
  });

  it('uses role=status for assistive tech', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders custom icon when provided', () => {
    render(<LoadingState icon={<span data-testid="test-icon">icon</span>} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });
});
