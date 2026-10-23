# Security policy

## Supported versions

The latest released version gets security fixes. While the version is `0.x`, older minor versions do not.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private vulnerability reporting: on the repository page choose **Security**, then **Report a vulnerability**. You get an answer within a few days.

## What this package does

The package runs a small script inside the page that your test opens. It reads the layout of the elements (positions and sizes) and reports changes to the test. It does not send anything over the network, does not read cookies or storage, and has no runtime dependencies. It is meant for test environments, not for production pages.

The releases on npm are published from GitHub Actions with provenance, so each version can be traced back to the commit and the workflow run that built it.
