# Helper Library Reference

The `helpers` object is globally available in all scripts. It provides safe, utility functions for common operations.

## Date (`helpers.date`)
Utilities for querying and manipulating dates. Uses `date-fns` under the hood.

| Function | Signature | Description |
|---|---|---|
| `now()` | `() => ISOString` | Returns current UTC time as ISO string. |
| `add()` | `(date, n, unit) => ISOString` | Adds days/hours/etc. to a date. Unit: 'days','hours'... |
| `subtract()` | `(date, n, unit) => ISOString` | Subtracts from a date. |
| `format()` | `(date, fmt) => string` | Formats date using date-fns tokens (e.g. 'yyyy-MM-dd'). |
| `diff()` | `(d1, d2, unit) => number` | Returns difference between two dates. |

## String (`helpers.string`)

| Function | Signature | Description |
|---|---|---|
| `upper()` | `(str) => string` | Uppercase. |
| `lower()` | `(str) => string` | Lowercase. |
| `trim()` | `(str) => string` | Remove whitespace. |
| `slug()` | `(str) => string` | URL-friendly slug. |
| `capitalize()` | `(str) => string` | Capitalize first letter. |

## Number (`helpers.number`)

| Function | Signature | Description |
|---|---|---|
| `round()` | `(n, decimals?) => number` | Round to decimal places. |
| `formatCurrency()` | `(n, ccy?) => string` | Format as currency (default USD). |
| `percent()` | `(n, decimals?) => string` | Format as percentage string. |

## Array (`helpers.array`)

| Function | Signature | Description |
|---|---|---|
| `unique()` | `(arr) => arr` | Remove duplicates. |
| `flatten()` | `(arr) => arr` | Flatten nested arrays. |
| `sortBy()` | `(arr, key) => arr` | Sort array of objects by key. |
| `filter()` | `(arr, fn) => arr` | Filter array (JS only). |
| `map()` | `(arr, fn) => arr` | Map array (JS only). |

## Object (`helpers.object`)

| Function | Signature | Description |
|---|---|---|
| `keys()` | `(obj) => string[]` | Get keys. |
| `pick()` | `(obj, keys[]) => obj` | Create new object with only selected keys. |
| `omit()` | `(obj, keys[]) => obj` | Create new object without selected keys. |
| `merge()` | `(...objs) => obj` | Deep merge objects. |

## Math (`helpers.math`)
`sum`, `avg`, `min`, `max`, `random`, `randomInt`.

## Console (`helpers.console` or global `console`)
- `console.log(...)`
- `console.warn(...)`
- `console.error(...)`
Logs are captured and viewable in the Run Logs.

## HTTP (`helpers.http`)
*Proxied requests to prevent IP leakage and enforce timeouts.*

| Function | Signature | Description |
|---|---|---|
| `get()` | `(url, options?) => Promise<any>` | Simple GET request. |
| `post()` | `(url, body, options?) => Promise<any>` | Simple POST request. |

**Note**: HTTP helpers are async. In JS, use `await helpers.http.get(...)`.
