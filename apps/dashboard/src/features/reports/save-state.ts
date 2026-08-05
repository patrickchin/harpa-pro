import type { projects } from '@harpa/api-contract';

export type SaveState =
  | { status: 'saved'; updatedAt: string }
  | {
      status: 'dirty';
      updatedAt: string;
      saveInFlight?: boolean;
    }
  | { status: 'saving'; updatedAt: string }
  | { status: 'failed'; updatedAt: string; message: string }
  | {
      status: 'conflict';
      updatedAt: string;
      currentUpdatedAt: string;
    };

export type SaveStateEvent =
  | { type: 'changed' }
  | { type: 'saving' }
  | { type: 'saved'; updatedAt: string }
  | { type: 'failed'; message: string }
  | { type: 'conflict'; currentUpdatedAt: string }
  | { type: 'reset'; updatedAt: string };

export function initialSaveState(updatedAt: string): SaveState {
  return { status: 'saved', updatedAt };
}

export function saveStateReducer(state: SaveState, event: SaveStateEvent): SaveState {
  switch (event.type) {
    case 'changed':
      return {
        status: 'dirty',
        updatedAt: state.updatedAt,
        saveInFlight: state.status === 'saving' || (state.status === 'dirty' && state.saveInFlight),
      };
    case 'saving':
      if (state.status === 'conflict') return state;
      return { status: 'saving', updatedAt: state.updatedAt };
    case 'saved':
      if (state.status === 'dirty' && state.saveInFlight) {
        return { status: 'dirty', updatedAt: event.updatedAt };
      }
      return { status: 'saved', updatedAt: event.updatedAt };
    case 'failed':
      return {
        status: 'failed',
        updatedAt: state.updatedAt,
        message: event.message,
      };
    case 'conflict':
      return {
        status: 'conflict',
        updatedAt: state.updatedAt,
        currentUpdatedAt: event.currentUpdatedAt,
      };
    case 'reset':
      return initialSaveState(event.updatedAt);
  }
}

export function saveStateText(state: SaveState): string {
  switch (state.status) {
    case 'saved':
      return 'Saved';
    case 'dirty':
      return 'Unsaved changes';
    case 'saving':
      return 'Saving…';
    case 'failed':
      return 'Save failed';
    case 'conflict':
      return 'Changed elsewhere';
  }
}

export function canFinalizeReport(role: projects.ProjectRole, saveState: SaveState): boolean {
  return role === 'owner' && saveState.status === 'saved';
}
