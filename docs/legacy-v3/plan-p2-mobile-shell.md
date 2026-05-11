# P2: Mobile Shell (Week 4)

> Part of [Implementation Plan](./implementation-plan.md)

### Goal
Set up mobile-v3 with auth, navigation, and design system.

### P2.1 — Auth Flow

**Deliverables:**
- AuthProvider with Supabase
- Login, verify, onboarding screens

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P2.1.1 | Create AuthProvider with Legends State | 2h | P0.1.3 |
| P2.1.2 | Implement signInWithOtp, verifyOtp | 1h | P2.1.1 |
| P2.1.3 | Create (auth)/_layout.tsx with unauthenticated redirect | 1h | P2.1.2 |
| P2.1.4 | Create login.tsx screen | 2h | P2.1.3 |
| P2.1.5 | Create verify.tsx screen (OTP input) | 2h | P2.1.4 |
| P2.1.6 | Create onboarding.tsx screen | 2h | P2.1.5 |
| P2.1.7 | Unit tests for auth hooks | 2h | P2.1.6 |

**Acceptance Criteria:**
- [ ] Phone OTP flow works end-to-end
- [ ] Session persisted across app restarts
- [ ] Unauthenticated users redirected to login
- [ ] New users see onboarding

---

### P2.2 — Navigation Structure

**Deliverables:**
- Expo Router setup
- All route layouts

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P2.2.1 | Create root _layout.tsx with providers | 1h | P2.1 |
| P2.2.2 | Create (app)/_layout.tsx with Stack | 1h | P2.2.1 |
| P2.2.3 | Create projects/index.tsx placeholder | 30m | P2.2.2 |
| P2.2.4 | Create projects/[projectId]/_layout.tsx | 30m | P2.2.3 |
| P2.2.5 | Create reports route structure | 1h | P2.2.4 |
| P2.2.6 | Create profile route structure | 30m | P2.2.5 |
| P2.2.7 | Create camera/capture.tsx placeholder | 30m | P2.2.6 |

**Acceptance Criteria:**
- [ ] All routes navigable
- [ ] Back navigation works correctly
- [ ] Deep linking works

---

### P2.3 — Design System (Unistyles)

**Deliverables:**
- Design tokens
- Core UI components

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P2.3.1 | Create lib/styles/tokens.ts (colors, spacing, typography) | 1h | P0.1.3 |
| P2.3.2 | Create lib/styles/unistyles.ts (theme setup) | 1h | P2.3.1 |
| P2.3.3 | Create components/ui/Button.tsx with variants | 2h | P2.3.2 |
| P2.3.4 | Create components/ui/Input.tsx | 1h | P2.3.3 |
| P2.3.5 | Create components/ui/Card.tsx | 1h | P2.3.4 |
| P2.3.6 | Create components/ui/Dialog.tsx | 2h | P2.3.5 |
| P2.3.7 | Create components/ui/Sheet.tsx | 2h | P2.3.6 |
| P2.3.8 | Create components/ui/Skeleton.tsx | 1h | P2.3.7 |
| P2.3.9 | Create components/ui/EmptyState.tsx | 1h | P2.3.8 |
| P2.3.10 | Create components/ui/CachedImage.tsx | 2h | P2.3.9 |
| P2.3.11 | Unit tests for UI components | 2h | P2.3.10 |

**Acceptance Criteria:**
- [ ] All components render correctly
- [ ] Dark mode works
- [ ] Variants work via Unistyles
- [ ] Components match v1 visual design

---

### P2.4 — API Client Setup

**Deliverables:**
- API client integration
- React Query setup

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P2.4.1 | Create lib/api/client.ts with openapi-fetch | 1h | P0.2 |
| P2.4.2 | Create lib/api/keys.ts with query key factories | 30m | P2.4.1 |
| P2.4.3 | Create lib/api/hooks.ts with base hook patterns | 2h | P2.4.2 |
| P2.4.4 | Configure QueryClient in root layout | 30m | P2.4.3 |
| P2.4.5 | Add error handling utilities | 1h | P2.4.4 |

**Acceptance Criteria:**
- [ ] API calls work with JWT
- [ ] Types flow from OpenAPI spec
- [ ] Query hooks follow documented patterns
