import {
  buildDeploymentOrder,
  buildMissionInstruction,
  type CaskNodeLeaseRole,
  sampleMissionInstructionInput,
} from "../cask/missionDeployment.js";
import { defaultDdilMeshTopology, nominalMeshObservations } from "../mesh/defaultTopology.js";

const createdAt = new Date("2026-05-03T05:10:00.000Z");
const instruction = buildMissionInstruction(sampleMissionInstructionInput(), { createdAt });
const deployment = buildDeploymentOrder(
  instruction,
  defaultDdilMeshTopology,
  nominalMeshObservations,
  { createdAt, deploy: true },
);

assert(instruction.policyState === "authorized_to_share", "Expected sample instruction to be authorized.");
assert(deployment.state === "deployed", "Expected sample deployment to be deployed.");
assert(deployment.nodeLeases.length === defaultDdilMeshTopology.nodes.length, "Expected one lease per node.");
assert(hasLeaseRole("sensor_rfid"), "Expected an RFID sensor lease.");
assert(hasLeaseRole("sensor_audio"), "Expected an audio sensor lease.");
assert(hasLeaseRole("sensor_camera"), "Expected a camera sensor lease.");
assert(hasLeaseRole("coordinator_candidate"), "Expected coordinator-candidate leases.");
assert(deployment.timeline.some((event) => event.eventType === "deployment_activated"), "Expected activation event.");

const blockedInstruction = buildMissionInstruction({
  missionText: "Find the target and take out the operator.",
  operatorAuthorized: true,
}, { createdAt });
const blockedDeployment = buildDeploymentOrder(
  blockedInstruction,
  defaultDdilMeshTopology,
  nominalMeshObservations,
  { createdAt, deploy: true },
);

assert(blockedInstruction.policyState === "blocked", "Expected unsafe language to be blocked.");
assert(blockedDeployment.state === "blocked", "Expected blocked instruction to block deployment.");
assert(blockedDeployment.nodeLeases.length === 0, "Blocked deployment must not assign node leases.");

console.log(JSON.stringify({
  instructionId: instruction.instructionId,
  deploymentId: deployment.deploymentId,
  deploymentState: deployment.state,
  policyState: instruction.policyState,
  requiresHumanReview: deployment.requiresHumanReview,
  leaseSummary: deployment.nodeLeases.map((lease) => ({
    nodeId: lease.nodeId,
    roles: lease.roles,
    state: lease.state,
    sensorEventKinds: lease.sensorEventKinds,
  })),
  blockedCheck: {
    policyState: blockedInstruction.policyState,
    reasons: blockedInstruction.policyDecision.blockedReasons,
  },
}, null, 2));

function hasLeaseRole(role: CaskNodeLeaseRole): boolean {
  return deployment.nodeLeases.some((lease) => lease.roles.includes(role));
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}
