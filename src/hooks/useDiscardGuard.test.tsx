import { useState } from 'react';
import { Modal, TextInput } from '@mantine/core';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { hasChanged, useDiscardGuard } from './useDiscardGuard';
import { renderWithMantineProvider } from '@/utils/testWrapper';

const HostModal = ({ onClose }: { onClose: () => void }) => {
  const [text, setText] = useState('');
  const guard = useDiscardGuard({ hasUnsavedChanges: () => text !== '', onDiscard: onClose });

  return (
    <Modal
      opened
      onClose={guard.requestClose}
      closeOnEscape={!guard.isConfirming}
      title="Host"
      transitionProps={{ duration: 0 }}
    >
      <TextInput label="Field" value={text} onChange={(e) => setText(e.currentTarget.value)} />
      {guard.confirmation}
    </Modal>
  );
};

const pressEscape = () => fireEvent.keyDown(document.body, { key: 'Escape' });
const clickOverlay = () => fireEvent.click(document.querySelector('.mantine-Modal-overlay')!);
const typeInField = (value: string) =>
  fireEvent.change(screen.getByLabelText('Field'), { target: { value } });

describe('useDiscardGuard', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    renderWithMantineProvider(<HostModal onClose={onClose} />);
  });

  test('closes without asking when nothing was changed', () => {
    pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });

  test('asks for confirmation instead of closing when Escape is pressed with changes', async () => {
    typeInField('milk');

    pressEscape();

    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('asks for confirmation when clicking outside with changes', async () => {
    typeInField('milk');

    clickOverlay();

    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('keeps the form and its values when choosing to keep editing', async () => {
    typeInField('milk');
    pressEscape();

    fireEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Field')).toHaveValue('milk');
    expect(onClose).not.toHaveBeenCalled();
  });

  test('closes the form when the discard is confirmed', async () => {
    typeInField('milk');
    pressEscape();

    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('dismisses only the confirmation when Escape is pressed while it is open', async () => {
    typeInField('milk');
    pressEscape();
    await screen.findByText('Discard changes?');

    pressEscape();

    await waitFor(() => expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('hasChanged', () => {
  test('is false for equal values, including equal dates', () => {
    expect(hasChanged({ a: 1, d: new Date(1000) }, { a: 1, d: new Date(1000) })).toBe(false);
  });

  test('is true when a value differs', () => {
    expect(hasChanged({ a: 1 }, { a: 2 })).toBe(true);
  });
});
