/**
 * NoteOptionsKebab — shared ⋯ trigger rendered in the trailing slot of
 * `NoteCardHeader` on every note card (text / voice / photo /
 * document, on both the saved-report and draft surfaces). Opens the
 * shared `NoteOptionsSheet` for that row when tapped.
 *
 * Centralised so every note row has an identical accessible hit target
 * and a stable testID scheme.
 */
import { Pressable } from 'react-native';
import { MoreVertical } from 'lucide-react-native';

import { colors } from '@/lib/design-tokens/colors';

export interface NoteOptionsKebabProps {
  /** Used as the testID suffix — works equally with note ids or indices. */
  noteId: string | number;
  onPress: () => void;
}

export function NoteOptionsKebab({ noteId, onPress }: NoteOptionsKebabProps) {
  return (
    <Pressable
      onPress={(e) => {
        // Wrapping rows (e.g. DocumentNoteRow) are themselves
        // Pressable; stop propagation so opening the menu doesn't
        // also fire the card's open-file handler.
        e?.stopPropagation?.();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Note options"
      hitSlop={8}
      testID={`btn-note-options-${noteId}`}
      className="h-7 w-7 items-center justify-center rounded-full"
    >
      <MoreVertical size={16} color={colors.muted.foreground} />
    </Pressable>
  );
}
