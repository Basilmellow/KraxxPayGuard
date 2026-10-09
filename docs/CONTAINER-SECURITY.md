# Container vulnerability remediation

On 2026-10-09, Astropods reported 278 findings on build 5a1c8825, including
five critical findings and 55 with fixes. A fresh Trivy 0.75.0 scan of the same
local image reported 284 findings (5 critical, 70 high, 121 medium, 81 low,
7 unknown), also with 55 fixable findings. Counts vary with scanner databases.

The previous image included Debian Perl and npm's bundled tar dependency even
though PayGuard needs neither at runtime. The replacement uses a multi-stage
build: production dependency installation happens separately, then only Node
24.21.0 and application runtime files are copied into patched Alpine 3.24.2.
Node and Alpine source images are pinned by digest. Build-time `apk upgrade`
applies available security updates; npm, Yarn, Perl and npm's dependency tree
are absent from the final image. UID 1000, port 80, strict origin checks,
Astropods gateway selection and mandatory persistent `/data` remain unchanged.

Trivy detected **zero vulnerabilities in recognized packages** in the replacement
image. Its report identified the Alpine OS packages, with no npm dependency
target remaining. This does not prove the application or copied Node binary is
free of vulnerabilities: package scanning has limited coverage, and new advisories
can appear later. Rebuild/rescan regularly; inspect the new Astropods build scan
separately instead of assuming it matches Trivy.

One old critical finding, CVE-2023-45853, is also marked by the
[Debian security tracker](https://security-tracker.debian.org/tracker/CVE-2023-45853)
as involving MiniZip code that is not built into the Bookworm zlib binary package.
It was not suppressed: the replacement no longer uses that Debian package.

Validation: Docker build passed; 65 server tests and 10 browser tests passed;
syntax and Astropods spec validation passed. Container smoke passed with a
read-only filesystem, dropped capabilities, non-root port 80, deterministic
API execution, missing-mount rejection, and identical persisted intent/audit
state after restart. Node's built-in SQLite query and HTTPS certificate validation
against the Sandbox API also worked; an unauthenticated HTTP 403 was received,
not a successful payment. No credentials were embedded or printed.

The scan reports and container archives are kept in ignored local artifacts.
No payment authorization, recipient, currency or firewall behavior was changed.

The hardened image was published as Astropods build `7c2bcc23` and redeployed
in place. The platform reported active/ready with one app replica and both
workloads ready. The old build 5a1c8825 retains its historical vulnerability
report. The new Astropods scanner report has not been retrieved; the zero count
above is from local Trivy, not a claim about Astropods' independent scan.
