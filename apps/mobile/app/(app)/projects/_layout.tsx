import { Stack } from 'expo-router';

export default function ProjectsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[project]/index" />
      <Stack.Screen name="[project]/edit" />
      <Stack.Screen name="[project]/members" />
      <Stack.Screen name="[project]/reports/index" />
      <Stack.Screen name="[project]/reports/[number]/index" />
      <Stack.Screen name="[project]/reports/[number]/generate" />
    </Stack>
  );
}
