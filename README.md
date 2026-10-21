# Hayes Yacht Company website

Static site for [hayesyachtcompany.com](https://hayesyachtcompany.com).

## Local review

From the repository root, start any static server, for example:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Checks

```sh
node --test tests/site.test.mjs
```

The site has no build step or runtime package dependencies.

## Formspree acknowledgment

All inquiry forms post asynchronously to the existing Formspree endpoint. The free-first-visit
form is ready for Formspree's account-side autoresponse, but that workflow must be enabled and
verified in the Formspree dashboard. See `docs/formspree-autoresponse.md`.

## Print QR

Print assets and the encoded destination are documented in `assets/qr/README.md`.
