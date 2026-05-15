import { Stack } from 'expo-router';

export default function ProjectsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[projectSlug]/index" />
      <Stack.Screen name="[projectSlug]/edit" />
      <Stack.Screen name="[projectSlug]/members" />
      <Stack.Screen name="[projectSlug]/reports/index" />
      <Stack.Screen name="[projectSlug]/reports/[number]/generate" />
    </Stack>
  );
}
