import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";

// 429 is the free-tier cooldown doing its job — never a failure.
http.setResponseCallback(http.expectedStatuses(200, 202, 204, 301, 302, 304, 429));

// ─── Configuration ───────────────────────────────────────────────────────────
// Target: the user's own Vercel production deployment (safe to load-test).
const BASE_URL = "https://autoapplyai-gules.vercel.app";
const PERSONAS = ["usr_alex_chen", "usr_priya_sharma"]; // demo users rotated across VUs

// Custom metrics
const errorRate = new Rate("api_errors");            // real failures (5xx, missing data)
const cooldownRate = new Rate("cooldown_hits");       // 429 = free-tier shield working as designed
const kickoffDuration = new Trend("kickoff_duration", true);

// Load profile: ramp to 10, hold, spike, wind down.
export const options = {
  scenarios: {
    browse: {
      // Simulates candidates browsing the portal (read path)
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 10 },
        { duration: "20s", target: 25 },
        { duration: "30s", target: 25 },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
    agentRuns: {
      // Simulates users triggering the discovery agent (write path). The
      // pipeline is now async: kickoff must return fast (202), polls report
      // progress, and back-to-back runs land on the 45s cooldown (429 = OK).
      executor: "per-vu-iterations",
      vus: 5,
      iterations: 2,
      maxDuration: "3m",
      startTime: "45s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],                    // <1% transport errors
    api_errors: ["rate<0.05"],                         // <5% real API failures
    http_req_duration: ["p(95)<1200"],                 // p95 overall (incl. serverless cold starts)
    "http_req_duration{endpoint:read}": ["p(95)<500"], // reads feel instant
    "http_req_duration{endpoint:discover}": ["p(95)<1200"], // kickoff must never block
    kickoff_duration: ["p(95)<1200"],
  },
};

// ─── Setup: mint a token per persona so VUs act as distinct users ─────────────
export function setup() {
  const tokens = [];
  for (const u of PERSONAS) {
    const res = http.post(
      `${BASE_URL}/api/auth/demo-switch`,
      JSON.stringify({ userId: u }),
      { headers: { "Content-Type": "application/json" } }
    );
    const ok = check(res, {
      [`setup: demo-switch 200 (${u})`]: (r) => r.status === 200,
      "setup: token issued": (r) => typeof r.json("token") === "string",
    }) || errorRate.add(1);
    if (!ok) throw new Error("Could not mint demo token for " + u + ": " + res.body);
    tokens.push(res.json("token"));
  }
  return { tokens };
}

const authedParams = (token, endpointTag) => ({
  headers: { Authorization: `Bearer ${token}` },
  tags: { endpoint: endpointTag },
});

// ─── Test body ────────────────────────────────────────────────────────────────
export default function (data) {
  // Rotate users across VUs (persists across this scenario's iterations)
  const token = data.tokens[(__VU - 1) % data.tokens.length];

  group("candidate browse (read path)", () => {
    const jobs = http.get(`${BASE_URL}/api/jobs`, authedParams(token, "read"));
    const ok = check(jobs, {
      "jobs 200": (r) => r.status === 200,
      "jobs is array": (r) => Array.isArray(r.json()),
    });
    if (!ok) errorRate.add(1);

    http.get(`${BASE_URL}/api/applications`, authedParams(token, "read"));
    http.get(`${BASE_URL}/api/resumes`, authedParams(token, "read"));
    http.get(`${BASE_URL}/api/agent/logs`, authedParams(token, "read"));
  });

  sleep(1 + Math.random() * 2); // human-ish think time (compressed for CI)

  if (__VU % 2 === 0) {
    group("agent discovery (async write path)", () => {
      // 1) Kickoff — MUST be instant and non-blocking
      const t0 = Date.now();
      const kick = http.post(
        `${BASE_URL}/api/agent/discover`,
        JSON.stringify({ keywords: ["Full Stack Developer", "Node.js"], sources: ["LinkedIn", "Naukri", "Workday Portal"], remoteOnly: false }),
        authedParams(token, "discover")
      );
      kickoffDuration.add(kick.timings.duration);

      if (kick.status === 429) {
        // Free-tier cooldown — exactly what back-to-back runs should get.
        cooldownRate.add(1);
      } else if (kick.status === 202) {
        cooldownRate.add(0);
        check(kick, {
          "kickoff has jobId": (r) => (r.json("jobId") || "").startsWith("disc_"),
          "kickoff has pollUrl": (r) => (r.json("pollUrl") || "").includes("agent/discover"),
        }) || errorRate.add(1);

        // 2) Poll until terminal (bounded to keep the test short)
        const pollUrl = `${BASE_URL}${kick.json("pollUrl")}`;
        let terminal = null;
        for (let i = 0; i < 30; i++) {
          const poll = http.get(pollUrl, authedParams(token, "poll"));
          const j = poll.json();
          if (j.status === "completed" || j.status === "failed") {
            terminal = j;
            break;
          }
          sleep(0.2);
        }
        const good = check(terminal, {
          "poll reached terminal": (j) => j !== null,
          "job completed": (j) => j.status === "completed",
          "result has discovery numbers": (j) =>
            typeof j.result.jobsFound === "number" &&
            typeof j.result.staleJobsFiltered === "number",
        });
        if (!good) errorRate.add(1);
      } else {
        cooldownRate.add(0);
        errorRate.add(1); // unexpected status on the write path
      }
    });
  }

  sleep(0.5);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: false }),
  };
}
