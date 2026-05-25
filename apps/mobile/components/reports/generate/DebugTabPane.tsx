/**
 * DebugTabPane — surfaces the prompt, input notes, and LLM response
 * from the most recent (re)generate call. Adapted from canonical
 * `../haru3-reports/apps/mobile/components/reports/generate/DebugTabPane.tsx`
 * (v3) — same UX (collapsible sections, copy buttons), but reads from
 * the v4 `generation.lastGeneration` surface instead of the
 * `rawRequest/rawResponse` pair canonical exposed.
 */
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react-native';

import { useCopyToClipboard } from '@/lib/util/use-clipboard';
import { useGenerateReport } from '@/features/generate/GenerateReportProvider';
import { colors } from '@/lib/design-tokens/colors';

interface DebugTabPaneProps {
  width: number;
}

const monoStyle = {
  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
} as const;

export function DebugTabPane({ width }: DebugTabPaneProps) {
  const { notes, generation } = useGenerateReport();
  const notesCount = notes.list.length;
  const { copy: copyDebug, isCopied: isDebugCopied } = useCopyToClipboard();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    prompt: false,
    input: false,
    response: false,
    error: false,
  });
  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const isCollapsed = (key: string) => collapsed[key] === true;

  const last = generation.lastGeneration;

  const rawResponseText = useMemo(() => {
    if (!last) return '';
    try {
      return JSON.stringify(JSON.parse(last.rawText), null, 2);
    } catch {
      return last.rawText;
    }
  }, [last]);

  const combinedPrompt = useMemo(() => {
    if (!last) return '';
    return [
      last.systemPrompt ? `# System\n\n${last.systemPrompt}` : '',
      last.userPrompt ? `# User\n\n${last.userPrompt}` : '',
    ]
      .filter(Boolean)
      .join('\n\n---\n\n');
  }, [last]);

  const status = generation.isUpdating
    ? 'pending'
    : generation.error
      ? 'error'
      : last
        ? 'success'
        : 'idle';

  return (
    <View style={{ width }} className="flex-1" testID="debug-tab-pane">
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <View className="gap-4 py-3">
          <View className="flex-row items-center gap-2 border border-border bg-card p-3">
            <Text className="text-sm font-bold text-foreground">Status:</Text>
            <Text
              className="text-sm text-foreground"
              style={monoStyle}
              testID="debug-status"
            >
              {status}
            </Text>
            <Text className="ml-3 text-sm font-bold text-foreground">Notes:</Text>
            <Text className="text-sm text-foreground" style={monoStyle}>
              {notesCount}
            </Text>
            {last ? (
              <>
                <Text className="ml-3 text-sm font-bold text-foreground">
                  Vendor:
                </Text>
                <Text className="text-sm text-foreground" style={monoStyle}>
                  {last.vendor}
                </Text>
              </>
            ) : null}
          </View>

          {/* System Prompt */}
          <Section
            title="System Prompt"
            collapsed={isCollapsed("prompt")}
            onToggle={() => toggle('prompt')}
            actions={
              last?.systemPrompt ? (
                <CopyButton
                  label="System"
                  copyKey="system"
                  text={last.systemPrompt}
                  copy={copyDebug}
                  isCopied={isDebugCopied}
                />
              ) : null
            }
          >
            {last?.systemPrompt ? (
              <Text className="text-xs text-foreground" style={monoStyle}>
                {last.systemPrompt}
              </Text>
            ) : (
              <Text className="text-xs text-muted-foreground">
                No prompt yet — tap Generate / Update report on the Notes tab.
              </Text>
            )}
          </Section>

          {/* Input (user prompt) */}
          <Section
            title="Input (Notes Payload)"
            collapsed={isCollapsed("input")}
            onToggle={() => toggle('input')}
            actions={
              last?.userPrompt ? (
                <CopyButton
                  label="Input"
                  copyKey="user"
                  text={last.userPrompt}
                  copy={copyDebug}
                  isCopied={isDebugCopied}
                />
              ) : null
            }
          >
            {last?.userPrompt ? (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <Text className="text-xs text-foreground" style={monoStyle}>
                  {last.userPrompt}
                </Text>
              </ScrollView>
            ) : (
              <Text className="text-xs text-muted-foreground">
                No input captured yet.
              </Text>
            )}
          </Section>

          {/* Combined copy for convenience */}
          {combinedPrompt ? (
            <View className="flex-row justify-end">
              <CopyButton
                label="Full prompt"
                copyKey="combined"
                text={combinedPrompt}
                copy={copyDebug}
                isCopied={isDebugCopied}
              />
            </View>
          ) : null}

          {/* LLM Response */}
          <Section
            title="LLM Response"
            collapsed={isCollapsed("response")}
            onToggle={() => toggle('response')}
            actions={
              last?.rawText ? (
                <CopyButton
                  label="Response"
                  copyKey="response"
                  text={rawResponseText}
                  copy={copyDebug}
                  isCopied={isDebugCopied}
                />
              ) : null
            }
          >
            {last?.rawText ? (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <Text className="text-xs text-foreground" style={monoStyle}>
                  {rawResponseText}
                </Text>
              </ScrollView>
            ) : (
              <Text className="text-xs text-muted-foreground">
                No response yet.
              </Text>
            )}
          </Section>

          {generation.error ? (
            <Section
              title="Error"
              collapsed={isCollapsed("error")}
              onToggle={() => toggle('error')}
              destructive
            >
              <Text className="text-xs text-destructive" style={monoStyle}>
                {generation.error}
              </Text>
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  collapsed,
  onToggle,
  actions,
  destructive,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View>
      <View className="mb-1 flex-row items-center justify-between">
        <Pressable
          onPress={onToggle}
          className="flex-row items-center gap-1"
          accessibilityLabel={`Toggle ${title}`}
        >
          {collapsed ? (
            <ChevronRight
              size={16}
              color={destructive ? colors.danger.DEFAULT : colors.foreground}
            />
          ) : (
            <ChevronDown
              size={16}
              color={destructive ? colors.danger.DEFAULT : colors.foreground}
            />
          )}
          <Text
            className={`text-base font-bold ${destructive ? 'text-destructive' : 'text-foreground'}`}
          >
            {title}
          </Text>
        </Pressable>
        {actions}
      </View>
      {!collapsed ? (
        <View
          className={`border bg-card p-3 ${destructive ? 'border-destructive' : 'border-border'}`}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

function CopyButton({
  label,
  copyKey,
  text,
  copy,
  isCopied,
}: {
  label: string;
  copyKey: string;
  text: string;
  copy: (text: string, opts: { key: string; toast: string }) => void;
  isCopied: (key: string) => boolean;
}) {
  return (
    <Pressable
      onPress={() => copy(text, { key: copyKey, toast: `${label} copied` })}
      className="flex-row items-center gap-1 border border-border bg-card px-2 py-1"
      accessibilityLabel={`Copy ${label}`}
      testID={`btn-copy-${copyKey}`}
    >
      {isCopied(copyKey) ? (
        <Check size={12} color={colors.success.DEFAULT} />
      ) : (
        <Copy size={12} color={colors.muted.foreground} />
      )}
      <Text className="text-xs text-foreground">{label}</Text>
    </Pressable>
  );
}
