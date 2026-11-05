import { useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface UseDiscardGuardOptions {
  /** Read when the user tries to dismiss the modal, so it may inspect refs as well as state. */
  hasUnsavedChanges: () => boolean;
  onDiscard: () => void;
}

/**
 * Guards a form modal against accidental dismissal (Escape, click outside, close button).
 * Wire `requestClose` to the modal's `onClose`, `isConfirming` to `!closeOnEscape`, and render
 * `confirmation` inside it. Buttons that mean "close" and successful saves should keep calling
 * `onDiscard` directly.
 */
export const useDiscardGuard = ({ hasUnsavedChanges, onDiscard }: UseDiscardGuardOptions) => {
  const { t } = useTranslation('common');
  const [isConfirming, setIsConfirming] = useState(false);

  const requestClose = () => {
    if (hasUnsavedChanges()) {
      setIsConfirming(true);
    } else {
      onDiscard();
    }
  };

  const keepEditing = () => setIsConfirming(false);

  const discard = () => {
    setIsConfirming(false);
    onDiscard();
  };

  const confirmation = (
    <Modal
      opened={isConfirming}
      onClose={keepEditing}
      title={t('discard.title')}
      centered
      size="sm"
    >
      <Stack>
        <Text>{t('discard.message')}</Text>
        <Group justify="flex-end">
          <Button variant="outline" onClick={keepEditing}>
            {t('discard.keep')}
          </Button>
          <Button color="red" onClick={discard}>
            {t('discard.confirm')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  // While the confirmation is open the form modal must not react to Escape: Mantine listens on
  // window for every open modal, so one keypress would otherwise also re-request the close
  // that the confirmation just dismissed.
  return { requestClose, isConfirming, confirmation };
};

/** True when two plain objects differ; Dates compare by their ISO form. */
export const hasChanged = (current: object, initial: object): boolean =>
  JSON.stringify(current) !== JSON.stringify(initial);
