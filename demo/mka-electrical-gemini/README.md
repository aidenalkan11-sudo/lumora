# MKA Electrical — Gemini rebuild

This is a separate experimental copy. The original `/demo/mka-electrical/` demo is unchanged and remains the ElevenLabs fallback.

## Required Vercel configuration

Add `GEMINI_API_KEY` as a **server-side** environment variable for the Lumora Vercel project (Production and Preview if needed), then redeploy. Never add this key to HTML or browser JavaScript.

The client requests a one-use, short-lived Gemini Live token from `/api/demo/gemini-token`. The long-lived API key stays in the server environment. The endpoint includes basic origin validation and best-effort per-instance request throttling.

## Demo URL

`/demo/mka-electrical-gemini/`

## Notes

- Uses Gemini Live audio with two voice choices, configured for Australian English.
- The API endpoint currently uses the `models/gemini-3.8-live` Live model. If that model is unavailable for the Google API project, update the model in both the endpoint and client to a currently enabled Live model.
- The Gemini rebuild has not been live-tested because the deployment needs a valid `GEMINI_API_KEY` first.
