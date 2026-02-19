# AR Store Navigator — MVP

Browser-based AR navigation for retail stores using WebXR. Select a store section, point your phone, and follow 3D arrows to your destination.

Built with **Next.js 15** • **TypeScript** • **TailwindCSS v4** • **Three.js** • **WebXR API** • **Supabase** • **Framer Motion**

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase (Optional)

The app works without Supabase using fallback data. To enable the database:

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the SQL from `supabase-schema.sql` in the SQL Editor
3. Copy `.env.local.example` to `.env.local` and fill in your credentials:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Run with HTTPS (Required for WebXR)

WebXR requires HTTPS. Next.js has built-in experimental HTTPS support:

```bash
npx next dev --experimental-https
```

Accept the self-signed certificate warning in your browser.

---

## Testing on Android Chrome

### Prerequisites

- ARCore-compatible Android device
- Chrome 81+ installed
- Device and computer on the same Wi-Fi network

### Steps

1. **Deploy to Vercel** (easiest) — see below
2. Open the Vercel URL on your Android Chrome
3. Select a store section from the dropdown
4. Tap **"Start AR Navigation"**
5. Accept camera permission
6. Point your phone at the floor — a cyan arrow appears pointing toward your destination
7. Walk around — the arrow updates direction in real-time

### WebXR Chrome Flags (if needed)

If AR doesn't start, enable these flags in `chrome://flags`:

- `#webxr-incubations` → Enabled
- `#webxr-ar-module` → Enabled (if available)

Restart Chrome after changing flags.

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or push to GitHub and import on [vercel.com/new](https://vercel.com/new).

> **Env vars**: Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel dashboard → Settings → Environment Variables.

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout (dark mode, fonts, SEO)
│   ├── page.tsx            # Landing page
│   ├── globals.css         # Global styles (glassmorphism, neon glow)
│   └── ar/
│       └── page.tsx        # AR navigation page
├── ar/
│   ├── ARScene.ts          # Three.js + WebXR engine
│   └── ArrowModel.ts       # Procedural 3D arrow model
├── components/
│   ├── HeroSection.tsx     # Animated hero
│   ├── SectionSelector.tsx # Destination dropdown
│   ├── StartButton.tsx     # CTA button
│   ├── FeatureCards.tsx     # Feature grid
│   └── ErrorOverlay.tsx    # Error/loading states
├── lib/
│   ├── supabase.ts         # Supabase client
│   └── sections.ts         # Section data fetching
└── utils/
    ├── device.ts           # Device detection
    └── navigation.ts       # Direction math
```

---

## Store Sections (Default)

| Section     | X (meters) | Z (meters) |
|------------|-----------|-----------|
| Billing     | 0         | 8         |
| Electronics | 6         | 4         |
| Groceries   | -5        | 6         |
| Clothing    | 4         | -3        |

Entrance is at (0, 0). Coordinates are relative to the entrance.

---

## Tech

- **WebXR `immersive-ar`** with `local-floor` reference space
- **Three.js** for 3D rendering (procedural arrow, no external models)
- **Vector math** for direction calculation (`atan2`)
- Arrow repositions 2m ahead of camera each frame, rotated toward target
- Neon cyan arrow with emissive glow + floating animation

---

## License

MIT
