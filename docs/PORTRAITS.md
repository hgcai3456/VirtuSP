# Synthetic demo portraits

## Supplied patient photos in SQLite

The eight user-supplied PNGs are preserved unchanged under `corpus/patient-photos/`. `corpus/patient-photos.json` explicitly maps each organizer UUID and roster ID to its image; the supplied `Vadko` filename maps to the existing `Vladko Bareche` identity without renaming or changing case content. Marcus Ramirez is distinct from Marcus Lee. No matching is inferred from demographics or an arbitrary patient name.

`lib/patient-photos.js` creates the SQLite table **`Patient Photos`** with `patient_id`, `patient_name`, `content_type`, `photo` (**BLOB**), `sha256` and `updated_at`. The existing primary ground-truth SQLite file stores it; this change does not write to PostgreSQL or require S3. Use:

```powershell
npm run photos:import
# Optional explicit SQLite file:
npm run photos:import -- C:/path/to/virtusp.sqlite
```

Import is idempotent and preserves existing BLOBs. Fresh environments lazily seed a mapped photo into the table on its first image request. The original PNG bytes and MIME type are returned from the BLOB by the existing `/api/profiles/:id/image` and owned `/api/encounters/:id/image` endpoints. Profile cards and encounter images already use these URLs. Database updates are read afresh, bypassing the old in-memory static-image cache. Image responses retain `private, no-store` and `nosniff`; encounter ownership checks remain in force.

An explicitly uploaded portrait on a published version retains priority over the bundled photo; shared comparison presentations retain their existing presentation behavior. Other cases keep their existing authored/neutral fallback. New table rows do not publish hidden/retired profiles. This replaces profile pictures, not prerecorded talking-video assets. The SQLite database must be backed up with its photos; the JSON/S3 manifest alone does not contain these BLOBs.

Verification: `tests/patient-photos.test.js` checks all eight original byte sequences and UUID/roster associations, BLOB storage, restart persistence, safe updates, idempotence, signature/size validation and HTTP delivery. `tests/portraits.test.js` checks publication/assignment portrait overrides and encounter ownership. These are engineering tests, not clinical validation.

## Earlier generated comparison portraits

Generated with the built-in image generation tool for the explicitly authored fictional cases. These are synthetic visual identities, not photographs of real patients or evidence of ethnicity. Age and character matching was visually reviewed. Faculty should review voice/portrait presentation before interpreting comparative assessments. The same neutral clothing, framing, light and setting are used for all four. Common voice selection still needs the speech teammate�s review.

Marlene uses the existing synthetic `patient.jpg` copied to `public/img/marlene.jpg`, replacing an unrelated stock face. Cases without an authored portrait or uploaded image use a neutral avatar. No ethnicity or appearance is inferred from a patient name.

## Prompt set

### public/img/jordan.png

Use case: photorealistic-natural. Asset type: portrait for a fictional standardized patient in a healthcare education app. Generate one photo of a 34-year-old Black American woman, short natural curly black hair. All characters fictional. Neutral plain dark navy top, neutral relaxed attentive expression, seated facing camera, eye-level chest-up framing, complete head and shoulders, vertical 3:4 composition, softly blurred light gray clinic background, soft even daylight, realistic skin texture and age. This is a simple consistent identity portrait, no text, no labels, no logos, no objects suggesting wealth, occupation or diagnosis. Match an ordinary clinical interview portrait.

### public/img/daniel.png

Use case: photorealistic-natural. Asset type: portrait for a fictional standardized patient in a healthcare education app. Generate one photo of a 45-year-old White American man, short brown hair. All characters fictional. Neutral plain dark navy top, neutral relaxed attentive expression, seated facing camera, eye-level chest-up framing, complete head and shoulders, vertical 3:4 composition, softly blurred light gray clinic background, soft even daylight, realistic skin texture and age. This is a simple consistent identity portrait, no text, no labels, no logos, no objects suggesting wealth, occupation or diagnosis. Match an ordinary clinical interview portrait.

### public/img/meera.png

Use case: photorealistic-natural. Asset type: portrait for a fictional standardized patient in a healthcare education app. Generate one photo of a 58-year-old South Asian American woman, shoulder-length dark hair with some gray. All characters fictional. Neutral plain dark navy top, neutral relaxed attentive expression, seated facing camera, eye-level chest-up framing, complete head and shoulders, vertical 3:4 composition, softly blurred light gray clinic background, soft even daylight, realistic skin texture and age. This is a simple consistent identity portrait, no text, no labels, no logos, no objects suggesting wealth, occupation or diagnosis. Match an ordinary clinical interview portrait.

### public/img/roberto.png

Use case: photorealistic-natural. Asset type: portrait for a fictional standardized patient in a healthcare education app. Generate one photo of a 67-year-old Latino American man, short gray hair. All characters fictional. Neutral plain dark navy top, neutral relaxed attentive expression, seated facing camera, eye-level chest-up framing, complete head and shoulders, vertical 3:4 composition, softly blurred light gray clinic background, soft even daylight, realistic skin texture and age. This is a simple consistent identity portrait, no text, no labels, no logos, no objects suggesting wealth, occupation or diagnosis. Match an ordinary clinical interview portrait.
