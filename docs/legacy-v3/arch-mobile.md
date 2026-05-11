# Mobile Architecture

> Part of [Mobile v3 Architecture](./architecture.md)

## 3.1 Directory Structure

Target: **~120-150 source files** (vs current 246)

```
apps/mobile-v3/
├── app/                           # Expo Router screens (~15 files)
│   ├── _layout.tsx               # Root layout + providers
│   ├── index.tsx                 # Auth redirect
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── verify.tsx
│   │   └── onboarding.tsx
│   ├── (app)/
│   │   ├── _layout.tsx           # Main app layout (no tab bar)
│   │   ├── projects/
│   │   │   ├── index.tsx         # Project list
│   │   │   ├── new.tsx
│   │   │   └── [projectId]/
│   │   │       ├── index.tsx     # Project detail
│   │   │       ├── edit.tsx
│   │   │       ├── members.tsx
│   │   │       └── reports/
│   │   │           ├── index.tsx
│   │   │           ├── generate.tsx
│   │   │           └── [reportId].tsx
│   │   ├── profile/
│   │   │   ├── index.tsx
│   │   │   ├── account.tsx
│   │   │   └── usage.tsx
│   │   └── camera/
│   │       └── capture.tsx
│   └── +not-found.tsx
├── components/                    # Shared components (~40 files)
│   ├── ui/                       # Design system primitives
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Dialog.tsx
│   │   ├── Sheet.tsx
│   │   ├── Skeleton.tsx
│   │   ├── EmptyState.tsx
│   │   └── CachedImage.tsx
│   ├── forms/                    # Form components
│   │   ├── ProjectForm.tsx
│   │   ├── ReportForm.tsx
│   │   └── ProfileForm.tsx
│   ├── reports/                  # Report-specific components
│   │   ├── ReportCard.tsx
│   │   ├── ReportView.tsx
│   │   ├── NoteTimeline.tsx
│   │   ├── GenerateActionBar.tsx
│   │   └── sections/
│   │       ├── WeatherSection.tsx
│   │       ├── WorkersSection.tsx
│   │       ├── MaterialsSection.tsx
│   │       ├── IssuesSection.tsx
│   │       └── SectionsSection.tsx
│   ├── files/                    # File handling
│   │   ├── FileCard.tsx
│   │   ├── FilePicker.tsx
│   │   ├── ImagePreview.tsx
│   │   └── UploadTrayBadge.tsx
│   ├── voice/                    # Voice note components
│   │   ├── VoiceNoteCard.tsx
│   │   ├── RecordButton.tsx
│   │   └── Waveform.tsx
│   └── members/
│       ├── MembersList.tsx
│       └── AddMemberSheet.tsx
├── features/                      # Feature modules (~15 files)
│   ├── auth/
│   │   ├── AuthProvider.tsx
│   │   └── useAuth.ts
│   ├── upload-queue/
│   │   ├── UploadQueueProvider.tsx
│   │   ├── useUploadQueue.ts
│   │   └── upload-worker.ts
│   └── audio/
│       ├── AudioProvider.tsx
│       ├── useRecorder.ts
│       └── usePlayer.ts
├── lib/                           # Utilities (~20 files)
│   ├── api/
│   │   ├── client.ts             # Generated API client wrapper
│   │   └── hooks.ts              # React Query hook factories
│   ├── state/
│   │   ├── observables.ts        # Legends State observables
│   │   └── selectors.ts
│   ├── styles/
│   │   ├── tokens.ts             # Design tokens
│   │   ├── theme.ts              # Unistyles theme
│   │   └── unistyles.ts          # Unistyles setup
│   ├── utils/
│   │   ├── format.ts
│   │   ├── validation.ts
│   │   └── platform.ts
│   └── constants.ts
├── assets/                        # Static assets (shared with v1)
├── app.config.ts
├── package.json
└── tsconfig.json
```

## 3.2 Expo Router File Structure

**Key simplification:** Remove the `(tabs)` group since the tab bar is hidden in most flows.

```
Current (apps/mobile):
app/
├── (tabs)/
│   ├── _layout.tsx      # Tab navigator (hidden)
│   └── projects.tsx
├── projects/
│   └── [projectId]/...

Proposed (apps/mobile-v3):
app/
├── (app)/
│   ├── _layout.tsx      # Stack navigator
│   └── projects/
│       ├── index.tsx    # Project list (was (tabs)/projects.tsx)
│       └── [projectId]/...
```

**Route mapping:**

| Screen | v1 Path | v3 Path |
|--------|---------|---------|
| Project List | `/(tabs)/projects` | `/(app)/projects` |
| Project Detail | `/projects/[projectId]` | `/(app)/projects/[projectId]` |
| Generate Report | `/projects/[projectId]/reports/generate` | `/(app)/projects/[projectId]/reports/generate` |
| View Report | `/projects/[projectId]/reports/[reportId]` | `/(app)/projects/[projectId]/reports/[reportId]` |
| Profile | `/profile` | `/(app)/profile` |
| Camera | `/(camera)/capture` | `/(app)/camera/capture` |

## 3.3 State Management Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           State Management                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Legends State (@legendapp/state)                  │   │
│  │                                                                      │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │   │
│  │  │   Auth State     │  │    UI State      │  │  Upload Queue    │   │   │
│  │  │                  │  │                  │  │                  │   │   │
│  │  │  • session$      │  │  • activeModal$  │  │  • jobs$         │   │   │
│  │  │  • user$         │  │  • selectedTab$  │  │  • pending$      │   │   │
│  │  │  • profile$      │  │  • sortOrder$    │  │  • failed$       │   │   │
│  │  │  • isLoading$    │  │  • filterState$  │  │  • completed$    │   │   │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘   │   │
│  │                                                                      │   │
│  │  ┌──────────────────┐  ┌──────────────────┐                         │   │
│  │  │   Audio State    │  │  AI Settings     │                         │   │
│  │  │                  │  │                  │                         │   │
│  │  │  • isRecording$  │  │  • provider$     │                         │   │
│  │  │  • playingId$    │  │  • model$        │                         │   │
│  │  │  • waveform$     │  │                  │                         │   │
│  │  └──────────────────┘  └──────────────────┘                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     TanStack React Query                             │   │
│  │                                                                      │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │   │
│  │  │    Projects      │  │     Reports      │  │      Files       │   │   │
│  │  │                  │  │                  │  │                  │   │   │
│  │  │  useProjects()   │  │  useReports()    │  │  useFiles()      │   │   │
│  │  │  useProject(id)  │  │  useReport(id)   │  │  useFile(id)     │   │   │
│  │  │  useCreateProj() │  │  useGenerate()   │  │  useUpload()     │   │   │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘   │   │
│  │                                                                      │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │   │
│  │  │     Members      │  │      Notes       │  │      Usage       │   │   │
│  │  │                  │  │                  │  │                  │   │   │
│  │  │  useMembers()    │  │  useNotes()      │  │  useUsage()      │   │   │
│  │  │  useAddMember()  │  │  useCreateNote() │  │  useHistory()    │   │   │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Legends State observables:**

```typescript
// lib/state/observables.ts
import { observable } from '@legendapp/state';
import { persistObservable } from '@legendapp/state/persist';
import { ObservablePersistAsyncStorage } from '@legendapp/state/persist-plugins/async-storage';

// Auth state (persisted)
export const auth$ = observable({
  session: null as Session | null,
  user: null as User | null,
  profile: null as Profile | null,
  isLoading: true,
});

// UI state (not persisted)
export const ui$ = observable({
  activeModal: null as string | null,
  selectedTab: 'notes' as 'notes' | 'report' | 'edit',
  isKeyboardVisible: false,
});

// Upload queue (persisted for resume)
export const uploadQueue$ = observable({
  jobs: [] as UploadJob[],
});

persistObservable(uploadQueue$, {
  local: 'upload-queue-v3',
  pluginLocal: ObservablePersistAsyncStorage,
});

// Audio playback (not persisted)
export const audio$ = observable({
  isRecording: false,
  recordingDuration: 0,
  playingFileId: null as string | null,
  playbackPosition: 0,
});

// AI settings (persisted)
export const aiSettings$ = observable({
  provider: 'kimi' as AiProvider,
  model: 'kimi-k2-0905-preview' as string,
});

persistObservable(aiSettings$, {
  local: 'ai-settings-v3',
  pluginLocal: ObservablePersistAsyncStorage,
});
```

**React Query for server data:**

```typescript
// lib/api/hooks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const projectKeys = {
  all: ['projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: () => api.GET('/api/v1/projects').then(r => r.data?.data ?? []),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => api.GET('/api/v1/projects/{id}', { params: { path: { id } } })
      .then(r => r.data?.data ?? null),
    enabled: !!id,
  });
}
```

## 3.4 Component Architecture

**Three layers:**

1. **Screen components** (`app/`) — route entry points, minimal logic
2. **Feature components** (`features/`) — domain logic, providers, complex hooks
3. **UI components** (`components/`) — presentational, reusable

```typescript
// app/(app)/projects/[projectId]/reports/generate.tsx
// Screen component — thin, delegates to features
export default function GenerateReportScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const report = useReport(reportId);
  
  return (
    <GenerateReportProvider reportId={reportId}>
      <SafeAreaView edges={['bottom']}>
        <GenerateReportHeader />
        <NoteTimeline />
        <GenerateActionBar />
      </SafeAreaView>
    </GenerateReportProvider>
  );
}

// features/reports/GenerateReportProvider.tsx
// Feature component — orchestrates state and mutations
export function GenerateReportProvider({ reportId, children }) {
  const notes = useNotes(reportId);
  const generate = useGenerateReport();
  // Complex state coordination...
  
  return (
    <GenerateReportContext.Provider value={...}>
      {children}
    </GenerateReportContext.Provider>
  );
}

// components/reports/NoteTimeline.tsx
// UI component — pure presentation
export function NoteTimeline({ notes, onDelete, onReorder }) {
  return (
    <Animated.FlatList
      data={notes}
      renderItem={({ item }) => <NoteCard note={item} />}
      // ...
    />
  );
}
```

## 3.5 Design Token System (Unistyles)

**Migrate NativeWind tokens to Unistyles:**

```typescript
// lib/styles/tokens.ts
export const colors = {
  // Semantic colors (light mode)
  background: '#FFFFFF',
  foreground: '#0F172A',
  primary: '#3B82F6',
  primaryForeground: '#FFFFFF',
  secondary: '#F1F5F9',
  secondaryForeground: '#475569',
  muted: '#F8FAFC',
  mutedForeground: '#64748B',
  accent: '#F1F5F9',
  accentForeground: '#0F172A',
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',
  border: '#E2E8F0',
  input: '#E2E8F0',
  ring: '#3B82F6',
  
  // Status colors
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const typography = {
  h1: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  h2: { fontSize: 24, fontWeight: '600', lineHeight: 32 },
  h3: { fontSize: 20, fontWeight: '600', lineHeight: 28 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
} as const;
```

```typescript
// lib/styles/unistyles.ts
import { UnistylesRegistry, createStyleSheet } from 'react-native-unistyles';
import { colors, spacing, radii, typography } from './tokens';

const lightTheme = {
  colors,
  spacing,
  radii,
  typography,
};

const darkTheme = {
  colors: {
    ...colors,
    background: '#0F172A',
    foreground: '#F8FAFC',
    // ... dark mode overrides
  },
  spacing,
  radii,
  typography,
};

type AppThemes = { light: typeof lightTheme; dark: typeof darkTheme };

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
}

UnistylesRegistry
  .addThemes({ light: lightTheme, dark: darkTheme })
  .addConfig({ adaptiveThemes: true });
```

**Component example:**

```typescript
// components/ui/Button.tsx
import { Pressable, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}

export function Button({ variant = 'primary', size = 'md', children, onPress, disabled }: ButtonProps) {
  const { styles } = useStyles(stylesheet, { variant, size });
  
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.text}>{children}</Text>
    </Pressable>
  );
}

const stylesheet = createStyleSheet((theme, rt) => ({
  button: {
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    variants: {
      variant: {
        primary: { backgroundColor: theme.colors.primary },
        secondary: { backgroundColor: theme.colors.secondary },
        destructive: { backgroundColor: theme.colors.destructive },
      },
      size: {
        sm: { paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm },
        md: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
        lg: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
      },
    },
  },
  text: {
    color: theme.colors.primaryForeground,
    ...theme.typography.body,
    variants: {
      variant: {
        primary: { color: theme.colors.primaryForeground },
        secondary: { color: theme.colors.secondaryForeground },
        destructive: { color: theme.colors.destructiveForeground },
      },
    },
  },
  pressed: { opacity: 0.8 },
}));
```

## 3.6 Upload Queue Architecture

```typescript
// features/upload-queue/types.ts
export interface UploadJob {
  id: string;                    // Local UUID
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  fileUri: string;               // Local file path
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: 'image' | 'document' | 'voice-note';
  reportId: string;
  projectId: string;
  
  // Progress tracking
  progress: number;              // 0-100
  retryCount: number;
  lastError?: string;
  
  // Post-upload data
  storagePath?: string;
  fileId?: string;               // file_metadata.id
  addedAt: number;               // Timestamp for stable sorting (R11)
}

// features/upload-queue/UploadQueueProvider.tsx
export function UploadQueueProvider({ children }) {
  const queryClient = useQueryClient();
  
  // Process queue on mount
  useEffect(() => {
    const processQueue = async () => {
      const pending = uploadQueue$.jobs.get().filter(j => j.status === 'pending');
      for (const job of pending) {
        await processJob(job);
      }
    };
    processQueue();
  }, []);
  
  const enqueue = useCallback((input: EnqueueInput): string => {
    const job: UploadJob = {
      id: uuid(),
      status: 'pending',
      progress: 0,
      retryCount: 0,
      addedAt: Date.now(),
      ...input,
    };
    uploadQueue$.jobs.push(job);
    return job.id;
  }, []);
  
  const processJob = async (job: UploadJob) => {
    try {
      // 1. Get presigned URL
      uploadQueue$.jobs[job.id].status.set('uploading');
      const { signedUrl, storagePath } = await api.POST('/api/v1/uploads/presign', {
        body: { fileName: job.fileName, mimeType: job.mimeType, category: job.category },
      }).then(r => r.data!.data);
      
      // 2. Upload to storage (platform-specific)
      await uploadFile(job.fileUri, signedUrl, (progress) => {
        uploadQueue$.jobs[job.id].progress.set(progress);
      });
      
      // 3. Create file_metadata + report_notes
      const file = await api.POST('/api/v1/files', {
        body: { storagePath, reportId: job.reportId, category: job.category, ... },
      }).then(r => r.data!.data);
      
      // 4. Update job
      uploadQueue$.jobs[job.id].assign({
        status: 'uploaded',
        storagePath,
        fileId: file.id,
      });
      
      // 5. Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['files', job.projectId] });
      queryClient.invalidateQueries({ queryKey: ['notes', job.reportId] });
      
    } catch (error) {
      uploadQueue$.jobs[job.id].assign({
        status: 'failed',
        lastError: error.message,
        retryCount: job.retryCount + 1,
      });
    }
  };
  
  return (
    <UploadQueueContext.Provider value={{ enqueue, retry, cancel }}>
      {children}
    </UploadQueueContext.Provider>
  );
}
```

**Platform-specific upload:**

```typescript
// features/upload-queue/upload-worker.ts
import { Platform } from 'react-native';

export async function uploadFile(
  localUri: string,
  signedUrl: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  if (Platform.OS === 'ios') {
    return uploadWithNSURLSession(localUri, signedUrl, onProgress);
  } else {
    return uploadWithForegroundService(localUri, signedUrl, onProgress);
  }
}

// iOS: NSURLSession for background uploads
async function uploadWithNSURLSession(localUri: string, signedUrl: string, onProgress: (n: number) => void) {
  // Uses expo-background-fetch + native module
  // Continues even when app is backgrounded
}

// Android: Foreground service for reliable uploads
async function uploadWithForegroundService(localUri: string, signedUrl: string, onProgress: (n: number) => void) {
  // Uses @notifee/react-native for foreground service notification
  // Required for long-running uploads on Android 14+
}
```

## 3.7 Audio Recording + Playback Architecture

```typescript
// features/audio/AudioProvider.tsx
import { Audio } from 'expo-av';
import { audio$ } from '@/lib/state/observables';

export function AudioProvider({ children }) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  
  useEffect(() => {
    // Configure audio session
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }, []);
  
  const startRecording = useCallback(async () => {
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    recordingRef.current = recording;
    audio$.isRecording.set(true);
    
    // Update duration every 100ms
    const interval = setInterval(async () => {
      const status = await recording.getStatusAsync();
      audio$.recordingDuration.set(status.durationMillis);
    }, 100);
    
    return () => clearInterval(interval);
  }, []);
  
  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return null;
    
    await recording.stopAndUnloadAsync();
    audio$.isRecording.set(false);
    audio$.recordingDuration.set(0);
    
    const uri = recording.getURI();
    recordingRef.current = null;
    return uri;
  }, []);
  
  const playSound = useCallback(async (fileUrl: string, fileId: string) => {
    // Stop any currently playing sound
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
    }
    
    const { sound } = await Audio.Sound.createAsync(
      { uri: fileUrl },
      { shouldPlay: true },
    );
    soundRef.current = sound;
    audio$.playingFileId.set(fileId);
    
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded) {
        audio$.playbackPosition.set(status.positionMillis);
        if (status.didJustFinish) {
          audio$.playingFileId.set(null);
        }
      }
    });
  }, []);
  
  return (
    <AudioContext.Provider value={{ startRecording, stopRecording, playSound, pauseSound }}>
      {children}
    </AudioContext.Provider>
  );
}
```
