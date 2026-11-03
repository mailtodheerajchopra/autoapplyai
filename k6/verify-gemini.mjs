// Verify the real Gemini path on production: direct key probe + async discovery
// run with polling until terminal state.
const base = "https://autoapplyai-gules.vercel.app";
const key = process.argv[2];

const probe = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly: KEY_OK" }] }] }),
  }
);
const probeBody = await probe.json();
const probeText = probeBody?.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(probeBody).slice(0, 200);
console.log("DIRECT_KEY_PROBE:", probe.status, probeText);

const tokResp = await fetch(base + "/api/auth/demo-switch", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: "usr_priya_sharma" }),
});
const tok = (await tokResp.json()).token;

const kick = await fetch(base + "/api/agent/discover", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
  body: JSON.stringify({ keywords: ["Senior Frontend Engineer", "React TypeScript"], sources: ["Workday Portal", "LinkedIn"] }),
});
const kickBody = await kick.json();
console.log("KICKOFF:", kick.status, kickBody.jobId || JSON.stringify(kickBody));

// Cooldown (429) still identifies the relevant job — poll it as-is.
const pollJobId = (kickBody && kickBody.jobId) || null;
if (pollJobId) {
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const poll = await (await fetch(base + "/api/agent/discover/" + pollJobId, { headers: { Authorization: "Bearer " + tok } })).json();
    if (poll.status === "completed" || poll.status === "failed") {
      const secs = poll.completedAt ? (new Date(poll.completedAt) - new Date(poll.createdAt)) / 1000 : null;
      console.log("FINAL:", JSON.stringify({ status: poll.status, result: poll.result, error: poll.error, execSeconds: secs }));
      process.exit(0);
    }
  }
  console.log("FINAL: poll timeout (80 polls / 40s)");
}
