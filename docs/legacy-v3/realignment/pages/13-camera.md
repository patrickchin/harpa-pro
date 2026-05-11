# Camera Capture

> **Prompt for design tool:** Generate a high-fidelity mobile UI for an in-app camera capture screen. Full-screen CameraView with safe-area insets. Top bar: X (close), flash mode cycler (Off / Auto / On with icon). Bottom: thumbnail strip of captured photos (3-col grid), centered shutter button (large, circular), flip camera button (right). Above bottom strip: "Done" button appears only when photo count > 0 with badge "{N} photos". Permissions gate if camera not granted. Use warm-paper palette. Output iOS sizing, landscape-aware, haptic feedback on shutter.

**Route:** `/(app)/camera/capture`
**Reference screenshot:** (none)
**v3 source file(s):** apps/mobile-v3/app/(app)/camera/capture.tsx

## Purpose
Capture photos for a report within a session. Permission gate if needed. Confirm captured photos and commit to session, returning to report notes timeline.

## Layout (top → bottom)
1. **Permission gate** — If camera not granted, full-screen message "Camera Access Required", button to request permission or open settings
2. **Top bar** — X close button (left), flash mode cycler (center, shows current mode icon + label), space for symmetric layout
3. **CameraView** — Full screen, fill safe area, camera stream
4. **Bottom bar** — Thumbnail grid (3 col, 20px gap), shutter button (large circular, center), flip camera button (right)
5. **Done button** — Only visible when photos.length > 0, shows "{N} photos" count badge, testID=(?)

## Components
| Component | Type | Props / state |
|---|---|---|
| CameraView | CameraView (expo-camera) | ref={cameraRef}, facing={facing}, flashMode={flashMode} |
| Pressable (X) | Pressable | testID=(?) **(?)**, onPress={handleCancel}, shows discard confirmation if photos.length > 0 |
| Pressable (flash) | Pressable | onPress={cycleFlash}, shows Zap/ZapOff icon based on mode |
| Pressable (shutter) | Pressable | testID="btn-camera-shutter" **(?)**, onPress={capture}, large circular button, disabled if capturing or maxed |
| Pressable (flip) | Pressable | testID=(?) **(?)**, onPress={flipCamera}, shows SwitchCamera icon |
| FlatList (thumbnails) | FlatList | data={photos}, horizontal, 3-col layout, renderItem shows Image + remove icon |
| Done button | Pressable + Badge | testID=(?) **(?)**, only visible if photos.length > 0, shows count badge |

## Interactions
- On mount → Request camera permission if not granted
- Permission denied → Show permission gate, button to request or open settings
- Permission granted → Show camera view
- Tap flash cycler → Cycle through [off, auto, on], update icon/label
- Tap shutter → `cameraRef.takePictureAsync()`, add to photos array, haptic feedback
- Capture disabled if photos.length >= MAX_PHOTOS (20)
- Tap thumbnail remove (X icon) → Remove photo from array
- Tap flip button → Toggle facing (back ↔ front)
- Tap Done button (or Done-like) → Commit photos via `commitCameraSession(sessionId, photos)`, navigate back
- Tap X (close) → If photos.length > 0, show AppDialogSheet "Discard photos? You have {N} photo(s).", destructive action "Discard", cancel "Keep Editing"
- Confirm discard → `cancelCameraSession(sessionId)`, navigate back
- Cancel discard → Stay on camera screen

## Data shown
- facing — back or front
- flashMode — off, auto, on
- photos — array of URIs (local file paths)
- photos.length — count, shown in Done button badge and discard dialog
- permission — granted, denied, or not-determined

## Visual tokens
- Background: `theme.colors.background` (safe areas / fallback)
- Icon (X, flash, flip): `theme.colors.foreground`, size 24-28px
- Shutter button: `theme.colors.primary` or circular highlight, size ~64px
- Thumbnail: 80×80 or scaled, border: `theme.colors.border`, remove icon: red/destructive
- Done button: `theme.colors.primary` bg, badge shows count
- Permission gate: `theme.colors.foreground` text, `theme.colors.primary` button

## Acceptance checklist
- [ ] CameraView fills screen, respects safe-area insets
- [ ] Permission gate shows if camera not granted, request/settings button works
- [ ] Flash cycler toggles through modes, icon updates
- [ ] Shutter button captures photo, adds to photos array
- [ ] Thumbnail strip shows captured photos with remove buttons
- [ ] Flip button toggles camera facing
- [ ] Done button visible only when photos.length > 0, shows count badge
- [ ] Discard confirmation on X (close) if photos present
- [ ] testID for key interactions (shutter, close, done, flip, flash) **(?)** — some not in source
- [ ] No console.log / TODO / stubbed handlers
- [ ] Works in mock mode (USE_FIXTURES=true)
- [ ] Vitest snapshot or behavior test added (or Maestro E2E)
