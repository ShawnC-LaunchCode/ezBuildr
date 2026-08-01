import AdmZip from 'adm-zip';

/**
 * Zip primitives shared by `bundleWriter` and `bundleReader`.
 *
 * `adm-zip` publishes its types with `export =`, so neither `IZipEntry` nor the
 * class's own instance type can be pulled in as a named/default *type* import.
 * Deriving both from the imported constructor value keeps us on the library's
 * real signatures — a breaking change in a future adm-zip lands as a type error
 * here instead of passing silently through a hand-written interface.
 */
export type ZipArchive = InstanceType<typeof AdmZip>;

export type ZipEntry = ReturnType<ZipArchive['getEntries']>[number];

/** Open an existing archive, or start an empty one when no path is given. */
export function openZip(bundlePath?: string): ZipArchive {
  return bundlePath === undefined ? new AdmZip() : new AdmZip(bundlePath);
}
