# Training Tag Objective

This is the safe hackathon version of the "tag" component. It gives the demo an active mission objective without encoding harm, capture, pursuit, or autonomous engagement.

The objective is a controlled training tag against a consenting participant, tagged asset, toy prop, drone surrogate, or simulated entity. A tag is confirmed by NFC/RFID scan, QR scan, BLE beacon proximity, or referee/operator acknowledgement. Physical contact is not required.

## How It Works

1. Each node runs local inference or a local LLM/rules path over its own evidence.
2. Nodes publish peer intent pings with confidence, estimated distance to the objective zone, requested role, and a short lease.
3. The mesh first requires a three-node evidence quorum so no single device can claim resolution alone.
4. Inside that surviving quorum, the mesh chooses the best-positioned device for each support role; this is role deconfliction, not autonomous action.
5. If policy is still `review_needed`, the plan is staged but not ready.
6. If an authorized operator changes policy and acknowledges the objective, the plan becomes `ready_for_non_contact_tag`.
7. If one node fails after replication, its lease expires and the surviving quorum can reassign its role.
8. If two nodes fail, the plan drops to `below_quorum_collect_more`.

## Node Roles

| Role | Purpose |
| --- | --- |
| `observe` | Maintain observation of the simulated cue and report confidence, uncertainty, and zone changes. |
| `guide_to_checkpoint` | Move to the assigned observation/tag checkpoint for the authorized training zone. |
| `confirm_tag` | Confirm the tag through NFC/RFID/QR/manual acknowledgement. |
| `safety_observer` | Hold the objective if zone, bystander, policy, or confidence conditions are ambiguous. |
| `relay_display` | Update the shared display with tag status, evidence IDs, missing nodes, and policy gate. |

## Prohibited Behavior

- No harm, capture, restraint, pursuit, or physical contact.
- No autonomous drone or robot contact with a person.
- No escalation beyond the authorized training zone.
- No raw media sharing outside the local mesh unless policy allows it.

Run the deterministic check:

```bash
npm run tag:smoke
```
