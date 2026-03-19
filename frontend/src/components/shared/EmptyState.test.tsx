import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No results found" />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <EmptyState
        title="No results"
        description="Try adjusting your search filters"
      />
    );
    expect(screen.getByText('Try adjusting your search filters')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState title="No results" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="No patients"
        action={<button>Add Patient</button>}
      />
    );
    expect(screen.getByText('Add Patient')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(
      <EmptyState
        title="Empty"
        icon={<span data-testid="test-icon">icon</span>}
      />
    );
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });
});
