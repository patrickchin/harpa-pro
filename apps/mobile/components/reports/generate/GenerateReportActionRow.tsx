/**
 * GenerateReportActionRow — persistent Update / Finalize CTA above the
 * tab bar. Ported from
 * `../haru3-reports/apps/mobile/components/reports/generate/GenerateReportActionRow.tsx`
 * on branch `dev`.
 *
 * P3.6 keeps the visual shell so the Notes tab matches the final
 * design. The handlers route to the same provider surface, but the
 * underlying generation/finalize pipelines are stubbed (`hasReport`
 * is always false, so the "Generate report" branch is what renders).
 */
import { Text, View } from 'react-native';
import { RotateCcw, Sparkles } from 'lucide-react-native';

import { Button } from '@/components/primitives/Button';
import { useGenerateReport } from './GenerateReportProvider';
import { colors } from '@/lib/design-tokens/colors';

export function GenerateReportActionRow() {
  const { generation, draft, timeline } = useGenerateReport();

  const hasReport = generation.hasReport;
  const hasNotes = timeline.items.length > 0;
  const upToDate = hasReport && generation.notesSinceLastGeneration === 0;
  const busy = generation.isUpdating || draft.isFinalizing;

  const handleRegenerate = () => {
    // TODO(P3.7): route to useReportGeneration().regenerate via provider.
  };

  if (!upToDate) {
    const label = generation.isUpdating
      ? 'Generating…'
      : !hasReport
        ? 'Generate report'
        : `Update report (${generation.notesSinceLastGeneration})`;

    return (
      <View className="mx-5 mt-3">
        <Button
          testID="btn-generate-update-report"
          variant="secondary"
          size="default"
          className="w-full"
          onPress={handleRegenerate}
          disabled={busy || (!hasReport && !hasNotes)}
        >
          <View className="flex-row items-center gap-1.5">
            <Sparkles size={16} color={colors.foreground} />
            <Text
              className="text-base font-semibold text-foreground"
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </Button>
      </View>
    );
  }

  return (
    <View className="mx-5 mt-3 flex-row gap-2">
      <Button
        testID="btn-generate-update-report"
        variant="secondary"
        size="default"
        accessibilityLabel="Regenerate report"
        onPress={handleRegenerate}
        disabled={busy}
      >
        <RotateCcw size={18} color={colors.foreground} />
      </Button>
      <View className="flex-1">
        <Button
          testID="btn-finalize-report"
          variant="hero"
          size="default"
          className="w-full"
          onPress={() => draft.setIsFinalizeConfirmVisible(true)}
          disabled={busy}
        >
          <Text
            className="text-base font-semibold text-primary-foreground"
            numberOfLines={1}
          >
            {draft.isFinalizing ? 'Finalizing…' : 'Finalize report'}
          </Text>
        </Button>
      </View>
    </View>
  );
}
