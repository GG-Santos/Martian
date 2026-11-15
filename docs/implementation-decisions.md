# Implementation decisions and limits

- Native execution with one final independent review: approved recommendation; no per-task independent reviewer, so interim defects rely on tests.
- PDS labels override contradictory embedded optical JP2 projection: authoritative stereo pair labels match; incorrect CRS interpretation would displace imagery. Window-array reprojection and control points check processing registration.
- Thermal dates remain unknown because upstream STAC dates are reversed: avoids inventing a date range; archival context is less specific.
- Immediate top-down initial camera on narrow screens: improves map usability and matches the active control; omits the camera entrance there.
- Keep framework-matched lint config despite eight moderate development-only audit findings: avoids an automatic framework-major downgrade; development-tooling risk remains. Production audit is clean.
- Integrated-GPU performance unverified: RTX 3080 evidence is disclosed; slower laptops may need reduced assets.
- Absolute geodetic accuracy/upstream calibration not independently re-surveyed: source labels and processing controls establish demo registration; residual scientific/cartographic errors can remain.
- No production publication: approved local scope; sharing requires a later deployment.

Final independent reviewer found three Important issues and no Critical/Minor findings. All three were fixed in one pass with RED→GREEN regressions; see verification.md. No deferred minor findings.
