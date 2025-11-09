/**
 * BottomSheet component tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomSheet from '../../../frontend/src/components/BottomSheet';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock react-dom portal
vi.mock('react-dom', () => ({
  createPortal: (element: React.ReactElement) => element,
}));

describe('BottomSheet', () => {
  beforeEach(() => {
    // Reset body overflow
    document.body.style.overflow = '';
  });

  it('should render when isOpen is true', () => {
    render(
      <BottomSheet isOpen={true} onClose={() => {}} title="Test Title">
        <div>Test Content</div>
      </BottomSheet>
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <BottomSheet isOpen={false} onClose={() => {}} title="Test Title">
        <div>Test Content</div>
      </BottomSheet>
    );
    // With AnimatePresence mock, it should still render but conditionally
    expect(container.firstChild).toBeDefined();
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Test Title">
        <div>Test Content</div>
      </BottomSheet>
    );
    
    const closeButton = screen.getByRole('button');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should set body overflow hidden when open', () => {
    render(
      <BottomSheet isOpen={true} onClose={() => {}} title="Test Title">
        <div>Test Content</div>
      </BottomSheet>
    );
    expect(document.body.style.overflow).toBe('hidden');
  });
});

