# Print campaign QR codes

## Complimentary first visit

Encoded destination:

`https://hayesyachtcompany.com/free-visit?utm_source=print&utm_medium=qr&utm_campaign=free_first_visit`

Files:

- `free-first-visit-qr.svg` — vector artwork for professional print layouts.
- `free-first-visit-qr.png` — 780 × 780 transparent-background raster fallback.

Both use QR error-correction level H and a four-module quiet zone. Keep the QR square, preserve the
quiet zone, and print it at least 1.25 in / 32 mm wide for reliable scanning.

## Verification record

The PNG was decoded independently after generation using `jsQR` 1.4.0 and returned the exact URL
above. The route and both QR assets returned HTTP 200 from the local production-equivalent static
server. On October 12, 2026, the public destination still returned HTTP 404 because this change had
not been deployed. **Do not print yet.** After merge and deployment, confirm that the exact HTTPS
URL returns 200, then scan the placed proof at actual size with both an iPhone and an Android device.

## Referrals

Encoded destination:

`https://hayesyachtcompany.com/referrals/?utm_source=print&utm_medium=qr&utm_campaign=referral_program`

Files:

- `referrals-qr.svg` — vector artwork for professional print layouts.
- `referrals-qr.png` — 780 × 780 raster fallback.

Both use QR error-correction level H and a four-module quiet zone. Keep the QR square, preserve the
quiet zone, and print it at least 1.25 in / 32 mm wide for reliable scanning. Future print variants
may append a non-identifying `utm_content` value, such as `marina_partner`, without requiring a new
landing page.

## Referral verification record

The PNG was decoded independently after generation using `jsQR` 1.4.0 and returned the exact URL
above. On October 21, 2026, the referral route and assets were verified using a local static server.
After merge and deployment, confirm that the exact HTTPS URL returns 200, then scan the placed proof
at actual size with both an iPhone and an Android device before printing production collateral.
