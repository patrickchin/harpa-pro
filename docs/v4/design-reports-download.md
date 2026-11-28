# Harpa Pro download page

`/reports/download` gives site-reporting visitors one place to install Harpa
Pro. The page uses the existing reporting header, footer, colours, and type.
Use a two-column layout with the title beside the platform choices on desktop.
Stack the title and choices in reading order on smaller screens.

The iPhone option uses the official App Store badge. Android has a Google Play
opt-in link for the existing closed Alpha track and a direct APK download.
Explain who can use the Play link, label the direct download with its version,
and direct existing Play installs to Play for updates. Link the reporting
navigation to the page, include it in the sitemap, and update the availability
FAQ.

## Publishing the APK

Build the installable APK with the Android `production-apk` EAS profile.
It uses the production package `com.harpa.pro`, backend, and EAS Android
signing key. Play uses its own app-signing key and may inject an installer
check into exported APKs. Keep existing installs on their original channel
for updates. If a new release is still pending, the initial direct download
can use the source from a known store build. Display the version of the
downloadable APK even when the Play and App Store versions differ.

Verify the package, version name, version code, signing certificate, and
SHA-256 before upload. Confirm the APK opens after installation outside Play.
The 0.1.65 universal APK from Play hit its installer check when sideloaded.
[Google Play installer check](https://support.google.com/googleplay/android-developer/answer/10183279?hl=en)

Publish the APK as `Harpa-Pro-<version>.apk` in a public
`android-apk-v<version>` GitHub release pointing at its source commit. Record
the SHA-256 in the release notes. Verify the asset URL downloads the APK
without an account before deploying the link. Keep previous release assets
available and update the site's APK version when a replacement is ready.
