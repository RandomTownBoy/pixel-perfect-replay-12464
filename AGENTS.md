<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- `src/lib/kyoka.ts` is the local UI store; `src/lib/cloud.ts` mirrors questions to the database and broadcasts overlay/audience state over realtime channels keyed by the secret overlay token / audience code, so OBS and phones receive updates.
- Public pages (`/overlay/$token`, `/live/$code`) only use security-definer RPCs (get_overlay_state, get_audience_state, submit_audience); never grant anon table access.
- Dashboard pages live under `_authenticated/_studio.*` (sign-in gate + shell); overlay and audience routes stay outside so they render without chrome.
- AI calls go through `src/lib/ai.functions.ts` (auth-required server fn) → `ai.server.ts` (Lovable AI Gateway, Responses API, Kyoka persona prompt); the client sends recent bank items so the AI avoids repeats.
