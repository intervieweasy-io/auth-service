# API cURL Reference

The snippets below cover every HTTP endpoint exposed by the monolith. They assume the API is running
on `http://localhost:4000` and that you are using bash (or a compatible shell). Feel free to copy and
paste individual commands to exercise endpoints manually.

```bash
API_URL="http://localhost:4000"
```

Many routes require an access token. You can sign in once and reuse the bearer token + refresh cookie
for the remainder of your session:

```bash
# Log in and store the access token. Cookies (including refresh) are written to cookies.txt.
AUTH_TOKEN="$(curl -s -X POST "$API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"changeme"}' \
  -c cookies.txt | jq -r '.access')"
```

> **Tip:** `cookies.txt` lets you refresh tokens without re-authenticating.

## Health Checks

```bash
# Monolith health probes
curl "$API_URL/api/health"

curl "$API_URL/api/core/health"
```

```bash
# OpenAI proxy health (requires OPENAI_API_KEY configured on the server)
curl "$API_URL/openai/health"
```

## Authentication

```bash
# Sign up a new account (handle must be unique and alphanumeric/underscore).
curl -X POST "$API_URL/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "new.user@example.com",
    "name": "New User",
    "handle": "new_user",
    "password": "SuperSecure1"
  }'
```

```bash
# Sign in with an existing account.
curl -X POST "$API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"changeme"}' \
  -c cookies.txt
```

```bash
# Issue a fresh access token using the stored refresh cookie.
curl -X POST "$API_URL/api/auth/refresh" \
  -b cookies.txt
```

```bash
# Clear refresh state and cookies.
curl -X POST "$API_URL/api/auth/logout" \
  -b cookies.txt
```

```bash
# Ping the auth service (used by clients to confirm session status).
curl "$API_URL/api/auth/me"
```

```bash
# Start a password reset email.
curl -X POST "$API_URL/api/auth/forgot" \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com"}'
```

```bash
# Complete a password reset with a token from the email.
curl -X POST "$API_URL/api/auth/reset/{token}" \
  -H 'Content-Type: application/json' \
  -d '{"password":"NewStrongPass1"}'
```

## Jobs

```bash
# Create a job tracking entry.
curl -X POST "$API_URL/api/core/jobs" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "title": "Frontend Engineer",
    "company": "Karyo",
    "location": "Remote",
    "stage": "APPLIED",
    "priority": "starred"
  }'
```

```bash
# List jobs (optionally filter by stage, archived, cursor, limit).
curl "$API_URL/api/core/jobs?stage=APPLIED&limit=20" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# Fetch a single job (includes the latest comments and audit records).
curl "$API_URL/api/core/jobs/{jobId}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# Update job metadata.
curl -X PATCH "$API_URL/api/core/jobs/{jobId}" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "stage": "INTERVIEW",
    "appliedOn": "2024-03-01T00:00:00.000Z"
  }'
```

```bash
# Archive a job (moves to ARCHIVED stage).
curl -X POST "$API_URL/api/core/jobs/{jobId}/archive" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# Restore an archived job back to the wishlist.
curl -X POST "$API_URL/api/core/jobs/{jobId}/restore" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

## Job Comments

```bash
# Add a note to a job.
curl -X POST "$API_URL/api/core/jobs/{jobId}/comments" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"text":"Reached out to hiring manager."}'
```

```bash
# Retrieve paginated comments.
curl "$API_URL/api/core/jobs/{jobId}/comments?limit=20&cursor={opaqueCursor}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

## Job Audit Trail

```bash
# View audit history for a job.
curl "$API_URL/api/core/jobs/{jobId}/audit?limit=20&cursor={opaqueCursor}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

## Voice/Text Commands

```bash
# Send a parsed voice/text command request.
curl -X POST "$API_URL/api/core/commands" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "channel": "voice",
    "transcript": "Move the Stripe role to interview stage",
    "requestId": "req-12345"
  }'
```

## Internal Utilities

```bash
# Parse job details from a URL (no auth required).
curl -X POST "$API_URL/api/core/internal/parser/link" \
  -H 'Content-Type: application/json' \
  -d '{"sourceUrl":"https://jobs.example.com/listing"}'
```

```bash
# Run the natural-language command parser (no auth required).
curl -X POST "$API_URL/api/core/internal/commands/parse" \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"Add a backend role at Vercel"}'
```

## Profiles

```bash
# Fetch a public profile by handle.
curl "$API_URL/api/profile/{handle}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# Update your profile details.
curl -X PATCH "$API_URL/api/profile/me" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "headline": "Frontend @ Quince",
    "skills": ["react", "node", "design systems"],
    "location": "Bengaluru"
  }'
```

```bash
# Append a wall-of-work entry.
curl -X POST "$API_URL/api/profile/me/wall" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "type": "project",
    "title": "InterviewEasy",
    "summary": "AI powered job tracker",
    "media": [{
      "kind": "image",
      "url": "https://cdn.example.com/intervieweasy.png"
    }],
    "tags": ["ai", "jobs"],
    "pinned": true
  }'
```

## Posts

```bash
# Create a media post.
curl -X POST "$API_URL/api/posts" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "type": "media",
    "text": "Ship day!",
    "tags": ["shipping", "react"],
    "visibility": "public",
    "media": [{
      "kind": "image",
      "url": "https://cdn.example.com/launch.webp",
      "thumbUrl": "https://cdn.example.com/launch_thumb.webp"
    }]
  }'
```

```bash
# Retrieve a post.
curl "$API_URL/api/posts/{postId}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# Delete a post you own (or as an admin).
curl -X DELETE "$API_URL/api/posts/{postId}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# Vote in a poll (supports multi-select when defined).
curl -X POST "$API_URL/api/posts/{postId}/poll/vote" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"optionIds":["opt_a"]}'
```

```bash
# Fetch aggregated poll results.
curl "$API_URL/api/posts/{postId}/poll/results" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

## Engagement

```bash
# Like a post.
curl -X POST "$API_URL/api/engage/posts/{postId}/like" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# Remove a like.
curl -X DELETE "$API_URL/api/engage/posts/{postId}/like" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# Leave a comment on a post.
curl -X POST "$API_URL/api/engage/posts/{postId}/comments" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"text":"Love this update!"}'
```

```bash
# Paginate through comments.
curl "$API_URL/api/engage/posts/{postId}/comments?limit=20&cursor={opaqueCursor}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# Share a post (creates a share post on your timeline).
curl -X POST "$API_URL/api/engage/posts/{postId}/share" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"text":"Must read for early founders."}'
```

## Feed

```bash
# Home feed with ranking.
curl "$API_URL/api/feed/home?size=20&cursor={opaqueCursor}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# User timeline respecting visibility rules.
curl "$API_URL/api/feed/user/{handle}?limit=20&cursor={opaqueCursor}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

## Graph (Follows & Connections)

```bash
# Follow a user by ID.
curl -X POST "$API_URL/api/graph/follow/{userId}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# Unfollow a user.
curl -X DELETE "$API_URL/api/graph/follow/{userId}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# List followers with cursor pagination.
curl "$API_URL/api/graph/{userId}/followers?limit=20&cursor={opaqueCursor}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

```bash
# List accounts a user follows.
curl "$API_URL/api/graph/{userId}/following?limit=20&cursor={opaqueCursor}" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

## Pods

```bash
# Create a pod (owner is set automatically).
curl -X POST "$API_URL/api/pods" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "name": "React Builders",
    "purpose": "Ship weekly",
    "tags": ["react", "frontend"],
    "visibility": "public",
    "rituals": [{
      "id": "daily-standup",
      "title": "Daily Standup",
      "cadence": "daily"
    }],
    "needs": [{"skill":"design","must":true}],
    "offers": [{"skill":"frontend"}]
  }'
```

```bash
# Record a ritual check-in as a member.
curl -X POST "$API_URL/api/pods/{podId}/checkin" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "ritualId": "daily-standup",
    "text": "PR merged and deployed",
    "mood": "😄"
  }'
```

