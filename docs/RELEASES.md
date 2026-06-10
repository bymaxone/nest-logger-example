# Releases

Which version of `@bymax-one/nest-logger` each branch of this example tracks. Because the library is pre-1.0,
the tracking is explicit — a minor library bump can change behavior, so every commit on `main` records the
exact version it was tested against.

---

## Branch → library version

| Branch | Tracks library version | Notes                                                                                                      |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `main` | `^0.1.0` (pre-1.0)     | Current — local `link:`/`file:` to `../nest-logger` until first publish, then the published `^0.1.0` range |
| `next` | `^1.0.0` (when out)    | Pre-release tracking the GA library; expect breaking changes                                               |

Until the first npm publish, the local `link:`/`file:` **is** how `main` resolves the package — see
[OVERVIEW.md §7](./OVERVIEW.md#7-library-consumption). Once `@bymax-one/nest-logger` is on npm, `main` declares
the published semver range and the link is reserved for side-by-side development.

---

## Tested-version log

Each row records the exact library version a commit on `main` was verified against. The release automation
appends a row when a `v*` tag is cut; until the library publishes, the tracked version is the local checkout.

| Date      | Example version | Library version                 | Notes                                           |
| --------- | --------------- | ------------------------------- | ----------------------------------------------- |
| _pending_ | _pre-release_   | `0.1.0` (local `link:`/`file:`) | Pre-publish; consumed from the sibling checkout |

> Rows are appended by the release workflow on each `v*` tag (build → push images → record the resolved
> `@bymax-one/nest-logger` version). Versions are never fabricated; the table reflects only verified releases.

---

## Versioning policy

- The example follows the library's **major** line: each future major of `@bymax-one/nest-logger` gets its own
  long-lived branch here.
- When the library reaches `1.0.0`, `main` flips its range to `^1.0.0`, the 0.x branch is archived, and the
  [Feature Coverage Matrix](./OVERVIEW.md#6-feature-coverage-matrix) is re-audited against the GA export
  surface.

See **[OVERVIEW.md §18](./OVERVIEW.md#18-versioning--release-tracking)** for the full policy.
