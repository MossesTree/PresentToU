---
name: Warm Concierge
colors:
  surface: '#fbf8ff'
  surface-dim: '#dad9e3'
  surface-bright: '#fbf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2fd'
  surface-container: '#eeedf7'
  surface-container-high: '#e8e7f1'
  surface-container-highest: '#e3e1ec'
  on-surface: '#1a1b22'
  on-surface-variant: '#544241'
  inverse-surface: '#2f3038'
  inverse-on-surface: '#f1effa'
  outline: '#877270'
  outline-variant: '#dac1bf'
  surface-tint: '#984542'
  primary: '#420408'
  on-primary: '#ffffff'
  primary-container: '#5f1a1a'
  on-primary-container: '#e17f7a'
  inverse-primary: '#ffb3ae'
  secondary: '#7a573a'
  on-secondary: '#ffffff'
  secondary-container: '#fecea9'
  on-secondary-container: '#795639'
  tertiary: '#211d1b'
  on-tertiary: '#ffffff'
  tertiary-container: '#37322f'
  on-tertiary-container: '#a29a96'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad7'
  primary-fixed-dim: '#ffb3ae'
  on-primary-fixed: '#3f0306'
  on-primary-fixed-variant: '#7a2e2c'
  secondary-fixed: '#ffdcc2'
  secondary-fixed-dim: '#ecbd9a'
  on-secondary-fixed: '#2e1501'
  on-secondary-fixed-variant: '#604024'
  tertiary-fixed: '#eae0dd'
  tertiary-fixed-dim: '#cec5c1'
  on-tertiary-fixed: '#1f1b19'
  on-tertiary-fixed-variant: '#4b4643'
  background: '#fbf8ff'
  on-background: '#1a1b22'
  surface-variant: '#e3e1ec'
  background-cream: '#F6ECE8'
  deep-maroon: '#5F1A1A'
  earthy-tan: '#B88E6D'
  subtle-gray: '#71717A'
  surface-white: '#FFFFFF'
typography:
  display-hero:
    fontFamily: Be Vietnam Pro
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.3'
  headline-lg-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-bold:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  caption:
    fontFamily: Be Vietnam Pro
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max-width: 800px
  gutter: 24px
  section-gap: 64px
  card-padding: 24px
---

## Brand & Style

The visual identity is defined by an **Empathetic & Warm Modernism**. It balances the technical precision of AI analysis with the emotional sentiment of gift-giving. The aesthetic is approachable and celebratory, utilizing a soft, cream-based palette and generous whitespace to create a stress-free environment for users making high-stakes social decisions.

Key stylistic pillars include:
- **Soft Tactility:** Using rounded corners and earthy tones to feel organic rather than clinical.
- **Trust-Centered Utility:** Clear, linear progression with explicit security cues (lock icons, privacy notices).
- **Celebratory Accents:** Sparse use of confetti-like decorative elements and emojis to maintain a lighthearted, festive atmosphere.

## Colors

The palette avoids the sterile blues common in tech, opting instead for a "Warm Earth" theme.

- **Primary (Deep Maroon):** Used for critical CTAs, active selection states, and main headings. It conveys authority and maturity.
- **Secondary (Earthy Tan):** Used for accents and secondary interactive elements, softening the contrast between the maroon and the background.
- **Background (Cream):** The canvas is a warm `#F6ECE8`, which is gentler on the eyes than pure white and reinforces the "special occasion" feel.
- **Neutral (Slate Gray):** Reserved for meta-information, captions, and secondary body text to maintain a clear hierarchy without competing with brand colors.

## Typography

This system uses **Be Vietnam Pro** for its contemporary, friendly, and warm characteristics. The weight distribution is intentional, using heavy weights (800) for hero branding and medium weights (600) for section prompts to guide the user through the funnel.

- **Scale:** High contrast between titles and body text to ensure legibility during rapid scanning.
- **Readability:** Generous line-heights (1.5 - 1.6) for body copy to keep the interface feeling open and uncrowded.
- **Casing:** Labels use uppercase with slight letter spacing for secondary categorization (e.g., "BUDGET", "RELATIONSHIP").

## Layout & Spacing

The system follows a **Fixed Grid** philosophy centered in the viewport to maintain focus. The content is contained within a maximum width of 800px, creating a vertical "river" of information that is easy to follow.

- **Vertical Flow:** Sections are separated by large gaps (64px) to signal a transition between configuration (budget/relationship) and action (file upload).
- **Responsive Behavior:** 
  - **Desktop:** Multi-column layout for selection cards (3-across).
  - **Tablet:** 2-across grid for cards with increased margins.
  - **Mobile:** Single-column stack with condensed vertical gaps (32px).
- **Safe Areas:** A minimum horizontal margin of 20px is maintained on mobile devices.

## Elevation & Depth

The design system utilizes **Tonal Layering** rather than traditional shadows to create depth. Surfaces are differentiated by color shifts and borders.

- **Primary Surface:** The main `#FFFFFF` container sits on the `#F6ECE8` background with a very soft, diffused ambient shadow (0px 10px 30px rgba(0,0,0,0.05)).
- **Interactive Cards:** Unselected states use a subtle 1px solid border in a lightened version of the earthy-tan color.
- **Active State:** Selection is indicated by a fill color change (Primary Maroon) and a subtle inner glow or checkmark icon, rather than an increase in physical height.

## Shapes

The shape language is consistently **Rounded**, avoiding sharp corners to maintain the approachable brand persona.

- **Containers:** Large parent cards use `rounded-xl` (1.5rem).
- **Selection Cards:** Middle-tier elements like budget options use `rounded-lg` (1rem).
- **Action Buttons:** Primary CTAs use pill-shaped (999px) radii to encourage clicking and distinguish them from static layout elements.
- **Upload Zone:** Features a dashed border with `rounded-lg` corners to visually represent a "receptacle."

## Components

### Buttons
- **Primary Action:** Pill-shaped, high-contrast (Maroon background, White text). Includes a trailing icon (e.g., chevron) to suggest momentum.
- **Secondary/Ghost:** Rounded-lg, subtle border, using the Earthy Tan or Maroon as the stroke color.

### Selection Cards (Budget/Relationship)
- **Structure:** Vertical layout with an emoji/icon at the top, followed by a bold title and a small caption for details (e.g., price range).
- **Selection State:** When selected, the background flips to Primary Maroon and text flips to White.

### File Upload Area
- **Visuals:** Dashed border (2px width, 4px dash) in a muted Earthy Tan. 
- **Content:** Central icon with a prompt. Footer area of the zone contains "Micro-Trust" badges: small chips with icons (Lock, Speed, File Limit) to reassure the user.

### Input Chips (Gender/Relationship)
- **Style:** Small, pill-shaped buttons with icon + text.
- **Interaction:** Toggle behavior with a background fill change.

### Progress/Trust Indicators
- **Style:** Small badges or floating elements (e.g., "평균 분석 23초") using a light primary tint and high-contrast icon.