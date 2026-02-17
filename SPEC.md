# SocialCTL

**Version:** 0.1
**Mode:** File-first (GitOps)
**Secrets:** SOPS + age
**Primary Use Case:** Agent-friendly CLI for managing multi-profile social media publishing, activity reading, and replies.

---

# 1. Vision

SocialCTL is a CLI-first, GitOps-style social media control system.

It treats:

* Posts as version-controlled YAML files
* Publishing as a deterministic compilation step
* Receipts as immutable artifacts
* Secrets as encrypted SOPS documents
* Profiles as isolated user workspaces

It is designed for:

* Agents (AI or automation)
* Engineers
* Multi-profile setups
* Clean Git workflows
* Future MCP server support

---

# 2. Core Design Principles

1. File system is the source of truth.
2. YAML post files represent publishing intent.
3. Publishing generates immutable receipts.
4. Secrets are encrypted using SOPS + age.
5. Connectors are pluggable per platform.
6. Everything is idempotent.
7. MCP server mode reuses the same internal service layer.

---

# 3. Repository Structure

```
<repo>/
  SPEC.md
  socialctl.yaml
  profiles/
    <profile>/
      profile.yaml
      secrets.enc.yaml
      cache/
        accounts.json
        activity-cursors.json
      media/
      posts/
        2026/02/23/
          001-morning-thought.yaml
          002-product-update.yaml
          posted/
            001-morning-thought.receipt.json
            002-product-update.receipt.json
```

---

# 4. Profiles

Each profile represents one logical user identity.

Examples:

* balwant
* appfinity
* iamcoming-brand

Switch profile:

```
socialctl profile use balwant
```

---

# 5. profile.yaml (Non-Secret)

Location:

```
profiles/<profile>/profile.yaml
```

Example:

```yaml
version: 1
profile: balwant

default_targets:
  - platform: linkedin
  - platform: x

storage:
  posts_root: ./posts
  media_root: ./media

secrets:
  sops_file: ./secrets.enc.yaml
  age_key_provider: keychain  # keychain | file | env
```

---

# 6. Secrets (SOPS + age)

Location:

```
profiles/<profile>/secrets.enc.yaml
```

Encrypted using SOPS.

Plaintext structure before encryption:

```yaml
version: 1
platforms:
  linkedin:
    client_id: ""
    client_secret: ""
    accounts:
      - account_id: ""
        label: "Balwant"
        refresh_token: ""

  x:
    client_id: ""
    client_secret: ""
    accounts:
      - account_id: ""
        label: "Balwant"
        refresh_token: ""

  meta:
    app_id: ""
    app_secret: ""
    accounts:
      - account_id: ""
        label: "Appfinity Page"
        refresh_token: ""
        instagram_business_id: ""
```

---

## 6.1 Key Management

Supported providers:

1. keychain (default)
2. file → ~/.config/socialctl/age/key.txt
3. env → SOCIALCTL_AGE_KEY

Commands:

```
socialctl key init
socialctl key status
socialctl key rotate
```

---

# 7. Post File Format

Location:

```
profiles/<profile>/posts/YYYY/MM/DD/<name>.yaml
```

Example:

```yaml
version: 1
id: 2026-02-23-001-morning-thought

as_profile: balwant

targets:
  - platform: linkedin
  - platform: x
  - platform: meta.instagram
    account: "Appfinity Page"

content:
  text: |
    Shipping something new this week 🚀
    If you want early access, comment "beta".
  link:
    url: "https://iamcoming.io"
  media:
    - type: image
      path: "../../media/feature.png"
      alt: "Feature screenshot"

options:
  schedule_at: null
  dry_run: false

platform_overrides:
  x:
    text: "Shortened version for X..."
```

---

# 8. Validation Rules

Required:

* version
* content.text
* targets (or use profile defaults)

Media:

* Must exist
* Max size validated per platform

Platform constraints enforced during publish.

---

# 9. Receipt Format

Generated at:

```
posted/<name>.receipt.json
```

Example:

```json
{
  "version": 1,
  "post_id": "2026-02-23-001-morning-thought",
  "profile": "balwant",
  "published_at": "2026-02-23T09:15:22+11:00",
  "results": [
    {
      "platform": "linkedin",
      "account": "Balwant",
      "remote_post_id": "urn:li:share:123",
      "url": "https://linkedin.com/...",
      "status": "published"
    }
  ],
  "hash": {
    "intent_sha256": "..."
  },
  "warnings": [],
  "errors": []
}
```

---

# 10. Idempotency Rules

If receipt exists:

* Skip published platforms
* Allow `--republish` override
* Never overwrite receipt without explicit force

---

# 11. Activity Fetching

Command:

```
socialctl activity fetch --profile balwant --since 24h
```

Cursors stored in:

```
cache/activity-cursors.json
```

Normalized output (JSONL):

```json
{
  "platform": "linkedin",
  "type": "comment",
  "post_id": "...",
  "actor": "...",
  "text": "...",
  "created_at": "..."
}
```

---

# 12. Reply File Format

Example:

```yaml
version: 1
in_reply_to:
  platform: linkedin
  remote_post_id: "urn:li:share:123"
  remote_comment_id: null

content:
  text: "Thanks for your support!"
```

---

# 13. CLI Commands

## Profile

```
socialctl profile list
socialctl profile use <profile>
```

## Accounts

```
socialctl account link <platform>
socialctl account list
socialctl account whoami <platform>
```

## Posts

```
socialctl post validate -f <file>
socialctl post publish -f <file>
socialctl post status -f <file>
socialctl post list --since 7d
```

## Activity

```
socialctl activity fetch
socialctl activity watch --interval 60
```

## Reply

```
socialctl reply -f reply.yaml
```

---

# 14. Connector Architecture

Directory:

```
src/connectors/<platform>/
```

Each connector must implement:

* linkStart()
* linkFinish()
* publishPost(intent)
* fetchActivity(cursors)
* reply(intent)

All connectors must:

* Return normalized result objects
* Never write directly to disk
* Not manage secrets storage

---

# 15. Internal Architecture

```
src/
  cli/
  core/
    profile-loader.ts
    intent-loader.ts
    validator.ts
    receipt-writer.ts
    ledger.ts
    sops-helper.ts
  connectors/
  types/
```

Flow:

1. Load profile
2. Decrypt secrets
3. Parse intent YAML
4. Validate
5. Publish per target
6. Write receipt
7. Update activity cursor

---

# 16. Logging Modes

Default: human-readable

Optional:

```
--json
```

Outputs structured logs for agents.

---

# 17. Security Principles

* No plaintext tokens in repo
* Secrets only decrypted in memory
* Receipts contain no refresh tokens
* Token refresh handled automatically

---

# 18. Future MCP Mode

Command:

```
socialctl mcp serve --stdio
```

Exposes tools:

* accounts.list
* posts.publish
* posts.validate
* activity.fetch
* reply.publish

MCP uses same core service layer.

No storage changes required.

---

# 19. MVP Scope (Recommended)

Phase 1:

* Profile loader
* SOPS decrypt integration
* Post validate
* Publish for 1 platform
* Receipt generation

Phase 2:

* Add second platform
* Add activity polling
* Add replies

Phase 3:

* MCP server
* Scheduling
* Rich media support

---

# 20. Design Philosophy

SocialCTL treats social media as infrastructure.

Posts are artifacts.
Publishing is deployment.
Receipts are build outputs.
Secrets are encrypted.
Agents are first-class users.
