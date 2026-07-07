# assets/

Drop the login background photo here as **`login-bg.jpg`** (or `.png` — if you
use PNG, change the URL in `index.html`'s `.auth-overlay` rule from
`login-bg.jpg` to `login-bg.png`).

- Use the **background photo only** — not a mockup with the login card already
  drawn on it. The app renders its own glass card on top; a baked-in card would
  double up.
- Target ~1920px wide, JPG, roughly 200–400 KB so it stays light for the PWA
  and offline cache.
- Until the file exists, the login page falls back to the CSS night-city
  gradient automatically — nothing breaks.
