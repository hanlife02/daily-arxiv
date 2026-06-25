# daily-arxiv Design System

## 1. Atmosphere & Identity

daily-arxiv should feel like a quiet research desk: dense enough for daily scanning, but calm enough for long paper reading. The signature is soft technical depth: cool gray surfaces, subtle inset controls, and restrained blue accents that support repeated reading and triage.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Surface/primary | `--background` | `hsl(216 20% 88%)` | `hsl(220 16% 14%)` | App background and page bands |
| Surface/card | `--card` | `hsl(216 20% 88%)` | `hsl(220 16% 17%)` | Neumorphic panels and controls |
| Text/primary | `--foreground` | `hsl(215 25% 27%)` | `hsl(216 18% 82%)` | Headlines and body copy |
| Text/secondary | `--muted-foreground` | `hsl(217 14% 52%)` | `hsl(218 14% 56%)` | Captions, metadata, helper text |
| Border/default | `--border` | `hsl(216 16% 78%)` | `hsl(220 14% 24%)` | Dividers and fallback outlines |
| Accent/primary | `--accent` | `hsl(217 40% 48%)` | `hsl(217 45% 55%)` | Links, primary actions, active navigation |
| Accent/text | `--accent-foreground` | `hsl(0 0% 100%)` | `hsl(0 0% 100%)` | Text on accent backgrounds |
| Shadow/dark | `--shadow-dark` | `hsl(216 14% 72%)` | `hsl(220 12% 10%)` | Lower/right neumorphic shadow |
| Shadow/light | `--shadow-light` | `hsl(0 0% 100%)` | `hsl(220 14% 20%)` | Upper/left neumorphic highlight |
| Status/warning | Tailwind yellow scale | Existing utility classes | Existing utility classes | LLM/PDF fallback notices |
| Status/error | Tailwind red scale | Existing utility classes | Existing utility classes | Failed summaries, destructive states |

### Rules

- Use the CSS variables in `src/app/globals.css` for product surfaces and primary interactions.
- Reserve the blue accent for clickable affordances and current state.
- Status colors are allowed only for semantic warning/error/success feedback.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| H1 | `text-2xl` | 600 | Default Tailwind | 0 | Page titles |
| H2 | `text-base` | 600 | Default Tailwind | 0 | Panel titles |
| H3 | `text-sm` | 600 | Snug | 0 | Dense card titles |
| Body | `text-sm` | 400 | Relaxed when long form | 0 | Default dashboard text |
| Caption | `text-xs` | 400-500 | Normal | 0 | Metadata, labels, controls |

### Font Stack

- Primary: Inter via `next/font/google`, with system fallback.
- Mono: system monospace only when numeric/tabular data needs alignment.

### Rules

- Reading surfaces use relaxed line-height and constrained measure.
- Metadata stays compact, but body text should not drop below `text-sm`.

## 4. Spacing & Layout

### Base Unit

All spacing follows the Tailwind 4px scale.

| Token | Value | Usage |
| --- | --- | --- |
| `space-1` | 4px | Icon nudges, tight inline gaps |
| `space-2` | 8px | Compact controls, metadata chips |
| `space-3` | 12px | Dense card padding |
| `space-4` | 16px | Default panel padding |
| `space-6` | 24px | Page and card group rhythm |
| `space-8` | 32px | Dashboard main padding |

### Grid

- Dashboard shell uses a left navigation rail and flexible main content.
- Reading mode may use a three-column desktop grid: queue, original paper, AI analysis.
- Mobile collapses to one primary task surface at a time.

### Rules

- Prefer stable panel dimensions over content-driven resizing in tool surfaces.
- Avoid nested cards; use panel bands and internal dividers for hierarchy.

## 5. Components

### Neumorphic Surface

- **Structure**: `neu-card`, `neu-raised-sm`, `neu-inset` utility classes.
- **Variants**: raised panel, raised compact control, inset field.
- **Spacing**: `space-3` to `space-6` depending on density.
- **States**: interactive surfaces transition shadow depth on hover/active.
- **Accessibility**: preserve visible focus and semantic buttons/links.
- **Motion**: 200ms `ease` shadow/opacity/transform changes.

### Sidebar

- **Structure**: vertical `aside` with brand, role, navigation, theme, logout.
- **Variants**: expanded desktop, compact desktop rail, full-width mobile.
- **Spacing**: `space-3` nav padding, 40-56px row height.
- **States**: active route uses accent tone and inset/raised depth.
- **Accessibility**: collapsed items keep `aria-label`/`title` text.
- **Motion**: collapse uses width/opacity transitions only where it does not affect mobile flow.

### Reading Workspace

- **Structure**: paper queue, original paper panel, AI analysis panel.
- **Variants**: desktop three-column, mobile single-column with progressive navigation.
- **Spacing**: dense queue, comfortable original text, compact AI controls.
- **States**: empty category, no selected paper, LLM unconfigured, summary loading/error.
- **Accessibility**: original article is an `article`; AI analysis is an `aside`.
- **Motion**: keep transitions subtle; reading should not feel animated.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | 150-200ms | ease | Button press, hover depth |
| Standard | 200-300ms | ease-in-out | Sidebar collapse, mobile panel switch |

### Rules

- Keep reading interactions predictable and low-motion.
- Use Lucide icons for command buttons.
- Every icon-only button needs an accessible label.

## 7. Depth & Surface

### Strategy

Mixed neumorphic depth: raised panels for containers, inset fields/chips for secondary information, accent fills only for primary actions.

| Level | Utility | Usage |
| --- | --- | --- |
| Raised large | `neu-card` | Main panels |
| Raised compact | `neu-raised-sm` | Active nav, selected paper row |
| Inset | `neu-inset` | Search fields, metadata chips, subdued blocks |
| Primary action | `neu-btn-primary` | Submit/send/active command |

### Rules

- Avoid adding arbitrary shadows outside the neumorphic utilities.
- Do not introduce decorative gradients or ornamental backgrounds.
