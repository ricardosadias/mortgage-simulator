import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { notifications } from '@mantine/notifications';
import { useMortgagesStore } from '@/store/mortgages';
import { loan } from '@/test/loan';
import { renderWithMantineProvider } from '@/utils/testWrapper';
import { BackupControls } from './BackupControls';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

const jsonFile = (content: unknown) =>
  new File([JSON.stringify(content)], 'mortgages.json', { type: 'application/json' });

const importFile = async (file: File) => {
  // FileButton renders a hidden <input type="file">; upload goes straight to it.
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) {
    throw new Error('no file input rendered');
  }
  await userEvent.upload(input, file);
};

beforeEach(() => {
  useMortgagesStore.setState({ mortgages: [] });
  vi.clearAllMocks();
});

describe('BackupControls', () => {
  describe('export', () => {
    // jsdom implements neither object URLs nor navigation; both are browser APIs.
    const captureDownload = () => {
      const blobs: Blob[] = [];
      URL.createObjectURL = vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:download';
      });
      URL.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      return { blobs, click };
    };

    it('downloads every loan as a JSON file', async () => {
      useMortgagesStore.setState({ mortgages: [loan(), loan({ id: 'loan-2' })] });
      const { blobs } = captureDownload();
      renderWithMantineProvider(<BackupControls />);

      fireEvent.click(screen.getByRole('button', { name: 'Export' }));

      expect(JSON.parse(await blobs[0]!.text())).toEqual([loan(), loan({ id: 'loan-2' })]);
    });

    it('names the file with the date', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 5, 12));
      const { click } = captureDownload();
      renderWithMantineProvider(<BackupControls />);

      fireEvent.click(screen.getByRole('button', { name: 'Export' }));

      expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
        'mortgages-2026-11-05.json'
      );
    });
  });

  describe('import', () => {
    it('loads the loans from the file when there are none yet', async () => {
      renderWithMantineProvider(<BackupControls />);

      await importFile(jsonFile([loan()]));

      await waitFor(() => expect(useMortgagesStore.getState().mortgages).toEqual([loan()]));
    });

    it('asks before replacing the current loans', async () => {
      useMortgagesStore.setState({ mortgages: [loan({ name: 'Current' })] });
      renderWithMantineProvider(<BackupControls />);

      await importFile(jsonFile([loan({ name: 'From file' })]));

      expect(await screen.findByText('Replace your loans?')).toBeInTheDocument();
      expect(useMortgagesStore.getState().mortgages).toEqual([loan({ name: 'Current' })]);
    });

    it('replaces the current loans once confirmed', async () => {
      useMortgagesStore.setState({ mortgages: [loan({ name: 'Current' })] });
      renderWithMantineProvider(<BackupControls />);
      await importFile(jsonFile([loan({ name: 'From file' })]));

      fireEvent.click(await screen.findByRole('button', { name: 'Replace' }));

      expect(useMortgagesStore.getState().mortgages).toEqual([loan({ name: 'From file' })]);
    });

    it('keeps the current loans when cancelled', async () => {
      useMortgagesStore.setState({ mortgages: [loan({ name: 'Current' })] });
      renderWithMantineProvider(<BackupControls />);
      await importFile(jsonFile([loan({ name: 'From file' })]));

      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() =>
        expect(screen.queryByText('Replace your loans?')).not.toBeInTheDocument()
      );
      expect(useMortgagesStore.getState().mortgages).toEqual([loan({ name: 'Current' })]);
    });

    it('leaves the loans untouched when the file is invalid', async () => {
      renderWithMantineProvider(<BackupControls />);

      await importFile(jsonFile([{ ...loan(), termMonths: 'twelve' }]));

      await waitFor(() =>
        expect(notifications.show).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'loans[0].termMonths must be a number' })
        )
      );
      expect(useMortgagesStore.getState().mortgages).toEqual([]);
    });
  });
});
