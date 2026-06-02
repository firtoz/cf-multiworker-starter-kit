---
name: component-organization
description: Component organization patterns for React applications. Use when creating components, organizing files, or structuring routes. ALWAYS keep 1 component per file and routes simple.
---

# Component Organization

## Core Principles

### 1 Component Per File

Each component should be in its own file with a clear, descriptive name.

```typescript
// ✅ Good - components/admin/settings/SiteInfoSection.tsx
export function SiteInfoSection({ siteName, siteUrl, onUpdate }) {
  return (
    <div className="space-y-4">
      {/* Site info form fields */}
    </div>
  );
}
```

```typescript
// ❌ Bad - Multiple components in one file
// components/admin/settings/Sections.tsx
export function SiteInfoSection() { ... }
export function ThemeSection() { ... }
export function SEOSection() { ... }
```

## Folder Structure

Organize components by feature and purpose, using categorized folders:

```
app/
├── components/
│   ├── ui/              # Primitives (button, input, card, dialog)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   └── dialog.tsx
│   │
│   ├── shared/          # Cross-feature shared components
│   │   ├── ColorPicker.tsx
│   │   ├── NodeControls.tsx
│   │   └── VideoEmbed.tsx
│   │
│   └── [feature]/       # Feature-specific components
│       └── [page]/      # Page-specific components
│           ├── Header.tsx
│           ├── Sidebar.tsx
│           ├── ContentSection.tsx
│           └── ActionsPanel.tsx
│
├── features/            # Complex features with multiple concerns
│   └── [feature]/
│       ├── components/  # Feature's internal components
│       ├── hooks/       # Feature-specific hooks
│       └── stores/      # Feature-specific state
│
└── routes/
    └── admin/
        └── settings.tsx # Simple wrapper
```

### Example: Admin Settings Structure

```
app/
├── components/
│   └── admin/
│       └── settings/
│           ├── SettingsPage.tsx       # Main page component
│           ├── SiteInfoSection.tsx    # Site name, URL
│           ├── ThemeSection.tsx       # Theme settings
│           ├── SEOSection.tsx         # SEO fields
│           └── DangerZoneSection.tsx  # Logout, destructive actions
│
└── routes/
    └── admin/
        └── settings.tsx  # Simple wrapper (see below)
```

### Example: Blog Feature Structure

```
app/
├── components/
│   └── blog/
│       └── index/
│           ├── PostCard.tsx
│           ├── Pagination.tsx
│           └── BioSidebar.tsx
│
└── features/
    └── blog/
        ├── components/
        │   └── shared/
        │       └── PostHeader.tsx
        ├── hooks/
        │   └── usePosts.ts
        └── stores/
            └── isAdmin.ts
```

## Simple Route Pattern

Routes should be thin wrappers that delegate to page components. Keep loaders and actions in the route, but move JSX to a component.

```typescript
// ✅ Good - routes/admin/settings.tsx
import { SettingsPage } from "~/components/admin/settings/SettingsPage";

export const loader = async ({ request }: Route.LoaderArgs) => {
  // Load data
  const settings = await getAllSettings();
  return { settings };
};

export const action = formAction({
  schema: settingsSchema,
  handler: async ({ request }, formData) => {
    // Handle form submission
    await updateSettings(formData);
    return success();
  },
});

export default function SettingsRoute() {
  const { settings } = useLoaderData<typeof loader>();
  return <SettingsPage settings={settings} />;
}
```

```typescript
// ❌ Bad - All JSX in route file (900+ lines)
export default function SettingsRoute() {
  const { settings } = useLoaderData<typeof loader>();
  
  return (
    <div className="container">
      <h1>Settings</h1>
      <div className="grid">
        <section>
          <h2>Site Info</h2>
          <Input ... />
          <Input ... />
          {/* 800 more lines of JSX */}
        </section>
      </div>
    </div>
  );
}
```

## Page Component Pattern

The page component imported by the route can compose smaller section components:

```typescript
// components/admin/settings/SettingsPage.tsx
import { SiteInfoSection } from "./SiteInfoSection";
import { ThemeSection } from "./ThemeSection";
import { SEOSection } from "./SEOSection";

export function SettingsPage({ settings }) {
  const submitter = useDynamicSubmitter<typeof import("~/routes/admin/settings")>("/admin/settings");
  const [siteInfo, setSiteInfo] = useState(settings.siteInfo);
  const [theme, setTheme] = useState(settings.theme);

  return (
    <div className="container">
      <h1>Settings</h1>
      <div className="space-y-8">
        <SiteInfoSection 
          data={siteInfo} 
          onChange={setSiteInfo}
        />
        <ThemeSection 
          data={theme} 
          onChange={setTheme}
        />
        <SEOSection 
          data={settings.seo}
        />
      </div>
    </div>
  );
}
```

## Benefits

This organization provides:
- Easy to find components (predictable structure)
- Clear separation of concerns
- Reusable components (1 per file)
- Simple routes that are easy to understand
- Easier testing (components are isolated)
- Better code review (small, focused files)

## When Creating New Components

1. Ask: "Is this a UI primitive?" → `components/ui/`
2. Ask: "Will multiple features use this?" → `components/shared/`
3. Ask: "Is this specific to a feature?" → `components/[feature]/` or `features/[feature]/components/`
4. Ask: "Is this specific to a page?" → `components/[feature]/[page]/`

Always create a new file for each component, even if it's small. Small, focused files are better than large, multi-purpose files.

## Generated images, mockups, and “asset pack” rasters

AI-generated or imported **layout mockups** and **reference sheets** are for **visual reference** — not automatic UI chrome. Prefer **real DOM**, **CSS**, and **accessible** text/controls for buttons, forms, labels, and panels. Use **raster** assets sparingly: backgrounds, subtle accents, posters/cards, decorative textures. Avoid stretching a generated PNG of fake UI (buttons, panels) as the primary control surface without **visual** testing in a real browser. Realtime and canvas-specific patterns: [cf-socka-realtime/SKILL.md](../cf-socka-realtime/SKILL.md).
