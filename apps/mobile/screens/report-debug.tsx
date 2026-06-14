/**
 * ReportDebug screen — read-only view of the data behind the most
 * recent AI generation. Gated by the `showDeveloperSection` flag
 * (`env.EXPO_PUBLIC_USE_FIXTURES` or `__DEV__`) — the API does not
 * restrict access (data is the user's own notes + prompt/response),
 * but we hide the navigation entry in production builds.
 *
 * Props-driven so dev mirrors + tests can render canned data.
 * See docs/v4/design-maestro-full-regression.md §3.4.
 */
import { ScrollView, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';

export interface ReportDebugProps {
  reportNumber: number | null;
  isLoading: boolean;
  loadError: Error | null;
  prompt: { system: string; user: string } | null;
  notes: ReadonlyArray<{
    id: string;
    kind: 'text' | 'voice' | 'image' | 'document';
    body: string | null;
    transcript: string | null;
    createdAt: string;
  }>;
  lastGeneration: {
    requestedAt: string;
    finishedAt: string | null;
    vendor: string;
    model: string;
    fixtureMode: 'live' | 'replay' | 'record';
    systemPrompt: string;
    userPrompt: string;
    response: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
      cachedTokens?: number;
    } | null;
  } | null;
  onBack: () => void;
  /** Optional profile button slot (mirrors saved-report). */
  actions?: ReactNode;
}

function Section({
  title,
  children,
  testID,
}: {
  title: string;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View className="gap-2 rounded-lg border border-border bg-card p-4" testID={testID}>
      <Text className="text-sm font-semibold uppercase text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

function MonoBlock({ text, testID }: { text: string; testID?: string }) {
  return (
    <Text
      className="font-mono text-xs text-foreground"
      testID={testID}
      selectable
    >
      {text.length > 0 ? text : '(empty)'}
    </Text>
  );
}

export function ReportDebug(props: ReportDebugProps) {
  const {
    reportNumber,
    isLoading,
    loadError,
    prompt,
    notes,
    lastGeneration,
    onBack,
    actions,
  } = props;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenHeader
        title={
          reportNumber !== null ? `Debug: Report #${reportNumber}` : 'Debug'
        }
        onBack={onBack}
        actions={actions}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 py-4 pb-12"
        testID="report-debug-scroll"
      >
        {isLoading ? (
          <View className="items-center py-16" testID="report-debug-loading">
            <Text className="text-muted-foreground">Loading…</Text>
          </View>
        ) : loadError ? (
          <View
            className="items-center py-16"
            testID="report-debug-error"
          >
            <Text className="text-danger-text">
              Failed to load debug data.
            </Text>
            <Text className="mt-2 text-xs text-muted-foreground">
              {loadError.message}
            </Text>
          </View>
        ) : (
          <>
            <Section title="Prompt — system" testID="debug-prompt-system">
              <MonoBlock
                text={prompt?.system ?? ''}
                testID="debug-prompt-system-text"
              />
            </Section>
            <Section title="Prompt — user (live)" testID="debug-prompt">
              <MonoBlock
                text={prompt?.user ?? ''}
                testID="debug-prompt-text"
              />
            </Section>

            <Section title="Report notes" testID="debug-report-notes">
              {notes.length === 0 ? (
                <Text
                  className="text-sm text-muted-foreground"
                  testID="debug-report-notes-empty"
                >
                  No notes yet.
                </Text>
              ) : (
                notes.map((n) => (
                  <View
                    key={n.id}
                    className="gap-1 border-l-2 border-border pl-3"
                    testID={`debug-note-${n.id}`}
                  >
                    <Text className="text-xs uppercase text-muted-foreground">
                      {n.kind} · {new Date(n.createdAt).toLocaleString()}
                    </Text>
                    <Text className="text-sm text-foreground" selectable>
                      {n.body ?? n.transcript ?? '(no body)'}
                    </Text>
                  </View>
                ))
              )}
            </Section>

            {lastGeneration ? (
              <>
                <Section
                  title="Last generation — metadata"
                  testID="debug-last-generation-meta"
                >
                  <Text className="text-sm text-foreground">
                    Vendor: <Text className="font-semibold">{lastGeneration.vendor}</Text>
                  </Text>
                  <Text className="text-sm text-foreground">
                    Model: <Text className="font-semibold">{lastGeneration.model}</Text>
                  </Text>
                  <Text className="text-sm text-foreground">
                    Mode: <Text className="font-semibold">{lastGeneration.fixtureMode}</Text>
                  </Text>
                  <Text className="text-sm text-foreground">
                    Requested: {new Date(lastGeneration.requestedAt).toLocaleString()}
                  </Text>
                  <Text className="text-sm text-foreground">
                    Finished:{' '}
                    {lastGeneration.finishedAt
                      ? new Date(lastGeneration.finishedAt).toLocaleString()
                      : '—'}
                  </Text>
                  {lastGeneration.usage ? (
                    <Text className="text-sm text-foreground">
                      Tokens: in {lastGeneration.usage.inputTokens} / out{' '}
                      {lastGeneration.usage.outputTokens}
                      {lastGeneration.usage.cachedTokens
                        ? ` (cached ${lastGeneration.usage.cachedTokens})`
                        : ''}
                    </Text>
                  ) : null}
                </Section>
                <Section title="LLM response" testID="debug-llm-response">
                  <MonoBlock
                    text={lastGeneration.response}
                    testID="debug-llm-response-text"
                  />
                </Section>
                <Section
                  title="Last generation — prompt sent"
                  testID="debug-last-prompt"
                >
                  <Text className="text-xs uppercase text-muted-foreground">
                    system
                  </Text>
                  <MonoBlock text={lastGeneration.systemPrompt} />
                  <Text className="mt-2 text-xs uppercase text-muted-foreground">
                    user
                  </Text>
                  <MonoBlock text={lastGeneration.userPrompt} />
                </Section>
              </>
            ) : (
              <View
                className="items-center py-8"
                testID="debug-empty-state"
              >
                <Text className="text-sm text-muted-foreground">
                  This report has not been generated yet. The prompt and
                  response will appear here after the first generate
                  call.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
