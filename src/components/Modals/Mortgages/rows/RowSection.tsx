import { Button, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';

export interface RowSectionProps {
  title: string;
  hint: string;
  addLabel: string;
  error?: string;
  onAdd: () => void;
  children: React.ReactNode;
}

/** A titled, repeatable list of rows in a loan or offer form, with its add button and error. */
export const RowSection: React.FC<RowSectionProps> = ({
  title,
  hint,
  addLabel,
  error,
  onAdd,
  children,
}) => (
  <Stack gap={6}>
    <Text size="sm" fw={600}>
      {title}
    </Text>
    <Text size="xs" c="dimmed">
      {hint}
    </Text>
    {children}
    {error && (
      <Text size="xs" c="red">
        {error}
      </Text>
    )}
    <Button variant="subtle" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={onAdd}>
      {addLabel}
    </Button>
  </Stack>
);
