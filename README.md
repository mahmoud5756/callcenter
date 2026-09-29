# Bobwich – Customer Service Management

## Local
```
npm install
cp .env.example .env   # fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

## Deploy on Vercel
1. Push the project to GitHub and import it in Vercel (framework: Vite is detected from `vercel.json`).
2. Project Settings -> Environment Variables -> add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (Production + Preview), then redeploy.
3. Supabase -> Authentication -> URL Configuration: put the Vercel/custom domain in **Site URL**
   and add it to **Redirect URLs** (needed for "forgot password").
4. Run `db/inbound_guest_and_rls.sql` and `db/auth_hardening.sql` once in the Supabase SQL editor.
5. Custom domain with Open Graph: set `VITE_SITE_URL=https://your-domain` and redeploy.

After changing OG image/tags, refresh Facebook's cache: https://developers.facebook.com/tools/debug/
