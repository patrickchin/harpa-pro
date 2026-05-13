import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceTranscriptPanel } from '../components/VoiceTranscriptPanel.js';
import { demoTranscript } from '../fixtures/index.js';

describe('VoiceTranscriptPanel', () => {
  it('renders the transcript text and duration', () => {
    render(<VoiceTranscriptPanel transcript={demoTranscript} />);
    expect(screen.getByText('Transcript')).toBeTruthy();
    // 47s → 0:47
    expect(screen.getByText('0:47')).toBeTruthy();
    // First few words of the fixture
    expect(
      screen.getByText(/Right, it's Tuesday the twelfth/),
    ).toBeTruthy();
  });

  it('hides the transcript text while loading', () => {
    render(<VoiceTranscriptPanel transcript={demoTranscript} loading />);
    expect(
      screen.queryByText(/Right, it's Tuesday the twelfth/),
    ).toBeNull();
  });
});
