# Design System Specification: The Financial Architect

This document outlines a bespoke visual language for high-end desktop financial analysis. Moving beyond "standard" dashboard aesthetics, this system utilizes tonal depth, editorial typography, and "glass-on-glass" layering to create a tool that feels as authoritative as a private bank’s internal terminal.

## 1. Overview & Creative North Star
**The Creative North Star: "The Digital Vault"**
The design avoids the flimsy, "web-app" feel by leaning into the weight and permanence of a sophisticated local PC tool. We achieve this through **Intentional Asymmetry**—where data visualization takes a massive, centered stage while controls are tucked into elegant, semi-transparent sidebars. We break the grid by allowing interactive elements to overlap slightly with data containers, creating a sense of three-dimensional depth rather than flat, boxed-in sections.

## 2. Colors: Tonal Architecture
The palette is built on "Deep Trust" blues and "Neutral Logic" grays. 

### The Palette
- **Primary & Core:** `primary` (#000000) for high-impact text and `surface_tint` (#3755c3) for meaningful interaction.
- **The Accents (Data Viz Only):** Use `on_tertiary_container` (Teal), `on_error_container` (Coral/Red), and `on_primary_container` (Blue) to represent different spending categories.
- **Surface Hierarchy:** Utilize `surface` (#f7f9fb) as the base. Use `surface_container_lowest` (#ffffff) for active analysis cards and `surface_container_highest` (#e0e3e5) for persistent navigation rails.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to define sections.
Boundaries must be defined solely through background color shifts. For example, a `surface_container_low` section sitting on a `surface` background provides all the definition a professional eye needs. This creates a "seamless" interface that feels carved from a single block rather than stitched together.

### The "Glass & Gradient" Rule
Main Action areas (like the "Import Data" hero) should utilize a subtle gradient transition from `primary_container` (#001453) to `surface_tint` (#3755c3). Use Glassmorphism for floating "Quick Action" menus—applying `surface_container_lowest` at 80% opacity with a 12px backdrop-blur.

## 3. Typography: Editorial Authority
We pair **Manrope** (Display/Headlines) with **Inter** (UI/Body) to balance character with clinical precision.

- **Display & Headline (Manrope):** Large-scale values (e.g., "Total Net Worth") use `display-lg` (3.5rem). The wide apertures of Manrope convey modern transparency.
- **Title & Body (Inter):** All data mapping and card labels use Inter. `title-sm` (1rem) is the workhorse for table headers, providing high legibility even in dense spreadsheets.
- **Label-sm:** Used for "Micro-Data" (e.g., "Last synced 2m ago"). It must always use `on_surface_variant` (#45464d) to maintain hierarchy without cluttering the visual field.

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are banned. Depth is a result of **Tonal Stacking**.

- **The Layering Principle:** Place a `surface_container_lowest` (#ffffff) card on top of a `surface_container_low` (#f2f4f6) background. This creates a "lift" that is felt rather than seen.
- **Ambient Shadows:** For floating elements like Searchable Dropdowns, use a shadow with a 32px blur, 0% spread, and 6% opacity of `on_background` (#191c1e).
- **The "Ghost Border" Fallback:** If a divider is required for accessibility in data tables, use `outline_variant` at 15% opacity. Never use a 100% opaque line.

## 5. Components: Precision Primitives

### File Upload Dropzones
Avoid the "dashed box" cliché. Use a large `surface_container_high` area with `xl` (0.75rem) rounded corners. Upon hover, transition the background to `primary_fixed` (#dde1ff) with a "Glass" overlay effect.

### Searchable Dropdowns (Card Issuers)
The dropdown list should be a floating "Glass" panel. Items use `body-md`. The active selection should not use a checkmark; instead, use a subtle background shift to `secondary_container` (#d0e1fb) and a 2px left-accent bar of `surface_tint`.

### Data Tables (Accordion Style)
- **Forbid Dividers:** Use vertical white space (`spacing-5` or 1.1rem) to separate rows.
- **States:** When a row is expanded, the parent container shifts to `surface_container_lowest`, and the child data is nested on `surface_container_low`.
- **Interactivity:** Use `surface_dim` (#d8dadc) for hover states on rows to provide tactile feedback without visual noise.

### Interactive Pie Charts
The "Hole" of the pie chart should match the `surface` color of the section it sits on to create a "donut" feel. Use the vibrant accent tokens (`tertiary`, `secondary`, `error`) for segments. Tooltips on hover must be `inverse_surface` (#2d3133) with `on_inverse_surface` text for maximum contrast against data.

## 6. Do's and Don'ts

### Do:
- **Use "White Space as a Tool":** Use `spacing-16` (3.5rem) between major modules (e.g., between the Chart and the Table).
- **Embrace Asymmetry:** Let the "Spend Analysis" pie chart be larger than the "Card List" to establish a clear focal point.
- **Soft Rounding:** Use `lg` (0.5rem) for most cards to keep the "PC Tool" feel professional yet approachable.

### Don't:
- **Don't use "Pure Black" text:** Always use `on_surface` (#191c1e) for body text to reduce eye strain during long financial audits.
- **Don't use standard Tooltips:** Avoid yellow boxes. Use the Glassmorphism rule for all contextual popovers.
- **No Heavy Outlines:** If a button feels "lost," increase its tonal contrast (e.g., move from `secondary_container` to `primary_container`) rather than adding a border.