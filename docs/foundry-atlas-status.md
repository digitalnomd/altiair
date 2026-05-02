# Foundry Atlas Inspection Status

Date: 2026-05-02

Using the signed-in Atlas browser, the existing Developer Console application currently visible to this account is an example application. It is not ready to use as the Pi-side CASK edge service without additional Foundry setup:

- Client type shown: public client.
- The page shows missing client permissions.
- The NPM SDK versions page shows no SDK generated for NPM yet.
- The SDK page says to ask the application owner to generate the first SDK version.

No Foundry resources were created or modified during this inspection.

## What We Need Next

Use one of these paths:

1. Ask the existing application owner to generate the NPM OSDK package and grant this team/client access to the scoped resources and actions.
2. Create a new Developer Console backend-service application for the Pi-side daemon, generate the NPM OSDK package, and share only the local runtime values needed by `.env.example`.

The backend-service path is preferred for the Pi hub because it uses confidential OAuth and a service user rather than browser-only public-client auth.

Do not commit package registry tokens, client secrets, private resource identifiers, or stack access details.
