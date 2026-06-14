import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  HardHat,
} from 'lucide-react-native';

import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { colors } from '@/lib/design-tokens/colors';
import {
  ONBOARDING_POC_VARIANTS,
  SAMPLE_ONBOARDING_REPORT,
  type OnboardingPocVariant,
  type OnboardingPocVariantId,
} from '@/lib/onboarding/poc';

export interface OnboardingLabProps {
  selectedVariantId: OnboardingPocVariantId;
  onSelectVariant: (id: OnboardingPocVariantId) => void;
  onPrimaryAction: (id: OnboardingPocVariantId) => void;
  onBack: () => void;
}

function VariantIcon({
  id,
  selected,
}: {
  id: OnboardingPocVariantId;
  selected: boolean;
}) {
  const color = selected ? colors.accent.DEFAULT : colors.muted.foreground;

  if (id === 'sample-report') {
    return <FileText size={18} color={color} />;
  }
  if (id === 'workspace-first') {
    return <HardHat size={18} color={color} />;
  }
  return <ClipboardList size={18} color={color} />;
}

function VariantOption({
  variant,
  selected,
  onPress,
}: {
  variant: OnboardingPocVariant;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`onboarding-variant-${variant.id}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-lg border p-4 ${
        selected ? 'border-accent bg-surface-emphasis' : 'border-border bg-card'
      }`}
    >
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
          <VariantIcon id={variant.id} selected={selected} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-title-sm text-foreground" numberOfLines={1}>
            {variant.label}
          </Text>
          <Text className="text-body text-muted-foreground" numberOfLines={2}>
            {variant.summary}
          </Text>
        </View>
        {selected ? (
          <Check size={18} color={colors.accent.DEFAULT} />
        ) : (
          <ChevronRight size={18} color={colors.muted.foreground} />
        )}
      </View>
    </Pressable>
  );
}

function StepList({ items }: { items: readonly string[] }) {
  return (
    <View className="gap-3">
      {items.map((item, index) => (
        <View key={item} className="flex-row items-start gap-3">
          <View className="h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-muted">
            <Text className="text-sm font-semibold text-foreground">
              {index + 1}
            </Text>
          </View>
          <Text className="min-w-0 flex-1 text-body text-foreground">
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SignalList({ items }: { items: readonly string[] }) {
  return (
    <View className="gap-3">
      {items.map((item) => (
        <View key={item} className="flex-row items-start gap-2">
          <Clock size={14} color={colors.muted.foreground} />
          <Text className="min-w-0 flex-1 text-body text-muted-foreground">
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SampleReportPreview() {
  return (
    <Card variant="emphasis" className="gap-4">
      <View className="gap-1">
        <Text className="text-label text-muted-foreground">
          Sample report preview
        </Text>
        <Text className="text-title-sm text-foreground">
          {SAMPLE_ONBOARDING_REPORT.title}
        </Text>
        <Text className="text-body text-muted-foreground">
          {SAMPLE_ONBOARDING_REPORT.summary}
        </Text>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-label text-muted-foreground">Crew</Text>
          <Text className="text-title-sm text-foreground">
            {SAMPLE_ONBOARDING_REPORT.workerCount} workers
          </Text>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-label text-muted-foreground">Weather</Text>
          <Text className="text-title-sm text-foreground" numberOfLines={1}>
            {SAMPLE_ONBOARDING_REPORT.weather}
          </Text>
        </View>
      </View>

      <View className="gap-2 border-t border-border pt-3">
        <Text className="text-sm font-semibold text-warning-text">
          {SAMPLE_ONBOARDING_REPORT.issueTitle}
        </Text>
        <Text className="text-body text-muted-foreground">
          {SAMPLE_ONBOARDING_REPORT.issueDetail}
        </Text>
      </View>

      <View className="gap-2 border-t border-border pt-3">
        <Text className="text-sm font-semibold text-success-text">
          Next step
        </Text>
        <Text className="text-body text-muted-foreground">
          {SAMPLE_ONBOARDING_REPORT.nextStep}
        </Text>
      </View>
    </Card>
  );
}

export function OnboardingLab({
  selectedVariantId,
  onSelectVariant,
  onPrimaryAction,
  onBack,
}: OnboardingLabProps) {
  const selectedVariant = useMemo(
    () =>
      ONBOARDING_POC_VARIANTS.find(
        (variant) => variant.id === selectedVariantId,
      ) ??
      ONBOARDING_POC_VARIANTS[0],
    [selectedVariantId],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View className="px-5 pt-4 pb-6">
          <ScreenHeader
            title="Onboarding Lab"
            subtitle="Pick one path to trial. Each option routes into the existing project setup flow."
            backLabel="Projects"
            onBack={onBack}
          />
        </View>

        <View className="gap-4 px-5">
          <View className="gap-3">
            {ONBOARDING_POC_VARIANTS.map((variant) => (
              <VariantOption
                key={variant.id}
                variant={variant}
                selected={variant.id === selectedVariant.id}
                onPress={() => onSelectVariant(variant.id)}
              />
            ))}
          </View>

          <Card className="gap-4">
            <View className="gap-1">
              <Text className="text-label text-muted-foreground">
                {selectedVariant.eyebrow}
              </Text>
              <Text className="text-title-sm text-foreground">
                {selectedVariant.title}
              </Text>
              <Text className="text-body text-muted-foreground">
                {selectedVariant.summary}
              </Text>
            </View>

            <StepList items={selectedVariant.steps} />

            <Button
              testID="btn-onboarding-lab-primary"
              variant="hero"
              size="lg"
              onPress={() => onPrimaryAction(selectedVariant.id)}
              accessibilityLabel={selectedVariant.primaryCta}
            >
              {selectedVariant.primaryCta}
            </Button>
          </Card>

          {selectedVariant.id === 'sample-report' ? (
            <SampleReportPreview />
          ) : null}

          <Card variant="muted" className="gap-3">
            <Text className="text-title-sm text-foreground">
              Morning trial notes
            </Text>
            <SignalList items={selectedVariant.signals} />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
