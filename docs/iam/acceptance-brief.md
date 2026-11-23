# IAM — Business Acceptance Brief

**Updated** 2026-11-02 · **Owner** IAM PM, Kaivalya Pandit · **Readers** engineering, leadership, other module PMs

## How to read this

This brief describes how Identity and Access Management (IAM) is expected to work for real customers. It sits
before engineering's test cases and supports them; it is not a list of test steps.

- **Situations (part 1)** are real ways customers use IAM, end to end. They are representative examples, not a full
  list. Engineering works from the full product documentation and covers what lies beyond these stories.
- **Expected behaviours (part 2)** apply across every situation, including ones not written here. Each has a
  priority: **P0** a failure would go unnoticed, would cross from one customer to another, or could not be undone;
  **P1** a failure is visible and can be put right; **P2** minor.
- **Examples (part 3)** show selected behaviours as one concrete case each.
- **Points to note (part 4)** are specific behaviours and edge cases worth keeping in mind.
- **Configurations (part 5)** are the customer set-ups the situations run under.

Test cases can cite the brief's IDs (`SIT-IAM-03`, `BEH-IAM-12`, `EX-IAM-12.1`, `CFG-IAM-B`) to trace back to the
business need. Numbering has gaps; IDs do not change.

## Words used here

- **Account.** A person's account in one organisation. There is no global login and no account that spans
  organisations. Each email is one person's identity in its organisation.
- **Source of truth.** Who owns an account's lifecycle: the organisation's admins (**Manual**), or one connected
  directory (**SCIM** from an identity provider, or **LDAP** from Active Directory).
- **MSP.** A managed service provider that serves client organisations. MSP staff have accounts in the MSP
  organisation only. From there they work on the data of every client they reach, with the permissions their access
  profiles give. They do not sign in to a client. All data is pooled and kept apart by organisation.
- **Assignment** gives a role to a person or a team in one organisation. An **access profile** is the MSP's version: a
  named set of roles plus the organisations they apply to, assigned to MSP staff or teams.
- **Reach** is the set of organisations a person can act in.
- **An admin with the permission to …** For this release there is one admin role, the IAM permissions (names in
  brackets, such as `role.assign`), and custom roles the customer builds.
- **Tenant Owner.** The one person at the top of a tenant, the customer's whole account. They hold every power
  without a role, cannot be removed, only transferred, and are the tenant's built-in emergency way in.
- **Confirmation tiers.** Tier 1 is a plain confirm. Tier 2 asks the admin to type a word such as `delete`. Tier 3
  asks for a fresh one-time code sent to the admin's email.
- Steps owned by other modules end with **(TM)** Tenant Management, **(OM)** Organization Management or **(IEI)**
  Identity & Email Integration.

---

## 1. Situations (15)

People and organisations are the mock's seed data, so a story can be run against the mock as written.

### SIT-IAM-01 — "We bought the platform. Get me in, then my first colleagues."

**Who:** Pratik Patel (Tenant Owner), Ananya Iyer and Divya Rao (colleagues)  ·  Where: CFG-IAM-A  ·  Journeys: IAM-01, IAM-04, IAM-06, IAM-12

**The story:**

1. Motadata provisions the Lighthouse Analytics tenant and emails Pratik, who becomes its Tenant Owner (TM).
2. Pratik opens the sign-in link in the email, which carries his organisation, and signs in with an email code (TM) (OM).
3. Lighthouse sets `lighthouse.io` as its allowed domain (OM). A Gmail address Pratik adds by mistake gets a warning, and he removes it.
4. Pratik invites Ananya and Divya by email address only.
5. Ananya signs in through the organisation's sign-in link with a code, types her first and last name, skips the details pages, and lands as Active.
6. Pratik gives Ananya a role that lets her invite and manage people, and she invites the rest of the team.
7. Divya never accepts. When her invitation expires, her Invited row disappears, and Pratik invites her again.

**Success looks like:** Pratik and his deputy are working within the hour, with no IdP, and every invite and role change is in the audit log.

**Watch for:** anyone gets in without a code; an invitee reaches the workspace with no name; an expired invitation stays as Invited or blocks a new one; Pratik can be disabled or given an end date.

**Related behaviours:** BEH-IAM-01, 10, 11, 13, 15, 26.

**Depends on:** TM: the tenant exists and the Tenant Owner is designated (JOURNEY-TM-01, TM-02). OM: the organisation exists (JOURNEY-OM-10); allowed domains, if any, are set (JOURNEY-OM-03).

### SIT-IAM-02 — "Set up our MSP staff once, then give each team the clients it serves."

**Who:** Sarah Johnson (Tenant Owner), Natasha Manglore (MSP admin), the IT Support and Security teams  ·  Where: CFG-IAM-C  ·  Journeys: IAM-05, IAM-06, IAM-08, planned IAM-16

**The story:**

1. The MSP tenant is provisioned with Sarah as Tenant Owner (TM).
2. The MSP connects its own IdP to the MSP organisation over SCIM (IEI), and 60 staff arrive with SCIM as their source of truth.
3. Sarah gives Natasha an access profile with full admin permissions over all organisations.
4. Natasha builds "Helpdesk Access": the roles her helpdesk needs, over Acme Technologies and Beta Innovations. She assigns it to the IT Support and Security teams.
5. She adds 38 staff to IT Support. Each one gets the profile through the team, shown read-only on their own Access profiles tab.
6. A month later the MSP signs a new client (OM). Natasha's all-organisations profile reaches it at once; Helpdesk Access does not.

**Success looks like:** one profile per job, assigned to teams; a new hire needs only a team; a new client is reached only where a profile says All organisations.

**Watch for:** Natasha must pick organisations again for each person; a team's row can be edited on the person; Helpdesk Access starts covering the new client by itself; a profile saves with no roles or no organisations.

**Related behaviours:** BEH-IAM-17, 19.

**Depends on:** TM: the MSP tenant and its Tenant Owner exist (JOURNEY-TM-01). IEI: SCIM to the MSP organisation is live (JOURNEY-IEI-02). OM: client organisations exist (JOURNEY-OM-01).

### SIT-IAM-03 — "We signed a new client. Their staff sign in with their own SSO and appear by themselves."

**Who:** Natasha (MSP admin), the client's IT lead, client engineers, a contractor  ·  Where: CFG-IAM-D  ·  Journeys: IAM-01, IAM-04, IAM-05, IAM-06, IAM-15

**The story:**

1. Natasha creates the client organisation and its sign-in link (OM).
2. Every MSP user field set to apply to all clients appears in the new organisation at once.
3. The client's Entra connection is added with JIT on (IEI).
4. An engineer opens the client's link, signs in through Entra, and gets an account on the spot: Manual source of truth, only what every member can do. The allowed-domain list is not consulted: the client's IdP has already decided who may sign in.
5. His name came from Entra, so he skips the name page and sees only the fields he owes.
6. A contractor with no account who opens the link cannot get in until someone invites her. A stranger on a second connection with JIT off is turned away after proving their email.
7. Natasha, working on the client from the MSP organisation through her access profile, gives the IT lead a role that lets him manage people, and he assigns roles to his own staff.
8. When the engineer's job title changes in Entra, his account does not change, because JIT never updates on later sign-ins.

**Success looks like:** the client's staff get in on day one with the basics only; anything more is a deliberate admin act.

**Watch for:** JIT updates details on a later sign-in; JIT gives more than the basics; JIT runs on a connection whose JIT is off; a sign-in to one organisation opens another; Natasha needs an account or a sign-in in the client.

**Related behaviours:** BEH-IAM-02, 08, 17.

**Depends on:** OM: the client organisation and its link exist (JOURNEY-OM-01). IEI: the SSO connection is live with JIT on and its mapping set (JOURNEY-IEI-01).

### SIT-IAM-04 — "Our IdP runs joiners and leavers. When HR removes someone, they lose access."

**Who:** Ananya (admin), Meera Krishnan (leaver), Tanvi Deshpande (moved to Manual), Pratik (Tenant Owner)  ·  Where: CFG-IAM-B  ·  Journeys: IAM-03, IAM-05, IAM-06, IAM-12, IAM-14

**The story:**

1. Lighthouse connects its IdP over SCIM (IEI). New hires arrive with SCIM as source of truth, with their names and mapped fields.
2. Meera leaves. HR deactivates her in the IdP; her account is disabled, her sessions end, and her row reads "Disabled by SCIM".
3. Her manager asks Ananya to switch her back on for a day. The Enable confirm warns that SCIM still owns Meera and will disable her again.
4. Months ago an admin moved Tanvi to Manual. When the IdP deactivates Tanvi, nothing happens, because SCIM no longer owns her.
5. The IdP also sends a removal for Pratik. It is refused, the refusal is audited, and an admin is told.
6. Thirty days after SCIM disabled Meera, her account is deleted automatically and her data stripped.

**Success looks like:** the IdP is the one switch for the people it owns; Manual people stay the admins'; leavers do not linger.

**Watch for:** a SCIM removal deletes at once; a removal disables someone SCIM does not own; SCIM re-enables someone an admin disabled; the Tenant Owner is disabled; the 30-day delete fires early or never.

**Related behaviours:** BEH-IAM-06, 07, 13, 25.

**Depends on:** IEI: SCIM is live and the IdP pushes to it (JOURNEY-IEI-02); connection failures are reported (JOURNEY-IEI-06).

### SIT-IAM-05 — "Our on-prem Active Directory decides who works here."

**Who:** Marcus Webb (client admin), Grace Lindqvist (leaver), Daniel Okafor (admin-disabled), Amara Diallo (Manual)  ·  Where: CFG-IAM-E  ·  Journeys: IAM-05, IAM-06, IAM-12, IAM-14

**The story:**

1. The MSP sets up LDAP sync for Acme Healthcare through an on-prem collector, every 12 hours (IEI).
2. Each run creates new AD users with LDAP as source of truth and refreshes their mapped details.
3. Grace's AD account is disabled, and the next run disables her account in Acme, attributed to LDAP.
4. A nurse moves to an OU outside the sync scope. No other source carries her, so the run disables her too.
5. Daniel, whom Marcus disabled himself, still appears in AD. The run leaves him disabled, and it leaves Amara alone in both directions.
6. A new hire is given the address of a leaver whose account still exists. The run refuses to bind the new AD account, because its directory ID differs from the one recorded.
7. Thirty days after LDAP disabled Grace, her account is deleted automatically.

**Success looks like:** AD decides for the people LDAP owns, and Marcus's own decisions stand.

**Watch for:** a run deletes anyone at once; a run re-enables someone an admin disabled or moved to Manual; the new hire takes over the leaver's account.

**Related behaviours:** BEH-IAM-06, 07, 09, 12.

**Depends on:** IEI: the LDAP connection, cadence, mapping and collector route are live (JOURNEY-IEI-07); run failures are reported (JOURNEY-IEI-06). OM: Acme Healthcare exists (JOURNEY-OM-01).

### SIT-IAM-06 — "Our IdP is down and we are SSO-only. Someone still has to get in."

**Who:** two Acme Technologies admins on the emergency list, a technician not on it, Sarah Johnson (Tenant Owner)  ·  Where: CFG-IAM-F  ·  Journeys: IAM-01, IAM-02, IAM-03

**The story:**

1. Acme Technologies enforces SSO-only and names two admins for emergency access (OM).
2. Its IdP goes down. Staff on the Acme link see only the SSO button and cannot get in.
3. One named admin uses the emergency sign-in, proves her email with a code, and enters Acme. The use is audited and Acme's admins are alerted.
4. A technician not on the list tries the same and gets the same failure an unknown email gets.
5. The outage spreads to the MSP's own IdP. Sarah, the Tenant Owner and so the tenant's built-in break-glass, signs in with an email code.
6. A run of wrong codes hits the rate limit; the entry locks, and the lockout is audited.

**Success looks like:** the named people get in within minutes, everyone else waits for the IdP, and every emergency use is visible.

**Watch for:** the emergency sign-in shows on the normal sign-in page; it skips the rate limit; a use is not audited or not alerted; the entry reveals whether an email is on the list; the Tenant Owner is locked out.

**Related behaviours:** BEH-IAM-01, 03, 13.

**Depends on:** OM: SSO-only enforcement and the emergency list are set; an empty list is OM's concern. IEI: the SSO connection exists (JOURNEY-IEI-01). TM: the Tenant Owner is designated.

### SIT-IAM-07 — "Someone resigned. Switch them off today, remove them for good later."

**Who:** Natasha (MSP admin), Michael Smith (leaver, Manual), five other leavers  ·  Where: CFG-IAM-C  ·  Journeys: IAM-06, IAM-07, IAM-14

**The story:**

1. Michael Smith, Manual source of truth in the MSP organisation, hands in his notice.
2. Natasha disables him. The confirm says his sessions end now and his teams and assignments are kept; his row then reads "Disabled by admin".
3. Tickets and Approvals move his open work under their own rules (Tickets, Approvals).
4. Nothing deletes him automatically, because an admin disabled him. Six weeks later Natasha deletes him. She types `delete`, and his data is stripped: nothing of him is left in the console.
5. If his email address is ever used again, that person starts fresh.
6. Five more leavers, some still active, are selected on the Users list and deleted together. Active ones are disabled first and deleted in the background; each row has its own outcome.

**Success looks like:** a leaver is out the same day, can be brought back intact if HR was wrong, and is removed for good when the admin decides.

**Watch for:** enabling him again does not restore his teams and assignments; delete works without typing `delete`; anything of his survives a delete; IAM itself reassigns his tickets.

**Related behaviours:** BEH-IAM-05, 12, 25.

**Depends on:** Tickets, Approvals, Notifications: subscribed to IAM's lifecycle signals (their own PRDs).

### SIT-IAM-08 — "Give the project team client access for a few weeks, and let the contractor's account end on its date."

**Who:** Natasha (MSP admin), the Engineering team, Olivia Jones, Pratik (Lighthouse), an external contractor  ·  Where: CFG-IAM-C, CFG-IAM-B  ·  Journeys: IAM-06, IAM-08, IAM-14, IAM-03

**The story:**

1. Natasha assigns the "Change Approval" profile to the Engineering team for six days, and "Client Onboarding Access" to Olivia for 90 days.
2. While the end approaches, each row shows that it is expiring, and a day before, Natasha is told who loses what, and when.
3. She extends Olivia's row by a month and lets Engineering's lapse.
4. At the end, Engineering's members lose the profile, and the row disappears. Where it was someone's only way into a client, that client's data drops out of what they can see at once, with no new sign-in.
5. A week later a manager asks to extend it. It is gone, so Natasha assigns it again.
6. At Lighthouse, Pratik gives an external contractor an account end date of 15 December. At the end of that day the account is disabled and marked Expired, even if the scheduler runs late.
7. The work runs over, so Pratik clears the date the next morning, and the contractor is back with his access intact. Had nobody cleared it, the account would have been deleted automatically 30 days after it expired.

**Success looks like:** temporary access ends on time with nobody watching the clock, and the admin had a day's warning.

**Watch for:** access outlives its date; an expired assignment is still listed or can be extended; extending one holder's row changes another's; a person still sees a client they no longer reach; an expired account is deleted before its 30 days or never; the Tenant Owner can be given an end date.

**Related behaviours:** BEH-IAM-05, 07, 13, 15, 19.

**Depends on:** Notifications: delivers the lead-time notice. OM: the organisation's policy sets the lead time (JOURNEY-OM-03).

### SIT-IAM-09 — "The person who owns our integrations is leaving."

**Who:** Marcus Webb (client admin), Liam Gallagher (owner, leaving), Sofia Alvarez (an Acme admin)  ·  Where: CFG-IAM-E  ·  Journeys: IAM-06, IAM-11, IAM-14

**The story:**

1. Liam owns the HL7 Interface Bot that feeds patient messages, and he hands in his notice.
2. Marcus tries to disable Liam and is stopped. The message names the bot as the thing to resolve first.
3. Marcus opens the bot and reassigns it to Sofia, an eligible owner in Acme Healthcare.
4. The bot's keys and roles stay as they were, so the integration keeps running.
5. Sofia issues a new key beside the old one, the HL7 engine switches over, and she disables the old key, which stays on record.
6. Marcus goes back to Liam and disables him.
7. Had AD removed Liam first, the LDAP run's disable would have been blocked the same way, and Marcus told. The platform remembers the blocked disable and completes it on the next run after the bot is reassigned, as long as LDAP still owns Liam. A SCIM removal is remembered and completed the same way.

**Success looks like:** no integration stops because a person left, and every integration always has an accountable person in its own organisation.

**Watch for:** Liam is disabled or deleted while he owns an active bot, by any path; a blocked directory disable is lost, or completes after the directory no longer owns him; ownership moves to another organisation; a key change forces downtime; a disabled key still works or vanishes from the record.

**Related behaviours:** BEH-IAM-14, 23, 25.

**Depends on:** the central credential vault: issues and stores keys. IEI: Liam's LDAP connection is live (JOURNEY-IEI-07).

### SIT-IAM-10 — "HR sent us a spreadsheet of about 350 new starters."

**Who:** Divya Rao (Lighthouse admin with the permissions to invite, manage people and assign roles), People Ops  ·  Where: CFG-IAM-B; variant CFG-IAM-C  ·  Journeys: IAM-04, IAM-06, IAM-01, IAM-12

**The story:**

1. Divya fills the sample file from the HR export, with names, email, role, department and site, and uploads 352 rows into Lighthouse.
2. She maps the columns, leaves "allow users outside the allowed domains" off, and finishes. The import runs as a job while she does other work.
3. The Users page then says: 331 invited, 12 updated, 9 not imported.
4. The results file is her own file plus a status and reason per row: two outside addresses excluded, a duplicate and the Tenant Owner's address skipped, an unknown department left blank with a note, a disabled person updated and still disabled. A colleague already in Lighthouse gets her new phone number, and the role in her row is added to the roles she already had.
5. She fixes the cells, allows the two contractors' outside addresses, and uploads the same file again. Created rows now come back as updated, and nobody gets a second email.
6. The 331 invitees sign in, skip the name page because the file carried their names, and see only the fields they owe.
7. In the MSP organisation the same flow offers an access-profile column instead of a role column.

**Success looks like:** about 350 people handled in one pass, every row explained in one file, and a second run is safe.

**Watch for:** the import writes into another organisation; an update re-enables or re-invites anyone; an outside address is invited without the one choice; the role column works for an admin without the permission to assign; an update takes away access the person already had; a cell runs as a formula when the results open; the Tenant Owner's record changes.

**Related behaviours:** BEH-IAM-09, 10, 11, 13, 15, 26.

**Depends on:** OM: allowed domains, if any (JOURNEY-OM-03); departments and sites exist (JOURNEY-OM-02).

### SIT-IAM-11 — "We changed what an access profile or a role covers, and many people's access changed with it."

**Who:** Natasha (MSP admin) with IT Support (38) and Security (23); Ananya (Lighthouse admin) with Platform Engineering (26); Marcus Webb and an MSP engineer at Acme Healthcare  ·  Where: CFG-IAM-C, CFG-IAM-B, CFG-IAM-E  ·  Journeys: planned IAM-16, IAM-08, IAM-09, IAM-06, IAM-03, IAM-11

**The story, MSP:**

1. Natasha decides Helpdesk Access should also cover Gamma Solutions and include one more role.
2. Before saving she sees how many people gain access, and she confirms. Every holder, directly or through a team, has the new access at once.
3. A month later she removes Beta Innovations. The dialog counts who loses Beta; those with no other way in have their Beta sessions ended.
4. She later replaces Helpdesk Access with a new profile; the old one is deleted only after the new one saves.
5. On one person's Access profiles tab she can only change that person's expiry or revoke that person's row.

**The story, single organisation:**

6. Ananya creates a custom role "Release Engineer" that can edit only tickets owned by the person's teams, and assigns it to Platform Engineering and to two people, one until the end of the quarter.
7. She narrows the role, and everyone who holds it, directly or through the team, gets the narrower scope at once.
8. She revokes the direct row of someone who also holds the role through the team; the row tells her the access remains through the team.
9. She deletes an old custom role and replaces it with an existing one; the dialog counts the people, teams and service accounts it reaches.
10. At Acme Healthcare, an MSP engineer working on Acme from the MSP organisation and Marcus both edit the same client role. The last save wins, and both edits are audited.

**Success looks like:** one edit changes many people's access on purpose, with a count seen first, and a delete never strands anyone by accident.

**Watch for:** a profile or role changes many holders without the impact dialog; a profile's contents change from a role page or a team; revoking one holder touches another; Natasha can see, assign or edit a profile whose organisations she does not all reach; a single-organisation screen says "access profile".

**Related behaviours:** BEH-IAM-05, 17, 18, 19, 20, 24.

**Depends on:** OM: Gamma Solutions exists; an offboarded client is taken out of every profile (JOURNEY-OM-01, OM-07). Each operational module publishes its permissions to the catalog.

### SIT-IAM-13 — "Every client must record an Employee ID and an emergency contact for their people."

**Who:** Natasha (MSP admin), Marcus Webb (client admin), staff at Acme Healthcare and at the client from SIT-IAM-03  ·  Where: CFG-IAM-C, CFG-IAM-E, CFG-IAM-D  ·  Journeys: IAM-15, IAM-01, IAM-04, IAM-05, IAM-06

**The story:**

1. Natasha creates two user fields in the MSP organisation for all clients: Employee ID, required and admin-owned, and Emergency contact, required and member-editable.
2. Both appear at once in every client. At Acme Healthcare Marcus sees them read-only and cannot add his own field with either label.
3. Acme's LDAP run fills Employee ID under that connection's mapping (IEI); for the SSO client, the IdP admin maps the published SCIM attribute (IEI).
4. People owe only Emergency contact. It is asked on the details pages or in one dismissible line, and never stops anyone signing in.
5. People whose Employee ID is still empty are flagged as incomplete for their admins.
6. A client onboarded next month gets both fields by itself.
7. Natasha removes Beta Innovations from Employee ID. Beta's values are hidden but kept and come back if she adds Beta again; deleting the field needs `delete` and names the counts.

**Success looks like:** one definition, made once, filled in every client by whichever path knows the value, and nobody is blocked.

**Watch for:** a required field blocks a sign-in or a save; a client admin can edit an MSP field; a person is asked for a value their directory writes; values vanish on archive or on a reach change; a field's text renders as markup in a client.

**Related behaviours:** BEH-IAM-12, 26, 27, 28.

**Depends on:** IEI: LDAP and JIT mappings set per connection; the IdP admin maps the SCIM extension (JOURNEY-IEI-07, IEI-01, IEI-02). OM: the new client is onboarded (JOURNEY-OM-01); organisation attributes are a separate schema (JOURNEY-OM-05).

### SIT-IAM-14 — "A technician's laptop was stolen. Make sure nobody is using his sessions."

**Who:** James Brown (MSP technician), Natasha (MSP admin)  ·  Where: CFG-IAM-C  ·  Journeys: IAM-03, IAM-06, IAM-01

**The story:**

1. James reports his laptop stolen on a Friday night.
2. From his profile on his phone he ends all his sessions, which signs him out everywhere, the phone included.
3. Natasha opens his Sessions tab and sees none left. Had he not acted, she could have ended them all, and he would have been told. His sessions are all in the MSP organisation, where he signs in.
4. James signs in through the MSP's IdP, so ending sessions does not stop a new sign-in. Natasha disables him until his IdP password is reset (customer IdP).
5. On Monday Natasha enables James, and his teams and assignments are as they were.
6. When James then does something that needs a fresh code, he gets one for that action alone.

**Success looks like:** within minutes no session of James's is alive, so nothing of his reaches any client, and he is back on Monday with nothing lost.

**Watch for:** a session of his survives; the admin's own session ends; a disabled person keeps a session; the list shows another person's sessions; a Tier 3 action reuses an earlier code.

**Related behaviours:** BEH-IAM-04, 05, 12.

**Depends on:** the customer's IdP (outside the platform). OM: the session timeout policy (JOURNEY-OM-03). Notifications: the "your sessions were ended" notice.

### SIT-IAM-15 — "The auditor asks who could see patient records last quarter, and who can now."

**Who:** Marcus Webb (client admin), an external HIPAA auditor  ·  Where: CFG-IAM-E  ·  Journeys: IAM-06, IAM-08, IAM-09, IAM-14, IAM-12

**The story:**

1. Acme Healthcare's annual HIPAA audit starts. Marcus invites the auditor with a role that can view people and access but change nothing, and an account end date 30 days out.
2. The auditor asks who can open patient records today. Marcus opens the role that carries that permission and its list of holders, and each person's Roles tab, which shows whether a role is held directly or through a team.
3. The auditor asks who had access on 1 July. That answer comes from the audit history of assignments (Audit).
4. For Grace, who left, the record shows LDAP disabled her and when; for Daniel it shows an admin did.
5. The auditor asks which MSP people can act in Acme. Marcus finds them on the organisation's serving operators view, not in his user list (OM).
6. On day 31 the auditor's account disables itself, and 30 days later it is deleted.

**Success looks like:** every question has one place that answers it, and no person with access is missing from the answer.

**Watch for:** a role's holder list misses someone; an assignment lacks who gave it and when; a past change cannot be found in the audit history; the auditor's account outlives its date.

**Related behaviours:** BEH-IAM-15, 19, 24.

**Depends on:** Audit: assignment and profile history, searchable by date. OM: the serving operators view (JOURNEY-OM-09).

### SIT-IAM-16 — "The person who set up our tenant is leaving the company."

**Who:** Pratik Patel (Tenant Owner), Ananya Iyer (new owner), Divya Rao (admin)  ·  Where: CFG-IAM-B  ·  Journeys: IAM-12, IAM-06, IAM-07, IAM-05, IAM-03, IAM-11

**The story:**

1. Pratik resigns. Divya tries to disable him and is told to transfer the Tenant Owner first.
2. She selects Pratik and three other leavers and disables them together. The confirm warns that his row will fail; the other three are disabled.
3. HR removes Pratik in the IdP. The SCIM removal is refused, and the refusal is audited.
4. Pratik transfers ownership to Ananya with a fresh email code (TM).
5. Ananya now has every power without any role. Pratik keeps only what his own roles give him.
6. Pratik owns the Nightly Backup service account, so Divya reassigns it to Ananya.
7. Divya disables Pratik.

**Success looks like:** the tenant always has exactly one owner, the handover is deliberate, and nothing removes the owner by accident.

**Watch for:** the Tenant Owner is disabled, deleted or given an end date by any path (single, bulk, CSV, SCIM, LDAP); the tenant is ever without an owner; a service account or a second person becomes owner; the transfer works without a fresh code.

**Related behaviours:** BEH-IAM-04, 13, 14.

**Depends on:** TM: the ownership transfer flow, with its fresh code (PRD-TM). IEI: SCIM is live (JOURNEY-IEI-02).

---

## 2. Expected behaviours (26)


### Sign-in and sessions

| id | expected behaviour | priority | why it matters |
|---|---|---|---|
| BEH-IAM-01 | On an organisation's sign-in link, a known and an unknown email look exactly the same until the person proves their inbox; no message, sign-in method or rate-limit reply gives either away. | P0 | Enumeration of a customer's people is a security finding. |
| BEH-IAM-02 | A person has an account only in their own organisation and signs in only through its link, under its sign-in policy; a sign-in never opens another organisation. MSP staff reach a client's data only from the MSP organisation, through their access profiles, with no account or sign-in in the client. | P0 | A sign-in that opens another organisation's data is a cross-customer leak. |
| BEH-IAM-03 | Turning SSO-only on never leaves an organisation with no way in: the people named for emergency access, and the Tenant Owner, can still sign in with an email code when the IdP is down, under a rate limit, and nobody else can. | P0 | No way in is an outage; a way in for anyone else is a security finding. |
| BEH-IAM-04 | Every Tier 3 action asks for its own fresh code, with no grace window, for everyone including the Tenant Owner. | P1 | A stolen or unattended session could run a catastrophic action. |
| BEH-IAM-05 | A session ends on time: at once when the person or an admin ends it, and never later than the strictest timeout that applies; when a person loses their last way into a client, that client's data leaves their view at once, inside the session they already have. | P1 | A stale session is standing access; a client that stays visible after reach is gone is a cross-customer leak. Access where reach remains must survive. |

### Provisioning and source of truth

| id | expected behaviour | priority | why it matters |
|---|---|---|---|
| BEH-IAM-06 | An account has one source of truth at a time, the organisation's admins (Manual) or one directory; only that source changes its details or switches it off and on, and an admin who moves someone to Manual is told that offboarding them is now the admins' job. | P1 | The wrong source overwrites curated data or re-enables a leaver; a leaver kept on Manual has access nothing removes. |
| BEH-IAM-07 | When the directory that owns a person reports them gone, their access ends without an admin doing anything, as a disable, and the account is deleted automatically 30 days later; an account whose end date has passed is deleted the same way. An account an admin disabled is never deleted automatically. | P0 | Leavers keeping access is a security and compliance failure; leavers lingering forever is a privacy one; an admin's own disable must not turn into a delete. |
| BEH-IAM-08 | No directory, SSO sign-in or sync run ever sets anyone's access; roles, profiles, teams and assignments change only through people in the console, and JIT creates an account once and never rewrites it. | P0 | Otherwise an IdP is a privilege-escalation path. |
| BEH-IAM-09 | Each email is one person's identity in an organisation: trimmed and lower-cased before any match, and never joined on a name; a directory record with the same email but a different directory ID is refused. | P1 | Duplicates, or the wrong person updated; a name change must never change who an account belongs to; a recycled address must not take over a leaver's account. |
| BEH-IAM-10 | Inviting or importing someone gives them only what the admin is allowed to give: an email invitation can place the person in a team only with the permission to manage teams (which brings the team's access); an import's role column (access-profile column in the MSP organisation) is offered only with the permission to assign it. For a person who already exists, an import updates their details and adds the role or profile in the file; it never removes access, never changes their state and never sends a second invitation. Every row ends in one stated outcome, one bad row never stops the others, re-uploading is safe, and the results file can never run a formula. | P1 | Any other path is a side door to privilege; an import that removes access, re-enables or re-invites undoes an admin's decision. |
| BEH-IAM-11 | When an organisation has allowed domains, an address outside them is invited or imported only when the admin allows it for that invite or import, and the audit log records it; with no allowed domains, no check applies. | P1 | Unwanted outsiders join; the record of the exception is lost. |

### Lifecycle and retention

| id | expected behaviour | priority | why it matters |
|---|---|---|---|
| BEH-IAM-12 | Switching something off (a person, team, service account or field) is fully undone by switching it back on; deleting is final, needs the typed word `delete`, and strips the person's data so nothing is left, and a later person with the same email starts fresh once the old account is deleted; deleting an active person disables them first. | P1 | Data loss on one side; leftover personal data on the other. |
| BEH-IAM-13 | The Tenant Owner cannot be disabled, deleted, given an end date or moved to a directory by any path (single, bulk, CSV, SCIM, LDAP), and when the check cannot tell, the answer is no; the Tenant Owner is not a role, cannot be assigned, and is the tenant's built-in break-glass; the Tenant Owner keeps every power even when the service that knows who the owner is cannot be reached, so no access change can leave the tenant with nobody able to administer it. | P0 | A tenant without an owner, without its emergency way in, or with nobody able to administer it. |
| BEH-IAM-14 | Every service account always has an active human owner in its own organisation; nobody who still owns an active service account can be disabled or deleted, by any path, until the admin has reassigned or disabled those accounts, and the admin is told which ones; a directory's disable blocked this way is remembered and completes itself once the accounts are resolved, as long as that directory still owns the person. | P1 | An orphaned integration keeps live API access nobody answers for; a lost directory disable leaves a leaver with access. |
| BEH-IAM-15 | Access with an end date, on one assignment or a whole account, shows that it is expiring, ends on that date with no admin present, and the responsible admin hears about it first; an expired assignment disappears; an end date is never skipped silently: if a guard blocks it, a person hears about it; a person becomes Active only on first sign-in, and an invitation nobody accepts expires and disappears, staying in the audit log. | P1 | A contractor past their end date is a security finding; lists that fill with dead rows mislead admins. |

### Authorisation and reach

| id | expected behaviour | priority | why it matters |
|---|---|---|---|
| BEH-IAM-16 | Data in an organisation a person cannot reach is invisible to them, not just refused; every assignment carries its organisation, even where a single-organisation screen hides it. | P0 | A cross-organisation leak breaks customer trust. |
| BEH-IAM-17 | Access only adds up: no assignment ever narrows another, and a person with no assignment can do only what everyone in the organisation can. | P1 | Every module relies on access adding up correctly. |
| BEH-IAM-18 | An admin acts only inside their own reach. In the MSP organisation they see, assign and edit only access profiles whose every organisation they reach; a profile that names even one organisation outside their reach is not offered, because it cannot be given in part. | P0 | With no delegation gates in this version, reach is the only limit on who can give what; without it an admin hands out access to clients they cannot reach themselves. |
| BEH-IAM-19 | A change on one person or team touches only that holder; a change that reaches many holders happens only on the role or profile page, after showing how many people it affects; "All organisations" includes every organisation onboarded later and says so; adding someone to a team gives the team's access and removing them ends it. | P1 | Revoking access on one team must leave every other holder untouched, and access must not widen silently with each new client. |
| BEH-IAM-20 | Deleting a role or access profile never takes access away by surprise: the admin sees who is affected and picks replace with an existing one, replace with a new one (the old goes only after the new saves), or remove. | P1 | People lose access with no warning and the admin rebuilds it by hand. |

### Service accounts

| id | expected behaviour | priority | why it matters |
|---|---|---|---|
| BEH-IAM-23 | A service-account secret is shown once and can never be read back; static keys always expire within 365 days; rotation lets old and new work side by side; disabling a credential keeps it and revoking is final. | P0 | A readable secret can be stolen by anyone with view access; broken rotation takes integrations down. |

### Audit and notification

| id | expected behaviour | priority | why it matters |
|---|---|---|---|
| BEH-IAM-24 | Every change to identity, access or sign-in writes an audit event naming who or what made it, with before and after; an import writes one event per row grouped by its job, a bulk assignment one event with a count; when two admins save the same record, the last save wins, nothing is left half-changed, and both saves are audited; if the event cannot be written, the change does not happen. | P0 | A silent drop is a SOC 2 control failure, and past access can no longer be rebuilt. |
| BEH-IAM-25 | Nothing automatic happens silently: every lifecycle change reaches the other modules as a signal that IAM never acts on for them, and a change nobody clicked (an ownership switch, a refused attempt on the Tenant Owner, a directory disable blocked by a service-account owner, an emergency sign-in) reaches a person, not only the log. | P1 | Dropped signals leave tickets unassigned; unheard automatic changes are found only in an incident. |

### Custom fields and onboarding

| id | expected behaviour | priority | why it matters |
|---|---|---|---|
| BEH-IAM-26 | Only the name ever blocks a new person; every other required field is asked a few at a time, can be skipped, and is asked only of people who may edit it and whose directory does not fill it. | P1 | A required field as a gate stops people working. |
| BEH-IAM-27 | Text an admin writes into a field definition always shows as plain text, never as markup, in every organisation it reaches. | P0 | Stored script in an MSP field runs in every client organisation. |
| BEH-IAM-28 | Fields an MSP pushes are read-only to its clients, reach every new client automatically, and a label clash is logged rather than overwritten. | P1 | A new client starts with an incomplete schema; a clash destroys the client's own field. |

---

## 3. Examples (20)

Selected expected behaviours, each shown as one case in plain words.

### EX-IAM-01.1 — BEH-IAM-01: known and unknown emails look the same

- **Given** Acme Technologies has an account for `priya@acme.com` and none for `sam@acme.com`
- **When** both addresses are entered on Acme's sign-in link, and each is then tried until the rate limit is hit
- **Then** both see the same screen, the same message and the same rate-limit reply; nothing tells them apart before the person proves their inbox.

### EX-IAM-02.1 — BEH-IAM-02: MSP staff never sign in to a client

- **Given** Natasha signs in on the MSP organisation's link and holds an access profile over Acme Technologies and Beta Innovations
- **When** she opens Acme's people, then Beta's
- **Then** she works on both with the profile's permissions and is never asked to sign in again; Gamma Solutions does not appear anywhere; she has no account in Acme or Beta.

### EX-IAM-04.1 — BEH-IAM-04: every Tier 3 action needs its own code

- **Given** an admin has just entered a fresh code to complete one Tier 3 action
- **When** a minute later they start a second Tier 3 action
- **Then** a new code is asked for; the first code does not work again, and there is no grace window, for the Tenant Owner too.

### EX-IAM-05.1 — BEH-IAM-05: losing reach to a client takes effect at once

- **Given** an engineer reaches Beta only through the Engineering team's profile over Acme and Beta, and reaches Acme through his own profile too
- **When** the Engineering profile expires while he is working
- **Then** Beta leaves his view at once, without a new sign-in; Acme stays, and his session goes on.

### EX-IAM-06.1 — BEH-IAM-06: a person moved to Manual is the admins' to offboard

- **Given** Tanvi's source of truth was SCIM, and an admin moved her to Manual, and was told that offboarding her is now the admins' job
- **When** the IdP deactivates Tanvi
- **Then** nothing happens to her account, and the IdP's later updates to her details are not applied.

### EX-IAM-07.1 — BEH-IAM-07: a directory leaver is disabled, then deleted after 30 days

- **Given** Meera's source of truth is SCIM
- **When** HR deactivates her in the IdP on 1 November
- **Then** her account is disabled at once, her sessions end, her row says she was disabled by SCIM, and on 1 December the account is deleted with her data stripped, with no admin action and no setting anywhere.

### EX-IAM-07.2 — BEH-IAM-07: an admin's own disable is never turned into a delete

- **Given** an admin disabled Michael, whose source of truth is Manual, six months ago
- **When** any number of days pass
- **Then** Michael stays disabled until an admin deletes him; a contractor whose account end date passed is, by contrast, deleted 30 days after that date.

### EX-IAM-08.1 — BEH-IAM-08: a directory never sets access

- **Given** an engineer was created by JIT on his first SSO sign-in to a client, with the basics only
- **When** his job title and his IdP groups change, and he signs in again
- **Then** his account is not updated, and no role, profile or team is given or taken away by the IdP.

### EX-IAM-09.1 — BEH-IAM-09: a recycled address does not take over a leaver's account

- **Given** Acme Healthcare's LDAP disabled Grace, and her account still exists, bound to her old AD record
- **When** IT gives `grace.l@acmehealth.com` to a new hire, whose AD record has a different directory ID, and the next run carries it
- **Then** the run refuses to bind the new record to Grace's account, and the refusal is reported.

### EX-IAM-10.1 — BEH-IAM-10: an import gives only what the importing admin may give

- **Given** a Lighthouse admin may invite and manage people but has no permission to assign roles, and the file has a role column
- **When** the admin maps the file and runs the import
- **Then** the role column is not offered for mapping, every new person arrives with no role, and a disabled person in the file is updated but stays disabled.

### EX-IAM-12.1 — BEH-IAM-12: bulk delete with active people

- **Given** Natasha selects five leavers, two of them still active
- **When** she deletes them together and types `delete`
- **Then** the two active people are disabled first, all five are deleted in the background, and each row reports its own outcome.

### EX-IAM-13.1 — BEH-IAM-13: the Tenant Owner in a bulk action

- **Given** Divya selects Pratik, the Tenant Owner, and three other leavers
- **When** she disables all four together
- **Then** the confirm warns that Pratik's row will fail, the three others are disabled, and Pratik's row fails with a reason; a SCIM removal for Pratik is refused the same way and audited.

### EX-IAM-14.1 — BEH-IAM-14: a directory disable waits for the service account

- **Given** Liam owns the HL7 Interface Bot, and SCIM owns Liam
- **When** the IdP deactivates Liam
- **Then** Liam stays active and the admin is told which service account to reassign; when the bot is reassigned to Sofia, Liam is disabled at once, with no new message from the IdP. Under LDAP the same happens on the next run.

### EX-IAM-14.2 — BEH-IAM-14: the waiting disable is dropped if the directory lets go

- **Given** Liam's SCIM disable is waiting because he owns the HL7 Interface Bot
- **When** an admin moves Liam to Manual, and then reassigns the bot
- **Then** Liam is not disabled: SCIM no longer owns him, so the waiting disable no longer applies.

### EX-IAM-15.1 — BEH-IAM-15: an expired assignment is gone

- **Given** the Engineering team holds the "Change Approval" profile until Friday
- **When** Friday passes and on Monday a manager asks to extend it
- **Then** the row is no longer listed and cannot be extended; Natasha assigns the profile again, and the audit log shows both.

### EX-IAM-17.1 — BEH-IAM-17: revoking one route leaves the other

- **Given** a Lighthouse engineer holds the custom role "Release Engineer" directly and also through the Platform Engineering team
- **When** Ananya revokes the direct row
- **Then** the engineer's access does not change, and the row tells her the role remains through the team.

### EX-IAM-18.1 — BEH-IAM-18: profiles outside the admin's reach are hidden

- **Given** an MSP admin reaches Acme Technologies and Beta Innovations only
- **When** she assigns an access profile to a new technician
- **Then** a profile over Acme and Beta is offered; a profile over Acme, Beta and Gamma is neither listed nor assignable, and she cannot edit it either.

### EX-IAM-19.1 — BEH-IAM-19: "All organisations" grows, a named list does not

- **Given** Natasha holds a profile over All organisations, and IT Support holds "Helpdesk Access" over Acme and Beta
- **When** the MSP onboards a new client (OM)
- **Then** Natasha reaches the new client at once; IT Support does not, until someone edits Helpdesk Access after seeing the impact count.

### EX-IAM-24.1 — BEH-IAM-24: no audit event, no change

- **Given** the audit service cannot record events
- **When** an admin tries to give someone a role
- **Then** the role is not given, and the admin sees that the change failed, not a success.

### EX-IAM-27.1 — BEH-IAM-27: field text is never markup

- **Given** Natasha creates an MSP user field labelled `<img src=x onerror=alert(1)>` for all clients
- **When** Marcus opens a person in Acme Healthcare
- **Then** the label shows as those exact characters, and nothing runs.

---

## 4. Points to note

**Sign-in and organisations**

- A person signs in only through their own organisation's link. There is no main site, no global login and no list
  of workspaces across organisations.
- MSP staff work on a client from the MSP organisation, through their access profiles. They have no account in the
  client and are not asked to sign in again. When they lose reach to a client, it leaves their view at once; their
  session continues.
- Each organisation's emergency list is set in Organization Management. The Tenant Owner is the tenant's built-in
  emergency way in. IAM handles how sign-in behaves under SSO-only.
- Allowed domains are optional. With none set, no domain check applies. When set, they only warn when an admin
  invites, imports or creates people: an address outside them needs the admin's explicit choice on that invite or
  import. Sign-in through JIT does not consult the list, because the IdP has already decided who may sign in. There
  is no self sign-up.
- A client organisation's view works like a direct customer's, except for custom fields. A client admin can do
  what their permissions allow.
- When the permission check cannot give an answer, it refuses.

**Access and roles**

- A single organisation uses role assignments. The MSP organisation uses access profiles.
- For this release there is one admin role, the IAM permissions, and custom roles with their per-permission scopes.
- Reach is what limits who can give which permission. Anyone with the permission to manage or assign roles or
  access profiles can give any permission within their reach, privileged ones included. Assigning to yourself is
  allowed and audited.
- An admin sees and assigns only access profiles whose every organisation they reach. A profile is always given
  whole.
- An assignment that reaches its end date disappears, role or profile alike. A row close to its end shows as
  expiring. To continue access, assign it again.
- Editing an access profile shows how many people it affects before saving. The holder list on a role is read-only.
- Deleting a role can leave an access profile with no roles.
- A service account's roles, and its organisations in the MSP, are set on the account itself, with no assignment or
  expiry.
- Custom fields are managed with one permission, `user_attribute.manage`.

**Lifecycle**

- When a directory removes someone, their account is disabled at once and deleted 30 days later, with no setting
  involved. An account past its end date is deleted the same way. An account an admin disabled stays disabled until
  an admin deletes it.
- Bulk delete can include active people. They are disabled first, then deleted in the background, and each row
  reports its own outcome.
- Someone who owns a service account cannot be disabled until that account is reassigned, which is a separate step;
  the message names the accounts. A directory's disable waits in the same way, the admin is told, and the disable
  completes on its own once the accounts are reassigned, as long as that directory still owns the person.
- A person a directory disabled is brought back by fixing it in the directory, and the console says so. Enable warns
  while the disabling connection still owns the person.
- Moving someone to Manual takes them out of automated offboarding, and the confirm says so.
- The account state is called Disabled. An account end date is its own cause and shows as Expired.
- An email reused while its old account still exists reaches that old, disabled account. A directory record with the
  same email but a different directory ID is refused.

**Invitations and import**

- An invitation collects the email only. First and last name are the one required step at first sign-in, and the
  display name is stored.
- An invitation nobody accepts expires, and its Invited row disappears.
- A CSV import is upload, map columns, then a job. People it creates start as Invited. For people who already exist,
  it updates details such as a phone number, and adds the role or profile in the file to what they already hold; it
  never removes access. The role or profile column is offered only to an admin with the permission to assign;
  updating existing people needs the permission to manage people. The file has no team column: a team is chosen on
  the email invitation.

**Audit**

- An import writes one audit event per row, grouped by its job. A bulk assignment writes one event with a count.

**Smaller points**

- A custom role needs a description and can be cloned.
- A session's "last active" time is relative, with the exact time on hover.
- Ending a single session asks for confirmation. Deleting an access profile nobody holds needs no dialog.
- "Access profile" does not appear on single-organisation screens.

---

## 5. Configurations (6)

Each configuration is a type of customer. The table gives the overview; the sample setup under it lists what an
environment of that type holds so its situations can run, using the mock's seed names. Account states and
confirmations are part of the situations themselves.

| id | name | org type | sign-in | source of truth | other factors | mock seed |
|---|---|---|---|---|---|---|
| CFG-IAM-A | Direct customer, day one | direct | email code only | Manual, plus CSV | allowed domains optional; Tenant Owner present | Lighthouse Analytics, owner Pratik Patel |
| CFG-IAM-B | Direct customer with SCIM | direct | email code, SSO optional | Manual and SCIM | roles assigned directly; a person moved to Manual is the case to watch | Lighthouse: Meera Krishnan, Tanvi Deshpande |
| CFG-IAM-C | MSP organisation | MSP | email code and SSO | Manual, SCIM and LDAP | access profiles reaching clients; Tenant Owner present | MSP organisation, owner Sarah Johnson; clients Acme Technologies, Beta Innovations, Gamma Solutions, Vendor Operations, Support Ops India |
| CFG-IAM-D | MSP client on SSO with JIT | client | SSO (OIDC) beside email code; JIT on | JIT-created, then Manual | the client organisation's sign-in link for its own people; MSP staff work on it from the MSP organisation | Gamma Solutions stands in |
| CFG-IAM-E | MSP client on LDAP through an on-prem collector | client | email code | Manual and scheduled LDAP (Active Directory) | no Tenant Owner in the organisation; a Manual person who also exists in AD | Acme Healthcare: Marcus Webb, Grace Lindqvist, Daniel Okafor, Amara Diallo |
| CFG-IAM-F | MSP client, SSO-only | client | SSO only; emergency list (OM) | Manual or SCIM | the IdP outage is the case to watch | Acme Technologies |

### CFG-IAM-A — Direct customer, day one

Sample setup:

- **Tenant and organisation:** Lighthouse Analytics, a direct customer; Tenant Owner Pratik Patel.
- **Sign-in:** email code only; no identity provider connected.
- **Allowed domains:** `lighthouse.io`, plus one run with none set.
- **People:** Ananya Iyer, invited and then signed in; Divya Rao, invited, never accepts.
- **Access:** the admin role, given to Ananya after she joins.
- Situations: SIT-IAM-01.

### CFG-IAM-B — Direct customer with SCIM

Sample setup:

- **Tenant and organisation:** Lighthouse Analytics; Tenant Owner Pratik Patel.
- **Connections:** SCIM from the customer's identity provider, for example Okta or Entra ID.
- **People:**
  - Meera Krishnan, owned by SCIM, active.
  - Tanvi Deshpande, earlier moved from SCIM to Manual.
  - Ananya Iyer and Divya Rao, admins. Divya can invite, manage people and assign roles.
  - An external contractor with an account end date.
  - Three more people about to leave.
- **Teams and roles:**
  - The Platform Engineering team, 26 people.
  - The custom role "Release Engineer", scoped to tickets owned by the person's teams. It is held by the team, and directly by two people, one of them until the end of the quarter.
- **Service accounts:** Nightly Backup, owned by Pratik.
- **Organisation data (OM):** departments and sites; allowed domains.
- **Files:** a CSV of about 350 people. It includes two outside addresses, a duplicate, the Tenant Owner's address, an unknown department, a disabled person, and an existing colleague whose row carries a new phone number and a role.
- Situations: SIT-IAM-04, 08, 10, 11, 16.

### CFG-IAM-C — MSP organisation

Sample setup:

- **Tenant and organisation:** the MSP organisation; Tenant Owner Sarah Johnson.
- **Clients:** Acme Technologies, Beta Innovations, Gamma Solutions, Vendor Operations, Support Ops India. One more is added during the test.
- **Connections:** SSO and SCIM from the MSP's own identity provider, with about 60 staff owned by SCIM.
- **People:**
  - Natasha Manglore, MSP admin.
  - James Brown, technician signing in by SSO.
  - Olivia Jones.
  - Michael Smith, Manual, leaving.
  - Five more leavers, some active.
- **Teams:** IT Support (38), Security (23), Engineering.
- **Access profiles:**
  - An admin profile over All organisations, held by Natasha.
  - "Helpdesk Access" over Acme Technologies and Beta Innovations, held by IT Support and Security.
  - "Change Approval", held by Engineering for six days.
  - "Client Onboarding Access", held by Olivia for 90 days.
- **Custom fields, for all clients:** Employee ID (required, admin-owned) and Emergency contact (required, the person can edit it).
- Situations: SIT-IAM-02, 06 (step 5), 07, 08, 10 (variant), 11, 13, 14.

### CFG-IAM-D — MSP client on SSO with JIT

Sample setup:

- **Organisation:** Gamma Solutions, a client of the MSP in CFG-IAM-C, with its own sign-in link.
- **Connections:** an OIDC connection, for example Entra ID, with JIT on and its attribute mapping set. A second connection with JIT off.
- **People:**
  - The client's IT lead.
  - An engineer who gets an account through JIT on first sign-in.
  - A contractor with no account.
  - Someone signing in on the second connection.
- **MSP side:** Natasha reaches the client through her access profile; the MSP's all-clients fields apply.
- Situations: SIT-IAM-03, 13.

### CFG-IAM-E — MSP client on LDAP through an on-premises collector

Sample setup:

- **Organisation:** Acme Healthcare, a client of the MSP in CFG-IAM-C. It has no Tenant Owner of its own.
- **Connections:** LDAP to Active Directory through an on-premises collector, every 12 hours, with a mapping that fills Employee ID.
- **People:**
  - Marcus Webb, client admin.
  - Grace Lindqvist, owned by LDAP, leaving.
  - Daniel Okafor, disabled by Marcus and still present in AD.
  - Amara Diallo, Manual and also present in AD.
  - A nurse who moves outside the synced part of AD.
  - Liam Gallagher, leaving.
  - Sofia Alvarez, an admin who can take over a service account.
  - An external auditor.
- **Service accounts:** the HL7 Interface Bot, owned by Liam, with one active key.
- **Roles:** a client role that both Marcus and an MSP engineer edit; a view-only role for the auditor, with a 30-day account end date.
- **Directory data:** a new hire in AD given the email address of a leaver whose account still exists.
- Situations: SIT-IAM-05, 09, 11, 13, 15.

### CFG-IAM-F — MSP client, SSO-only

Sample setup:

- **Organisation:** Acme Technologies, a client of the MSP in CFG-IAM-C.
- **Sign-in:** SSO only, through the client's identity provider. Two admins are on the organisation's emergency list (OM).
- **People:** the two listed admins; a technician who is not on the list.
- **Conditions:** the identity provider is unavailable. In the related step, the MSP's own provider is down too, and Sarah Johnson signs in as Tenant Owner.
- Situations: SIT-IAM-06.
