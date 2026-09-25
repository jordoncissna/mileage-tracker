# assets/

## login-bg.jpg — optional sign-in background photo

The sign-in screen is a CSS night-city gradient. You can put a photo behind it.

**It is switched off by default, and that is deliberate.** CSS has no way to say
"use this image if it exists" — the browser requests it either way, so naming a
file that isn't there costs every single visitor a 404 on the first screen they
see. The photo layer therefore lives commented out in `index.html`.

To turn it on:

1. Drop your photo here as **`login-bg.jpg`**.
2. In `index.html`, find the `.auth-overlay` rule and delete the `/*` and `*/`
   around the `url('assets/login-bg.jpg')` line.

Notes:

- Use the **background photo only** — not a mockup with the login card already
  drawn on it. The app renders its own glass card on top; a baked-in card would
  double up.
- Target ~1920px wide, JPG, roughly 200–400 KB so it stays light for the PWA
  and offline cache.
- If you use a PNG, change the extension in that same line.

## The other files here

- `milo-mark.jpg` — the app logo. Referenced by `index.html` and cached by the
  service worker; it used to be pasted inline four times, which was 225 KB.
- `og-card.png` — the 1200×630 social preview image named by the `og:image` and
  `twitter:image` tags on every page.
