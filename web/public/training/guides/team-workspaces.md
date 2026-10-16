# Team workspaces

A **workspace** is one network: its people, relationships, integrations and settings. You can belong to several — for example a private one and one shared with your team.

## Workspace settings

**Settings → Workspace**

- **Name**
- **My email addresses** — used to detect your sent mail. In a shared workspace, add every member's address so everyone's threads are classified correctly.
- **Corporate email domains** — define the Corporate circle. Saving recomputes circles for the whole workspace.

## Creating and switching

**New workspace** (Settings → Workspace, or the switcher at the top of the rail) creates an empty workspace with you as owner. Switch with the rail menu; the app remembers your last choice per browser.

## Members and roles

**Settings → Members**

| Role | Can |
|---|---|
| **Owner** | Everything, including inviting, changing roles, removing members and deleting the workspace |
| **Editor** | Import, add/edit/merge people, log interactions, manage integrations |
| **Viewer** | Browse people and every visualisation; export |

To invite someone, enter their email and pick a role:

- If they already have an account they are added immediately.
- Otherwise you get a one-time **invite link** (`/invite/<token>`). Opening it lets them create an account that lands straight in the workspace. Pending invites are listed with copy and revoke actions.

Members can leave a workspace themselves; the owner cannot be removed.

## Data isolation

Workspaces are fully isolated: a user only ever sees workspaces they are a member of, and every API request is checked against membership and role.
